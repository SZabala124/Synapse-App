import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_LINKED_DEVICES = 2;

export const list = query({
  args: {
    email: v.string(),
    currentDeviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || normalizeEmail(identity.email) !== email) return [];

    const devices = await ctx.db
      .query("accountDevices")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .order("desc")
      .take(10);
    return devices.map((device) => ({
      id: device._id,
      deviceId: device.deviceId,
      label: device.label,
      createdAt: device.createdAt,
      lastSeenAt: device.lastSeenAt,
      isCurrent: device.deviceId === args.currentDeviceId,
    }));
  },
});

export const register = mutation({
  args: {
    email: v.string(),
    deviceId: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || normalizeEmail(identity.email) !== email) {
      throw new Error("No se pudo validar la sesión.");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("accountDevices")
      .withIndex("by_user_device", (q) => q.eq("userEmail", email).eq("deviceId", args.deviceId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { label: args.label, lastSeenAt: now });
      return { allowed: true, deviceId: args.deviceId, linkedDevices: 1 };
    }

    const devices = await ctx.db
      .query("accountDevices")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .take(MAX_LINKED_DEVICES + 1);
    if (devices.length >= MAX_LINKED_DEVICES) {
      throw new Error("Esta cuenta ya tiene 2 navegadores vinculados. Quita uno desde tu perfil para continuar.");
    }

    await ctx.db.insert("accountDevices", {
      userEmail: email,
      deviceId: args.deviceId,
      label: args.label,
      createdAt: now,
      lastSeenAt: now,
    });
    return { allowed: true, deviceId: args.deviceId, linkedDevices: devices.length + 1 };
  },
});

export const remove = mutation({
  args: {
    email: v.string(),
    deviceId: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || normalizeEmail(identity.email) !== email) {
      throw new Error("No se pudo validar la sesión.");
    }

    const device = await ctx.db
      .query("accountDevices")
      .withIndex("by_user_device", (q) => q.eq("userEmail", email).eq("deviceId", args.deviceId))
      .first();
    if (device) await ctx.db.delete(device._id);
    return { removed: Boolean(device) };
  },
});

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}
