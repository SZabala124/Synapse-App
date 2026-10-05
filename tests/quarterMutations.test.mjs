import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["./convex/quarter.js"], bundle: true, platform: "node", format: "esm", write: false });
const quarter = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const syncBundle = await build({ entryPoints: ["./convex/quarterScheduleSync.js"], bundle: true, platform: "node", format: "esm", write: false });
const scheduleSync = await import(`data:text/javascript;base64,${Buffer.from(syncBundle.outputFiles[0].text).toString("base64")}`);
const usersBundle = await build({ entryPoints: ["./convex/users.js"], bundle: true, platform: "node", format: "esm", write: false });
const users = await import(`data:text/javascript;base64,${Buffer.from(usersBundle.outputFiles[0].text).toString("base64")}`);

function fixture() {
  const email = "cache-test@example.com";
  const rows = {
    users: [{ _id: "user", email, plan: "free", userType: "admin", careers: [], selectedSubjectCodes: ["A"] }],
    academicTerms: [{ _id: "term", key: "free", startedAt: 1, resetAt: 2 }],
    quarterPlanners: [{ _id: "planner", userEmail: email, termStartedAt: 1, selectedCourseCodes: ["A"] }],
    quarterSubjects: [{ _id: "tracked", userEmail: email, termStartedAt: 1, courseCode: "A", passTarget: 9.5 }],
    quarterEvaluations: [], quarterDataRevisions: [], quarterScheduleBlocks: [], quarterScheduleSubjects: [],
  };
  const writes = [];
  let sequence = 0;
  const ctx = {
    auth: { getUserIdentity: async () => ({ email, subject: "test" }) },
    db: {
      query(table) {
        const filters = [];
        const result = () => (rows[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
        const chain = {
          withIndex(_name, predicate) {
            const query = { eq(key, value) { filters.push([key, value]); return query; } };
            predicate?.(query);
            return chain;
          },
          order: () => chain,
          take: async (limit) => result().slice(0, limit),
          collect: async () => result(),
          first: async () => result()[0] ?? null,
          unique: async () => result()[0] ?? null,
        };
        return chain;
      },
      get: async (id) => Object.values(rows).flat().find((row) => row._id === id) ?? null,
      async patch(id, fields) {
        const row = Object.values(rows).flat().find((item) => item._id === id);
        assert.ok(row, `Missing mock row ${id}`);
        Object.assign(row, fields);
        writes.push({ kind: "patch", id, fields });
      },
      async insert(table, fields) {
        const id = `new-${++sequence}`;
        (rows[table] ??= []).push({ ...fields, _id: id });
        writes.push({ kind: "insert", table });
        return id;
      },
      async delete(id) {
        for (const table of Object.keys(rows)) rows[table] = rows[table].filter((row) => row._id !== id);
        writes.push({ kind: "delete", id });
      },
    },
  };
  return { ctx, rows, writes, email };
}

test("quarter overview and revision use the actual selection even when an old planner disagrees", async () => {
  const { ctx, rows, email } = fixture();
  rows.users[0].careers = ["psicologia"];
  rows.users[0].selectedSubjectCodes = ["FPTCC07", "FPTCC28"];
  rows.quarterPlanners[0].selectedCourseCodes = ["FBTEM02"];
  const overview = await quarter.getQuarterOverview._handler(ctx, { email });
  assert.deepEqual(overview.selectedCourseCodes, ["FPTCC07", "FPTCC28"]);
  assert.deepEqual((await quarter.getQuarterRevision._handler(ctx, { email })).selectedCourseCodes, overview.selectedCourseCodes);
  rows.users[0].selectedSubjectCodes = [];
  assert.deepEqual((await quarter.getQuarterOverview._handler(ctx, { email })).selectedCourseCodes, []);
  rows.users[0].selectedSubjectCodes = ["FPTCC07"];
  rows.users[0].subjectSelectionPeriodEnd = 1;
  assert.deepEqual((await quarter.getQuarterOverview._handler(ctx, { email })).selectedCourseCodes, []);
});

test("editing the quarter synchronizes the global selector and preserves free edit limits", async () => {
  const { ctx, rows, email } = fixture();
  rows.academicTerms[0].resetAt = Date.now() + 86400000;
  rows.users[0].careers = ["psicologia"];
  await quarter.saveSelectedSubjects._handler(ctx, { email, courseCodes: ["FPTCC07"] });
  assert.deepEqual((await users.getSubjectSelection._handler(ctx, { email })).selectedSubjectCodes, ["FPTCC07"]);
  rows.users[0].userType = "user";
  rows.users[0].subjectSelectionModalSeen = true;
  rows.users[0].subjectSelectionEditsRemaining = 1;
  await quarter.saveSelectedSubjects._handler(ctx, { email, courseCodes: ["FPTCC28"] });
  assert.deepEqual(rows.users[0].selectedSubjectCodes, ["FPTCC28"]);
  assert.deepEqual(rows.quarterPlanners[0].selectedCourseCodes, ["FPTCC28"]);
  assert.equal(rows.users[0].subjectSelectionEditsRemaining, 0);
  await assert.rejects(quarter.saveSelectedSubjects._handler(ctx, { email, courseCodes: ["FPTCC07"] }), /2 ediciones/);
  assert.deepEqual(rows.users[0].selectedSubjectCodes, ["FPTCC28"]);
});

test("tracking checks the current selection instead of a stale planner", async () => {
  const { ctx, rows, email } = fixture();
  rows.users[0].selectedSubjectCodes = ["B"];
  await assert.rejects(quarter.trackSubject._handler(ctx, { email, courseCode: "A" }), /seleccionada/);
  await quarter.trackSubject._handler(ctx, { email, courseCode: "B" });
  assert.ok(rows.quarterSubjects.some((subject) => subject.courseCode === "B"));
});

test("changes from the global selector immediately reach the quarter without deleting old grades", async () => {
  const { ctx, rows, email } = fixture();
  rows.users[0].userType = "user";
  rows.users[0].careers = ["psicologia"];
  rows.users[0].selectedSubjectCodes = ["FBTEM02"];
  rows.users[0].subjectSelectionPeriodEnd = Date.now() + 86400000;
  rows.users[0].subjectSelectionModalSeen = true;
  rows.quarterPlanners[0].selectedCourseCodes = ["FBTEM02"];
  rows.quarterEvaluations.push({ _id: "old-grade", userEmail: email, termStartedAt: 1, courseCode: "FBTEM02", grade: 18 });
  await users.saveSubjectSelection._handler(ctx, { email, subjectCodes: ["FPTCC07", "FPTCC28"] });
  assert.deepEqual((await quarter.getQuarterOverview._handler(ctx, { email })).selectedCourseCodes, ["FPTCC07", "FPTCC28"]);
  assert.deepEqual((await quarter.getQuarterRevision._handler(ctx, { email })).selectedCourseCodes, ["FPTCC07", "FPTCC28"]);
  assert.equal(rows.quarterEvaluations[0].grade, 18);
});

test("evaluation mutations maintain summaries and invalidate only dependent quarter data", async () => {
  const { ctx, rows, writes, email } = fixture();
  const args = { email, courseCode: "A", title: "Parcial", weight: 50, grade: 16 };
  await quarter.saveEvaluation._handler(ctx, args);
  assert.deepEqual(rows.quarterSubjects[0].evaluationStats, { count: 1, gradedCount: 1, accumulatedPoints: 8 });
  assert.deepEqual(rows.quarterDataRevisions[0].versions, { overview: 1, calendar: 1, "evaluations:A": 1 });
  const evaluationId = rows.quarterEvaluations[0]._id;
  writes.length = 0;
  await quarter.saveEvaluation._handler(ctx, { ...args, evaluationId });
  assert.equal(writes.length, 0);
  await quarter.saveEvaluation._handler(ctx, { ...args, evaluationId, clearGrade: true });
  assert.deepEqual(rows.quarterSubjects[0].evaluationStats, { count: 1, gradedCount: 0, accumulatedPoints: 0 });
  await quarter.deleteEvaluation._handler(ctx, { email, evaluationId });
  assert.deepEqual(rows.quarterSubjects[0].evaluationStats, { count: 0, gradedCount: 0, accumulatedPoints: 0 });
  assert.equal(rows.quarterDataRevisions[0].versions.schedule, undefined);
});

test("saving the same schedule does not rewrite blocks or bump revisions", async () => {
  const { ctx, rows, writes, email } = fixture();
  const args = { email, courseCode: "A", color: "#ba624b", classroom: "A-1", blocks: [{ day: 0, block: 1 }] };
  await quarter.saveCourseSchedule._handler(ctx, args);
  const id = rows.quarterScheduleBlocks[0]._id;
  writes.length = 0;
  await quarter.saveCourseSchedule._handler(ctx, args);
  assert.equal(writes.length, 0);
  assert.equal(rows.quarterScheduleBlocks[0]._id, id);
  rows.quarterScheduleBlocks.push({ _id: "occupied", userEmail: email, termStartedAt: 1, courseCode: "B", day: 1, block: 2 });
  await assert.rejects(quarter.saveCourseSchedule._handler(ctx, { ...args, blocks: [{ day: 1, block: 2 }] }), /ocupado/);
  assert.equal(writes.length, 0);
});

test("quarter revisions preserve authentication and cross-account isolation", async () => {
  const { ctx, email } = fixture();
  await assert.rejects(quarter.getQuarterRevision._handler(ctx, { email: "another@example.com" }), /otra cuenta/);
  ctx.auth.getUserIdentity = async () => null;
  await assert.rejects(quarter.getQuarterRevision._handler(ctx, { email }), /iniciar sesi/);
});

function seedSchedule(rows, email) {
  rows.quarterScheduleBlocks.push(
    { _id: "block-a", userEmail: email, termStartedAt: 1, courseCode: "A", day: 0, block: 1 },
    { _id: "block-b", userEmail: email, termStartedAt: 1, courseCode: "B", day: 1, block: 2 },
    { _id: "other-account", userEmail: "other@example.com", termStartedAt: 1, courseCode: "A", day: 0, block: 1 },
    { _id: "old-term", userEmail: email, termStartedAt: 0, courseCode: "A", day: 0, block: 1 },
  );
  rows.quarterScheduleSubjects.push(
    { _id: "settings-a", userEmail: email, termStartedAt: 1, courseCode: "A", color: "#ba624b", classroom: "A-1" },
    { _id: "settings-b", userEmail: email, termStartedAt: 1, courseCode: "B", color: "#ba624b", classroom: "B-1" },
  );
}

test("removing a quarter subject deletes its blocks and settings without touching evaluations", async () => {
  const { ctx, rows, email } = fixture();
  seedSchedule(rows, email);
  rows.quarterEvaluations.push({ _id: "evaluation", userEmail: email, termStartedAt: 1, courseCode: "A" });
  await quarter.saveSelectedSubjects._handler(ctx, { email, courseCodes: [] });
  assert.deepEqual(rows.quarterScheduleBlocks.map((row) => row._id), ["other-account", "old-term"]);
  assert.equal(rows.quarterScheduleSubjects.length, 0);
  assert.equal(rows.quarterEvaluations.length, 1);
  assert.equal(rows.quarterDataRevisions[0].versions.schedule, 1);
});

test("global subject changes synchronize the quarter planner and prune only removed courses", async () => {
  const { ctx, rows, email, writes } = fixture();
  seedSchedule(rows, email);
  await scheduleSync.syncQuarterSubjectSelection(ctx, email, ["B"]);
  assert.deepEqual(rows.quarterPlanners[0].selectedCourseCodes, ["B"]);
  assert.ok(rows.quarterScheduleBlocks.some((row) => row._id === "block-b"));
  assert.ok(!rows.quarterScheduleBlocks.some((row) => row._id === "block-a"));
  assert.deepEqual(rows.quarterScheduleSubjects.map((row) => row.courseCode), ["B"]);
  writes.length = 0;
  await quarter.saveSelectedSubjects._handler(ctx, { email, courseCodes: [] });
  writes.length = 0;
  await quarter.saveSelectedSubjects._handler(ctx, { email, courseCodes: [] });
  assert.equal(writes.length, 0);
});

test("clearing a schedule is scoped, idempotent and preserves selected subjects and grades", async () => {
  const { ctx, rows, email, writes } = fixture();
  seedSchedule(rows, email);
  rows.quarterEvaluations.push({ _id: "evaluation", userEmail: email, termStartedAt: 1, courseCode: "A", grade: 16 });
  await quarter.clearSchedule._handler(ctx, { email });
  assert.deepEqual(rows.quarterScheduleBlocks.map((row) => row._id), ["other-account", "old-term"]);
  assert.equal(rows.quarterScheduleSubjects.length, 0);
  assert.deepEqual(rows.quarterPlanners[0].selectedCourseCodes, ["A"]);
  assert.equal(rows.quarterEvaluations[0].grade, 16);
  assert.equal(rows.quarterSubjects.length, 1);
  assert.equal(rows.quarterDataRevisions[0].versions.schedule, 1);
  writes.length = 0;
  await quarter.clearSchedule._handler(ctx, { email });
  assert.equal(writes.length, 0);
  await assert.rejects(quarter.clearSchedule._handler(ctx, { email: "other@example.com" }), /otra cuenta/);
});

test("changing careers retains selected courses still available and removes unavailable schedules", async () => {
  const { ctx, rows, email } = fixture();
  seedSchedule(rows, email);
  rows.quarterPlanners[0].selectedCourseCodes = ["A", "B"];
  await scheduleSync.syncQuarterSubjectSelection(ctx, email, ["B", "C"], { restrictToAllowed: true, fallbackCodes: ["C"] });
  assert.deepEqual(rows.quarterPlanners[0].selectedCourseCodes, ["B"]);
  assert.ok(rows.quarterScheduleBlocks.some((row) => row._id === "block-b"));
  assert.ok(!rows.quarterScheduleBlocks.some((row) => row._id === "block-a"));
});
