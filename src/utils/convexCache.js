import { loadJson, removeJson, saveJson } from "./localStore.js";

const CACHE_PREFIX = "synapse-convex-cache-v1";
const DEFAULT_TTL_MS = 1000 * 60 * 5;
const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const memoryEntries = new Map();
const listeners = new Map();
let storageListenerReady = false;

function readEntry(key) {
  if (!memoryEntries.has(key)) memoryEntries.set(key, loadJson(key, null));
  return memoryEntries.get(key);
}

function notify(key) {
  listeners.get(key)?.forEach((listener) => listener());
}

function removeEntry(key) {
  removeJson(key);
  memoryEntries.delete(key);
  notify(key);
}

export function getConvexCacheSnapshot(name, args) {
  return readEntry(convexCacheKey(name, args));
}

export function subscribeConvexCache(name, args, listener) {
  const key = convexCacheKey(name, args);
  if (!storageListenerReady && typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === null) {
        memoryEntries.clear();
        listeners.forEach((subscribers) => subscribers.forEach((callback) => callback()));
      } else if (event.key.startsWith(`${CACHE_PREFIX}:`)) {
        memoryEntries.delete(event.key);
        notify(event.key);
      }
    });
    storageListenerReady = true;
  }
  const subscribers = listeners.get(key) ?? new Set();
  subscribers.add(listener);
  listeners.set(key, subscribers);
  return () => {
    subscribers.delete(listener);
    if (!subscribers.size) listeners.delete(key);
  };
}

export function convexCacheKey(name, args = {}) {
  return `${CACHE_PREFIX}:${name}:${stableStringify(args)}`;
}

export function readConvexCache(name, args, options = {}) {
  const key = convexCacheKey(name, args);
  const entry = readEntry(key);
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
  memoryEntries.set(key, entry);

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
  notify(key);
}

export function clearConvexCache(name, args) {
  if (name && args !== undefined) {
    removeEntry(convexCacheKey(name, args));
    return;
  }

  const keys = new Set([...Object.keys(localStorage), ...memoryEntries.keys()]);
  Array.from(keys)
    .filter((key) => key.startsWith(name ? `${CACHE_PREFIX}:${name}:` : `${CACHE_PREFIX}:`))
    .forEach(removeEntry);
}

export function getConvexCacheMeta(name, args) {
  const entry = readEntry(convexCacheKey(name, args));
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
    .map((key) => ({ key, entry: readEntry(key) }))
    .filter(({ entry }) => entry?.savedAt);

  for (const { key, entry } of entries) {
    if (key === protectedKey) continue;
    if (entry.version === undefined && now - entry.savedAt > MAX_CACHE_AGE_MS) removeEntry(key);
  }

  const remaining = entries
    .filter(({ key, entry }) => key !== protectedKey && (entry.version !== undefined || now - entry.savedAt <= MAX_CACHE_AGE_MS))
    .sort((left, right) => (left.entry.accessedAt ?? left.entry.savedAt) - (right.entry.accessedAt ?? right.entry.savedAt));
  const excess = Math.max(0, remaining.length - (aggressive ? Math.floor(MAX_CACHE_ENTRIES / 2) : MAX_CACHE_ENTRIES));
  remaining.slice(0, excess).forEach(({ key }) => removeEntry(key));
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
