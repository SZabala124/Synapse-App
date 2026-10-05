import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { getConvexCacheSnapshot, subscribeConvexCache, writeConvexCache } from "../utils/convexCache";
import { canReuseQueryCache } from "../utils/queryCachePolicy";

export function useCachedConvexQuery(queryRef, args, cacheName, options = {}) {
  const enabled = options.enabled !== false;
  const argsKey = JSON.stringify(args ?? {});
  const normalizedArgs = useMemo(() => JSON.parse(argsKey), [argsKey]);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const lastLoggedRemoteKey = useRef(null);
  const lastLoggedCacheKey = useRef(null);
  const subscribe = useCallback((listener) => subscribeConvexCache(cacheName, normalizedArgs, listener), [cacheName, normalizedArgs]);
  const snapshot = useCallback(() => getConvexCacheSnapshot(cacheName, normalizedArgs), [cacheName, normalizedArgs]);
  const entry = useSyncExternalStore(subscribe, snapshot, () => null);
  const [, refreshClock] = useState(0);
  const waitingForVersion = options.waitForCacheVersion && options.cacheVersion === undefined;
  const skipRemoteQuery = !enabled || waitingForVersion || canReuseQueryCache(entry, options);
  const remoteValue = useQuery(queryRef, skipRemoteQuery ? "skip" : normalizedArgs);
  const isFromCache = enabled && Boolean(entry) && remoteValue === undefined;

  useEffect(() => {
    if (!enabled || options.cacheVersion !== undefined || !entry) return undefined;
    const remainingMs = (options.preferCacheMs ?? 0) - (Date.now() - entry.savedAt);
    if (remainingMs <= 0 || !Number.isFinite(remainingMs)) return undefined;
    const timer = window.setTimeout(() => refreshClock((tick) => tick + 1), Math.min(remainingMs, 2147483647));
    return () => window.clearTimeout(timer);
  }, [enabled, entry, options.cacheVersion, options.preferCacheMs]);

  useEffect(() => {
    if (skipRemoteQuery || remoteValue === undefined) return;
    const remoteKey = `${cacheName}:${argsKey}:${options.cacheVersion ?? ""}:${JSON.stringify(remoteValue)}`;
    const logLabel = optionsRef.current.logPayloadLabel;
    if (logLabel && lastLoggedRemoteKey.current !== remoteKey) {
      lastLoggedRemoteKey.current = remoteKey;
      console.info(`[Synapse ${logLabel}] Respuesta Convex recibida: ${formatPayloadBytes(estimatePayloadBytes(remoteValue))} JSON UTF-8 serializado (no incluye compresión ni protocolo; no equivale a Database I/O).`);
    }
    writeConvexCache(cacheName, normalizedArgs, remoteValue, { version: options.cacheVersion });
  }, [argsKey, cacheName, normalizedArgs, options.cacheVersion, remoteValue, skipRemoteQuery]);

  useEffect(() => {
    const logLabel = optionsRef.current.logPayloadLabel;
    const cacheKey = `${cacheName}:${argsKey}:${entry?.savedAt ?? ""}`;
    if (!logLabel || !isFromCache || lastLoggedCacheKey.current === cacheKey) return;
    lastLoggedCacheKey.current = cacheKey;
    console.info(`[Synapse ${logLabel}] Caché local reutilizada: 0 B descargados; ${formatPayloadBytes(estimatePayloadBytes(entry.value))} JSON UTF-8 disponible localmente.`);
  }, [argsKey, cacheName, entry, isFromCache]);

  return {
    data: enabled ? remoteValue === undefined ? entry?.value ?? options.initialValue : remoteValue : options.initialValue,
    isLoading: enabled && remoteValue === undefined && !entry,
    isFromCache,
    cacheMeta: entry ? { savedAt: entry.savedAt, ageMs: Date.now() - entry.savedAt, version: entry.version } : null,
  };
}

function estimatePayloadBytes(value) {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function formatPayloadBytes(bytes) {
  const kb = bytes / 1024;
  return `${bytes} B (${kb < 1024 ? `${kb.toFixed(2)} KB` : `${(kb / 1024).toFixed(3)} MB`})`;
}
