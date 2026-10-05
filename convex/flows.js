import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { COURSE_CODE_ALIASES, flowPrograms, sharedCourseInstances } from "./flowData";
import { assertAdmin, isAdmin } from "./users";
import { requireAuthenticatedEmail } from "./security";

export const listCareers = query({
  args: {},
  handler: async () => {
    return flowPrograms.map(({ id, name, approval, updatedAt }) => ({ id, name, approval, updatedAt }));
  },
});

export const getFlowRevision = query({
  args: {
    career: v.string(),
    userEmail: v.string(),
  },
  returns: v.object({ statusVersion: v.number(), ratingVersion: v.number() }),
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.userEmail);
    if (!flowPrograms.some((program) => program.id === args.career)) {
      throw new Error("No se encontró esa carrera.");
    }
    const [statusRevision, ratingRevision] = await Promise.all([
      ctx.db.query("flowDataRevisions")
        .withIndex("by_key", (q) => q.eq("key", flowStatusRevisionKey(email, args.career)))
        .first(),
      ctx.db.query("flowDataRevisions")
        .withIndex("by_key", (q) => q.eq("key", flowRatingRevisionKey(args.career)))
        .first(),
    ]);
    return {
      statusVersion: statusRevision?.version ?? 0,
      ratingVersion: ratingRevision?.version ?? 0,
    };
  },
});

export const getCourseCatalogRevision = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireAuthenticatedEmail(ctx);
    const revision = await ctx.db.query("flowDataRevisions")
      .withIndex("by_key", (q) => q.eq("key", "course-catalog"))
      .first();
    return revision?.version ?? 0;
  },
});

export const listCourses = query({
  args: {
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userEmail = args.userEmail
      ? (await requireAuthenticatedEmail(ctx, args.userEmail)).email
      : null;
    const admin = userEmail ? await isAdmin(ctx, userEmail) : false;
    const coursesByCode = new Map();
    const userProfiles = userEmail
      ? await ctx.db.query("users").withIndex("email", (q) => q.eq("email", userEmail)).take(10)
      : [];
    const userProfile = userProfiles.find((profile) => profile.userType === "admin") ?? userProfiles[0] ?? null;
    const allowedCareers = !admin && userProfile?.careers?.length
      ? new Set(userProfile.careers)
      : null;

    for (const program of flowPrograms) {
      if (allowedCareers && !allowedCareers.has(program.id)) continue;
      program.periods.forEach((period, periodIndex) => {
        period.forEach((course) => {
          const code = course.code;
          if (!coursesByCode.has(code)) {
            coursesByCode.set(code, {
              id: code,
              code,
              name: course.name,
              credits: course.credits,
              careers: [],
              periods: [],
            });
          }

          const entry = coursesByCode.get(code);
          if (!entry.careers.some((career) => career.id === program.id)) {
            entry.careers.push({ id: program.id, name: program.name });
          }
          entry.periods.push({ career: program.id, period: periodIndex + 1 });
        });
      });
    }

    const coursesByName = new Map();

    for (const course of coursesByCode.values()) {
      const nameKey = course.name.trim().toLocaleLowerCase();
      const duplicates = coursesByName.get(nameKey) ?? [];
      duplicates.push(course);
      coursesByName.set(nameKey, duplicates);
    }

    const duplicateCodes = [...coursesByName.values()]
      .filter((courses) => courses.length > 1).flatMap((courses) => courses.map((course) => course.code));
    const ratingRows = (await Promise.all(duplicateCodes.map((code) => ctx.db
      .query("flowDifficultyRatings").withIndex("by_course_code", (q) => q.eq("courseCode", code)).take(100)))).flat();
    const ratedCodes = new Set(ratingRows.filter((row) => row.stars > 0).map((row) => row.courseCode));

    const visibleCourses = [];
    for (const duplicates of coursesByName.values()) {
      const rated = duplicates.filter((course) => ratedCodes.has(course.code));
      if (rated.length === 0) {
        visibleCourses.push(...duplicates);
        continue;
      }

      const retained = rated;
      const careers = [...new Map(duplicates.flatMap((course) => course.careers).map((career) => [career.id, career])).values()];
      const periods = duplicates.flatMap((course) => course.periods);
      retained[0].careers = careers;
      retained[0].periods = periods;
      visibleCourses.push(...retained);
    }

    return visibleCourses.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getFlow = query({
  args: {
    career: v.string(),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userEmail = args.userEmail
      ? (await requireAuthenticatedEmail(ctx, args.userEmail)).email
      : null;
    const program = flowPrograms.find((item) => item.id === args.career) ?? flowPrograms[0];
    const statuses = {};
    const periods = withCourseIds(program);
    const allInstances = flowPrograms.flatMap((item) =>
      withCourseIds(item).flat().map((course) => ({ ...course, career: item.id })),
    );
    const instancesByKey = new Map(allInstances.map((course) => [courseInstanceKey(course), course]));
    const targetIdentities = new Set(periods.flat().map((course) => sharedCourseIdentity({ ...course, career: program.id })));
    const statusesByIdentity = new Map();
    let rows = [];

    if (userEmail) {
      rows = await ctx.db
        .query("flowStatuses")
        .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail))
        .take(1000);
      rows.forEach((row) => {
        const rawCode = canonicalCourseCode(row.courseCode);
        const source = rawCode.startsWith("COURSE::")
          ? instancesByKey.get(rawCode)
          : (() => {
            const matching = allInstances.filter((course) => course.career === row.career && course.code === rawCode);
            if (rawCode === "FGE") return matching[0] ?? null;
            return matching.length === 1 ? matching[0] : null;
          })();
        if (!source) return;
        const identity = sharedCourseIdentity(source);
        if (!targetIdentities.has(identity)) return;
        const current = statusesByIdentity.get(identity);
        if (!current || row.updatedAt > current.updatedAt) {
          statusesByIdentity.set(identity, { status: row.status, updatedAt: row.updatedAt });
        }
      });
    }

    periods.flat().forEach((course) => {
      const sharedStatus = statusesByIdentity.get(sharedCourseIdentity({ ...course, career: program.id }));
      if (sharedStatus) statuses[courseInstanceKey(course)] = sharedStatus;
    });

    const publicStatuses = Object.fromEntries(Object.entries(statuses).map(([code, value]) => [code, value.status]));
    const ratingRows = await ctx.db
      .query("flowDifficultyRatings")
      .withIndex("by_career", (q) => q.eq("career", program.id))
      .take(1000);
    const difficultyRatings = await getSharedDifficultyRatings(ctx, program, ratingRows);
    return {
      ...program,
      periods,
      statuses: publicStatuses,
      difficultyRatings,
      debug: buildFlowDebug("getFlow", rows, publicStatuses),
    };
  },
});

export const setDifficultyRating = mutation({
  args: {
    adminEmail: v.string(),
    career: v.string(),
    courseCode: v.string(),
    stars: v.number(),
  },
  handler: async (ctx, args) => {
    const adminEmail = await assertAdmin(ctx, args.adminEmail);
    if (!Number.isFinite(args.stars) || args.stars < 0 || args.stars > 6) {
      throw new Error("La dificultad debe estar entre 0 y 6 estrellas.");
    }

    const program = flowPrograms.find((item) => item.id === args.career);
    const courseCode = canonicalCourseCode(args.courseCode);
    if (!program || !program.periods.flat().some((course) => course.code === courseCode)) {
      throw new Error("No se encontró esa materia en el flujograma.");
    }

    const course = program.periods.flat().find((item) => item.code === courseCode);
    const shared = uniqueCourseInstances(sharedCourseInstances({ ...course, career: program.id }));
    const changedCareers = new Set();
    const now = Date.now();
    for (const instance of shared) {
      const existing = await ctx.db.query("flowDifficultyRatings")
        .withIndex("by_career_and_course", (q) => q.eq("career", instance.career).eq("courseCode", instance.code))
        .first();
      if (args.stars === 0) {
        if (existing) {
          await ctx.db.delete(existing._id);
          changedCareers.add(instance.career);
        }
        continue;
      }
      if (existing?.stars === args.stars) continue;
      const rating = { career: instance.career, courseCode: instance.code, stars: args.stars, updatedBy: adminEmail, updatedAt: now };
      if (existing) await ctx.db.patch(existing._id, rating);
      else await ctx.db.insert("flowDifficultyRatings", rating);
      changedCareers.add(instance.career);
    }
    for (const changedCareer of changedCareers) await bumpFlowRevision(ctx, flowRatingRevisionKey(changedCareer));
    if (changedCareers.size) await bumpFlowRevision(ctx, "course-catalog");
    return { career: program.id, courseCode, stars: args.stars, changed: changedCareers.size > 0, syncedCareers: [...changedCareers] };
  },
});

export const getSharedStatuses = query({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    const { email: userEmail } = await requireAuthenticatedEmail(ctx, args.userEmail);
    const rows = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail))
      .take(1000);
    const statuses = {};
    rows.forEach((row) => {
      const code = row.courseCode.startsWith("COURSE::")
        ? row.courseCode
        : `${row.career}::${canonicalCourseCode(row.courseCode)}`;
      const current = statuses[code];
      if (!current || row.updatedAt > current.updatedAt) {
        statuses[code] = { status: row.status, updatedAt: row.updatedAt };
      }
    });
    const publicStatuses = Object.fromEntries(Object.entries(statuses).map(([code, value]) => [code, value.status]));
    return {
      statuses: publicStatuses,
      debug: {
        query: "getSharedStatuses",
        rowsRead: rows.length,
        statusCount: Object.keys(publicStatuses).length,
        payloadBytes: estimateJsonBytes({ rows, statuses: publicStatuses }),
        payloadKb: toKb(estimateJsonBytes({ rows, statuses: publicStatuses })),
      },
    };
  },
});

async function persistFlowStatus(ctx, args) {
  const now = Date.now();
  const { email: userEmail } = await requireAuthenticatedEmail(ctx, args.userEmail);
  const program = flowPrograms.find((item) => item.id === args.career);
  const requestedCourseCode = canonicalCourseCode(args.courseCode);
  const occurrence = program && withCourseIds(program).flat()
    .find((course) => courseInstanceKey(course) === requestedCourseCode);
  if (!occurrence) throw new Error("No se encontró esa instancia de materia en la carrera seleccionada.");

  const sharedInstances = sharedCourseInstances({ ...occurrence, career: args.career });
  let rowsMatched = 0;
  let rowsUpdated = 0;
  let rowsInserted = 0;
  let changed = false;
  const syncedCareers = new Set();
  for (const shared of sharedInstances) {
    const courseCode = courseInstanceKey(shared);
    const rows = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail).eq("courseCode", courseCode))
      .take(10);
    const existing = rows.find((row) => row.career === shared.career);
    if (existing) {
      rowsMatched += 1;
      if (existing.status !== args.status) {
        rowsUpdated += 1;
        changed = true;
        syncedCareers.add(shared.career);
        await ctx.db.patch(existing._id, { status: args.status, updatedAt: now });
      }
    } else {
      changed = true;
      rowsInserted += 1;
      syncedCareers.add(shared.career);
      await ctx.db.insert("flowStatuses", { userEmail, career: shared.career, courseCode, status: args.status, updatedAt: now });
    }
  }
  for (const sharedCareer of syncedCareers) {
    await bumpFlowRevision(ctx, flowStatusRevisionKey(userEmail, sharedCareer));
  }

  const payloadBytes = estimateJsonBytes({ careers: [...syncedCareers], courseCode: requestedCourseCode, status: args.status });
  return {
    changed,
    courseCode: requestedCourseCode,
    rowsMatched,
    rowsUpdated,
    rowsInserted,
    careersSynced: [...syncedCareers],
    status: args.status,
    payloadBytes,
    payloadKb: toKb(payloadBytes),
  };
}

async function getSharedDifficultyRatings(ctx, program, careerRows) {
  const coursesByName = new Map();
  for (const course of program.periods.flat()) {
    const key = normalizeCourseName(course.name);
    const courses = coursesByName.get(key) ?? [];
    courses.push(course);
    coursesByName.set(key, courses);
  }

  const ratingsByName = new Map();
  const indexedRatings = new Map();
  for (const [name, courses] of coursesByName) {
    const peers = uniqueCourseInstances(courses.flatMap((course) =>
      sharedCourseInstances({ ...course, career: program.id }),
    ));
    if (new Set(peers.map((peer) => peer.career)).size < 2) continue;
    const peerKeys = new Set(peers.map((peer) => `${peer.career}:${peer.code}`));
    const peerCodes = [...new Set(peers.map((peer) => peer.code))];
    const rows = [...careerRows.filter((row) => peerKeys.has(`${row.career}:${row.courseCode}`))];
    const missingCodes = peerCodes.filter((code) => !indexedRatings.has(code));
    const fetched = await Promise.all(missingCodes.map((code) => ctx.db.query("flowDifficultyRatings")
      .withIndex("by_course_code", (q) => q.eq("courseCode", code)).take(100)));
    missingCodes.forEach((code, index) => indexedRatings.set(code, fetched[index]));
    for (const code of peerCodes) rows.push(...(indexedRatings.get(code) ?? []).filter((row) => peerKeys.has(`${row.career}:${row.courseCode}`)));
    let latest = null;
    for (const row of rows) if (row.stars > 0 && (!latest || row.updatedAt > latest.updatedAt)) latest = row;
    if (latest) ratingsByName.set(name, latest.stars);
  }
  const difficultyRatings = {};
  for (const course of program.periods.flat()) {
    const stars = ratingsByName.get(normalizeCourseName(course.name));
    if (stars) difficultyRatings[course.code] = stars;
  }
  return difficultyRatings;
}

function uniqueCourseInstances(courses) {
  return [...new Map(courses.map((course) => [`${course.career}:${course.code}`, course])).values()];
}

function normalizeCourseName(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function flowStatusRevisionKey(userEmail, career) {
  return `status:${userEmail}:${career}`;
}

function flowRatingRevisionKey(career) {
  return `rating:${career}`;
}

async function bumpFlowRevision(ctx, key) {
  const current = await ctx.db.query("flowDataRevisions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const version = (current?.version ?? 0) + 1;
  const updatedAt = Date.now();
  if (current) await ctx.db.patch(current._id, { version, updatedAt });
  else await ctx.db.insert("flowDataRevisions", { key, version, updatedAt });
  return version;
}

export const setStatus = mutation({
  args: {
    userEmail: v.string(),
    career: v.string(),
    courseCode: v.string(),
    status: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => persistFlowStatus(ctx, args),
});

export const setPeriodStatuses = mutation({
  args: {
    userEmail: v.string(),
    career: v.string(),
    changes: v.array(v.object({ courseCode: v.string(), status: v.string() })),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!flowPrograms.some((program) => program.id === args.career)) throw new Error("No se encontró esa carrera.");
    const requestedChanges = args.changes.map(({ courseCode, status }) => ({
      courseCode: canonicalCourseCode(courseCode),
      status,
    }));
    if (requestedChanges.length === 0 || requestedChanges.length > 100) throw new Error("La cantidad de cambios del periodo no es válida.");
    const uniqueChanges = new Map();
    requestedChanges.forEach((change) => uniqueChanges.set(change.courseCode, change));
    const changed = [];
    for (const change of uniqueChanges.values()) {
      const result = await persistFlowStatus(ctx, { ...args, ...change });
      if (result.changed) changed.push(change.courseCode);
    }
    const payloadBytes = estimateJsonBytes({ changed, career: args.career });
    return {
      changedCount: changed.length,
      changed,
      payloadBytes,
      payloadKb: toKb(payloadBytes),
    };
  },
});

function withCourseIds(program) {
  return program.periods.map((period, periodIndex) =>
    period.map((course, courseIndex) => ({
      ...course,
      id: `${program.id}-${periodIndex + 1}-${courseIndex + 1}-${course.code}`,
      period: periodIndex + 1,
    })),
  );
}

function canonicalCourseCode(value) {
  const raw = String(value ?? "").trim();
  if (raw.startsWith("COURSE::")) return raw;
  const legacyCode = Object.keys(COURSE_CODE_ALIASES)
    .find((code) => raw === code || raw.endsWith(`-${code}`));
  const normalizedRaw = legacyCode
    ? `${raw.slice(0, -legacyCode.length)}${COURSE_CODE_ALIASES[legacyCode]}`
    : raw;
  const match = flowPrograms
    .flatMap((program) => program.periods.flat())
    .find((course) => normalizedRaw === course.code || normalizedRaw.endsWith(`-${course.code}`));
  return match?.code ?? normalizedRaw;
}

function courseInstanceKey(course) {
  return `COURSE::${course.id}`;
}

function sharedCourseIdentity(course) {
  const code = String(course.code ?? "").trim().toLocaleUpperCase();
  const name = String(course.name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const career = code === "FGE" || code === "FPSXXXX" || code === "FPSXXX" || name.startsWith("electiva ")
    ? `${course.career ?? ""}::`
    : "";
  return `${career}${name || code}`;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function estimateJsonBytes(value) {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function toKb(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function buildFlowDebug(queryName, rows, statuses) {
  const payload = { rows, statuses };
  const payloadBytes = estimateJsonBytes(payload);
  return {
    query: queryName,
    rowsRead: rows.length,
    statusCount: Object.keys(statuses).length,
    payloadBytes,
    payloadKb: toKb(payloadBytes),
  };
}
