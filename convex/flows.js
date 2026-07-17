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

    if (args.userEmail) {
      const rows = await ctx.db
        .query("flowStatuses")
        .withIndex("by_user_career", (q) => q.eq("userEmail", args.userEmail).eq("career", program.id))
        .collect();
      rows.forEach((row) => {
        statuses[row.courseCode] = row.status;
      });
    }

    return {
      ...program,
      periods: withCourseIds(program),
      statuses,
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
    const existing = await ctx.db
      .query("flowStatuses")
      .withIndex("by_user_career_course", (q) =>
        q.eq("userEmail", args.userEmail).eq("career", args.career).eq("courseCode", args.courseCode),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { status: args.status, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("flowStatuses", {
      userEmail: args.userEmail,
      career: args.career,
      courseCode: args.courseCode,
      status: args.status,
      updatedAt: now,
    });
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
