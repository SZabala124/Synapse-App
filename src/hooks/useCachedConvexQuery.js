import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { getConvexCacheMeta, readConvexCache, writeConvexCache } from "../utils/convexCache";

export function useCachedConvexQuery(queryRef, args, cacheName, options = {}) {
  const enabled = options.enabled !== false;
  const rawArgs = args ?? {};
  const argsKey = useMemo(() => JSON.stringify(rawArgs), [rawArgs]);
  const normalizedArgs = useMemo(() => rawArgs, [argsKey]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const initialCacheMeta = getConvexCacheMeta(cacheName, normalizedArgs);
  const [cachedValue, setCachedValue] = useState(() =>
    readConvexCache(cacheName, normalizedArgs, {
      allowStale: true,
      fallback: options.initialValue,
      ttlMs: options.ttlMs,
    }),
  );
  const [shouldUseLocalCache, setShouldUseLocalCache] = useState(() => isFreshEnough(initialCacheMeta, options.preferCacheMs));
  const liveCacheMeta = getConvexCacheMeta(cacheName, normalizedArgs);
  const hasCachedEntry = Boolean(liveCacheMeta);
  const cacheVersionMatches = isCacheVersionCurrent(liveCacheMeta, options.cacheVersion);
  const skipRemoteQuery = cacheVersionMatches && (shouldUseLocalCache || isFreshEnough(liveCacheMeta, options.preferCacheMs));

  const remoteValue = useQuery(queryRef, !enabled || skipRemoteQuery ? "skip" : normalizedArgs);
  const remoteKey = useMemo(() => {
    if (remoteValue === undefined) return "__loading__";
    try {
      return JSON.stringify(remoteValue);
    } catch {
      return String(Date.now());
    }
  }, [remoteValue]);

  useEffect(() => {
    const nextCachedValue = readConvexCache(cacheName, normalizedArgs, {
      allowStale: true,
      fallback: optionsRef.current.initialValue,
      ttlMs: optionsRef.current.ttlMs,
    });
    const nextCacheMeta = getConvexCacheMeta(cacheName, normalizedArgs);
    setShouldUseLocalCache(isFreshEnough(nextCacheMeta, optionsRef.current.preferCacheMs));
    setCachedValue((currentValue) => (Object.is(currentValue, nextCachedValue) ? currentValue : nextCachedValue));
  }, [cacheName, argsKey, normalizedArgs]);

  useEffect(() => {
    if (remoteValue === undefined) return;
    writeConvexCache(cacheName, normalizedArgs, remoteValue, { version: optionsRef.current.cacheVersion });
    setCachedValue((currentValue) => {
      try {
        return JSON.stringify(currentValue) === remoteKey ? currentValue : remoteValue;
      } catch {
        return Object.is(currentValue, remoteValue) ? currentValue : remoteValue;
      }
    });
  }, [cacheName, argsKey, normalizedArgs, remoteKey, remoteValue]);

  const meta = useMemo(() => getConvexCacheMeta(cacheName, normalizedArgs), [cacheName, argsKey, cachedValue, normalizedArgs]);

  return {
    data: enabled ? (remoteValue === undefined ? cachedValue : remoteValue) : options.initialValue,
    isLoading: enabled && !skipRemoteQuery && remoteValue === undefined && !hasCachedEntry,
    isFromCache: enabled && hasCachedEntry && (skipRemoteQuery || remoteValue === undefined),
    cacheMeta: meta,
  };
}

function isFreshEnough(meta, preferCacheMs) {
  return Boolean(meta && preferCacheMs > 0 && Date.now() - meta.savedAt <= preferCacheMs);
}

function isCacheVersionCurrent(meta, cacheVersion) {
  if (cacheVersion === undefined) return true;
  return meta?.version === cacheVersion;
}
