import test from "node:test";
import assert from "node:assert/strict";
import { purchaseOptions, quarterlyUpgrade, resolvedPlanExpiration, shouldResetFreeMaterialQuota, subscriptionEnd } from "../convex/paymentPricing.js";

const start = Date.UTC(2026, 0, 31, 12);
const payment = { _id: "monthly", plan: "pro", status: "approved", billingPeriod: "monthly", amountUsd: 3, resolvedAt: start };
test("an expired plan restores the free material quota exactly once", () => {
  const expiresAt = start;
  const expiredProfile = { activePlan: "free", planExpiresAt: expiresAt, resetForPlanExpiresAt: undefined };
  assert.equal(shouldResetFreeMaterialQuota(expiredProfile, expiresAt), true);
  assert.equal(shouldResetFreeMaterialQuota({ ...expiredProfile, resetForPlanExpiresAt: expiresAt }, expiresAt), false);
  assert.equal(shouldResetFreeMaterialQuota({ ...expiredProfile, activePlan: "pro" }, expiresAt), false);
});

test("Pro pays 4 and keeps the original quarter start", () => {
  const offer = quarterlyUpgrade(payment, "pro", start + 86400000);
  assert.equal(offer.amountUsd, 4);
  assert.equal(offer.creditedUsd, 3);
  assert.equal(offer.subscriptionStartAt, start);
  assert.equal(offer.subscriptionEndAt, Date.UTC(2026, 3, 30, 12));
});
test("Excellence pays 5", () => {
  assert.equal(quarterlyUpgrade({ ...payment, plan: "excellence", amountUsd: 4 }, "excellence", start).amountUsd, 5);
});
test("expired, different, pending and quarterly plans have no discount", () => {
  assert.equal(quarterlyUpgrade(payment, "pro", subscriptionEnd(start, "monthly")), null);
  assert.equal(quarterlyUpgrade(payment, "excellence", start), null);
  assert.equal(quarterlyUpgrade({ ...payment, status: "pending" }, "pro", start), null);
  assert.equal(quarterlyUpgrade({ ...payment, billingPeriod: "quarterly" }, "pro", start), null);
  assert.equal(quarterlyUpgrade(null, "pro", start), null);
});
test("credit never exceeds the amount paid or monthly price", () => {
  assert.equal(quarterlyUpgrade({ ...payment, amountUsd: 2 }, "pro", start).amountUsd, 5);
  assert.equal(quarterlyUpgrade({ ...payment, amountUsd: 20 }, "pro", start).amountUsd, 4);
});

test("a plan explicitly expired by the admin can be purchased again at full price", () => {
  const now = start + 7 * 86400000;
  const stillScheduledPayment = { ...payment, subscriptionEndAt: now + 30 * 86400000 };
  const renewed = purchaseOptions(stillScheduledPayment, "pro", "pro", now, now - 1);
  assert.deepEqual(renewed.monthly, { amountUsd: 3 });
  assert.deepEqual(renewed.bimonthly, { amountUsd: 5 });
  assert.deepEqual(renewed.quarterly, { amountUsd: 7 });
});

test("an active plan still prevents buying the exact same plan period twice", () => {
  const active = purchaseOptions(payment, "pro", "pro", start + 1000, subscriptionEnd(start, "monthly"));
  assert.equal(active.monthly, null);
});

test("manual expiration is the reactive account expiration instead of the approved payment date", () => {
  const paymentEnd = subscriptionEnd(start, "quarterly");
  const manualEnd = start + 14 * 86400000;
  const result = resolvedPlanExpiration(
    { plan: "pro", planExpiresAt: manualEnd },
    { ...payment, billingPeriod: "quarterly", subscriptionEndAt: paymentEnd },
    "pro",
  );
  assert.equal(result, manualEnd);
});
