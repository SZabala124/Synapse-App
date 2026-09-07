import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertAdmin, isAdmin } from "./users";

export function nextTermDate(timestamp) {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 3);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay) + 7);
  return date.getTime();
}

export async function currentTerm(ctx) {
  return await ctx.db.query("academicTerms").withIndex("by_key", (q) => q.eq("key", "free")).unique();
}

export const status = query({
  args: { adminEmail: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    return await currentTerm(ctx);
  },
});

export const reset = mutation({
  args: { adminEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.adminEmail);
    const term = await currentTerm(ctx);
    if (term?.processing) throw new Error("Ya hay un reinicio en curso.");
    await startTerm(ctx, term);
    return null;
  },
});

async function startTerm(ctx, term) {
  const startedAt = Date.now();
  const resetAt = nextTermDate(startedAt);
  const data = { key: "free", startedAt, resetAt, processing: true, processed: 0 };
  if (term) await ctx.db.patch(term._id, data);
  else await ctx.db.insert("academicTerms", data);
  await ctx.scheduler.runAfter(0, internal.academicTerms.resetBatch, { startedAt, cursor: null });
  await ctx.scheduler.runAt(resetAt, internal.academicTerms.automaticReset, { startedAt });
}

export const automaticReset = internalMutation({
  args: { startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const term = await currentTerm(ctx);
    // A manual reset invalidates the previously scheduled reset.
    if (term?.startedAt === args.startedAt) await startTerm(ctx, term);
    return null;
  },
});

export const resetBatch = internalMutation({
  args: { startedAt: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const term = await currentTerm(ctx);
    if (term?.startedAt !== args.startedAt) return null;
    const page = await ctx.db.query("users").paginate({ cursor: args.cursor, numItems: 100 });
    let processed = term.processed;
    for (const user of page.page) {
      if (await isAdmin(ctx, user.email ?? "")) continue;
      await ctx.db.patch(user._id, {
        careerSelectionEditsRemaining: 1,
        careerSelectionPeriodStart: term.startedAt,
        careerSelectionPeriodEnd: term.resetAt,
        careerSelectionUpdatedAt: Date.now(),
        ...((user.plan ?? "free") === "free" ? {
        selectedSubjectCodes: [],
        subjectSelectionModalSeen: false,
        subjectSelectionEditsRemaining: 2,
        subjectSelectionPeriodStart: term.startedAt,
        subjectSelectionPeriodEnd: term.resetAt,
        subjectSelectionUpdatedAt: Date.now(),
        proMaterialUses: [],
        proMaterialPeriodStart: term.startedAt,
        proMaterialPeriodEnd: term.startedAt + 30 * 24 * 60 * 60 * 1000,
        } : {}),
      });
      processed++;
    }
    await ctx.db.patch(term._id, { processed, processing: !page.isDone });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.academicTerms.resetBatch, { startedAt: args.startedAt, cursor: page.continueCursor });
    return null;
  },
});
