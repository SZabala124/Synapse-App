import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { getConvexCacheMeta, readConvexCache, writeConvexCache } from "../utils/convexCache";

const CACHE_NAME = "documents.pages";
const PAGE_SIZE = 6;
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function useCachedMaterialPages(queryRef, args, revision) {
  const argsKey = useMemo(() => JSON.stringify(args), [args]);
  const cacheArgs = useMemo(() => args, [argsKey]);
  const cacheVersion = revision ?? 0;
  const stateKey = `${argsKey}:${cacheVersion}`;
  const cachedSnapshot = useMemo(() => readSnapshot(cacheArgs, cacheVersion), [cacheArgs, cacheVersion]);
  const [pages, setPages] = useState(() => cachedSnapshot?.pages ?? []);
  const [activeKey, setActiveKey] = useState(stateKey);
  const [request, setRequest] = useState(() => cachedSnapshot ? null : { cursor: null });
  const pagesRef = useRef(pages);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    const nextSnapshot = readSnapshot(cacheArgs, cacheVersion);
    const nextPages = nextSnapshot?.pages ?? [];
    pagesRef.current = nextPages;
    setActiveKey(stateKey);
    setPages(nextPages);
    setRequest(nextSnapshot ? null : { cursor: null });
  }, [cacheArgs, cacheVersion, stateKey]);

  const queryArgs = request
    ? { ...cacheArgs, paginationOpts: { cursor: request.cursor, numItems: PAGE_SIZE } }
    : "skip";
  const remotePage = useQuery(queryRef, queryArgs);

  useEffect(() => {
    if (!request || remotePage === undefined) return;
    const requestCursor = request.cursor;
    const nextPage = {
      cursor: requestCursor,
      page: remotePage.page ?? [],
      isDone: Boolean(remotePage.isDone),
      continueCursor: remotePage.continueCursor ?? null,
    };
    const currentPages = pagesRef.current;
    const existingIndex = currentPages.findIndex((item) => item.cursor === requestCursor);
    const nextPages = existingIndex >= 0
      ? currentPages.map((item, index) => index === existingIndex ? nextPage : item).slice(0, existingIndex + 1)
      : [...currentPages, nextPage];
    pagesRef.current = nextPages;
    setPages(nextPages);
    writeSnapshot(cacheArgs, cacheVersion, nextPages);
    setRequest(null);
  }, [cacheArgs, cacheVersion, remotePage, request]);

  const visiblePages = activeKey === stateKey ? pages : [];
  const results = useMemo(() => visiblePages.flatMap((item) => item.page), [visiblePages]);
  const lastPage = visiblePages.at(-1);

  // A restrictive filter can leave a candidate page with fewer than six
  // matches. Continue in six-record metadata pages until the first visual row
  // is complete, without ever downloading the material files themselves.
  useEffect(() => {
    if (request || !lastPage || lastPage.isDone || results.length >= PAGE_SIZE || !lastPage.continueCursor) return;
    setRequest({ cursor: lastPage.continueCursor });
  }, [lastPage, request, results.length]);

  const loadMore = useCallback(() => {
    if (request || !lastPage || lastPage.isDone || !lastPage.continueCursor) return;
    setRequest({ cursor: lastPage.continueCursor });
  }, [lastPage, request]);

  const updateRow = useCallback((id, updater) => {
    const currentPages = pagesRef.current;
    let changed = false;
    const nextPages = currentPages.map((item) => ({
      ...item,
      page: item.page.map((row) => {
        if (row._id !== id) return row;
        changed = true;
        return updater(row);
      }),
    }));
    if (!changed) return;
    pagesRef.current = nextPages;
    setPages(nextPages);
    writeSnapshot(cacheArgs, cacheVersion, nextPages);
  }, [cacheArgs, cacheVersion]);

  return {
    results,
    status: request
      ? (visiblePages.length ? "LoadingMore" : "LoadingFirstPage")
      : lastPage && !lastPage.isDone ? "CanLoadMore" : "Exhausted",
    loadMore,
    updateRow,
  };
}

function readSnapshot(args, version) {
  const meta = getConvexCacheMeta(CACHE_NAME, args);
  if (!meta || meta.version !== version) return null;
  const snapshot = readConvexCache(CACHE_NAME, args, {
    allowStale: true,
    ttlMs: CACHE_TTL_MS,
    fallback: null,
  });
  return Array.isArray(snapshot?.pages) ? snapshot : null;
}

function writeSnapshot(args, version, pages) {
  writeConvexCache(CACHE_NAME, args, { pages }, { version });
}
