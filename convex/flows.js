import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { flowPrograms } from "./flowData";

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
    let rows = [];

    if (args.userEmail) {
      rows = await ctx.db
        .query("flowStatuses")
        .withIndex("by_user_course", (q) => q.eq("userEmail", normalizeEmail(args.userEmail)))
        .take(1000);
      rows.forEach((row) => {
        const code = canonicalCourseCode(row.courseCode);
        const current = statuses[code];
        if (!current || row.updatedAt > current.updatedAt) {
          statuses[code] = { status: row.status, updatedAt: row.updatedAt };
        }
      });
    }

    const publicStatuses = Object.fromEntries(Object.entries(statuses).map(([code, value]) => [code, value.status]));
    return {
      ...program,
      periods: withCourseIds(program),
      statuses: publicStatuses,
      debug: buildFlowDebug("getFlow", rows, publicStatuses),
    };
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

export const setStatus = mutation({
  args: {
    userEmail: v.string(),
    career: v.string(),
    courseCode: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const userEmail = normalizeEmail(args.userEmail);
    const requestedCourseCode = canonicalCourseCode(args.courseCode);
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
  const match = flowPrograms
    .flatMap((program) => program.periods.flat())
    .find((course) => raw === course.code || raw.endsWith(`-${course.code}`));
  return match?.code ?? raw;
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
