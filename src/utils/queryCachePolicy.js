export function canReuseQueryCache(entry, { cacheVersion, preferCacheMs = 0 } = {}, now = Date.now()) {
  if (!entry || !("value" in entry)) return false;
  if (cacheVersion !== undefined) return entry.version === cacheVersion;
  return preferCacheMs > 0 && now - entry.savedAt < preferCacheMs;
}
