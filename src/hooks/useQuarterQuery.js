import { useCachedConvexQuery } from "./useCachedConvexQuery";
import { quarterCacheVersion } from "../utils/quarterCacheVersion";

export function useQuarterQuery(queryRef, args, name, revision, scope, part, enabled) {
  return useCachedConvexQuery(queryRef, args, `quarter.${name}`, {
    enabled,
    cacheVersion: quarterCacheVersion(revision, scope, part),
    waitForCacheVersion: true,
    logPayloadLabel: `trimestre ${name}`,
  }).data;
}
