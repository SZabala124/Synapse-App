import { FLOW_CATALOG_VERSION } from "../../convex/flowData.js";

export function quarterCacheVersion(revision, scope, part) {
  if (!revision) return undefined;
  return JSON.stringify([
    "shared-selection-v2",
    FLOW_CATALOG_VERSION,
    scope,
    revision.term?.startedAt ?? 0,
    revision.term?.displayName ?? "",
    revision.term?.resetAt ?? 0,
    revision.versions?.[part] ?? 0,
    part === "overview" || part === "schedule" ? revision.selectedCourseCodes ?? [] : null,
  ]);
}
