import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
const RECOVERY_QUESTION = v.union(
  v.literal("first_pet"),
  v.literal("first_car"),
  v.literal("birth_city"),
  v.literal("childhood_nickname"),
  v.literal("first_school"),
  v.literal("favorite_food"),
);

export const saveForCurrentUser = internalMutation({
  args: {
    email: v.string(),
    subject: v.string(),
    recoveryCodeHash: v.string(),
    recoveryCodeSalt: v.string(),
    recoveryQuestion: v.string(),
    recoveryAnswerHash: v.string(),
    recoveryAnswerSalt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const profiles = await ctx.db.query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .take(10);
    const ownedProfiles = profiles.filter((profile) => profile.supabaseAuthUserId === args.subject);
    if (ownedProfiles.length !== 1) throw new Error("No se pudo vincular la recuperación con esta cuenta.");
    const profile = ownedProfiles[0];
    await ctx.db.patch(profile._id, {
      recoveryCodeHash: args.recoveryCodeHash,
      recoveryCodeSalt: args.recoveryCodeSalt,
      recoveryQuestion: args.recoveryQuestion,
      recoveryAnswerHash: args.recoveryAnswerHash,
      recoveryAnswerSalt: args.recoveryAnswerSalt,
      recoveryCodeConsumedAt: undefined,
      recoveryResetReservedUntil: undefined,
      recoveryResetReservationId: undefined,
      recoveryResetMethod: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordAttempt = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const now = Date.now();
    const rows = await ctx.db.query("passwordRecoveryAttempts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(1);
    const row = rows[0];
    const inWindow = row && now - row.windowStartedAt < ATTEMPT_WINDOW_MS;
    if (inWindow && row.count >= MAX_ATTEMPTS_PER_WINDOW) {
      throw new Error("No se pudo verificar la recuperación. Espera 15 minutos e inténtalo de nuevo.");
    }
    if (inWindow) {
      await ctx.db.patch(row._id, { count: row.count + 1 });
    } else if (row) {
      await ctx.db.patch(row._id, { windowStartedAt: now, count: 1 });
    } else {
      await ctx.db.insert("passwordRecoveryAttempts", { email, windowStartedAt: now, count: 1 });
    }
    return null;
  },
});

export const loadRecoveryRecord = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), v.object({
    userId: v.id("users"),
    supabaseAuthUserId: v.string(),
    recoveryCodeHash: v.optional(v.string()),
    recoveryCodeSalt: v.optional(v.string()),
    recoveryAnswerHash: v.optional(v.string()),
    recoveryAnswerSalt: v.optional(v.string()),
    recoveryQuestion: v.optional(v.string()),
    recoveryCodeConsumedAt: v.optional(v.number()),
    recoveryResetReservedUntil: v.optional(v.number()),
  })),
  handler: async (ctx, args) => {
    const profiles = await ctx.db.query("users")
      .withIndex("email", (q) => q.eq("email", normalizeEmail(args.email)))
      .take(10);
    const candidates = profiles.filter((profile) => profile.supabaseAuthUserId
      && (profile.recoveryCodeHash || profile.recoveryAnswerHash));
    if (candidates.length !== 1) return null;
    const profile = candidates[0];
    return {
      userId: profile._id,
      supabaseAuthUserId: profile.supabaseAuthUserId,
      recoveryCodeHash: profile.recoveryCodeHash,
      recoveryCodeSalt: profile.recoveryCodeSalt,
      recoveryAnswerHash: profile.recoveryAnswerHash,
      recoveryAnswerSalt: profile.recoveryAnswerSalt,
      recoveryQuestion: profile.recoveryQuestion,
      recoveryCodeConsumedAt: profile.recoveryCodeConsumedAt,
      recoveryResetReservedUntil: profile.recoveryResetReservedUntil,
    };
  },
});

export const reserveReset = internalMutation({
  args: {
    userId: v.id("users"),
    method: v.union(v.literal("code"), v.literal("question")),
    question: v.optional(RECOVERY_QUESTION),
    expectedVerifierHash: v.string(),
    candidateVerifierHash: v.string(),
    reservationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.userId);
    if (!profile || !profile.supabaseAuthUserId) throw new Error("Invalid recovery credential.");
    const now = Date.now();
    if (profile.recoveryResetReservedUntil && profile.recoveryResetReservedUntil > now) {
      throw new Error("Invalid recovery credential.");
    }
    if (args.method === "code") {
      if (profile.recoveryCodeConsumedAt) throw new Error("Invalid recovery credential.");
      if (profile.recoveryCodeHash !== args.expectedVerifierHash
        || args.candidateVerifierHash !== profile.recoveryCodeHash) {
        throw new Error("Invalid recovery credential.");
      }
    } else if (profile.recoveryQuestion !== args.question
      || profile.recoveryAnswerHash !== args.expectedVerifierHash
      || args.candidateVerifierHash !== profile.recoveryAnswerHash) {
      throw new Error("Invalid recovery credential.");
    }
    await ctx.db.patch(profile._id, {
      recoveryResetReservedUntil: now + 2 * 60 * 1000,
      recoveryResetReservationId: args.reservationId,
      recoveryResetMethod: args.method,
      ...(args.method === "code" ? { recoveryCodeConsumedAt: now } : {}),
    });
    return null;
  },
});

export const releaseReset = internalMutation({
  args: { userId: v.id("users"), reservationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.userId);
    if (profile?.recoveryResetReservationId !== args.reservationId) return null;
    await ctx.db.patch(profile._id, {
      recoveryResetReservedUntil: undefined,
      recoveryResetReservationId: undefined,
      ...(profile.recoveryResetMethod === "code" ? { recoveryCodeConsumedAt: undefined } : {}),
      recoveryResetMethod: undefined,
    });
    return null;
  },
});

export const finishReset = internalMutation({
  args: {
    userId: v.id("users"),
    reservationId: v.string(),
    recoveryCodeHash: v.string(),
    recoveryCodeSalt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.userId);
    if (!profile || profile.recoveryResetReservationId !== args.reservationId) {
      throw new Error("No se pudo completar la recuperación. Contacta al administrador.");
    }
    await ctx.db.patch(profile._id, {
      recoveryCodeHash: args.recoveryCodeHash,
      recoveryCodeSalt: args.recoveryCodeSalt,
      recoveryCodeConsumedAt: undefined,
      recoveryResetReservedUntil: undefined,
      recoveryResetReservationId: undefined,
      recoveryResetMethod: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}
