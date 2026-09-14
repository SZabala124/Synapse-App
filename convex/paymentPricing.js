export const PLAN_PRICES = {
  pro: { monthly: 3, bimonthly: 5, quarterly: 7 },
  excellence: { monthly: 4, bimonthly: 6.5, quarterly: 9 },
};
export const PERIOD_MONTHS = { monthly: 1, bimonthly: 2, quarterly: 3 };

export function subscriptionEnd(start, billingPeriod) {
  const date = new Date(start);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + PERIOD_MONTHS[billingPeriod]);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.getTime();
}

export function quarterlyUpgrade(payment, currentPlan, now, targetPeriod = "quarterly") {
  return upgradeOffer(payment, currentPlan, currentPlan, now, targetPeriod);
}

function upgradeOffer(payment, currentPlan, targetPlan, now, targetPeriod) {
  if (!payment || payment.status !== "approved" || payment.plan !== currentPlan
    || !(PERIOD_MONTHS[payment.billingPeriod] <= PERIOD_MONTHS[targetPeriod]) || !payment.resolvedAt
    || !PLAN_PRICES[currentPlan] || !PLAN_PRICES[targetPlan]) return null;
  if (currentPlan === targetPlan && payment.billingPeriod === targetPeriod) return null;
  const start = payment.subscriptionStartAt ?? payment.resolvedAt;
  if ((payment.subscriptionEndAt ?? subscriptionEnd(start, payment.billingPeriod)) <= now) return null;
  // An active subscription always contributes its listed value, independent of
  // referral or accumulated discounts used when it was originally purchased.
  const credit = PLAN_PRICES[currentPlan][payment.billingPeriod];
  if (!Number.isFinite(credit) || credit <= 0) return null;
  const amountUsd = Math.round((PLAN_PRICES[targetPlan][targetPeriod] - credit) * 100) / 100;
  if (amountUsd <= 0) return null;
  return {
    basePaymentId: payment._id,
    amountUsd,
    creditedUsd: credit,
    subscriptionStartAt: start,
    subscriptionEndAt: subscriptionEnd(start, targetPeriod),
  };
}

export function purchaseOptions(payment, currentPlan, targetPlan, now) {
  const active = payment?.status === "approved" && payment.plan === currentPlan && payment.resolvedAt
    && (payment.subscriptionEndAt ?? subscriptionEnd(payment.subscriptionStartAt ?? payment.resolvedAt, payment.billingPeriod)) > now;
  const planRank = { free: 0, pro: 1, excellence: 2 };
  if (active && (planRank[targetPlan] ?? 0) < (planRank[currentPlan] ?? 0)) {
    return Object.fromEntries(Object.keys(PLAN_PRICES[targetPlan]).map((period) => [period, null]));
  }
  return Object.fromEntries(Object.entries(PLAN_PRICES[targetPlan]).map(([period, amountUsd]) => {
    if (active && (PERIOD_MONTHS[period] < PERIOD_MONTHS[payment.billingPeriod]
      || (currentPlan === targetPlan && period === payment.billingPeriod))) return [period, null];
    if (!active) return [period, { amountUsd }];
    return [period, upgradeOffer(payment, currentPlan, targetPlan, now, period)];
  }));
}
