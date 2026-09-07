import test from "node:test";
import assert from "node:assert/strict";
import { quarterlyUpgrade, subscriptionEnd } from "../convex/paymentPricing.js";

const start = Date.UTC(2026, 0, 31, 12);
const payment = { _id: "monthly", plan: "pro", status: "approved", billingPeriod: "monthly", amountUsd: 3, resolvedAt: start };
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
