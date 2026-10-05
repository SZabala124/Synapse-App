import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { isKnownAdmin } from "./users";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

export const authorizeAndRecordAttempt = internalMutation({
  args: {
    adminEmail: v.string(),
    adminSubject: v.string(),
    targetEmail: v.string(),
  },
  returns: v.object({ supabaseAuthUserId: v.string() }),
  handler: async (ctx, args) => {
    const adminEmail = normalizeEmail(args.adminEmail);
    const targetEmail = normalizeEmail(args.targetEmail);
    const adminProfiles = await ctx.db.query("users")
      .withIndex("email", (q) => q.eq("email", adminEmail))
      .take(10);
    const isBoundAdmin = adminProfiles.some((profile) => profile.supabaseAuthUserId === args.adminSubject);
    if (!isBoundAdmin || !(await isKnownAdmin(ctx, adminEmail))) {
      throw new Error("Solo un administrador con sesión vinculada puede restablecer contraseñas.");
    }

    const now = Date.now();
    const attempts = await ctx.db.query("adminPasswordResetAttempts")
      .withIndex("by_admin", (q) => q.eq("adminEmail", adminEmail))
      .take(1);
    const attempt = attempts[0];
    const inWindow = attempt && now - attempt.windowStartedAt < ATTEMPT_WINDOW_MS;
    if (inWindow && attempt.count >= MAX_ATTEMPTS_PER_WINDOW) {
      throw new Error("Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.");
    }
    if (inWindow) {
      await ctx.db.patch(attempt._id, { count: attempt.count + 1 });
    } else if (attempt) {
      await ctx.db.patch(attempt._id, { windowStartedAt: now, count: 1 });
    } else {
      await ctx.db.insert("adminPasswordResetAttempts", { adminEmail, windowStartedAt: now, count: 1 });
    }

    const targetProfiles = await ctx.db.query("users")
      .withIndex("email", (q) => q.eq("email", targetEmail))
      .take(10);
    const targetIds = [...new Set(targetProfiles.map((profile) => profile.supabaseAuthUserId).filter(Boolean))];
    if (targetIds.length !== 1) {
      throw new Error(targetIds.length
        ? "La cuenta tiene una vinculación de autenticación ambigua; contacta soporte."
        : "La cuenta todavía no está vinculada con el proveedor de autenticación; el usuario debe iniciar sesión una vez o contactar soporte.");
    }
    return { supabaseAuthUserId: targetIds[0] };
  },
});

export const recordSuccess = internalMutation({
  args: { adminEmail: v.string(), targetEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("adminPasswordResetLogs", {
      adminEmail: normalizeEmail(args.adminEmail),
      targetEmail: normalizeEmail(args.targetEmail),
      createdAt: Date.now(),
    });
    return null;
  },
});

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}
