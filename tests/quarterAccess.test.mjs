import test from "node:test";
import assert from "node:assert/strict";
import { canEditTrackedSubject } from "../convex/quarterAccess.js";

test("free accounts can edit only the first three tracked subjects", () => {
  assert.equal(canEditTrackedSubject({ plan: "free", index: 0 }), true);
  assert.equal(canEditTrackedSubject({ plan: "free", index: 1 }), true);
  assert.equal(canEditTrackedSubject({ plan: "free", index: 2 }), true);
  assert.equal(canEditTrackedSubject({ plan: "free", index: 3 }), false);
});

test("paid plans and administrators can edit every tracked subject", () => {
  assert.equal(canEditTrackedSubject({ plan: "pro", index: 3 }), true);
  assert.equal(canEditTrackedSubject({ plan: "excellence", index: 3 }), true);
  assert.equal(canEditTrackedSubject({ plan: "free", isAdmin: true, index: 3 }), true);
});
