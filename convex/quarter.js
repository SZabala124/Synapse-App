import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { currentTerm } from "./academicTerms";
import { flowPrograms } from "./flowData";
import { isAdmin, resolveActivePlan, saveUserSubjectSelection } from "./users";
import { requireAuthenticatedEmail } from "./security";
import { canEditTrackedSubject, FREE_TRACKED_SUBJECT_LIMIT, MAX_QUARTER_SUBJECTS } from "./quarterAccess";
import { evaluationStats as calculateEvaluationStats } from "./quarterStats";
import { bumpQuarterRevision, pruneQuarterSchedule } from "./quarterScheduleSync";

const evaluationFields = {
  title: v.string(),
  description: v.optional(v.string()),
  type: v.optional(v.union(
    v.literal("Parcial"),
    v.literal("Taller"),
    v.literal("Quiz"),
    v.literal("Presentación"),
    v.literal("Tarea"),
    v.literal("Informe"),
    v.literal("Proyecto"),
    v.literal("Lectura"),
  )),
  weight: v.number(),
  date: v.optional(v.string()),
  grade: v.optional(v.number()),
  completed: v.optional(v.boolean()),
};

export const getQuarterRevision = query({
  args: { email: v.string() },
  returns: v.object({
    term: v.union(v.null(), v.object({ startedAt: v.number(), resetAt: v.number(), displayName: v.union(v.string(), v.null()) })),
    versions: v.record(v.string(), v.number()),
    selectedCourseCodes: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const { email, term } = await quarterReadAccess(ctx, args.email);
    const revision = term ? await ctx.db.query("quarterDataRevisions")
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).first() : null;
    const user = await findUser(ctx, email);
    const admin = await isAdmin(ctx, email);
    const selectedCourseCodes = await selectedCodesForTerm(ctx, email, user, term, admin);
    return { term: term ? publicTerm(term) : null, versions: revision?.versions ?? {}, selectedCourseCodes };
  },
});

export const getQuarterOverview = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { email } = await requireAuthenticatedEmail(ctx, args.email);
    const user = await findUser(ctx, email);
    const admin = await isAdmin(ctx, email);
    const term = await currentTerm(ctx);
    if (!user || !term) return { term: term ? publicTerm(term) : null, subjects: [], selectedCourseCodes: [], trackedSubjects: [], evaluationStats: {}, scheduleSubjects: [], plan: "free", isAdmin: admin };
    const plan = await resolveActivePlan(ctx, user, email);

    const subjects = subjectsForCareers(user.careers ?? []);
    const allowedCodes = new Set(subjects.map((subject) => subject.code));
    const selectedCourseCodes = (await selectedCodesForTerm(ctx, email, user, term, admin))
      .filter((code) => allowedCodes.has(code));
    const trackedSubjects = await ctx.db.query("quarterSubjects")
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).order("asc").take(100);
    const scheduleSubjects = await ctx.db.query("quarterScheduleSubjects")
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(100);
    const evaluationStats = {};
    for (const tracked of trackedSubjects) {
      // Old subjects acquire their summary on their next evaluation mutation.
      evaluationStats[tracked.courseCode] = tracked.evaluationStats ?? calculateEvaluationStats(
        await ctx.db.query("quarterEvaluations")
          .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", tracked.courseCode)).take(100),
      );
    }

    return {
      term: publicTerm(term),
      subjects,
      selectedCourseCodes,
      trackedSubjects: trackedSubjects.map((item, index) => ({
        id: item._id,
        courseCode: item.courseCode,
        passTarget: item.passTarget,
        editable: canEditTrackedSubject({ plan, isAdmin: admin, index }),
      })),
      evaluationStats,
      scheduleSubjects: scheduleSubjects.map((item) => ({ id: item._id, courseCode: item.courseCode, color: item.color, classroom: item.classroom ?? "" })),
      plan,
      isAdmin: admin,
    };
  },
});

export const getCourseEvaluations = query({
  args: { email: v.string(), courseCode: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { email, term } = await quarterReadAccess(ctx, args.email);
    if (!term) return [];
    const evaluations = await ctx.db.query("quarterEvaluations")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", args.courseCode)).take(100);
    return evaluations.map(publicDoc);
  },
});

export const getCourseSimulations = query({
  args: { email: v.string(), courseCode: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { email, term } = await quarterReadAccess(ctx, args.email);
    if (!term) return [];
    const simulations = await ctx.db.query("quarterSimulations")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", args.courseCode)).take(20);
    return simulations.map(publicDoc);
  },
});

export const getCalendarEvaluations = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { email, term } = await quarterReadAccess(ctx, args.email);
    if (!term) return [];
    const evaluations = await ctx.db.query("quarterEvaluations")
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(500);
    return evaluations.map(publicDoc);
  },
});

export const getScheduleWorkspace = query({
  args: { email: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { email, term } = await quarterReadAccess(ctx, args.email);
    if (!term) return { scheduleBlocks: [], scheduleSubjects: [] };
    const [scheduleBlocks, scheduleSubjects] = await Promise.all([
      ctx.db.query("quarterScheduleBlocks").withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(250),
      ctx.db.query("quarterScheduleSubjects").withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(100),
    ]);
    return {
      scheduleBlocks: scheduleBlocks.map(publicDoc),
      scheduleSubjects: scheduleSubjects.map((item) => ({ id: item._id, courseCode: item.courseCode, color: item.color, classroom: item.classroom ?? "" })),
    };
  },
});

export const saveSelectedSubjects = mutation({
  args: { email: v.string(), courseCodes: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email, user, term, admin } = await workspaceAccess(ctx, args.email);
    const allowed = new Set(subjectsForCareers(user.careers ?? []).map((subject) => subject.code));
    const courseCodes = uniqueCodes(args.courseCodes);
    if (courseCodes.some((code) => !allowed.has(code))) throw new Error("Selecciona materias de tus carreras registradas.");
    if (courseCodes.length > MAX_QUARTER_SUBJECTS) throw new Error("Puedes seleccionar hasta 7 materias por trimestre, sin importar tu plan.");
    if (!admin) {
      await saveUserSubjectSelection(ctx, { email, subjectCodes: courseCodes });
      return null;
    }
    const planner = await getPlanner(ctx, email, term, user, { admin });
    const selectionChanged = JSON.stringify(currentSelectedCodes(user)) !== JSON.stringify(courseCodes)
      || JSON.stringify(planner.selectedCourseCodes) !== JSON.stringify(courseCodes);
    if (JSON.stringify(user.selectedSubjectCodes) !== JSON.stringify(courseCodes)) {
      await ctx.db.patch(user._id, { selectedSubjectCodes: courseCodes, subjectSelectionUpdatedAt: Date.now(), subjectSelectionPeriodStart: term.startedAt, subjectSelectionPeriodEnd: term.resetAt });
    }
    if (selectionChanged) await ctx.db.patch(planner._id, { selectedCourseCodes: courseCodes, updatedAt: Date.now() });
    const scheduleChanged = await pruneQuarterSchedule(ctx, email, term, courseCodes);
    if (selectionChanged || scheduleChanged) await bumpQuarterRevision(ctx, email, term, ["overview", "schedule"]);
    return null;
  },
});

export const trackSubject = mutation({
  args: { email: v.string(), courseCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email, user, term, admin } = await workspaceAccess(ctx, args.email);
    const planner = await getPlanner(ctx, email, term, user, { admin });
    if (!planner.selectedCourseCodes.includes(args.courseCode)) throw new Error("La materia debe estar seleccionada para este trimestre.");
    const existing = await getTrackedSubject(ctx, email, term, args.courseCode);
    if (existing) return null;
    if (!admin && user.plan === "free") {
      const tracked = await ctx.db.query("quarterSubjects")
        .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(4);
      if (tracked.length >= FREE_TRACKED_SUBJECT_LIMIT) throw new Error("Ya alcanzaste el límite gratis de seguimiento para este trimestre.");
    }
    const now = Date.now();
    await ctx.db.insert("quarterSubjects", { userEmail: email, termStartedAt: term.startedAt, courseCode: args.courseCode, passTarget: 9.5, evaluationStats: calculateEvaluationStats([]), createdAt: now, updatedAt: now });
    await bumpQuarterRevision(ctx, email, term, ["overview"]);
    return null;
  },
});

export const setPassTarget = mutation({
  args: { email: v.string(), courseCode: v.string(), passTarget: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.email);
    const { email, term } = access;
    if (args.passTarget !== 9.5 && args.passTarget !== 10) throw new Error("La nota mínima debe ser 9.5 o 10 sobre 20.");
    const tracked = await requireEditableTrackedSubject(ctx, email, term, args.courseCode, access);
    if (tracked.passTarget === args.passTarget) return null;
    await ctx.db.patch(tracked._id, { passTarget: args.passTarget, updatedAt: Date.now() });
    await bumpQuarterRevision(ctx, email, term, ["overview"]);
    return null;
  },
});

export const saveEvaluation = mutation({
  args: { email: v.string(), courseCode: v.string(), evaluationId: v.optional(v.id("quarterEvaluations")), clearGrade: v.optional(v.boolean()), ...evaluationFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.email);
    const { email, term } = access;
    const tracked = await requireEditableTrackedSubject(ctx, email, term, args.courseCode, access);
    validateEvaluation(args);
    const evaluations = await ctx.db.query("quarterEvaluations")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", args.courseCode)).take(100);
    const existing = args.evaluationId ? await ctx.db.get(args.evaluationId) : null;
    if (args.evaluationId && (!existing || existing.userEmail !== email || existing.termStartedAt !== term.startedAt || existing.courseCode !== args.courseCode)) throw new Error("No se encontró esa evaluación.");
    if (args.clearGrade && !existing) throw new Error("Solo puedes quitar la nota de una evaluación existente.");
    const totalWeight = evaluations.reduce((sum, item) => sum + (item._id === args.evaluationId ? 0 : item.weight), 0) + args.weight;
    if (totalWeight > 100.0001) throw new Error("Los porcentajes de las evaluaciones no pueden superar 100%.");
    const now = Date.now();
    const values = { title: args.title.trim(), description: (args.description ?? "").trim(), type: args.type ?? "Tarea", weight: args.weight, updatedAt: now };
    if (args.date) values.date = args.date;
    if (args.clearGrade) values.grade = undefined;
    else if (args.grade !== undefined) values.grade = args.grade;
    if (args.completed !== undefined) values.completed = args.completed;
    else if (!existing) values.completed = false;
    if (existing && Object.entries(values).every(([key, value]) => key === "updatedAt" || existing[key] === value)) return null;
    if (existing) await ctx.db.patch(existing._id, values);
    else await ctx.db.insert("quarterEvaluations", { ...values, userEmail: email, termStartedAt: term.startedAt, courseCode: args.courseCode, createdAt: now });
    const nextEvaluations = [...evaluations.filter((item) => item._id !== args.evaluationId), { ...existing, ...values }];
    await ctx.db.patch(tracked._id, { evaluationStats: calculateEvaluationStats(nextEvaluations) });
    await bumpQuarterRevision(ctx, email, term, ["overview", "calendar", `evaluations:${args.courseCode}`]);
    return null;
  },
});

export const deleteEvaluation = mutation({
  args: { email: v.string(), evaluationId: v.id("quarterEvaluations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.email);
    const { email, term } = access;
    const evaluation = await ctx.db.get(args.evaluationId);
    if (!evaluation || evaluation.userEmail !== email || evaluation.termStartedAt !== term.startedAt) throw new Error("No se encontró esa evaluación.");
    const tracked = await requireEditableTrackedSubject(ctx, email, term, evaluation.courseCode, access);
    await ctx.db.delete(evaluation._id);
    const remaining = await ctx.db.query("quarterEvaluations")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", evaluation.courseCode)).take(100);
    await ctx.db.patch(tracked._id, { evaluationStats: calculateEvaluationStats(remaining) });
    await bumpQuarterRevision(ctx, email, term, ["overview", "calendar", `evaluations:${evaluation.courseCode}`]);
    return null;
  },
});

export const saveCourseSchedule = mutation({
  args: {
    email: v.string(),
    courseCode: v.string(),
    color: v.string(),
    classroom: v.optional(v.string()),
    blocks: v.array(v.object({ day: v.number(), block: v.number() })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email, user, term, admin } = await workspaceAccess(ctx, args.email);
    const planner = await getPlanner(ctx, email, term, user, { admin });
    if (!planner.selectedCourseCodes.includes(args.courseCode)) throw new Error("La materia debe estar seleccionada para este trimestre.");
    const allowedColors = new Set(["#ba624b", "#bd8c32", "#4f8271", "#4d79a8", "#a94e73", "#75599c", "#3c827e", "#a96135"]);
    if (!allowedColors.has(args.color)) throw new Error("El color seleccionado no es válido.");
    const classroom = (args.classroom ?? "").trim();
    if (classroom.length > 50) throw new Error("El salón debe tener 50 caracteres o menos.");
    const slots = new Set();
    for (const item of args.blocks) {
      if (!Number.isInteger(item.day) || item.day < 0 || item.day > 4 || !Number.isInteger(item.block) || item.block < 0 || item.block > 7) throw new Error("Uno de los bloques de horario no es válido.");
      const key = `${item.day}:${item.block}`;
      if (slots.has(key)) throw new Error("No repitas bloques en el horario.");
      slots.add(key);
    }
    const existing = await ctx.db.query("quarterScheduleBlocks")
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).take(250);
    for (const item of args.blocks) {
      if (existing.some((block) => block.courseCode !== args.courseCode && block.day === item.day && block.block === item.block)) {
        throw new Error("Ese día y bloque ya está ocupado por otra materia.");
      }
    }
    const now = Date.now();
    const courseBlocks = existing.filter((block) => block.courseCode === args.courseCode);
    const retainedSlots = new Set(courseBlocks.map((block) => `${block.day}:${block.block}`));
    let changed = false;
    for (const block of courseBlocks) {
      if (!slots.has(`${block.day}:${block.block}`)) {
        await ctx.db.delete(block._id);
        changed = true;
      }
    }
    for (const item of args.blocks) {
      if (retainedSlots.has(`${item.day}:${item.block}`)) continue;
      await ctx.db.insert("quarterScheduleBlocks", { userEmail: email, termStartedAt: term.startedAt, courseCode: args.courseCode, day: item.day, block: item.block, createdAt: now, updatedAt: now });
      changed = true;
    }
    const settings = await ctx.db.query("quarterScheduleSubjects")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", args.courseCode)).first();
    if (settings) {
      if (settings.color !== args.color || (settings.classroom ?? "") !== classroom) {
        await ctx.db.patch(settings._id, { color: args.color, classroom, updatedAt: now });
        changed = true;
      }
    } else {
      await ctx.db.insert("quarterScheduleSubjects", { userEmail: email, termStartedAt: term.startedAt, courseCode: args.courseCode, color: args.color, classroom, updatedAt: now });
      changed = true;
    }
    if (changed) await bumpQuarterRevision(ctx, email, term, ["overview", "schedule"]);
    return null;
  },
});

export const clearSchedule = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { email, term } = await workspaceAccess(ctx, args.email);
    if (await pruneQuarterSchedule(ctx, email, term, [])) {
      await bumpQuarterRevision(ctx, email, term, ["overview", "schedule"]);
    }
    return null;
  },
});

export const saveSimulation = mutation({
  args: { email: v.string(), courseCode: v.string(), simulationId: v.optional(v.id("quarterSimulations")), name: v.string(), projectedGrades: v.array(v.object({ evaluationId: v.string(), grade: v.number() })) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.email);
    const { email, term } = access;
    await requireEditableTrackedSubject(ctx, email, term, args.courseCode, access);
    const existing = args.simulationId ? await ctx.db.get(args.simulationId) : null;
    if (args.simulationId && (!existing || existing.userEmail !== email || existing.termStartedAt !== term.startedAt || existing.courseCode !== args.courseCode)) {
      throw new Error("No se encontró esa simulación.");
    }
    if (!args.name.trim() || args.name.length > 50) throw new Error("Escribe un nombre de hasta 50 caracteres para la simulación.");
    if (args.projectedGrades.some((item) => !Number.isFinite(item.grade) || item.grade < 0 || item.grade > 20)) throw new Error("Las notas simuladas deben estar entre 0 y 20.");
    const evaluations = await ctx.db.query("quarterEvaluations")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", args.courseCode)).take(100);
    const allowed = new Set(evaluations.map((item) => item._id));
    if (args.projectedGrades.some((item) => !allowed.has(item.evaluationId))) throw new Error("La simulación contiene una evaluación que ya no existe.");
    const simulations = await ctx.db.query("quarterSimulations")
      .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", args.courseCode)).take(100);
    const now = Date.now();
    let saved;
    if (existing) {
      if (existing.name === args.name.trim() && JSON.stringify(existing.projectedGrades) === JSON.stringify(args.projectedGrades)) return publicDoc(existing);
      await ctx.db.patch(existing._id, { name: args.name.trim(), projectedGrades: args.projectedGrades, updatedAt: now });
      saved = await ctx.db.get(existing._id);
    } else {
      if (simulations.length >= 20) throw new Error("Puedes guardar hasta 20 simulaciones por materia.");
      const id = await ctx.db.insert("quarterSimulations", { userEmail: email, termStartedAt: term.startedAt, courseCode: args.courseCode, name: args.name.trim(), projectedGrades: args.projectedGrades, createdAt: now, updatedAt: now });
      saved = await ctx.db.get(id);
    }
    await bumpQuarterRevision(ctx, email, term, [`simulations:${args.courseCode}`]);
    return saved ? publicDoc(saved) : null;
  },
});

export const deleteSimulation = mutation({
  args: { email: v.string(), simulationId: v.id("quarterSimulations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const access = await workspaceAccess(ctx, args.email);
    const { email, term } = access;
    const simulation = await ctx.db.get(args.simulationId);
    if (!simulation || simulation.userEmail !== email || simulation.termStartedAt !== term.startedAt) throw new Error("No se encontró esa simulación.");
    await requireEditableTrackedSubject(ctx, email, term, simulation.courseCode, access);
    await ctx.db.delete(simulation._id);
    await bumpQuarterRevision(ctx, email, term, [`simulations:${simulation.courseCode}`]);
    return null;
  },
});

async function workspaceAccess(ctx, rawEmail) {
  const { email } = await requireAuthenticatedEmail(ctx, rawEmail);
  const user = await findUser(ctx, email);
  const term = await currentTerm(ctx);
  if (!user) throw new Error("No se encontró la cuenta del usuario.");
  if (!term) throw new Error("El trimestre actual todavía no está configurado.");
  return { email, user: { ...user, plan: await resolveActivePlan(ctx, user, email) }, term, admin: await isAdmin(ctx, email) };
}

async function quarterReadAccess(ctx, rawEmail) {
  const { email } = await requireAuthenticatedEmail(ctx, rawEmail);
  return { email, term: await currentTerm(ctx) };
}

async function findUser(ctx, email) {
  const users = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).take(10);
  return users.find((user) => user.userType === "admin") ?? users[0] ?? null;
}

async function getPlanner(ctx, email, term, user, { admin = false } = {}) {
  const existing = await ctx.db.query("quarterPlanners")
    .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).first();
  if (existing) return { ...existing, selectedCourseCodes: admin ? uniqueCodes(existing.selectedCourseCodes) : currentSelectedCodes(user) };
  const now = Date.now();
  const id = await ctx.db.insert("quarterPlanners", {
    userEmail: email,
    termStartedAt: term.startedAt,
    selectedCourseCodes: currentSelectedCodes(user),
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

function currentSelectedCodes(user) {
  if (user?.subjectSelectionPeriodEnd && user.subjectSelectionPeriodEnd <= Date.now()) return [];
  return uniqueCodes(user?.selectedSubjectCodes ?? []);
}

async function selectedCodesForTerm(ctx, email, user, term, admin) {
  if (!user) return [];
  let codes = currentSelectedCodes(user);
  if (admin && term) {
    const planner = await ctx.db.query("quarterPlanners")
      .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).first();
    if (planner) codes = uniqueCodes(planner.selectedCourseCodes);
  }
  const allowed = new Set(subjectsForCareers(user.careers ?? []).map((subject) => subject.code));
  return codes.filter((code) => allowed.has(code));
}

async function getTrackedSubject(ctx, email, term, courseCode) {
  return await ctx.db.query("quarterSubjects")
    .withIndex("by_user_term_course", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt).eq("courseCode", courseCode)).first();
}

async function requireEditableTrackedSubject(ctx, email, term, courseCode, { user, admin }) {
  const tracked = await ctx.db.query("quarterSubjects")
    .withIndex("by_user_term", (q) => q.eq("userEmail", email).eq("termStartedAt", term.startedAt)).order("asc").take(100);
  const index = tracked.findIndex((item) => item.courseCode === courseCode);
  if (index < 0) throw new Error("Activa el seguimiento de esta materia primero.");
  if (!canEditTrackedSubject({ plan: user.plan, isAdmin: admin, index })) {
    throw new Error("Esta materia quedó en modo de solo lectura al vencer tu plan. Mejora tu plan para volver a editarla.");
  }
  return tracked[index];
}

function subjectsForCareers(careers) {
  const byCode = new Map();
  const selectedCareers = new Set(careers);
  for (const program of flowPrograms) {
    if (!selectedCareers.has(program.id)) continue;
    for (const [index, period] of program.periods.entries()) {
      for (const course of period) {
        const existing = byCode.get(course.code) ?? { code: course.code, name: course.name, credits: course.credits ?? 3, periods: [] };
        existing.periods.push(index + 1);
        byCode.set(course.code, existing);
      }
    }
  }
  return [...byCode.values()].map((subject) => ({ ...subject, periods: [...new Set(subject.periods)] }))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function validateEvaluation({ title, description, weight, grade }) {
  if (!title.trim() || title.trim().length > 25) throw new Error("El nombre de la evaluación debe tener entre 1 y 25 caracteres.");
  if (description !== undefined && description.length > 1000) throw new Error("La descripción no puede superar los 1000 caracteres.");
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error("El porcentaje debe ser mayor que 0 y hasta 100.");
  if (grade !== undefined && (!Number.isFinite(grade) || grade < 0 || grade > 20)) throw new Error("La nota debe estar entre 0 y 20.");
}

function uniqueCodes(codes) {
  return [...new Set((codes ?? []).map((code) => String(code).trim()).filter(Boolean))];
}

function publicTerm(term) {
  return { startedAt: term.startedAt, resetAt: term.resetAt, displayName: term.displayName ?? null };
}

function publicDoc(doc) {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id };
}
