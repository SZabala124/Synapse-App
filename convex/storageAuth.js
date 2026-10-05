import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { isKnownAdmin, needsFreeMaterialQuotaReset, resolveActivePlan, resolveMaterialUsage } from "./users";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

export const authorizeUpload = internalQuery({
  args: {
    actorEmail: v.string(),
    mimeType: v.string(),
    size: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await isKnownAdmin(ctx, args.actorEmail))) throw new Error("Solo administradores pueden subir materiales.");
    if (!ALLOWED_MIME_TYPES.has(args.mimeType)) throw new Error("El tipo de archivo no está permitido.");
    if (!Number.isFinite(args.size) || args.size <= 0 || args.size > MAX_FILE_SIZE) {
      throw new Error("El archivo debe pesar entre 1 byte y 50 MB.");
    }
    return null;
  },
});

export const authorizeDelete = internalQuery({
  args: { actorEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await isKnownAdmin(ctx, args.actorEmail))) throw new Error("Solo administradores pueden borrar materiales.");
    return null;
  },
});

export const authorizeDownload = internalMutation({
  args: {
    actorEmail: v.string(),
    storagePath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", args.actorEmail)).take(10);
    const user = users.find((item) => item.userType === "admin") ?? users[0] ?? null;
    if (!user || user.userType === "blocked") throw new Error("La cuenta no tiene acceso a materiales.");

    let document = await ctx.db.query("documents")
      .withIndex("by_storage_path", (q) => q.eq("storagePath", args.storagePath)).first();
    if (!document) {
      document = await ctx.db.query("documents")
        .withIndex("by_image_storage_path", (q) => q.eq("imageStoragePath", args.storagePath)).first();
    }
    if (!document) throw new Error("El archivo no corresponde a un material publicado.");
    if (await isKnownAdmin(ctx, args.actorEmail)) return null;

    const activePlan = await resolveActivePlan(ctx, user, args.actorEmail);
    if (activePlan !== "free" || String(document.level ?? "").toLowerCase() !== "pro") return null;

    const now = Date.now();
    const usage = resolveMaterialUsage(user, activePlan, now);
    const uses = usage.uses;
    const documentId = String(document._id);
    if (uses.includes(documentId)) return null;
    const referralBonus = (user.referralMaterialBonusEndsAt ?? 0) > now
      ? Math.max(0, Math.floor(user.referralMaterialBonus ?? 0))
      : 0;
    if (uses.length >= 3 + referralBonus) throw new Error("Ya alcanzaste el límite mensual de materiales Pro.");
    await ctx.db.patch(user._id, {
      proMaterialPeriodStart: usage.periodStart,
      proMaterialPeriodEnd: usage.periodEnd,
      proMaterialUses: [...uses, documentId],
      ...(needsFreeMaterialQuotaReset(user, activePlan, now) ? {
        plan: "free",
        planExpirationScheduledAt: undefined,
        proMaterialResetForPlanExpiresAt: user.planExpiresAt,
      } : {}),
    });
    return null;
  },
});
