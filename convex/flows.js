import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { COURSE_CODE_ALIASES, flowPrograms } from "./flowData";
import { assertAdmin } from "./users";

export const listCareers = query({
  args: {},
  handler: async () => {
    return flowPrograms.map(({ id, name, approval, updatedAt }) => ({ id, name, approval, updatedAt }));
  },
});

export const listCourses = query({
  args: {
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coursesByCode = new Map();
    const userProfile = args.userEmail
      ? await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", args.userEmail.trim().toLowerCase()))
        .first()
      : null;
    const allowedCareers = userProfile?.careers?.length && userProfile.userType !== "admin"
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

    return Array.from(coursesByCode.values()).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getFlow = query({
  args: {
    career: v.string(),
    userEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const program = flowPrograms.find((item) => item.id === args.career) ?? flowPrograms[0];
    const statuses = {};
    const periods = withCourseIds(program);
    let rows = [];

    if (args.userEmail) {
      rows = await ctx.db
        .query("flowStatuses")
        .withIndex("by_user_course", (q) => q.eq("userEmail", normalizeEmail(args.userEmail)))
        .take(1000);
      rows.forEach((row) => {
        let code = canonicalCourseCode(row.courseCode);
        if (code === "FGE") {
          if (row.career !== program.id) return;
          const firstFge = periods.flat().find((course) => course.code === "FGE");
          if (!firstFge) return;
          code = fgeInstanceKey(firstFge);
        }
        const current = statuses[code];
        if (!current || row.updatedAt > current.updatedAt) {
          statuses[code] = { status: row.status, updatedAt: row.updatedAt };
        }
      });
    }

    const publicStatuses = Object.fromEntries(Object.entries(statuses).map(([code, value]) => [code, value.status]));
    const ratingRows = await ctx.db
      .query("flowDifficultyRatings")
      .withIndex("by_course_code")
      .take(1000);
    const knownCourseCodes = new Set(program.periods.flat().map((course) => course.code));
    const latestRatings = {};
    ratingRows.forEach((row) => {
      const current = latestRatings[row.courseCode];
      if (!current || row.updatedAt > current.updatedAt) latestRatings[row.courseCode] = row;
    });
    const difficultyRatings = Object.fromEntries(
      Array.from(knownCourseCodes)
        .filter((courseCode) => latestRatings[courseCode])
        .map((courseCode) => [courseCode, latestRatings[courseCode].stars]),
    );
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
    await assertAdmin(ctx, args.adminEmail);
    if (!Number.isInteger(args.stars) || args.stars < 1 || args.stars > 6) {
      throw new Error("La dificultad debe estar entre 1 y 6 estrellas.");
    }

    const program = flowPrograms.find((item) => item.id === args.career);
    const courseCode = canonicalCourseCode(args.courseCode);
    if (!program || !program.periods.flat().some((course) => course.code === courseCode)) {
      throw new Error("No se encontró esa materia en el flujograma.");
    }

    const existing = await ctx.db
      .query("flowDifficultyRatings")
      .withIndex("by_career_and_course", (q) => q.eq("career", program.id).eq("courseCode", courseCode))
      .first();
    const rating = {
      career: program.id,
      courseCode,
      stars: args.stars,
      updatedBy: args.adminEmail.trim().toLowerCase(),
      updatedAt: Date.now(),
    };

    if (existing) await ctx.db.patch(existing._id, rating);
    else await ctx.db.insert("flowDifficultyRatings", rating);

    return { career: program.id, courseCode, stars: args.stars };
  },
});

export const getSharedStatuses = query({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_course", (q) => q.eq("userEmail", normalizeEmail(args.userEmail)))
      .take(1000);
    const statuses = {};
    rows.forEach((row) => {
      const code = canonicalCourseCode(row.courseCode);
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
    const userEmail = normalizeEmail(args.userEmail);
    const requestedCourseCode = canonicalCourseCode(args.courseCode);
    if (requestedCourseCode.startsWith("FGE::")) {
      const program = flowPrograms.find((item) => item.id === args.career);
      const isValidOccurrence = program
        && withCourseIds(program).flat().some((course) => course.code === "FGE" && fgeInstanceKey(course) === requestedCourseCode);
      if (!isValidOccurrence) throw new Error("No se encontró esa instancia de FGE.");

      const matchingRows = await ctx.db
        .query("flowStatuses")
        .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail).eq("courseCode", requestedCourseCode))
        .take(10);
      const existingRow = matchingRows.find((row) => row.career === args.career);
      if (existingRow) {
        await ctx.db.patch(existingRow._id, { status: args.status, updatedAt: now });
      } else {
        await ctx.db.insert("flowStatuses", {
          userEmail,
          career: args.career,
          courseCode: requestedCourseCode,
          status: args.status,
          updatedAt: now,
        });
      }
      return {
        changed: true,
        courseCode: requestedCourseCode,
        rowsMatched: existingRow ? 1 : 0,
        rowsUpdated: existingRow ? 1 : 0,
        rowsInserted: existingRow ? 0 : 1,
        careersSynced: [args.career],
        status: args.status,
        payloadBytes: estimateJsonBytes({ career: args.career, courseCode: requestedCourseCode, status: args.status }),
        payloadKb: toKb(estimateJsonBytes({ career: args.career, courseCode: requestedCourseCode, status: args.status })),
      };
    }
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", userEmail))
      .first();
    const userCareerIds = user?.userType === "admin"
      ? flowPrograms.map((program) => program.id)
      : user?.careers?.length ? user.careers : [args.career];
    const targetCareerIds = userCareerIds.filter((careerId) => programHasCourse(careerId, requestedCourseCode));
    const careersToSync = targetCareerIds.length ? targetCareerIds : [args.career];
    const existingRowsByExactCourse = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail).eq("courseCode", requestedCourseCode))
      .take(1000);
    const existingRowsByUser = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail))
      .take(1000);
    const existingRows = uniqueRows([
      ...existingRowsByExactCourse,
      ...existingRowsByUser.filter((row) => canonicalCourseCode(row.courseCode) === requestedCourseCode),
    ]);

    if (existingRows.length > 0) {
      await Promise.all(existingRows.map((row) => ctx.db.patch(row._id, { courseCode: requestedCourseCode, status: args.status, updatedAt: now })));
    }

    const existingCareerIds = new Set(existingRows.map((row) => row.career));
    const missingCareerIds = careersToSync.filter((careerId) => !existingCareerIds.has(careerId));
    const insertedIds = [];
    for (const careerId of missingCareerIds) {
      insertedIds.push(await ctx.db.insert("flowStatuses", {
        userEmail,
        career: careerId,
        courseCode: requestedCourseCode,
        status: args.status,
        updatedAt: now,
      }));
    }

    return {
      changed: existingRows.length + insertedIds.length > 0,
      courseCode: requestedCourseCode,
      previousRowsRead: existingRowsByUser.length,
      rowsMatched: existingRows.length,
      rowsUpdated: existingRows.length,
      rowsInserted: insertedIds.length,
      careersSynced: careersToSync,
      status: args.status,
      payloadBytes: estimateJsonBytes({ existingRows, insertedIds, careersToSync, status: args.status }),
      payloadKb: toKb(estimateJsonBytes({ existingRows, insertedIds, careersToSync, status: args.status })),
    };
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
    const programCourses = withCourseIds(flowPrograms.find((program) => program.id === args.career)).flat();
    for (const change of uniqueChanges.values()) {
      const isValidCourse = change.courseCode.startsWith("FGE::")
        ? programCourses.some((course) => course.code === "FGE" && fgeInstanceKey(course) === change.courseCode)
        : programCourses.some((course) => course.code === change.courseCode);
      if (!isValidCourse) throw new Error(`La materia ${change.courseCode} no pertenece a esta carrera.`);
    }
    const userEmail = normalizeEmail(args.userEmail);
    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", userEmail)).first();
    const existingRows = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_course", (q) => q.eq("userEmail", userEmail))
      .take(1000);
    const now = Date.now();
    const changed = [];
    for (const change of uniqueChanges.values()) {
      if (change.courseCode.startsWith("FGE::")) {
        const row = existingRows.find((item) => item.career === args.career && canonicalCourseCode(item.courseCode) === change.courseCode);
        if (row) await ctx.db.patch(row._id, { status: change.status, updatedAt: now });
        else await ctx.db.insert("flowStatuses", { userEmail, career: args.career, courseCode: change.courseCode, status: change.status, updatedAt: now });
        changed.push(change.courseCode);
        continue;
      }
      const matchingRows = uniqueRows(existingRows.filter((row) => canonicalCourseCode(row.courseCode) === change.courseCode));
      await Promise.all(matchingRows.map((row) => ctx.db.patch(row._id, { courseCode: change.courseCode, status: change.status, updatedAt: now })));
      const userCareerIds = user?.userType === "admin"
        ? flowPrograms.map((program) => program.id)
        : user?.careers?.length ? user.careers : [args.career];
      const careersToSync = userCareerIds.filter((careerId) => programHasCourse(careerId, change.courseCode));
      const existingCareerIds = new Set(matchingRows.map((row) => row.career));
      for (const careerId of careersToSync.length ? careersToSync : [args.career]) {
        if (!existingCareerIds.has(careerId)) {
          await ctx.db.insert("flowStatuses", { userEmail, career: careerId, courseCode: change.courseCode, status: change.status, updatedAt: now });
          existingCareerIds.add(careerId);
        }
      }
      changed.push(change.courseCode);
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
  if (raw.startsWith("FGE::")) return raw;
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

function fgeInstanceKey(course) {
  return `FGE::${course.id}`;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function programHasCourse(careerId, courseCode) {
  const program = flowPrograms.find((item) => item.id === careerId);
  if (!program) return false;
  return program.periods.flat().some((course) => course.code === courseCode);
}

function uniqueRows(rows) {
  const byId = new Map();
  rows.forEach((row) => byId.set(row._id, row));
  return Array.from(byId.values());
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
