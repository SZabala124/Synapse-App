import { loadJson, removeJson, saveJson } from "./localStore";

const CACHE_PREFIX = "synapse-convex-cache-v1";
const DEFAULT_TTL_MS = 1000 * 60 * 5;
const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function convexCacheKey(name, args = {}) {
  return `${CACHE_PREFIX}:${name}:${stableStringify(args)}`;
}

export function readConvexCache(name, args, options = {}) {
  const key = convexCacheKey(name, args);
  const entry = loadJson(key, null);
  if (!entry || !("value" in entry)) return options.fallback;

  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const isExpired = ttlMs > 0 && Date.now() - entry.savedAt > ttlMs;
  if (isExpired && !options.allowStale) return options.fallback;

  return entry.value;
}

export function writeConvexCache(name, args, value, options = {}) {
  const now = Date.now();
  const key = convexCacheKey(name, args);
  const entry = {
    value,
    savedAt: now,
    accessedAt: now,
    version: options.version,
  };

  try {
    pruneConvexCache(key);
    saveJson(key, entry);
  } catch {
    // A cache miss is preferable to breaking the library when browser storage
    // is full or unavailable. Remove older entries and retry once.
    try {
      pruneConvexCache(key, true);
      saveJson(key, entry);
    } catch {
      // Intentionally keep the live Convex response usable without persistence.
    }
  }
}

export function clearConvexCache(name, args) {
  if (name && args !== undefined) {
    removeJson(convexCacheKey(name, args));
    return;
  }

  Object.keys(localStorage)
    .filter((key) => key.startsWith(name ? `${CACHE_PREFIX}:${name}:` : `${CACHE_PREFIX}:`))
    .forEach((key) => removeJson(key));
}

export function getConvexCacheMeta(name, args) {
  const entry = loadJson(convexCacheKey(name, args), null);
  if (!entry?.savedAt) return null;
  return {
    savedAt: entry.savedAt,
    ageMs: Date.now() - entry.savedAt,
    version: entry.version,
  };
}

function pruneConvexCache(protectedKey, aggressive = false) {
  const now = Date.now();
  const entries = Object.keys(localStorage)
    .filter((key) => key.startsWith(`${CACHE_PREFIX}:`))
    .map((key) => ({ key, entry: loadJson(key, null) }))
    .filter(({ entry }) => entry?.savedAt);

  for (const { key, entry } of entries) {
    if (key === protectedKey) continue;
    if (now - entry.savedAt > MAX_CACHE_AGE_MS) removeJson(key);
  }

  const remaining = entries
    .filter(({ key, entry }) => key !== protectedKey && now - entry.savedAt <= MAX_CACHE_AGE_MS)
    .sort((left, right) => (left.entry.accessedAt ?? left.entry.savedAt) - (right.entry.accessedAt ?? right.entry.savedAt));
  const excess = Math.max(0, remaining.length - (aggressive ? Math.floor(MAX_CACHE_ENTRIES / 2) : MAX_CACHE_ENTRIES));
  remaining.slice(0, excess).forEach(({ key }) => removeJson(key));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
