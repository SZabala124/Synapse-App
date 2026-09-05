import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { flowPrograms } from "./flowData";

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
const MONTHLY_LIMIT_PERIOD_MS = 1000 * 60 * 60 * 24 * 30;
const FREE_PRO_MATERIAL_LIMIT = 3;
const PRO_TOOL_LIMIT = 3;

export const getProfile = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await findBestUserByEmail(ctx, email);
    if (user) return withResolvedUserType(user);

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
    const email = normalizeEmail(args.email);
    const user = await findBestUserByEmail(ctx, email);
    const userType = resolveUserType(user, email);

    return {
      email,
      userId: user?._id,
      userType,
      plan: resolvePlan(user),
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
    const users = await ctx.db.query("users").collect();
    return users
      .map((user) => ({
        _id: user._id,
        email: user.email ?? "",
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        nationalId: user.nationalId ?? "",
        phone: user.phone ?? "",
        careers: user.careers ?? [],
        userType: resolveUserType(user, user.email),
        plan: resolvePlan(user),
        selectedSubjectCodes: user.selectedSubjectCodes ?? [],
        subjectSelectionPeriodEnd: user.subjectSelectionPeriodEnd,
        createdAt: user._creationTime ?? user.createdAt ?? 0,
        updatedAt: user.updatedAt ?? user.subjectSelectionUpdatedAt ?? user._creationTime ?? 0,
      }))
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
  },
});

export const getEntitlements = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await findBestUserByEmail(ctx, email);
    return buildEntitlements(user, email);
  },
});

export const getSubjectSelection = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await findBestUserByEmail(ctx, email);
    const userType = resolveUserType(user, email);
    const plan = resolvePlan(user);
    const now = Date.now();
    const periodEnd = user?.subjectSelectionPeriodEnd ?? 0;
    const expired = Boolean(periodEnd && periodEnd <= now);
    const selectedSubjectCodes = expired ? [] : sanitizeSubjectCodes(user?.selectedSubjectCodes);
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
    const email = normalizeEmail(args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const existing = pickBestUser(matchingUsers);
    const seededType = seedUserType(email);
    const profilePatch = compactProfilePatch(args);
    if (existing) {
      const nextType = existing.userType ?? seededType;
      if (nextType !== existing.userType || seededType === USER_TYPES.admin || Object.keys(profilePatch).length > 0) {
        for (const user of matchingUsers) {
          const userTypePatch = user.userType === USER_TYPES.blocked
            ? USER_TYPES.blocked
            : nextType === USER_TYPES.admin || seededType === USER_TYPES.admin
              ? USER_TYPES.admin
              : nextType;
          await ctx.db.patch(user._id, {
            ...profilePatch,
            userType: userTypePatch,
          });
        }
        return await ctx.db.get(existing._id);
      }
      return existing;
    }

    const id = await ctx.db.insert("users", {
      email,
      ...profilePatch,
      userType: seededType,
    });
    return await ctx.db.get(id);
  },
});

export const recoverLocalAccess = mutation({
  args: {
    email: v.string(),
    nationalId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const nationalId = normalizeNationalIdValue(args.nationalId);
    const user = await findBestUserByEmail(ctx, email);

    if (!user) {
      throw new Error("No encontramos una cuenta con ese correo.");
    }

    if (!nationalId || normalizeNationalIdValue(user.nationalId) !== nationalId) {
      throw new Error("La cédula no coincide con la cuenta registrada.");
    }

    const resolved = withResolvedUserType(user);
    return {
      email: resolved.email ?? email,
      firstName: resolved.firstName ?? "",
      lastName: resolved.lastName ?? "",
      nationalId: resolved.nationalId ?? "",
      phone: resolved.phone ?? "",
      careers: resolved.careers ?? [],
      userType: resolved.userType,
      plan: resolved.plan,
      selectedSubjectCodes: sanitizeSubjectCodes(resolved.selectedSubjectCodes),
      subjectSelectionModalSeen: Boolean(resolved.subjectSelectionModalSeen),
      createdAt: resolved._creationTime ?? resolved.createdAt ?? 0,
      updatedAt: resolved.updatedAt ?? resolved._creationTime ?? 0,
    };
  },
});

export const saveSubjectSelection = mutation({
  args: {
    email: v.string(),
    subjectCodes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const existing = pickBestUser(matchingUsers);
    const userType = resolveUserType(existing, email);
    const plan = resolvePlan(existing);
    if (userType === USER_TYPES.admin || plan !== PLANS.free) {
      return {
        selectedSubjectCodes: [],
        editsRemaining: SUBJECT_SELECTION_EDITS_PER_PERIOD,
        modalSeen: true,
      };
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
    const nextEditsRemaining = previousModalSeen && selectionChanged
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
      subjectSelectionPeriodEnd: periodExpired ? now + SUBJECT_SELECTION_PERIOD_MS : existing?.subjectSelectionPeriodEnd,
      subjectSelectionEditsRemaining: nextEditsRemaining,
      subjectSelectionUpdatedAt: now,
    };

    if (existing) {
      for (const user of matchingUsers) {
        await ctx.db.patch(user._id, patch);
      }
      return { ...existing, ...patch };
    }

    const id = await ctx.db.insert("users", {
      ...patch,
      userType: USER_TYPES.user,
    });
    return await ctx.db.get(id);
  },
});

export const previewMaterialAccess = query({
  args: {
    email: v.string(),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await findBestUserByEmail(ctx, email);
    const document = await ctx.db.get(args.documentId);
    if (!document) return { allowed: false, reason: "Este material ya no esta disponible." };
    return materialAccessState(user, email, document);
  },
});

export const consumeMaterialAccess = mutation({
  args: {
    email: v.string(),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const user = pickBestUser(matchingUsers);
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Este material ya no esta disponible.");
    const preview = materialAccessState(user, email, document);
    if (!preview.allowed) throw new Error(preview.reason ?? "No puedes abrir este material con tu plan actual.");
    if (!preview.consumesQuota) return preview;

    const now = Date.now();
    const usage = normalizePeriodUsage(user?.proMaterialPeriodStart, user?.proMaterialPeriodEnd, user?.proMaterialUses, now);
    const nextUses = uniqueStrings([...usage.uses, String(args.documentId)]);
    const patch = {
      email,
      proMaterialPeriodStart: usage.periodStart,
      proMaterialPeriodEnd: usage.periodEnd,
      proMaterialUses: nextUses,
    };
    if (user) {
      for (const item of matchingUsers) await ctx.db.patch(item._id, patch);
    } else {
      await ctx.db.insert("users", { ...patch, userType: USER_TYPES.user, plan: PLANS.free });
    }
    return materialAccessState({ ...user, ...patch }, email, document);
  },
});

export const previewToolAccess = query({
  args: {
    email: v.string(),
    toolId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const user = await findBestUserByEmail(ctx, email);
    return toolAccessState(user, email, args.toolId);
  },
});

export const consumeToolAccess = mutation({
  args: {
    email: v.string(),
    toolId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const matchingUsers = await findUsersByEmail(ctx, email);
    const user = pickBestUser(matchingUsers);
    const preview = toolAccessState(user, email, args.toolId);
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
    return toolAccessState({ ...user, ...patch }, email, args.toolId);
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
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("users", {
      email: targetEmail,
      userType: args.userType,
    });
    return await ctx.db.get(id);
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
      return await ctx.db.get(existing._id);
    }

    const id = await ctx.db.insert("users", {
      email: targetEmail,
      userType: nextType,
      plan: PLANS.free,
    });
    return await ctx.db.get(id);
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
      return await ctx.db.get(existing._id);
    }
    const id = await ctx.db.insert("users", {
      email: targetEmail,
      userType: USER_TYPES.user,
      plan: args.plan,
    });
    return await ctx.db.get(id);
  },
});

export async function isAdmin(ctx, email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await findBestUserByEmail(ctx, normalizedEmail);
  return resolveUserType(user, normalizedEmail) === USER_TYPES.admin;
}

export async function assertAdmin(ctx, email) {
  if (!(await isAdmin(ctx, email))) {
    throw new Error("Solo administradores pueden realizar esta accion.");
  }
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
  return {
    ...user,
    userType: resolveUserType(user, user.email),
    plan: resolvePlan(user),
  };
}

function resolveUserType(user, email) {
  const seededType = seedUserType(email ?? "");
  if (seededType === USER_TYPES.admin) return USER_TYPES.admin;
  return user?.userType ?? USER_TYPES.user;
}

function resolvePlan(user) {
  return Object.values(PLANS).includes(user?.plan) ? user.plan : PLANS.free;
}

function buildEntitlements(user, email) {
  const userType = resolveUserType(user, email);
  const plan = resolvePlan(user);
  const now = Date.now();
  const materialUsage = normalizePeriodUsage(user?.proMaterialPeriodStart, user?.proMaterialPeriodEnd, user?.proMaterialUses, now);
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
      limit: isAdminUser || plan !== PLANS.free ? null : FREE_PRO_MATERIAL_LIMIT,
      used: isAdminUser || plan !== PLANS.free ? 0 : materialUsage.uses.length,
      remaining: isAdminUser || plan !== PLANS.free ? null : Math.max(0, FREE_PRO_MATERIAL_LIMIT - materialUsage.uses.length),
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

function materialAccessState(user, email, document) {
  const entitlement = buildEntitlements(user, email);
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
      reason: "Ya usaste tus 3 materiales Pro de este mes. Mejora tu plan para abrir materiales Pro sin limites.",
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
    limit: FREE_PRO_MATERIAL_LIMIT,
    resetAt: entitlement.proMaterials.resetAt,
    message: `Este material es Pro. Si continuas usaras 1 de tus ${FREE_PRO_MATERIAL_LIMIT} materiales Pro del mes.`,
  };
}

function toolAccessState(user, email, toolId) {
  const entitlement = buildEntitlements(user, email);
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
      reason: "Las herramientas estan disponibles desde el plan Pro.",
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
    message: `Esta herramienta usara 1 de tus ${PRO_TOOL_LIMIT} herramientas disponibles este mes.`,
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
  return email.trim().toLowerCase();
}

function normalizeNationalIdValue(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 9);
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
  return Array.from(new Set(codes.map((code) => String(code ?? "").trim()).filter(Boolean)));
}

function normalizeEditsRemaining(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return SUBJECT_SELECTION_EDITS_PER_PERIOD;
  return Math.max(0, Math.min(SUBJECT_SELECTION_EDITS_PER_PERIOD, Math.floor(value)));
}

function sameStringSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
