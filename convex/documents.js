import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { assertAdmin } from "./users";
import { flowPrograms } from "./flowData";

const MATERIALS_CANDIDATE_PAGE_SIZE = 6;
const LIBRARY_STATE_KEY = "materials";

export const list = query({
  args: {
    search: v.optional(v.string()),
    format: v.optional(v.string()),
    level: v.optional(v.string()),
    subject: v.optional(v.string()),
    sort: v.optional(v.string()),
    limit: v.optional(v.number()),
    savedOnly: v.optional(v.boolean()),
    userEmail: v.optional(v.string()),
    // When true, skips fetching per-user rating and saved state (used by flowchart)
    lightweight: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const format = args.format && args.format !== "Todos" ? args.format : undefined;
    const level = args.level && args.level !== "Todos" ? args.level : undefined;
    const subject = args.subject && args.subject !== "Todas" ? args.subject : undefined;
    const rawSearch = String(args.search ?? "").trim();
    const search = normalizeSearchText(rawSearch);
    const userProfile = args.userEmail ? await findUserByEmail(ctx, args.userEmail) : null;
    const allowedSubjects = allowedSubjectCodesForUser(userProfile);
    const limit = Math.min(Math.max(args.limit ?? 6, 1), 2000);

    // The full favorite list is only necessary for the saved-only filter.
    const favorites = (!args.lightweight && args.savedOnly && args.userEmail)
      ? await ctx.db
        .query("documentFavorites")
        .withIndex("by_user", (q) => q.eq("userEmail", args.userEmail))
        .collect()
      : [];
    const favoriteIds = new Set(favorites.map((row) => row.documentId));

    const candidateLimit = Math.min(Math.max(limit * 4, limit), 240);
    const docs = await takeMaterialCandidates(ctx, { sort: args.sort, format, level, search, rawSearch }, candidateLimit);
    const filtered = docs.filter((doc) => {
      const matchesFormat = !format || doc.format === format;
      const matchesLevel = !level || doc.level === level;
      const docSubjects = documentSubjects(doc);
      const matchesSubject = !subject || docSubjects.includes(subject);
      const matchesSearch = !search || normalizeSearchText([doc.title, docSubjects.join(" "), doc.format, doc.level, doc.fileName].join(" ")).includes(search);
      const matchesCareer = !allowedSubjects || (docSubjects.length > 0 && docSubjects.some((item) => allowedSubjects.has(item)));
      const matchesSaved = !args.savedOnly || favoriteIds.has(doc._id);
      return matchesFormat && matchesLevel && matchesSubject && matchesSearch && matchesCareer && matchesSaved;
    });
    const sorted = args.sort === "Mas vistos"
      ? [...filtered].sort((left, right) => (right.viewCount ?? 0) - (left.viewCount ?? 0))
      : filtered;
    const limited = sorted.slice(0, limit);

    // Lightweight mode (flowchart): use denormalized fields on document, skip rating queries
    if (args.lightweight) {
      return limited.map((doc) => withDenormalizedRatingStats(doc, null));
    }

    return await hydrateDocumentPage(ctx, limited, args.userEmail, favoriteIds, Boolean(args.savedOnly));
  },
});

export const listPage = query({
  args: {
    search: v.optional(v.string()),
    format: v.optional(v.string()),
    level: v.optional(v.string()),
    subject: v.optional(v.string()),
    sort: v.optional(v.string()),
    savedOnly: v.optional(v.boolean()),
    userEmail: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const format = args.format && args.format !== "Todos" ? args.format : undefined;
    const level = args.level && args.level !== "Todos" ? args.level : undefined;
    const subject = args.subject && args.subject !== "Todas" ? args.subject : undefined;
    const rawSearch = String(args.search ?? "").trim();
    const search = normalizeSearchText(rawSearch);
    const userProfile = args.userEmail ? await findUserByEmail(ctx, args.userEmail) : null;
    const allowedSubjects = allowedSubjectCodesForUser(userProfile);
    const favorites = args.savedOnly && args.userEmail
      ? await ctx.db
        .query("documentFavorites")
        .withIndex("by_user", (q) => q.eq("userEmail", args.userEmail))
        .collect()
      : [];
    const favoriteIds = new Set(favorites.map((row) => row.documentId));
    const pageSize = Math.min(Math.max(args.paginationOpts.numItems ?? MATERIALS_CANDIDATE_PAGE_SIZE, 1), MATERIALS_CANDIDATE_PAGE_SIZE);
    const candidateQuery = await materialCandidatesQuery(ctx, { sort: args.sort, format, level, search, rawSearch });
    const candidatePage = await candidateQuery.paginate({
      ...args.paginationOpts,
      numItems: pageSize,
    });
    const matches = candidatePage.page.filter((doc) =>
      documentMatchesFilters(doc, { format, level, subject, search, allowedSubjects, favoriteIds, savedOnly: args.savedOnly }),
    );

    return {
      page: await hydrateDocumentPage(ctx, matches, args.userEmail, favoriteIds, Boolean(args.savedOnly)),
      isDone: candidatePage.isDone,
      continueCursor: candidatePage.continueCursor,
    };
  },
});

export const metadataManifest = query({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const userProfile = await findUserByEmail(ctx, args.userEmail);
    const allowedSubjects = allowedSubjectCodesForUser(userProfile);
    const [documents, favorites, ratings] = await Promise.all([
      ctx.db.query("documents").withIndex("by_created").order("desc").collect(),
      ctx.db
        .query("documentFavorites")
        .withIndex("by_user", (q) => q.eq("userEmail", args.userEmail))
        .collect(),
      ctx.db
        .query("documentRatings")
        .withIndex("by_user_document", (q) => q.eq("userEmail", args.userEmail))
        .collect(),
    ]);
    const favoriteIds = new Set(favorites.map((row) => row.documentId));
    const ratingByDocument = new Map(ratings.map((row) => [row.documentId, row.rating]));
    const rows = documents
      .filter((document) => documentVisibleForSubjects(document, allowedSubjects))
      .map((document) => compactDocumentMetadata(document, {
        saved: favoriteIds.has(document._id),
        userRating: ratingByDocument.get(document._id) ?? 0,
      }));

    return {
      revision: await currentLibraryRevision(ctx),
      generatedAt: Date.now(),
      rows,
    };
  },
});

export const changesSince = query({
  args: {
    userEmail: v.string(),
    revision: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentRevision = await currentLibraryRevision(ctx);
    if (args.revision >= currentRevision) {
      return { currentRevision, resetRequired: false, changes: [] };
    }

    const limit = Math.min(Math.max(args.limit ?? 250, 1), 500);
    const userProfile = await findUserByEmail(ctx, args.userEmail);
    const allowedSubjects = allowedSubjectCodesForUser(userProfile);
    const changes = await ctx.db
      .query("libraryChanges")
      .withIndex("by_key_revision", (q) => q.eq("key", LIBRARY_STATE_KEY).gt("revision", args.revision))
      .order("asc")
      .take(limit + 1);

    if (changes.length > limit) {
      return { currentRevision, resetRequired: true, changes: [] };
    }

    const visibleChanges = [];
    for (const change of changes) {
      const beforeVisible = change.before && documentVisibleForSubjects(change.before, allowedSubjects);
      const afterVisible = change.after && documentVisibleForSubjects(change.after, allowedSubjects);
      if (afterVisible) {
        const [favorite, rating] = await Promise.all([
          ctx.db
            .query("documentFavorites")
            .withIndex("by_user_document", (q) => q.eq("userEmail", args.userEmail).eq("documentId", change.documentId))
            .unique(),
          ctx.db
            .query("documentRatings")
            .withIndex("by_user_document", (q) => q.eq("userEmail", args.userEmail).eq("documentId", change.documentId))
            .unique(),
        ]);
        visibleChanges.push({
          revision: change.revision,
          operation: "upsert",
          documentId: change.documentId,
          row: {
            ...change.after,
            saved: Boolean(favorite),
            userRating: rating?.rating ?? 0,
          },
        });
      } else if (beforeVisible) {
        visibleChanges.push({
          revision: change.revision,
          operation: "delete",
          documentId: change.documentId,
        });
      }
    }

    return {
      currentRevision,
      resetRequired: false,
      changes: visibleChanges,
    };
  },
});

export const facets = query({
  args: {
    search: v.optional(v.string()),
    format: v.optional(v.string()),
    level: v.optional(v.string()),
    subject: v.optional(v.string()),
    savedOnly: v.optional(v.boolean()),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const format = args.format && args.format !== "Todos" ? args.format : undefined;
    const level = args.level && args.level !== "Todos" ? args.level : undefined;
    const subject = args.subject && args.subject !== "Todas" ? args.subject : undefined;
    const rawSearch = String(args.search ?? "").trim();
    const search = normalizeSearchText(rawSearch);
    const userProfile = args.userEmail ? await findUserByEmail(ctx, args.userEmail) : null;
    const allowedSubjects = allowedSubjectCodesForUser(userProfile);
    const canUseAggregateStats = !search && !args.savedOnly && !allowedSubjects;
    if (canUseAggregateStats) {
      const stats = await ctx.db
        .query("libraryStats")
        .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
        .first();
      if (stats) return buildFacetResultFromStats(stats, { format, level, subject });
    }
    const favorites = args.userEmail
      ? await ctx.db
        .query("documentFavorites")
        .withIndex("by_user", (q) => q.eq("userEmail", args.userEmail))
        .collect()
      : [];
    const favoriteIds = new Set(favorites.map((row) => row.documentId));
    const docs = search
      ? await takeMaterialCandidates(ctx, { sort: "Recientes", format, level, search, rawSearch }, 240)
      : await ctx.db.query("documents").withIndex("by_created").order("desc").collect();
    const visibleDocs = docs.filter((doc) => {
      const docSubjects = documentSubjects(doc);
      const matchesSearch = !search || normalizeSearchText([doc.title, docSubjects.join(" "), doc.format, doc.level, doc.fileName].join(" ")).includes(search);
      const matchesCareer = !allowedSubjects || (docSubjects.length > 0 && docSubjects.some((item) => allowedSubjects.has(item)));
      const matchesSaved = !args.savedOnly || favoriteIds.has(doc._id);
      return matchesSearch && matchesCareer && matchesSaved;
    });
    const filteredTotal = visibleDocs.filter((doc) => {
      const matchesFormat = !format || doc.format === format;
      const matchesLevel = !level || doc.level === level;
      const matchesSubject = !subject || documentSubjects(doc).includes(subject);
      return matchesFormat && matchesLevel && matchesSubject;
    }).length;
    const docsForFormatCounts = visibleDocs.filter((doc) => {
      const matchesLevel = !level || doc.level === level;
      const matchesSubject = !subject || documentSubjects(doc).includes(subject);
      return matchesLevel && matchesSubject;
    });
    const docsForLevelCounts = visibleDocs.filter((doc) => {
      const matchesFormat = !format || doc.format === format;
      const matchesSubject = !subject || documentSubjects(doc).includes(subject);
      return matchesFormat && matchesSubject;
    });
    const docsForSubjectCounts = visibleDocs.filter((doc) => {
      const matchesFormat = !format || doc.format === format;
      const matchesLevel = !level || doc.level === level;
      return matchesFormat && matchesLevel;
    });

    return {
      total: visibleDocs.length,
      filteredTotal,
      formatTotal: docsForFormatCounts.length,
      levelTotal: docsForLevelCounts.length,
      subjectTotal: docsForSubjectCounts.length,
      formats: countDocsBy(docsForFormatCounts, "format"),
      levels: countDocsBy(docsForLevelCounts, "level"),
      subjects: countDocsBySubjects(docsForSubjectCounts),
    };
  },
});

// Uses denormalized ratingAverage/ratingCount stored directly on the document
// to avoid a full documentRatings table scan on every read.
function withDenormalizedRatingStats(doc, userRating) {
  return {
    _id: doc._id,
    title: doc.title,
    subject: doc.subject,
    subjects: doc.subjects,
    format: doc.format,
    level: doc.level,
    source: doc.source,
    externalUrl: doc.externalUrl,
    storagePath: doc.storagePath,
    imageStoragePath: doc.imageStoragePath,
    imageFileName: doc.imageFileName,
    fileName: doc.fileName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    viewCount: doc.viewCount ?? 0,
    ratingAverage: doc.ratingAverage ?? 0,
    ratingCount: doc.ratingCount ?? 0,
    userRating,
  };
}

// Legacy helper kept for potential use in admin/stats paths
function withRatingStats(doc, stats, userRating) {
  return withDenormalizedRatingStats(
    { ...doc, ratingAverage: stats?.count ? stats.total / stats.count : 0, ratingCount: stats?.count ?? 0 },
    userRating,
  );
}

function orderedDocumentsQuery(ctx, sort, { format, level } = {}) {
  const isMostViewed = sort === "Mas vistos";
  if (format && level) {
    return isMostViewed
      ? ctx.db.query("documents").withIndex("by_format_level_view_count", (q) => q.eq("format", format).eq("level", level)).order("desc")
      : ctx.db.query("documents").withIndex("by_format_level_created", (q) => q.eq("format", format).eq("level", level)).order("desc");
  }
  if (format) {
    return isMostViewed
      ? ctx.db.query("documents").withIndex("by_format_view_count", (q) => q.eq("format", format)).order("desc")
      : ctx.db.query("documents").withIndex("by_format_created", (q) => q.eq("format", format)).order("desc");
  }
  if (level) {
    return isMostViewed
      ? ctx.db.query("documents").withIndex("by_level_view_count", (q) => q.eq("level", level)).order("desc")
      : ctx.db.query("documents").withIndex("by_level_created", (q) => q.eq("level", level)).order("desc");
  }
  return isMostViewed
    ? ctx.db.query("documents").withIndex("by_view_count").order("desc")
    : ctx.db.query("documents").withIndex("by_created").order("desc");
}

async function materialCandidatesQuery(ctx, { sort, format, level, search, rawSearch }) {
  if (!search) {
    return orderedDocumentsQuery(ctx, sort, { format, level });
  }

  const searchIndexReady = await isSearchIndexReady(ctx);
  if (!searchIndexReady) {
    return ctx.db.query("documents").withSearchIndex("search_title", (q) => {
      let searchQuery = q.search("title", rawSearch || search);
      if (format) searchQuery = searchQuery.eq("format", format);
      if (level) searchQuery = searchQuery.eq("level", level);
      return searchQuery;
    });
  }

  return ctx.db.query("documents").withSearchIndex("search_normalized_title", (q) => {
    let searchQuery = q.search("searchTitle", search);
    if (format) searchQuery = searchQuery.eq("format", format);
    if (level) searchQuery = searchQuery.eq("level", level);
    return searchQuery;
  });
}

async function takeMaterialCandidates(ctx, filters, limit) {
  const candidateQuery = await materialCandidatesQuery(ctx, filters);
  return await candidateQuery.take(limit);
}

async function isSearchIndexReady(ctx) {
  const state = await ctx.db
    .query("libraryStates")
    .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
    .first();
  return Boolean(state?.searchIndexReady);
}

function documentMatchesFilters(doc, { format, level, subject, search, allowedSubjects, favoriteIds, savedOnly }) {
  const docSubjects = documentSubjects(doc);
  const matchesFormat = !format || doc.format === format;
  const matchesLevel = !level || doc.level === level;
  const matchesSubject = !subject || docSubjects.includes(subject);
  const matchesSearch = !search || normalizeSearchText([doc.title, docSubjects.join(" "), doc.format, doc.level, doc.fileName].join(" ")).includes(search);
  const matchesCareer = !allowedSubjects || (docSubjects.length > 0 && docSubjects.some((item) => allowedSubjects.has(item)));
  const matchesSaved = !savedOnly || favoriteIds.has(doc._id);
  return matchesFormat && matchesLevel && matchesSubject && matchesSearch && matchesCareer && matchesSaved;
}

async function hydrateDocumentPage(ctx, docs, userEmail, favoriteIds, favoritesWereLoaded) {
  if (docs.length === 0) return [];

  // Read per-card state only for the current page. This avoids downloading a
  // user's complete favorites and ratings collection for every six-card page.
  return await Promise.all(docs.map(async (doc) => {
    if (!userEmail) return { ...withDenormalizedRatingStats(doc, null), saved: false };
    const [rating, favorite] = await Promise.all([
      ctx.db
        .query("documentRatings")
        .withIndex("by_user_document", (q) => q.eq("userEmail", userEmail).eq("documentId", doc._id))
        .unique(),
      favoritesWereLoaded
        ? Promise.resolve(null)
        : ctx.db
          .query("documentFavorites")
          .withIndex("by_user_document", (q) => q.eq("userEmail", userEmail).eq("documentId", doc._id))
          .unique(),
    ]);
    return {
      ...withDenormalizedRatingStats(doc, rating?.rating ?? null),
      saved: favoritesWereLoaded ? favoriteIds.has(doc._id) : Boolean(favorite),
    };
  }));
}

export const libraryRevision = query({
  args: {},
  handler: async (ctx) => {
    const state = await ctx.db
      .query("libraryStates")
      .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
      .first();
    return {
      revision: state?.revision ?? 0,
      updatedAt: state?.updatedAt ?? 0,
      statsReady: Boolean(state?.statsReady),
      searchIndexReady: Boolean(state?.searchIndexReady),
    };
  },
});

async function currentLibraryRevision(ctx) {
  const state = await ctx.db
    .query("libraryStates")
    .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
    .first();
  return state?.revision ?? 0;
}

export const rebuildLibraryStats = mutation({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.userEmail);
    const documents = await ctx.db.query("documents").collect();
    await Promise.all(documents.map((document) => ctx.db.patch(document._id, {
      searchTitle: normalizeSearchText(document.title),
    })));
    const nextStats = { key: LIBRARY_STATE_KEY, ...buildLibraryStats(documents), updatedAt: Date.now() };
    const existing = await ctx.db
      .query("libraryStats")
      .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
      .first();
    if (existing) await ctx.db.patch(existing._id, nextStats);
    else await ctx.db.insert("libraryStats", nextStats);
    await bumpLibraryRevision(ctx, { statsReady: true, searchIndexReady: true });
    return { total: documents.length };
  },
});

async function bumpLibraryRevision(ctx, readiness = {}) {
  const current = await ctx.db
    .query("libraryStates")
    .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
    .first();
  const now = Date.now();
  if (current) {
    const nextRevision = current.revision + 1;
    await ctx.db.patch(current._id, {
      revision: nextRevision,
      updatedAt: now,
      ...readiness,
    });
    return nextRevision;
  }
  const initialRevision = 1;
  await ctx.db.insert("libraryStates", {
    key: LIBRARY_STATE_KEY,
    revision: initialRevision,
    updatedAt: now,
    ...readiness,
  });
  return initialRevision;
}

async function recordLibraryChange(ctx, before, after) {
  const existingStats = await ctx.db
    .query("libraryStats")
    .withIndex("by_key", (q) => q.eq("key", LIBRARY_STATE_KEY))
    .first();

  if (!existingStats) {
    const documents = await ctx.db.query("documents").collect();
    await ctx.db.insert("libraryStats", {
      key: LIBRARY_STATE_KEY,
      ...buildLibraryStats(documents),
      updatedAt: Date.now(),
    });
    const revision = await bumpLibraryRevision(ctx, { statsReady: true });
    await insertLibraryChange(ctx, revision, before, after);
    return;
  }

  const nextStats = cloneLibraryStats(existingStats);
  if (before) applyDocumentToStats(nextStats, before, -1);
  if (after) applyDocumentToStats(nextStats, after, 1);
  await ctx.db.patch(existingStats._id, { ...nextStats, updatedAt: Date.now() });
  const revision = await bumpLibraryRevision(ctx, { statsReady: true });
  await insertLibraryChange(ctx, revision, before, after);
}

async function insertLibraryChange(ctx, revision, before, after) {
  if (!revision) return;
  const documentId = after?._id ?? before?._id;
  if (!documentId) return;
  const operation = before && after ? "update" : after ? "create" : "delete";
  await ctx.db.insert("libraryChanges", {
    key: LIBRARY_STATE_KEY,
    revision,
    operation,
    documentId,
    before: before ? compactDocumentMetadata(before) : undefined,
    after: after ? compactDocumentMetadata(after) : undefined,
    createdAt: Date.now(),
  });
}

function buildLibraryStats(documents) {
  const stats = emptyLibraryStats();
  for (const document of documents) applyDocumentToStats(stats, document, 1);
  return stats;
}

function emptyLibraryStats() {
  return { total: 0, formats: {}, levels: {}, subjects: {}, formatLevels: {}, subjectDetails: {} };
}

function cloneLibraryStats(stats) {
  return {
    total: stats.total ?? 0,
    formats: { ...(stats.formats ?? {}) },
    levels: { ...(stats.levels ?? {}) },
    subjects: { ...(stats.subjects ?? {}) },
    formatLevels: { ...(stats.formatLevels ?? {}) },
    subjectDetails: Object.fromEntries(Object.entries(stats.subjectDetails ?? {}).map(([subject, detail]) => [
      subject,
      {
        total: detail.total ?? 0,
        formats: { ...(detail.formats ?? {}) },
        levels: { ...(detail.levels ?? {}) },
        formatLevels: { ...(detail.formatLevels ?? {}) },
      },
    ])),
  };
}

function applyDocumentToStats(stats, document, delta) {
  if (!document) return;
  stats.total = Math.max(0, stats.total + delta);
  adjustCount(stats.formats, document.format, delta);
  adjustCount(stats.levels, document.level, delta);
  adjustCount(stats.formatLevels, statPairKey(document.format, document.level), delta);
  for (const subject of documentSubjects(document)) {
    adjustCount(stats.subjects, subject, delta);
    const detail = stats.subjectDetails[subject] ?? { total: 0, formats: {}, levels: {}, formatLevels: {} };
    detail.total = Math.max(0, detail.total + delta);
    adjustCount(detail.formats, document.format, delta);
    adjustCount(detail.levels, document.level, delta);
    adjustCount(detail.formatLevels, statPairKey(document.format, document.level), delta);
    if (detail.total === 0) delete stats.subjectDetails[subject];
    else stats.subjectDetails[subject] = detail;
  }
}

function adjustCount(counts, key, delta) {
  if (!key) return;
  const next = Math.max(0, (counts[key] ?? 0) + delta);
  if (next === 0) delete counts[key];
  else counts[key] = next;
}

function statPairKey(format, level) {
  return `${format ?? ""}::${level ?? ""}`;
}

function countStatCombination(stats, format, level) {
  if (format && level) return stats.formatLevels?.[statPairKey(format, level)] ?? 0;
  if (format) return stats.formats?.[format] ?? 0;
  if (level) return stats.levels?.[level] ?? 0;
  return stats.total ?? 0;
}

function buildFacetResultFromStats(stats, { format, level, subject }) {
  const global = {
    total: stats.total ?? 0,
    formats: stats.formats ?? {},
    levels: stats.levels ?? {},
    formatLevels: stats.formatLevels ?? {},
  };
  const base = subject ? (stats.subjectDetails?.[subject] ?? emptyLibraryStats()) : global;
  const formats = {};
  const levels = {};
  const subjects = {};

  for (const formatName of Object.keys(base.formats ?? {})) {
    formats[formatName] = level
      ? base.formatLevels?.[statPairKey(formatName, level)] ?? 0
      : base.formats[formatName] ?? 0;
  }
  for (const levelName of Object.keys(base.levels ?? {})) {
    levels[levelName] = format
      ? base.formatLevels?.[statPairKey(format, levelName)] ?? 0
      : base.levels[levelName] ?? 0;
  }
  for (const [subjectCode, detail] of Object.entries(stats.subjectDetails ?? {})) {
    subjects[subjectCode] = countStatCombination(detail, format, level);
  }

  return {
    total: global.total,
    filteredTotal: countStatCombination(base, format, level),
    formatTotal: countStatCombination(base, undefined, level),
    levelTotal: countStatCombination(base, format, undefined),
    subjectTotal: countStatCombination(global, format, level),
    formats,
    levels,
    subjects,
  };
}

function countDocsBy(docs, key) {
  const counts = {};
  for (const doc of docs) {
    const value = doc?.[key];
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function countDocsBySubjects(docs) {
  const counts = {};
  for (const doc of docs) {
    for (const subject of documentSubjects(doc)) {
      counts[subject] = (counts[subject] ?? 0) + 1;
    }
  }
  return counts;
}

function documentSubjects(doc) {
  if (Array.isArray(doc.subjects) && doc.subjects.length > 0) return Array.from(new Set(doc.subjects.filter(Boolean)));
  return doc.subject ? [doc.subject] : [];
}

function documentVisibleForSubjects(doc, allowedSubjects) {
  if (!allowedSubjects) return true;
  const docSubjects = documentSubjects(doc);
  return docSubjects.length > 0 && docSubjects.some((subject) => allowedSubjects.has(subject));
}

function compactDocumentMetadata(doc, userState = {}) {
  return {
    _id: doc._id,
    title: doc.title,
    searchTitle: doc.searchTitle ?? normalizeSearchText(doc.title),
    subject: doc.subject,
    subjects: documentSubjects(doc),
    format: doc.format,
    level: doc.level,
    source: doc.source,
    externalUrl: doc.externalUrl,
    storagePath: doc.storagePath,
    imageStoragePath: doc.imageStoragePath,
    imageFileName: doc.imageFileName,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    fileSize: doc.fileSize,
    viewCount: doc.viewCount ?? 0,
    ratingAverage: doc.ratingAverage ?? 0,
    ratingCount: doc.ratingCount ?? 0,
    saved: Boolean(userState.saved),
    userRating: userState.userRating ?? 0,
    ownerId: doc.ownerId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function findUserByEmail(ctx, email) {
  return await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email.trim().toLowerCase()))
    .first();
}

function allowedSubjectCodesForUser(userProfile) {
  if (userProfile?.userType === "admin") return null;
  if (!userProfile?.careers?.length) return new Set();
  if (userProfile?.plan === "pro" || userProfile?.plan === "excellence") {
    return subjectCodesForCareers(userProfile.careers);
  }
  const subjectSelectionActive = !userProfile.subjectSelectionPeriodEnd || userProfile.subjectSelectionPeriodEnd > Date.now();
  if (subjectSelectionActive && Array.isArray(userProfile.selectedSubjectCodes) && userProfile.selectedSubjectCodes.length > 0) {
    return new Set(userProfile.selectedSubjectCodes.filter(Boolean));
  }
  return new Set();
}

function subjectCodesForCareers(careers) {
  const selectedCareers = new Set(Array.isArray(careers) ? careers.filter(Boolean) : []);
  const codes = new Set();
  for (const program of flowPrograms) {
    if (!selectedCareers.has(program.id)) continue;
    for (const period of program.periods) {
      for (const course of period) codes.add(course.code);
    }
  }
  return codes;
}

export const create = mutation({
  args: {
    title: v.string(),
    subject: v.optional(v.string()),
    subjects: v.optional(v.array(v.string())),
    format: v.string(),
    level: v.string(),
    source: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    storageBucket: v.optional(v.string()),
    storagePath: v.optional(v.string()),
    imageStorageBucket: v.optional(v.string()),
    imageStoragePath: v.optional(v.string()),
    imageFileName: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    userEmail: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.userEmail);
    const now = Date.now();
    const { userEmail, ...document } = args;
    const id = await ctx.db.insert("documents", {
      ...document,
      searchTitle: normalizeSearchText(document.title),
      saved: false,
      viewCount: 0,
      ownerId: userEmail,
      createdAt: now,
      updatedAt: now,
    });
    await recordLibraryChange(ctx, null, await ctx.db.get(id));
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.string(),
    subject: v.optional(v.string()),
    subjects: v.optional(v.array(v.string())),
    format: v.string(),
    level: v.string(),
    source: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    storageBucket: v.optional(v.string()),
    storagePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    imageStorageBucket: v.optional(v.string()),
    imageStoragePath: v.optional(v.string()),
    imageFileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    metadata: v.optional(v.any()),
    clearExternalUrl: v.optional(v.boolean()),
    clearStorageFile: v.optional(v.boolean()),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.userEmail);
    const document = await ctx.db.get(args.id);
    if (!document) return { deleted: false };

    const patch = {
      title: args.title.trim(),
      searchTitle: normalizeSearchText(args.title),
      format: args.format,
      level: args.level,
      updatedAt: Date.now(),
    };

    if (args.subject !== undefined) patch.subject = args.subject;
    if (args.subjects !== undefined) patch.subjects = args.subjects;
    if (args.source !== undefined) patch.source = args.source;
    if (args.metadata !== undefined) patch.metadata = args.metadata;

    if (args.clearExternalUrl) {
      patch.externalUrl = undefined;
    } else if (args.externalUrl !== undefined) {
      patch.externalUrl = args.externalUrl;
    }

    if (args.clearStorageFile) {
      patch.storageBucket = undefined;
      patch.storagePath = undefined;
      patch.fileName = undefined;
      patch.mimeType = undefined;
      patch.fileSize = undefined;
    } else {
      if (args.storageBucket !== undefined) patch.storageBucket = args.storageBucket;
      if (args.storagePath !== undefined) patch.storagePath = args.storagePath;
      if (args.fileName !== undefined) patch.fileName = args.fileName;
      if (args.mimeType !== undefined) patch.mimeType = args.mimeType;
      if (args.fileSize !== undefined) patch.fileSize = args.fileSize;
    }

    if (args.imageStorageBucket !== undefined) patch.imageStorageBucket = args.imageStorageBucket;
    if (args.imageStoragePath !== undefined) patch.imageStoragePath = args.imageStoragePath;
    if (args.imageFileName !== undefined) patch.imageFileName = args.imageFileName;

    await ctx.db.patch(args.id, patch);
    await recordLibraryChange(ctx, document, await ctx.db.get(args.id));
  },
});

export const remove = mutation({
  args: {
    id: v.id("documents"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    await assertAdmin(ctx, args.userEmail);
    const document = await ctx.db.get(args.id);
    if (!document) return { deleted: false };

    const ratings = await ctx.db
      .query("documentRatings")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    await Promise.all(ratings.map((rating) => ctx.db.delete(rating._id)));

    // Use index instead of full table scan
    const favorites = await ctx.db
      .query("documentFavorites")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    await Promise.all(favorites.map((favorite) => ctx.db.delete(favorite._id)));

    await ctx.db.delete(args.id);
    await recordLibraryChange(ctx, document, null);
    return { deleted: true };
  },
});

export const incrementView = mutation({
  args: {
    id: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("Documento no disponible.");
    await ctx.db.patch(args.id, {
      viewCount: (document.viewCount ?? 0) + 1,
    });
  },
});

export const rate = mutation({
  args: {
    id: v.id("documents"),
    userEmail: v.string(),
    rating: v.number(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("Documento no disponible.");

    const safeRating = Math.min(5, Math.max(1, Math.round(args.rating)));
    const existing = await ctx.db
      .query("documentRatings")
      .withIndex("by_user_document", (q) => q.eq("userEmail", args.userEmail).eq("documentId", args.id))
      .unique();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { rating: safeRating, updatedAt: now });
    } else {
      await ctx.db.insert("documentRatings", {
        userEmail: args.userEmail,
        documentId: args.id,
        rating: safeRating,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Recompute and denormalize rating stats onto the document
    const allRatings = await ctx.db
      .query("documentRatings")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    const count = allRatings.length;
    const total = allRatings.reduce((sum, r) => sum + r.rating, 0);
    await ctx.db.patch(args.id, {
      ratingAverage: count ? total / count : 0,
      ratingCount: count,
    });
  },
});

export const removeRating = mutation({
  args: {
    id: v.id("documents"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("Documento no disponible.");

    const existing = await ctx.db
      .query("documentRatings")
      .withIndex("by_user_document", (q) => q.eq("userEmail", args.userEmail).eq("documentId", args.id))
      .unique();

    if (!existing) return;
    await ctx.db.delete(existing._id);

    // Recompute and denormalize rating stats onto the document
    const allRatings = await ctx.db
      .query("documentRatings")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .collect();
    const count = allRatings.length;
    const total = allRatings.reduce((sum, r) => sum + r.rating, 0);
    await ctx.db.patch(args.id, {
      ratingAverage: count ? total / count : 0,
      ratingCount: count,
    });
  },
});

export const toggleSaved = mutation({
  args: {
    id: v.id("documents"),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.id);
    if (!document) throw new Error("Documento no disponible.");

    const existing = await ctx.db
      .query("documentFavorites")
      .withIndex("by_user_document", (q) => q.eq("userEmail", args.userEmail).eq("documentId", args.id))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }

    await ctx.db.insert("documentFavorites", {
      userEmail: args.userEmail,
      documentId: args.id,
      createdAt: Date.now(),
    });
    return true;
  },
});
