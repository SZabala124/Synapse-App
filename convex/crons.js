import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Backfill subscriptions that existed before one-shot expiry scheduling was
// deployed, then periodically repair any missing expiration task.
crons.interval(
  "reconcile plan expirations",
  { hours: 24 },
  internal.users.reconcilePlanExpirations,
  { cursor: null },
);

export default crons;
