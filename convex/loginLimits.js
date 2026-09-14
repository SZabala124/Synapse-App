import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { isAdmin } from "./users";

const DAILY_LOGIN_LIMIT = 3;

export const record = mutation({
  args: { email: v.string() },
  returns: v.object({
    count: v.number(),
    limit: v.number(),
    remaining: v.number(),
    isExempt: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (await isAdmin(ctx, email)) {
      return { count: 0, limit: DAILY_LOGIN_LIMIT, remaining: DAILY_LOGIN_LIMIT, isExempt: true };
    }
    const now = Date.now();
    const day = caracasDay(now);
    const current = await ctx.db
      .query("dailyLoginLimits")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    const count = current?.day === day ? current.count : 0;

    if (count >= DAILY_LOGIN_LIMIT) {
      throw new Error("Ya alcanzaste los 3 inicios de sesión permitidos hoy. Vuelve a intentarlo mañana.");
    }

    const nextCount = count + 1;
    if (current) {
      await ctx.db.patch(current._id, { day, count: nextCount, updatedAt: now });
    } else {
      await ctx.db.insert("dailyLoginLimits", { email, day, count: nextCount, updatedAt: now });
    }

    return {
      count: nextCount,
      limit: DAILY_LOGIN_LIMIT,
      remaining: DAILY_LOGIN_LIMIT - nextCount,
      isExempt: false,
    };
  },
});

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function caracasDay(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}
