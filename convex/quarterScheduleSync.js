import { nextQuarterVersions } from "./quarterStats";

export async function bumpQuarterRevision(ctx, email, term, keys) {
  const existing = await ctx.db.query("quarterDataRevisions")
    .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).first();
  const versions = nextQuarterVersions(existing?.versions, keys);
  if (existing) await ctx.db.patch(existing._id, { versions });
  else await ctx.db.insert("quarterDataRevisions", { userEmail: email, termStartedAt: term.startedAt, versions });
}

export async function pruneQuarterSchedule(ctx, email, term, selectedCodes) {
  const selected = new Set(selectedCodes);
  let changed = false;
  for (const [table, limit] of [["quarterScheduleBlocks", 250], ["quarterScheduleSubjects", 100]]) {
    const rows = await ctx.db.query(table)
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(limit);
    for (const row of rows) {
      if (selected.has(row.courseCode)) continue;
      await ctx.db.delete(row._id);
      changed = true;
    }
  }
  return changed;
}

export async function syncQuarterSubjectSelection(ctx, email, codes, { restrictToAllowed = false, fallbackCodes = [] } = {}) {
  const term = await ctx.db.query("academicTerms").withIndex("by_key", (q) => q.eq("key", "free")).unique();
  if (!term) return;
  const planner = await ctx.db.query("quarterPlanners")
    .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).first();
  const selected = restrictToAllowed
    ? (planner?.selectedCourseCodes ?? fallbackCodes).filter((code) => codes.includes(code))
    : codes;
  if (planner && JSON.stringify(planner.selectedCourseCodes) !== JSON.stringify(selected)) {
    await ctx.db.patch(planner._id, { selectedCourseCodes: selected, updatedAt: Date.now() });
  }
  await pruneQuarterSchedule(ctx, email, term, selected);
  await bumpQuarterRevision(ctx, email, term, ["overview", "schedule"]);
}
