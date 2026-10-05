import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { COURSE_CODE_ALIASES, flowPrograms } from "./flowData";
import { requireAuthenticatedEmail } from "./security";
import { effectivePlan, shouldResetFreeMaterialQuota, subscriptionEnd } from "./paymentPricing";
import { profileFieldsToPersist } from "./profileSync";
import { syncQuarterSubjectSelection } from "./quarterScheduleSync";

const USER_TYPES = {
  user: "user",
  admin: "admin",
  blocked: "blocked",
};

const PLANS = {
  free: "free",
  pro: "pro",
  excellence: "excellence",
};

const SUBJECT_SELECTION_LIMIT = 7;
const SUBJECT_SELECTION_EDITS_PER_PERIOD = 2;
const SUBJECT_SELECTION_PERIOD_MS = 1000 * 60 * 60 * 24 * 92;
const CAREER_SELECTION_EDITS_PER_PERIOD = 1;
const MONTHLY_LIMIT_PERIOD_MS = 1000 * 60 * 60 * 24 * 30;
const FREE_PRO_MATERIAL_LIMIT = 3;
const PRO_TOOL_LIMIT = 3;

export const getProfile = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findBestUserByEmail(ctx, email);
    if (user) return withoutPrivateAuthFields({ ...withResolvedUserType(user), plan: await resolveActivePlan(ctx, user, email) });

    return {
      email,
      userType: seedUserType(email),
      createdAt: 0,
      updatedAt: 0,
      pendingCreation: true,
    };
  },
});

export const getAccess = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findBestUserByEmail(ctx, email);
    const userType = resolveUserType(user, email);

    return {
      email,
      userId: user?._id,
      userType,
      plan: await resolveActivePlan(ctx, user, email),
      canAddMaterials: userType === USER_TYPES.admin,
    };
  },
});

export const listForAdmin = query({
  args: {
    adminEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const users = await ctx.db.query("users").take(500);
    const adminUsers = await Promise.all(users.map(async (user) => {
      const email = normalizeEmail(user.email);
      const planExpiresAt = await resolvePlanExpiration(ctx, user, email);
      return {
        _id: user._id,
        email,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        nationalId: user.nationalId ?? "",
        phone: user.phone ?? "",
        careers: user.careers ?? [],
        userType: resolveUserType(user, user.email),
        plan: await resolveActivePlan(ctx, { ...user, planExpiresAt }, email),
        storedPlan: resolvePlan(user),
        planExpiresAt,
        selectedSubjectCodes: user.selectedSubjectCodes ?? [],
        subjectSelectionPeriodEnd: user.subjectSelectionPeriodEnd,
        createdAt: user._creationTime ?? user.createdAt ?? 0,
        updatedAt: user.updatedAt ?? user.subjectSelectionUpdatedAt ?? user._creationTime ?? 0,
      };
    }));
    return adminUsers.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
  },
});

export const getEntitlements = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findBestUserByEmail(ctx, email);
    const plan = await resolveActivePlan(ctx, user, email);
    return buildEntitlements(user, email, plan);
  },
});

export const getSubjectSelection = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findBestUserByEmail(ctx, email);
    const userType = resolveUserType(user, email);
    const plan = await resolveActivePlan(ctx, user, email);
    const now = Date.now();
    const periodEnd = user?.subjectSelectionPeriodEnd ?? 0;
    const expired = Boolean(periodEnd && periodEnd <= now);
    let selectedSubjectCodes = expired ? [] : sanitizeSubjectCodes(user?.selectedSubjectCodes);
    if (userType === USER_TYPES.admin) {
      const term = await ctx.db.query("academicTerms").withIndex("by_key", (q) => q.eq("key", "free")).unique();
      if (term) {
        const planner = await ctx.db.query("quarterPlanners")
          .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).first();
        if (planner) selectedSubjectCodes = sanitizeSubjectCodes(planner.selectedCourseCodes);
      }
    }
    const editsRemaining = expired
      ? SUBJECT_SELECTION_EDITS_PER_PERIOD
      : normalizeEditsRemaining(user?.subjectSelectionEditsRemaining);
    const modalSeen = expired ? false : Boolean(user?.subjectSelectionModalSeen);

    return {
      email,
      userType,
      plan,
      limit: SUBJECT_SELECTION_LIMIT,
      modalSeen,
      shouldShowModal: userType !== USER_TYPES.admin && plan === PLANS.free && !modalSeen,
      selectedSubjectCodes,
      periodStart: expired ? null : user?.subjectSelectionPeriodStart ?? null,
      periodEnd: expired ? null : user?.subjectSelectionPeriodEnd ?? null,
      editsRemaining,
      availableSubjects: subjectsForCareers(user?.careers ?? []),
    };
  },
});

export const ensureProfile = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    phone: v.optional(v.string()),
    careers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { email, subject } = await requireAuthenticatedEmail(ctx, args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const existing = pickBestUser(matchingUsers);
    assertAuthBinding(existing, subject);
    const seededType = seedUserType(email);
    const profilePatch = compactProfilePatch(args);
    validateProfilePatch(profilePatch);
    const referralPatch = existing?.referralCode ? {} : { referralCode: await generateReferralCode(ctx) };
    if (resolveUserType(existing, email) !== USER_TYPES.admin && (profilePatch.careers?.length ?? 0) > 2) {
      throw new Error("Solo puedes seleccionar hasta 2 carreras a la vez.");
    }
    if (existing) {
      const isInitialAuthBinding = !existing.supabaseAuthUserId;
      const nextType = existing.userType ?? seededType;
      const existingProfilePatch = profileFieldsToPersist(existing, profilePatch, isInitialAuthBinding);
      const needsAdminPromotion = seededType === USER_TYPES.admin
        && matchingUsers.some((user) => user.userType !== USER_TYPES.admin && user.userType !== USER_TYPES.blocked);
      if (nextType !== existing.userType || needsAdminPromotion || Object.keys(referralPatch).length > 0 || isInitialAuthBinding || Object.keys(existingProfilePatch).length > 0) {
        for (const user of matchingUsers) {
          const userTypePatch = user.userType === USER_TYPES.blocked
            ? USER_TYPES.blocked
            : nextType === USER_TYPES.admin || seededType === USER_TYPES.admin
              ? USER_TYPES.admin
              : nextType;
          await ctx.db.patch(user._id, {
            ...profileFieldsToPersist(user, profilePatch, isInitialAuthBinding),
            ...referralPatch,
            userType: userTypePatch,
            supabaseAuthUserId: subject,
            updatedAt: Date.now(),
          });
        }
        return withoutPrivateAuthFields(await ctx.db.get(existing._id));
      }
      return withoutPrivateAuthFields(existing);
    }

    const id = await ctx.db.insert("users", {
      email,
      ...profilePatch,
      ...referralPatch,
      userType: seededType,
      supabaseAuthUserId: subject,
      updatedAt: Date.now(),
    });
    return withoutPrivateAuthFields(await ctx.db.get(id));
  },
});

export const updateMyProfile = mutation({
  args: {
    email: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    phone: v.optional(v.string()),
    careers: v.optional(v.array(v.string())),
    expectedUpdatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { email, subject } = await requireAuthenticatedEmail(ctx, args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const existing = pickBestUser(matchingUsers);
    if (!existing) throw new Error("El perfil todavía no existe. Recarga la aplicación e intenta de nuevo.");
    assertAuthBinding(existing, subject);
    const currentVersion = existing.updatedAt ?? 0;
    if (currentVersion !== args.expectedUpdatedAt) {
      throw new Error("El perfil cambió en otro dispositivo. Recarga antes de guardar para no sobrescribir datos recientes.");
    }

    const profilePatch = compactProfilePatch(args);
    validateProfilePatch(profilePatch);
    if (resolveUserType(existing, email) !== USER_TYPES.admin && (profilePatch.careers?.length ?? 0) > 2) {
      throw new Error("Solo puedes seleccionar hasta 2 carreras a la vez.");
    }

    const requestedCareers = profilePatch.careers;
    const careerSelectionChanged = Array.isArray(requestedCareers)
      && !sameStringSet(existing.careers ?? [], requestedCareers);
    let careerSelectionPatch = {};
    if (careerSelectionChanged && resolveUserType(existing, email) !== USER_TYPES.admin) {
      const now = Date.now();
      const periodEnd = existing.careerSelectionPeriodEnd ?? 0;
      const periodExpired = !periodEnd || periodEnd <= now;
      const hasPreviousSelection = (existing.careers ?? []).length > 0;
      const currentEditsRemaining = periodExpired
        ? CAREER_SELECTION_EDITS_PER_PERIOD
        : normalizeCareerEditsRemaining(existing.careerSelectionEditsRemaining);
      const nextEditsRemaining = hasPreviousSelection ? currentEditsRemaining - 1 : currentEditsRemaining;
      if (nextEditsRemaining < 0) throw new Error("Ya usaste tu cambio de carreras para este trimestre.");
      careerSelectionPatch = {
        careerSelectionPeriodStart: periodExpired ? now : existing.careerSelectionPeriodStart ?? now,
        careerSelectionPeriodEnd: periodExpired ? now + SUBJECT_SELECTION_PERIOD_MS : existing.careerSelectionPeriodEnd,
        careerSelectionEditsRemaining: nextEditsRemaining,
        careerSelectionUpdatedAt: now,
      };
    }

    const updatedAt = Date.now();
    for (const user of matchingUsers) {
      await ctx.db.patch(user._id, { ...profilePatch, ...careerSelectionPatch, updatedAt });
    }
    if (careerSelectionChanged) {
      await syncQuarterSubjectSelection(ctx, email, subjectsForCareers(requestedCareers).map((item) => item.code), {
        restrictToAllowed: true, fallbackCodes: existing.selectedSubjectCodes ?? [],
      });
    }
    return withoutPrivateAuthFields(await ctx.db.get(existing._id));
  },
});

export const saveSubjectSelection = mutation({
  args: {
    email: v.string(),
    subjectCodes: v.array(v.string()),
  },
  handler: saveUserSubjectSelection,
});

export async function saveUserSubjectSelection(ctx, args) {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const existing = pickBestUser(matchingUsers);
    const userType = resolveUserType(existing, email);
    const plan = await resolveActivePlan(ctx, existing, email);
    const term = plan === PLANS.free
      ? await ctx.db.query("academicTerms").withIndex("by_key", (q) => q.eq("key", "free")).unique()
      : null;
    if (term?.processing) throw new Error("Se está reiniciando el trimestre. Intenta guardar en unos segundos.");
    if (userType === USER_TYPES.admin) {
      return formatSubjectSelectionMutationResult(existing, email, plan);
    }

    const careers = existing?.careers ?? [];
    const allowedSubjects = subjectsForCareers(careers);
    const allowedCodes = new Set(allowedSubjects.map((subject) => subject.code));
    const subjectCodes = sanitizeSubjectCodes(args.subjectCodes);

    if (subjectCodes.length === 0) throw new Error("Selecciona al menos una materia.");
    if (subjectCodes.length > SUBJECT_SELECTION_LIMIT) {
      throw new Error(`Solo puedes escoger hasta ${SUBJECT_SELECTION_LIMIT} materias por trimestre.`);
    }
    const invalidCode = subjectCodes.find((code) => !allowedCodes.has(code));
    if (invalidCode) throw new Error("Solo puedes escoger materias de tu carrera.");

    const now = Date.now();
    const periodEnd = existing?.subjectSelectionPeriodEnd ?? 0;
    const periodExpired = !periodEnd || periodEnd <= now;
    const previousModalSeen = periodExpired ? false : Boolean(existing?.subjectSelectionModalSeen);
    const previousSelection = periodExpired ? [] : sanitizeSubjectCodes(existing?.selectedSubjectCodes);
    const selectionChanged = !sameStringSet(previousSelection, subjectCodes);
    const currentEditsRemaining = periodExpired
      ? SUBJECT_SELECTION_EDITS_PER_PERIOD
      : normalizeEditsRemaining(existing?.subjectSelectionEditsRemaining);
    const nextEditsRemaining = plan === PLANS.free && previousModalSeen && selectionChanged
      ? currentEditsRemaining - 1
      : currentEditsRemaining;

    if (nextEditsRemaining < 0) {
      throw new Error("Ya usaste tus 2 ediciones de materias para este trimestre.");
    }

    const patch = {
      email,
      selectedSubjectCodes: subjectCodes,
      subjectSelectionModalSeen: true,
      subjectSelectionPeriodStart: periodExpired ? now : existing?.subjectSelectionPeriodStart ?? now,
      subjectSelectionPeriodEnd: term && term.resetAt > now ? term.resetAt : periodExpired ? now + SUBJECT_SELECTION_PERIOD_MS : existing?.subjectSelectionPeriodEnd,
      subjectSelectionEditsRemaining: nextEditsRemaining,
      subjectSelectionUpdatedAt: now,
    };

    if (existing) {
      for (const user of matchingUsers) {
        await ctx.db.patch(user._id, patch);
      }
      if (selectionChanged) await syncQuarterSubjectSelection(ctx, email, subjectCodes);
      return formatSubjectSelectionMutationResult({ ...existing, ...patch }, email, plan);
    }

    const id = await ctx.db.insert("users", {
      ...patch,
      userType: USER_TYPES.user,
    });
    await syncQuarterSubjectSelection(ctx, email, subjectCodes);
    return formatSubjectSelectionMutationResult(await ctx.db.get(id), email, plan);
}

export const previewMaterialAccess = query({
  args: {
    email: v.string(),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findBestUserByEmail(ctx, email);
    const document = await ctx.db.get(args.documentId);
    if (!document) return { allowed: false, reason: "Este material ya no esta disponible." };
    return materialAccessState(user, email, document, await resolveActivePlan(ctx, user, email));
  },
});

export const consumeMaterialAccess = mutation({
  args: {
    email: v.string(),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const user = pickBestUser(matchingUsers);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Este material ya no esta disponible.");
    const activePlan = await resolveActivePlan(ctx, user, email);
    const preview = materialAccessState(user, email, document, activePlan);
    if (activePlan === PLANS.free && resolveUserType(user, email) !== USER_TYPES.admin) {
      const term = await ctx.db.query("academicTerms").withIndex("by_key", (q) => q.eq("key", "free")).unique();
      if (term?.processing) throw new Error("Se está reiniciando el trimestre. Intenta abrir el material en unos segundos.");
    }
    if (!preview.allowed) throw new Error(preview.reason ?? "No puedes abrir este material con tu plan actual.");
    if (!preview.consumesQuota) return preview;

    const now = Date.now();
    const usage = resolveMaterialUsage(user, activePlan, now);
    const nextUses = uniqueStrings([...usage.uses, String(args.documentId)]);
    const patch = {
      email,
      proMaterialPeriodStart: usage.periodStart,
      proMaterialPeriodEnd: usage.periodEnd,
      proMaterialUses: nextUses,
      ...(needsFreeMaterialQuotaReset(user, activePlan, now) ? {
        plan: PLANS.free,
        planExpirationScheduledAt: undefined,
        proMaterialResetForPlanExpiresAt: user.planExpiresAt,
      } : {}),
    };
    if (user) {
      for (const item of matchingUsers) await ctx.db.patch(item._id, patch);
    } else {
      await ctx.db.insert("users", { ...patch, userType: USER_TYPES.user, plan: PLANS.free });
    }
    return materialAccessState({ ...user, ...patch }, email, document, activePlan);
  },
});

export const previewToolAccess = query({
  args: {
    email: v.string(),
    toolId: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findBestUserByEmail(ctx, email);
    return toolAccessState(user, email, args.toolId, await resolveActivePlan(ctx, user, email));
  },
});

export const consumeToolAccess = mutation({
  args: {
    email: v.string(),
    toolId: v.string(),
  },
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const user = pickBestUser(matchingUsers);
    const activePlan = await resolveActivePlan(ctx, user, email);
    const preview = toolAccessState(user, email, args.toolId, activePlan);
    if (!preview.allowed) throw new Error(preview.reason ?? "No puedes usar esta herramienta con tu plan actual.");
    if (!preview.consumesQuota) return preview;

    const now = Date.now();
    const usage = normalizePeriodUsage(user?.toolUsePeriodStart, user?.toolUsePeriodEnd, user?.toolUses, now);
    const nextUses = uniqueStrings([...usage.uses, args.toolId]);
    const patch = {
      email,
      toolUsePeriodStart: usage.periodStart,
      toolUsePeriodEnd: usage.periodEnd,
      toolUses: nextUses,
    };
    if (user) {
      for (const item of matchingUsers) await ctx.db.patch(item._id, patch);
    } else {
      await ctx.db.insert("users", { ...patch, userType: USER_TYPES.user, plan: PLANS.free });
    }
    return toolAccessState({ ...user, ...patch }, email, args.toolId, activePlan);
  },
});

export const setUserType = mutation({
  args: {
    adminEmail: v.string(),
    targetEmail: v.string(),
    userType: v.union(v.literal("user"), v.literal("admin"), v.literal("blocked")),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const targetEmail = normalizeEmail(args.targetEmail);
    const matchingUsers = await findUsersByEmail(ctx, targetEmail);
    const existing = pickBestUser(matchingUsers);

    if (existing) {
      for (const user of matchingUsers) {
        await ctx.db.patch(user._id, {
          userType: args.userType,
        });
      }
      return withoutPrivateAuthFields(await ctx.db.get(existing._id));
    }

    const id = await ctx.db.insert("users", {
      email: targetEmail,
      userType: args.userType,
    });
    return withoutPrivateAuthFields(await ctx.db.get(id));
  },
});

export const setUserBlocked = mutation({
  args: {
    adminEmail: v.string(),
    targetEmail: v.string(),
    blocked: v.boolean(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const adminEmail = normalizeEmail(args.adminEmail);
    const targetEmail = normalizeEmail(args.targetEmail);
    if (adminEmail === targetEmail) throw new Error("No puedes bloquear tu propia cuenta admin.");
    const matchingUsers = await findUsersByEmail(ctx, targetEmail);
    const existing = pickBestUser(matchingUsers);
    const nextType = args.blocked ? USER_TYPES.blocked : USER_TYPES.user;

    if (existing) {
      if (existing.userType === USER_TYPES.admin && args.blocked) {
        throw new Error("No puedes bloquear a otro administrador desde esta vista.");
      }
      for (const user of matchingUsers) {
        await ctx.db.patch(user._id, { userType: nextType });
      }
      return withoutPrivateAuthFields(await ctx.db.get(existing._id));
    }

    const id = await ctx.db.insert("users", {
      email: targetEmail,
      userType: nextType,
      plan: PLANS.free,
    });
    return withoutPrivateAuthFields(await ctx.db.get(id));
  },
});

export const setUserPlan = mutation({
  args: {
    adminEmail: v.string(),
    targetEmail: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("excellence")),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const targetEmail = normalizeEmail(args.targetEmail);
    const matchingUsers = await findUsersByEmail(ctx, targetEmail);
    const existing = pickBestUser(matchingUsers);
    if (existing) {
      for (const user of matchingUsers) {
        await ctx.db.patch(user._id, { plan: args.plan });
      }
      return withoutPrivateAuthFields(await ctx.db.get(existing._id));
    }
    const id = await ctx.db.insert("users", {
      email: targetEmail,
      userType: USER_TYPES.user,
      plan: args.plan,
    });
    return withoutPrivateAuthFields(await ctx.db.get(id));
  },
});

export const setUserPlanExpiration = mutation({
  args: {
    adminEmail: v.string(),
    targetEmail: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    if (!Number.isFinite(args.expiresAt) || args.expiresAt <= 0) {
      throw new Error("La fecha de vencimiento no es válida.");
    }

    const targetEmail = normalizeEmail(args.targetEmail);
    const matchingUsers = await findUsersByEmail(ctx, targetEmail);
    const existing = pickBestUser(matchingUsers);
    if (!existing) throw new Error("No se encontró el perfil del usuario.");
    if (resolveUserType(existing, targetEmail) === USER_TYPES.admin) {
      throw new Error("No se puede modificar el vencimiento de una cuenta administradora.");
    }
    if (resolvePlan(existing) === PLANS.free) {
      throw new Error("Solo puedes cambiar el vencimiento de un plan Pro o Excellence.");
    }

    for (const user of matchingUsers) {
      await ctx.db.patch(user._id, {
        plan: args.expiresAt <= Date.now() ? PLANS.free : resolvePlan(user),
        planExpiresAt: args.expiresAt,
        ...(args.expiresAt <= Date.now() ? {
          proMaterialPeriodStart: undefined,
          proMaterialPeriodEnd: undefined,
          proMaterialUses: [],
          proMaterialResetForPlanExpiresAt: args.expiresAt,
        } : {}),
        planExpirationScheduledAt: args.expiresAt > Date.now() ? args.expiresAt : undefined,
        updatedAt: Date.now(),
      });
    }
    if (args.expiresAt > Date.now()) {
      await schedulePlanExpiration(ctx, matchingUsers.map((user) => user._id), args.expiresAt);
    }
    return null;
  },
});

export const expirePlan = internalMutation({
  args: {
    userIds: v.array(v.id("users")),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.expiresAt > now) return null;

    for (const userId of args.userIds) {
      const user = await ctx.db.get(userId);
      // A renewal or admin edit changes the timestamp; ignore its stale job.
      if (!user || user.planExpiresAt !== args.expiresAt || resolvePlan(user) === PLANS.free) continue;
      await ctx.db.patch(userId, {
        plan: PLANS.free,
        proMaterialPeriodStart: undefined,
        proMaterialPeriodEnd: undefined,
        proMaterialUses: [],
        proMaterialResetForPlanExpiresAt: args.expiresAt,
        planExpirationScheduledAt: undefined,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const reconcilePlanExpirations = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), plan: v.optional(v.union(v.literal("pro"), v.literal("excellence"))) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const activePlan = args.plan ?? PLANS.pro;
    const page = await ctx.db.query("users")
      .withIndex("by_plan_expiration", (q) => q.eq("plan", activePlan))
      .paginate({ cursor: args.cursor, numItems: 100 });

    for (const user of page.page) {
      const plan = resolvePlan(user);
      if ((plan !== PLANS.pro && plan !== PLANS.excellence) || typeof user.planExpiresAt !== "number") continue;

      if (user.planExpiresAt <= now) {
        await ctx.db.patch(user._id, {
          plan: PLANS.free,
          proMaterialPeriodStart: undefined,
          proMaterialPeriodEnd: undefined,
          proMaterialUses: [],
          proMaterialResetForPlanExpiresAt: user.planExpiresAt,
          planExpirationScheduledAt: undefined,
          updatedAt: now,
        });
      } else if (user.planExpirationScheduledAt !== user.planExpiresAt) {
        // Backfill expirations saved before scheduled jobs were deployed and
        // repair any paid profile that is missing its matching scheduled job.
        await schedulePlanExpiration(ctx, [user._id], user.planExpiresAt);
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.users.reconcilePlanExpirations, { cursor: page.continueCursor, plan: activePlan });
    } else if (activePlan === PLANS.pro) {
      await ctx.scheduler.runAfter(0, internal.users.reconcilePlanExpirations, { cursor: null, plan: PLANS.excellence });
    }
    return null;
  },
});

export async function schedulePlanExpiration(ctx, userIds, expiresAt) {
  await ctx.scheduler.runAt(expiresAt, internal.users.expirePlan, { userIds, expiresAt });
  for (const userId of userIds) {
    await ctx.db.patch(userId, { planExpirationScheduledAt: expiresAt });
  }
}

export async function isAdmin(ctx, email) {
  const { email: verifiedEmail, subject } = await requireAuthenticatedEmail(ctx, email);
  const user = await findBestUserByEmail(ctx, verifiedEmail);
  assertAuthBinding(user, subject);
  return resolveUserType(user, verifiedEmail) === USER_TYPES.admin;
}

export async function assertAdmin(ctx, email) {
  if (!(await isAdmin(ctx, email))) {
    throw new Error("Solo administradores pueden realizar esta acción.");
  }
  return normalizeEmail(email);
}

export async function isKnownAdmin(ctx, email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findBestUserByEmail(ctx, normalizedEmail);
  return resolveUserType(user, normalizedEmail) === USER_TYPES.admin;
}

async function findUsersByEmail(ctx, email) {
  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", normalizeEmail(email)))
    .collect();
}

async function findBestUserByEmail(ctx, email) {
  return pickBestUser(await findUsersByEmail(ctx, email));
}

function pickBestUser(users) {
  return users.find((user) => user.userType === USER_TYPES.admin) ?? users[0] ?? null;
}

function withResolvedUserType(user) {
  const userType = resolveUserType(user, user?.email);
  const careerPeriodExpired = Boolean(
    user?.careerSelectionPeriodEnd && user.careerSelectionPeriodEnd <= Date.now(),
  );
  return {
    ...user,
    userType,
    plan: resolvePlan(user),
    careerSelectionEditsRemaining: userType === USER_TYPES.admin
      ? null
      : careerPeriodExpired
        ? CAREER_SELECTION_EDITS_PER_PERIOD
        : normalizeCareerEditsRemaining(user?.careerSelectionEditsRemaining),
  };
}

function withoutPrivateAuthFields(user) {
  if (!user) return user;
  const privateFields = new Set([
    "supabaseAuthUserId",
    "recoveryCodeHash",
    "recoveryCodeSalt",
    "recoveryAnswerHash",
    "recoveryAnswerSalt",
    "recoveryQuestion",
    "recoveryCodeConsumedAt",
    "recoveryResetReservedUntil",
    "recoveryResetReservationId",
    "recoveryResetMethod",
  ]);
  return Object.fromEntries(Object.entries(user).filter(([key]) => !privateFields.has(key)));
}

function resolveUserType(user, email) {
  const seededType = seedUserType(email ?? "");
  if (seededType === USER_TYPES.admin) return USER_TYPES.admin;
  return user?.userType ?? USER_TYPES.user;
}

function resolvePlan(user) {
  return Object.values(PLANS).includes(user?.plan) ? user.plan : PLANS.free;
}

export async function resolveActivePlan(ctx, user, email, now = Date.now()) {
  const storedPlan = resolvePlan(user);
  const initial = effectivePlan({
    storedPlan,
    userType: resolveUserType(user, email),
    planExpiresAt: user?.planExpiresAt,
    payment: null,
  }, now);
  if (initial !== PLANS.free || storedPlan === PLANS.free || resolveUserType(user, email) === USER_TYPES.admin
    || typeof user?.planExpiresAt === "number") return initial;
  const payment = await ctx.db
    .query("paymentRequests")
    .withIndex("by_user_status_resolved", (q) => q.eq("userEmail", email).eq("status", "approved"))
    .order("desc")
    .first();
  return effectivePlan({ storedPlan, userType: resolveUserType(user, email), planExpiresAt: user?.planExpiresAt, payment }, now);
}

async function resolvePlanExpiration(ctx, user, email) {
  if (typeof user?.planExpiresAt === "number") return user.planExpiresAt;
  const storedPlan = resolvePlan(user);
  if (storedPlan === PLANS.free || resolveUserType(user, email) === USER_TYPES.admin) return null;

  const payment = await ctx.db
    .query("paymentRequests")
    .withIndex("by_user_status_resolved", (q) => q.eq("userEmail", email).eq("status", "approved"))
    .order("desc")
    .first();
  if (!payment?.resolvedAt || payment.plan !== storedPlan) return null;
  return payment.subscriptionEndAt
    ?? subscriptionEnd(payment.subscriptionStartAt ?? payment.resolvedAt, payment.billingPeriod);
}

export function needsFreeMaterialQuotaReset(user, activePlan, now = Date.now()) {
  return shouldResetFreeMaterialQuota({
    activePlan,
    planExpiresAt: user?.planExpiresAt,
    resetForPlanExpiresAt: user?.proMaterialResetForPlanExpiresAt,
  }, now);
}

export function resolveMaterialUsage(user, activePlan, now = Date.now()) {
  const returnedToFree = needsFreeMaterialQuotaReset(user, activePlan, now);
  return normalizePeriodUsage(
    returnedToFree ? undefined : user?.proMaterialPeriodStart,
    returnedToFree ? undefined : user?.proMaterialPeriodEnd,
    returnedToFree ? [] : user?.proMaterialUses,
    now,
  );
}

function buildEntitlements(user, email, activePlan = resolvePlan(user)) {
  const userType = resolveUserType(user, email);
  const plan = activePlan;
  const now = Date.now();
  const materialUsage = resolveMaterialUsage(user, plan, now);
  const freeProMaterialLimit = FREE_PRO_MATERIAL_LIMIT + activeReferralMaterialBonus(user, now);
  const toolUsage = normalizePeriodUsage(user?.toolUsePeriodStart, user?.toolUsePeriodEnd, user?.toolUses, now);
  const isAdminUser = userType === USER_TYPES.admin;

  return {
    email,
    userType,
    plan,
    isAdmin: isAdminUser,
    subjectLimit: isAdminUser || plan !== PLANS.free ? null : SUBJECT_SELECTION_LIMIT,
    canSeeAllCareerSubjects: isAdminUser || plan !== PLANS.free,
    canUseFreeMaterials: true,
    proMaterials: {
      limit: isAdminUser || plan !== PLANS.free ? null : freeProMaterialLimit,
      used: isAdminUser || plan !== PLANS.free ? 0 : materialUsage.uses.length,
      remaining: isAdminUser || plan !== PLANS.free ? null : Math.max(0, freeProMaterialLimit - materialUsage.uses.length),
      usedIds: materialUsage.uses,
      resetAt: materialUsage.periodEnd,
    },
    tools: {
      canViewList: isAdminUser || plan !== PLANS.free,
      limit: isAdminUser || plan === PLANS.excellence ? null : plan === PLANS.pro ? PRO_TOOL_LIMIT : 0,
      used: isAdminUser || plan === PLANS.excellence ? 0 : toolUsage.uses.length,
      remaining: isAdminUser || plan === PLANS.excellence ? null : Math.max(0, (plan === PLANS.pro ? PRO_TOOL_LIMIT : 0) - toolUsage.uses.length),
      usedIds: toolUsage.uses,
      resetAt: toolUsage.periodEnd,
    },
  };
}

function formatSubjectSelectionMutationResult(user, email, activePlan = resolvePlan(user)) {
  const editsRemaining = normalizeEditsRemaining(user?.subjectSelectionEditsRemaining);
  return {
    email,
    userType: resolveUserType(user, email),
    plan: activePlan,
    selectedSubjectCodes: sanitizeSubjectCodes(user?.selectedSubjectCodes),
    modalSeen: Boolean(user?.subjectSelectionModalSeen),
    subjectSelectionModalSeen: Boolean(user?.subjectSelectionModalSeen),
    editsRemaining,
    subjectSelectionEditsRemaining: editsRemaining,
    periodStart: user?.subjectSelectionPeriodStart ?? null,
    subjectSelectionPeriodStart: user?.subjectSelectionPeriodStart ?? null,
    periodEnd: user?.subjectSelectionPeriodEnd ?? null,
    subjectSelectionPeriodEnd: user?.subjectSelectionPeriodEnd ?? null,
    updatedAt: user?.subjectSelectionUpdatedAt ?? Date.now(),
    subjectSelectionUpdatedAt: user?.subjectSelectionUpdatedAt ?? Date.now(),
  };
}

function materialAccessState(user, email, document, activePlan) {
  const entitlement = buildEntitlements(user, email, activePlan);
  const level = String(document.level ?? "").toLowerCase();
  const isProMaterial = level === "pro";
  if (entitlement.isAdmin || entitlement.plan !== PLANS.free || !isProMaterial) {
    return {
      allowed: true,
      requiresConfirmation: false,
      consumesQuota: false,
      plan: entitlement.plan,
      remaining: entitlement.proMaterials.remaining,
      resetAt: entitlement.proMaterials.resetAt,
    };
  }

  const documentId = String(document._id);
  const alreadyUsed = entitlement.proMaterials.usedIds.includes(documentId);
  if (alreadyUsed) {
    return {
      allowed: true,
      requiresConfirmation: false,
      consumesQuota: false,
      plan: entitlement.plan,
      remaining: entitlement.proMaterials.remaining,
      resetAt: entitlement.proMaterials.resetAt,
    };
  }

  const remaining = entitlement.proMaterials.remaining ?? 0;
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: `Ya usaste tus ${entitlement.proMaterials.limit ?? FREE_PRO_MATERIAL_LIMIT} materiales Pro de este mes. Mejora tu plan para abrir materiales Pro sin límites.`,
      plan: entitlement.plan,
      remaining: 0,
      resetAt: entitlement.proMaterials.resetAt,
    };
  }

  return {
    allowed: true,
    requiresConfirmation: true,
    consumesQuota: true,
    plan: entitlement.plan,
    remaining,
    remainingAfterUse: Math.max(0, remaining - 1),
    limit: entitlement.proMaterials.limit ?? FREE_PRO_MATERIAL_LIMIT,
    resetAt: entitlement.proMaterials.resetAt,
    message: `Este material es Pro. Si continúas usarás 1 de tus ${entitlement.proMaterials.limit ?? FREE_PRO_MATERIAL_LIMIT} materiales Pro del mes.`,
  };
}

function toolAccessState(user, email, toolId, activePlan) {
  const entitlement = buildEntitlements(user, email, activePlan);
  if (entitlement.isAdmin || entitlement.plan === PLANS.excellence) {
    return {
      allowed: true,
      requiresConfirmation: false,
      consumesQuota: false,
      plan: entitlement.plan,
      remaining: entitlement.tools.remaining,
      resetAt: entitlement.tools.resetAt,
    };
  }

  if (entitlement.plan === PLANS.free) {
    return {
      allowed: false,
      reason: "Las herramientas están disponibles desde el plan Pro.",
      plan: entitlement.plan,
      remaining: 0,
      resetAt: entitlement.tools.resetAt,
    };
  }

  const alreadyUsed = entitlement.tools.usedIds.includes(toolId);
  if (alreadyUsed) {
    return {
      allowed: true,
      requiresConfirmation: false,
      consumesQuota: false,
      plan: entitlement.plan,
      remaining: entitlement.tools.remaining,
      resetAt: entitlement.tools.resetAt,
    };
  }

  const remaining = entitlement.tools.remaining ?? 0;
  if (remaining <= 0) {
    return {
      allowed: false,
      reason: "Ya usaste tus 3 herramientas de este mes. Excellence desbloquea herramientas ilimitadas.",
      plan: entitlement.plan,
      remaining: 0,
      resetAt: entitlement.tools.resetAt,
    };
  }

  return {
    allowed: true,
    requiresConfirmation: true,
    consumesQuota: true,
    plan: entitlement.plan,
    remaining,
    remainingAfterUse: Math.max(0, remaining - 1),
    limit: PRO_TOOL_LIMIT,
    resetAt: entitlement.tools.resetAt,
    message: `Esta herramienta usará 1 de tus ${PRO_TOOL_LIMIT} herramientas disponibles este mes.`,
  };
}

function normalizePeriodUsage(periodStart, periodEnd, uses, now) {
  const active = typeof periodEnd === "number" && periodEnd > now;
  if (active) {
    return {
      periodStart: typeof periodStart === "number" ? periodStart : now,
      periodEnd,
      uses: uniqueStrings(uses),
    };
  }
  return {
    periodStart: now,
    periodEnd: now + MONTHLY_LIMIT_PERIOD_MS,
    uses: [],
  };
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function seedUserType(email) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(normalizeEmail(email)) ? USER_TYPES.admin : USER_TYPES.user;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizeNationalIdValue(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12);
}

function activeReferralMaterialBonus(user, now) {
  if ((user?.referralMaterialBonusEndsAt ?? 0) <= now) return 0;
  const bonus = Number(user?.referralMaterialBonus ?? 0);
  return Number.isFinite(bonus) && bonus > 0 ? Math.floor(bonus) : 0;
}

async function generateReferralCode(ctx) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let code = "";
    for (let index = 0; index < 8; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const existing = await ctx.db
      .query("users")
      .withIndex("by_referral_code", (q) => q.eq("referralCode", code))
      .first();
    if (!existing) return code;
  }
  throw new Error("No se pudo generar un código de referido. Intenta de nuevo.");
}

function compactProfilePatch(args) {
  const patch = {};
  for (const key of ["firstName", "lastName", "nationalId", "phone"]) {
    if (typeof args[key] === "string" && args[key].trim()) {
      patch[key] = args[key].trim();
    }
  }
  if (Array.isArray(args.careers) && args.careers.length) {
    patch.careers = Array.from(new Set(args.careers.map((career) => career.trim()).filter(Boolean)));
  }
  return patch;
}

function validateProfilePatch(patch) {
  if (patch.firstName !== undefined && !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,15}$/.test(patch.firstName)) {
    throw new Error("El nombre debe contener entre 2 y 15 letras.");
  }
  if (patch.lastName !== undefined && !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,15}$/.test(patch.lastName)) {
    throw new Error("El apellido debe contener entre 2 y 15 letras.");
  }
  if (patch.nationalId !== undefined && !/^\d{6,12}$/.test(normalizeNationalIdValue(patch.nationalId))) {
    throw new Error("La cédula o el carnet universitario debe contener entre 6 y 12 números.");
  }
  if (patch.phone !== undefined && !/^0(2\d{2}|4(12|14|16|24|26))\d{7}$/.test(patch.phone)) {
    throw new Error("El teléfono debe ser venezolano y tener 11 dígitos.");
  }
  if (patch.careers !== undefined && (patch.careers.length === 0 || patch.careers.length > 2)) {
    throw new Error("Debes seleccionar entre 1 y 2 carreras.");
  }
}

function assertAuthBinding(user, subject) {
  if (!subject) throw new Error("La sesión autenticada no contiene un identificador de cuenta.");
  if (user?.supabaseAuthUserId && user.supabaseAuthUserId !== subject) {
    throw new Error("La identidad autenticada no corresponde al perfil solicitado.");
  }
}

function subjectsForCareers(careers) {
  const selectedCareers = new Set(Array.isArray(careers) ? careers.filter(Boolean) : []);
  if (selectedCareers.size === 0) return [];
  const subjectsByCode = new Map();

  for (const program of flowPrograms) {
    if (selectedCareers.size && !selectedCareers.has(program.id)) continue;
    for (const [periodIndex, period] of program.periods.entries()) {
      for (const course of period) {
        if (!subjectsByCode.has(course.code)) {
          subjectsByCode.set(course.code, {
            id: course.code,
            code: course.code,
            name: course.name,
            careers: [],
            periods: [],
          });
        }
        const entry = subjectsByCode.get(course.code);
        if (!entry.careers.some((career) => career.id === program.id)) {
          entry.careers.push({ id: program.id, name: program.name });
        }
        entry.periods.push({ career: program.id, period: periodIndex + 1 });
      }
    }
  }

  return Array.from(subjectsByCode.values()).sort((left, right) => left.name.localeCompare(right.name));
}

function sanitizeSubjectCodes(codes) {
  if (!Array.isArray(codes)) return [];
  return Array.from(new Set(codes
    .map((code) => String(code ?? "").trim())
    .filter(Boolean)
    .map((code) => COURSE_CODE_ALIASES[code] ?? code)));
}

function normalizeEditsRemaining(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return SUBJECT_SELECTION_EDITS_PER_PERIOD;
  return Math.max(0, Math.min(SUBJECT_SELECTION_EDITS_PER_PERIOD, Math.floor(value)));
}

function normalizeCareerEditsRemaining(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return CAREER_SELECTION_EDITS_PER_PERIOD;
  return Math.max(0, Math.min(CAREER_SELECTION_EDITS_PER_PERIOD, Math.floor(value)));
}

function sameStringSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
