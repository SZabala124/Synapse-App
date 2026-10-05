import test from "node:test";
import assert from "node:assert/strict";
import { canReuseQueryCache } from "../src/utils/queryCachePolicy.js";
import { quarterCacheVersion } from "../src/utils/quarterCacheVersion.js";
import { evaluationStats, nextQuarterVersions } from "../convex/quarterStats.js";

test("versioned cache remains reusable indefinitely, but never after a revision change", () => {
  const entry = { value: [], version: "same", savedAt: 1 };
  assert.equal(canReuseQueryCache(entry, { cacheVersion: "same" }, 1e12), true);
  assert.equal(canReuseQueryCache(entry, { cacheVersion: "new" }, 1e12), false);
  assert.equal(canReuseQueryCache(null, { cacheVersion: "same" }), false);
});

test("unversioned cache retains finite freshness and accepts empty responses", () => {
  const entry = { value: null, savedAt: 100 };
  assert.equal(canReuseQueryCache(entry, { preferCacheMs: 1000 }, 1099), true);
  assert.equal(canReuseQueryCache(entry, { preferCacheMs: 1000 }, 1100), false);
  assert.equal(canReuseQueryCache(entry, {}, 100), false);
});

test("quarter cache invalidation is granular and follows term and permission changes", () => {
  const revision = { term: { startedAt: 1, resetAt: 2, displayName: "Actual" }, versions: { overview: 1, schedule: 2 } };
  const before = quarterCacheVersion(revision, "free", "schedule");
  const changed = { ...revision, versions: nextQuarterVersions(revision.versions, ["overview", "evaluations:A", "overview"]) };
  assert.equal(quarterCacheVersion(changed, "free", "schedule"), before);
  assert.notEqual(quarterCacheVersion(changed, "free", "overview"), quarterCacheVersion(revision, "free", "overview"));
  assert.notEqual(quarterCacheVersion(revision, "pro", "schedule"), before);
  assert.notEqual(quarterCacheVersion({ ...revision, term: { ...revision.term, startedAt: 3 } }, "free", "schedule"), before);
  assert.equal(quarterCacheVersion(undefined, "free", "schedule"), undefined);
  assert.equal(changed.versions.overview, 2);
  assert.equal(revision.versions.overview, 1);
});

test("evaluation summary counts zero grades but not missing or cleared grades", () => {
  assert.deepEqual(evaluationStats([
    { weight: 25, grade: 20 }, { weight: 25, grade: 0 }, { weight: 25 }, { weight: 25, grade: null },
  ]), { count: 4, gradedCount: 2, accumulatedPoints: 5 });
  assert.deepEqual(evaluationStats([]), { count: 0, gradedCount: 0, accumulatedPoints: 0 });
});

test("selection changes invalidate overview and schedule without discarding cached grades", () => {
  const revision = { versions: {}, selectedCourseCodes: ["A"] };
  const changed = { ...revision, selectedCourseCodes: ["B"] };
  for (const part of ["overview", "schedule"]) {
    assert.notEqual(quarterCacheVersion(revision, "same", part), quarterCacheVersion(changed, "same", part));
  }
  assert.equal(quarterCacheVersion(revision, "same", "evaluations:A"), quarterCacheVersion(changed, "same", "evaluations:A"));
});
