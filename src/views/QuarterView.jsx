import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { canEditTrackedSubject, MAX_QUARTER_SUBJECTS } from "../../convex/quarterAccess";
import { matchesFuzzySearch } from "../utils/fuzzySearch";
import { useQuarterQuery } from "../hooks/useQuarterQuery";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const BLOCKS = ["7:00 - 8:30", "8:45 - 10:15", "10:30 - 12:00", "12:15 - 13:45", "14:00 - 15:30", "15:45 - 17:15", "17:30 - 19:00", "19:15 - 20:45"];
const TABS = [["evaluations", "Evaluaciones"], ["simulations", "Simulaciones"], ["calendar", "Calendario"], ["schedule", "Horario"]];
const EVALUATION_TYPES = ["Parcial", "Taller", "Quiz", "Presentación", "Tarea", "Informe", "Proyecto", "Lectura"];
const clampGradeInput = (value) => {
  if (value === "") return "";
  const grade = Number(value);
  return Number.isFinite(grade) ? String(Math.min(20, Math.max(0, grade))) : "";
};
const gradeTone = (grade) => (grade <= 10 ? "low" : grade < 16 ? "medium" : "high");
const projectionTone = (grade) => (grade < 9.5 ? "low" : grade < 16 ? "medium" : "high");
const SCHEDULE_COLORS = [
  { name: "Coral", value: "#ba624b" },
  { name: "Mostaza", value: "#bd8c32" },
  { name: "Verde", value: "#4f8271" },
  { name: "Azul", value: "#4d79a8" },
  { name: "Rosa", value: "#a94e73" },
  { name: "Violeta", value: "#75599c" },
  { name: "Turquesa", value: "#3c827e" },
  { name: "Naranja", value: "#a96135" },
];
const scheduleInkCache = new Map();

function serializedJsonSize(value) {
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json ?? "undefined").length;
}

function formatJsonSize(bytes) {
  const kb = bytes / 1024;
  return `${bytes} B (${kb < 1024 ? `${kb.toFixed(2)} KB` : `${(kb / 1024).toFixed(3)} MB`})`;
}

function logQuarterQuery(cache, name, value) {
  if (value === undefined) return;
  const json = JSON.stringify(value);
  if (cache.get(name) === json) return;
  cache.set(name, json);
  console.info(`[Synapse trimestre] Lectura ${name}: ${formatJsonSize(new TextEncoder().encode(json).length)} JSON UTF-8 recibido (estimación del contenido, sin protocolo ni compresión).`);
}

export function QuarterView({ currentUser }) {
  const [tab, setTab] = useState("evaluations");
  const [activeCourseCode, setActiveCourseCode] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [notice, setNotice] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const subjectMenuRef = useRef(null);
  const loggedQueryResults = useRef(new Map());
  const email = currentUser?.email ?? "";
  const revision = useQuery(api.quarter.getQuarterRevision, email ? { email } : "skip");
  const cacheScope = JSON.stringify({
    careers: [...(currentUser?.careers ?? [])].sort(),
    plan: currentUser?.plan,
    userType: currentUser?.userType,
    selectedSubjectCodes: [...(currentUser?.selectedSubjectCodes ?? [])].sort(),
  });
  const workspace = useQuarterQuery(api.quarter.getQuarterOverview, { email }, "getQuarterOverview", revision, cacheScope, "overview", Boolean(email));
  const saveSelected = useMutation(api.quarter.saveSelectedSubjects);
  const trackSubject = useMutation(api.quarter.trackSubject);
  const saveEvaluation = useMutation(api.quarter.saveEvaluation);
  const deleteEvaluation = useMutation(api.quarter.deleteEvaluation);
  const saveCourseSchedule = useMutation(api.quarter.saveCourseSchedule);
  const clearSchedule = useMutation(api.quarter.clearSchedule);
  const saveSimulation = useMutation(api.quarter.saveSimulation);
  const deleteSimulation = useMutation(api.quarter.deleteSimulation);

  const subjectByCode = useMemo(() => new Map((workspace?.subjects ?? []).map((subject) => [subject.code, subject])), [workspace]);
  const selectedCourseCodes = revision?.selectedCourseCodes ?? currentUser?.selectedSubjectCodes ?? workspace?.selectedCourseCodes ?? [];
  const selectedSubjects = useMemo(() => selectedCourseCodes.map((code) => subjectByCode.get(code)).filter(Boolean), [selectedCourseCodes, subjectByCode]);
  const trackerSubjects = selectedSubjects;
  const calendarCourseColors = useMemo(() => {
    const configuredColors = new Map((workspace?.scheduleSubjects ?? []).map((item) => [item.courseCode, item.color]));
    const subjectsWithScheduledFirst = [...selectedSubjects, ...(workspace?.subjects ?? []).filter((subject) => !selectedCourseCodes.includes(subject.code))];
    return new Map(subjectsWithScheduledFirst.map((subject, index) => [
      subject.code,
      SCHEDULE_COLORS.find((color) => color.value === configuredColors.get(subject.code))?.value ?? SCHEDULE_COLORS[index % SCHEDULE_COLORS.length].value,
    ]));
  }, [selectedSubjects, selectedCourseCodes, workspace?.scheduleSubjects, workspace?.subjects]);
  const premium = workspace?.isAdmin || workspace?.plan === "pro" || workspace?.plan === "excellence";
  const trackedCodes = useMemo(() => new Set((workspace?.trackedSubjects ?? []).map((subject) => subject.courseCode)), [workspace]);
  const editableTrackedCodes = useMemo(() => new Set((workspace?.trackedSubjects ?? [])
    .filter((subject, index) => subject.editable ?? canEditTrackedSubject({ plan: workspace?.plan, isAdmin: workspace?.isAdmin, index }))
    .map((subject) => subject.courseCode)), [premium, workspace]);
  const accumulatedByCourse = useMemo(() => new Map(trackerSubjects.map((subject) => {
    if (!trackedCodes.has(subject.code)) return [subject.code, null];
    const stats = workspace?.evaluationStats?.[subject.code];
    return [subject.code, stats?.gradedCount ? stats.accumulatedPoints : null];
  })), [trackedCodes, trackerSubjects, workspace?.evaluationStats]);
  const availableCourseAverages = [...accumulatedByCourse.values()].filter((average) => average !== null);
  const termAverage = availableCourseAverages.length
    ? availableCourseAverages.reduce((sum, average) => sum + average, 0) / availableCourseAverages.length
    : null;
  const activeSubject = trackerSubjects.find((subject) => subject.code === activeCourseCode) ?? trackerSubjects[0];
  const trackedCount = workspace?.trackedSubjects?.length ?? 0;
  const readOnlyCount = trackedCount - editableTrackedCodes.size;
  const shouldLoadCourseEvaluations = Boolean(email && activeSubject && trackedCodes.has(activeSubject.code) && (tab === "evaluations" || tab === "simulations"));
  const courseCode = activeSubject?.code ?? "";
  const courseEvaluations = useQuarterQuery(api.quarter.getCourseEvaluations, { email, courseCode }, "getCourseEvaluations", revision, cacheScope, `evaluations:${courseCode}`, shouldLoadCourseEvaluations);
  const courseSimulations = useQuarterQuery(api.quarter.getCourseSimulations, { email, courseCode }, "getCourseSimulations", revision, cacheScope, `simulations:${courseCode}`, Boolean(email && activeSubject && trackedCodes.has(courseCode) && tab === "simulations"));
  const calendarEvaluations = useQuarterQuery(api.quarter.getCalendarEvaluations, { email }, "getCalendarEvaluations", revision, cacheScope, "calendar", Boolean(email && tab === "calendar"));
  const scheduleWorkspace = useQuarterQuery(api.quarter.getScheduleWorkspace, { email }, "getScheduleWorkspace", revision, cacheScope, "schedule", Boolean(email && tab === "schedule"));

  useEffect(() => logQuarterQuery(loggedQueryResults.current, "getQuarterRevision", revision), [revision]);

  useEffect(() => {
    function closeSubjectMenu(event) {
      if (subjectMenuRef.current?.open && !subjectMenuRef.current.contains(event.target)) {
        subjectMenuRef.current.open = false;
      }
    }
    document.addEventListener("pointerdown", closeSubjectMenu);
    return () => document.removeEventListener("pointerdown", closeSubjectMenu);
  }, []);

  async function mutate(label, mutation, args) {
    const requestBytes = serializedJsonSize(args);
    try {
      const result = await mutation(args);
      const responseBytes = serializedJsonSize(result);
      console.info(`[Synapse trimestre] Actualización ${label}: ${formatJsonSize(requestBytes)} JSON UTF-8 enviado; ${formatJsonSize(responseBytes)} JSON UTF-8 de respuesta.`);
      return result;
    } catch (error) {
      console.info(`[Synapse trimestre] Actualización ${label} fallida: ${formatJsonSize(requestBytes)} JSON UTF-8 enviado; no hubo respuesta exitosa.`);
      throw error;
    }
  }

  async function run(action, successMessage) {
    try {
      await action();
      setNotice(successMessage);
      window.setTimeout(() => setNotice(""), 3500);
      return true;
    } catch (error) {
      setNotice("No se pudo guardar el cambio. Revisa los datos e inténtalo de nuevo.");
      return false;
    }
  }

  if (workspace === undefined) return <section className="workspace quarter-workspace"><p>Cargando tu trimestre…</p></section>;
  if (!workspace.term) return <section className="workspace quarter-workspace"><h1>Trimestre</h1><p>El trimestre académico aún no está configurado.</p></section>;

  const selectedCount = selectedCourseCodes.length;
  const selectionLimit = MAX_QUARTER_SUBJECTS;
  const filteredSubjects = (workspace.subjects ?? []).filter((subject) => matchesFuzzySearch(subjectSearch, [subject.name, subject.code]));

  return (
    <section className="workspace quarter-workspace">
      <header className="quarter-header">
        <div>
          <p className="eyebrow">Organización académica</p>
          <h1>Trimestre</h1>
          <p>Tu horario semanal y el avance de tus evaluaciones, en un solo lugar.</p>
        </div>
        <div className="quarter-term-badge">
          <span>Trimestre actual</span>
          <strong>{workspace.term.displayName || new Date(workspace.term.startedAt).toLocaleDateString("es", { month: "long", year: "numeric" })}</strong>
        </div>
      </header>

      <nav className="quarter-tabs" aria-label="Secciones del trimestre">
        {TABS.map(([id, label]) => <button key={id} type="button" className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </nav>

      {(tab === "evaluations" || tab === "simulations") && <section className="quarter-course-selection" aria-label="Materias del trimestre">
        <div className="quarter-section-heading">
          <div><h2>Materias del trimestre</h2><p>{selectedCount} seleccionadas{selectionLimit ? ` · máximo ${selectionLimit}` : ""}</p></div>
          {(premium || selectedCount === 0) && <details ref={subjectMenuRef} className="quarter-select-menu">
            <summary>Elegir materias</summary>
            <div className="quarter-subject-options">
              <label className="quarter-subject-search-field">
                <span>Buscar materias</span>
                <input type="search" value={subjectSearch} onChange={(event) => setSubjectSearch(event.target.value)} placeholder="Nombre o código..." aria-label="Buscar materias por nombre o código" />
              </label>
              {filteredSubjects.map((subject) => {
                const checked = selectedCourseCodes.includes(subject.code);
                const disabled = !checked && selectionLimit !== null && selectedCount >= selectionLimit;
                return <label key={subject.code}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => {
                    const next = event.target.checked ? [...selectedCourseCodes, subject.code] : selectedCourseCodes.filter((code) => code !== subject.code);
                    void run(() => mutate("saveSelectedSubjects", saveSelected, { email, courseCodes: next }), "Materias actualizadas.");
                  }} />
                  <span>{subject.name}</span><small>{subject.code}</small>
                </label>;
              })}
              {filteredSubjects.length === 0 && <p className="quarter-selection-note">No se encontraron materias.</p>}
              {!premium && <p className="quarter-selection-note">El horario semanal es gratis para todas tus materias. El límite de 3 aplica solo al seguimiento de evaluaciones.</p>}
            </div>
          </details>}
        </div>
        {trackerSubjects.length ? <div className="quarter-subject-chips">
          {trackerSubjects.map((subject) => {
            const tracked = trackedCodes.has(subject.code);
            const evaluationCount = workspace.evaluationStats?.[subject.code]?.count ?? 0;
            const accumulated = accumulatedByCourse.get(subject.code);
            return <button key={subject.code} type="button" className={activeSubject?.code === subject.code ? "is-active" : ""} aria-pressed={activeSubject?.code === subject.code} onClick={() => setActiveCourseCode(subject.code)}>
              <span className="quarter-subject-chip-name">{subject.name}</span><span className="quarter-subject-chip-meta"><small>{subject.code}</small>
                {tab === "evaluations" && <span className={`quarter-subject-tracking-state${tracked ? " is-tracked" : ""}${tracked && !editableTrackedCodes.has(subject.code) ? " is-readonly" : ""}`}><i aria-hidden="true" />{tracked ? !editableTrackedCodes.has(subject.code) ? "Solo lectura" : `${evaluationCount} ${evaluationCount === 1 ? "evaluación" : "evaluaciones"}` : "Sin seguimiento"}</span>}
              </span><span className="quarter-subject-chip-average">Acumulado <strong>{accumulated === null ? "N/A" : `${accumulated.toFixed(2)} / 20`}</strong></span>
            </button>;
          })}
        </div> : <p className="quarter-empty-state">Selecciona las materias que cursarás para armar el horario. Si ya las elegiste en tu perfil, aparecerán aquí automáticamente.</p>}
        {trackerSubjects.length > 0 && <div className="quarter-term-average"><div><strong>Promedio del trimestre</strong><small>{availableCourseAverages.length} de {trackerSubjects.length} materias con nota acumulada</small></div><strong className={termAverage === null ? "is-unavailable" : `quarter-evaluation-grade-tag is-${projectionTone(termAverage)}`}>{termAverage === null ? "N/A" : `${termAverage.toFixed(2)} / 20`}</strong></div>}
      </section>}
      {notice && <p className="quarter-notice" role="status">{notice}</p>}

      {(tab === "evaluations" || tab === "simulations") && <section className="quarter-pane">
        <div className="quarter-section-heading"><div><h2>{tab === "simulations" ? "Simulaciones" : "Seguimiento de evaluaciones"}</h2><p>{tab === "simulations" ? "Prueba resultados sin modificar tus evaluaciones reales." : premium ? "Selecciona una materia para ver su seguimiento." : readOnlyCount > 0 ? `${editableTrackedCodes.size} materias editables · ${readOnlyCount} en solo lectura. Conservamos todo tu historial.` : `${trackedCount} de 3 materias con seguimiento.`}</p></div></div>
        {!trackerSubjects.length ? <p className="quarter-empty-state">Primero selecciona las materias de este trimestre.</p> : <>
          {activeSubject && trackedCodes.has(activeSubject.code) && courseEvaluations !== undefined && (tab !== "simulations" || courseSimulations !== undefined) && <CourseTracker
          key={`${activeSubject.code}:${tab}`}
          subject={activeSubject}
          evaluations={courseEvaluations ?? []}
          simulations={courseSimulations ?? []}
          simulationsOnly={tab === "simulations"}
          readOnly={!editableTrackedCodes.has(activeSubject.code)}
          email={email}
          onSaveEvaluation={(data) => run(() => mutate("saveEvaluation", saveEvaluation, { email, courseCode: activeSubject.code, ...data }), "Evaluación guardada.")}
            onDeleteEvaluation={(evaluationId) => run(() => mutate("deleteEvaluation", deleteEvaluation, { email, evaluationId }), "Evaluación eliminada.")}
            onSaveSimulation={async (data) => {
              const savedSimulation = await mutate("saveSimulation", saveSimulation, { email, courseCode: activeSubject.code, ...data });
              setNotice("Simulación guardada.");
              window.setTimeout(() => setNotice(""), 3500);
              return savedSimulation;
            }}
            onDeleteSimulation={(simulationId) => run(() => mutate("deleteSimulation", deleteSimulation, { email, simulationId }), "Simulación eliminada.")}
          />}
          {activeSubject && trackedCodes.has(activeSubject.code) && shouldLoadCourseEvaluations && (courseEvaluations === undefined || (tab === "simulations" && courseSimulations === undefined)) && <p className="quarter-empty-state">{tab === "simulations" ? "Cargando simulaciones…" : "Cargando evaluaciones…"}</p>}
          {activeSubject && !trackedCodes.has(activeSubject.code) && <div className="quarter-track-prompt">
            <div><strong>{activeSubject.name}</strong><span>{activeSubject.code} · aún no tiene seguimiento de evaluaciones.</span></div>
            {premium || trackedCount < 3
              ? <button className="primary-action quarter-inline-action" type="button" onClick={() => void run(() => mutate("trackSubject", trackSubject, { email, courseCode: activeSubject.code }), "Seguimiento activado.")}>Activar seguimiento</button>
              : <div className="quarter-upgrade-actions"><p className="quarter-upgrade-note">Ya usaste tus 3 materias de seguimiento gratis. Pro y Excellence permiten organizar todas tus materias.</p><a className="primary-action quarter-inline-action quarter-plans-link" href="#plans">Ver planes</a></div>}
          </div>}
        </>}
      </section>}

      {tab === "calendar" && (calendarEvaluations === undefined
        ? <p className="quarter-empty-state">Cargando calendario…</p>
        : <QuarterCalendar evaluations={calendarEvaluations} subjects={subjectByCode} courseColors={calendarCourseColors} month={month} onMonthChange={setMonth} />)}
      {tab === "schedule" && (scheduleWorkspace === undefined
        ? <p className="quarter-empty-state">Cargando horario…</p>
        : <SchedulePlanner
        subjects={selectedSubjects}
        scheduleBlocks={scheduleWorkspace.scheduleBlocks}
        scheduleSubjects={scheduleWorkspace.scheduleSubjects}
        termName={workspace.term.displayName || new Date(workspace.term.startedAt).toLocaleDateString("es", { month: "long", year: "numeric" })}
        onSave={(data) => run(() => mutate("saveCourseSchedule", saveCourseSchedule, { email, ...data }), "Horario guardado.")}
        onClear={() => run(() => mutate("clearSchedule", clearSchedule, { email }), "Horario limpiado.")}
      />)}
    </section>
  );
}

function CourseTracker({ subject, evaluations, simulations, email, readOnly = false, simulationsOnly = false, onSaveEvaluation, onDeleteEvaluation, onSaveSimulation, onDeleteSimulation }) {
  const [draft, setDraft] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [simulationDeleteConfirmation, setSimulationDeleteConfirmation] = useState(null);
  const [simulationDeleteError, setSimulationDeleteError] = useState("");
  const [simulationDeletePending, setSimulationDeletePending] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [simulationName, setSimulationName] = useState("");
  const [simulatedGrades, setSimulatedGrades] = useState({});
  const [editingSimulationId, setEditingSimulationId] = useState("");
  const [simulationError, setSimulationError] = useState("");
  const [simulationModalOpen, setSimulationModalOpen] = useState(false);
  const [optimisticSimulations, setOptimisticSimulations] = useState(() => new Map());
  const evaluationTitleRef = useRef(null);
  const deleteCancelRef = useRef(null);
  const simulationFormRef = useRef(null);
  const simulationNameRef = useRef(null);
  const isModalOpen = draft !== null || deleteConfirmation !== null || simulationDeleteConfirmation !== null || simulationModalOpen;
  const target = 9.5;
  const hasInvalidSimulatedGrade = evaluations.some((item) => {
    const value = simulatedGrades[item.id];
    return value !== undefined && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 20);
  });
  const visibleSimulations = [...optimisticSimulations.values()]
    .filter((item) => !simulations.some((simulation) => simulation.id === item.id))
    .concat(simulations);
  const scored = evaluations.filter((item) => item.grade !== undefined && item.grade !== null);
  const earnedPoints = scored.reduce((sum, item) => sum + item.grade * item.weight / 100, 0);
  const gradedWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  const remainingWeight = Math.max(0, 100 - gradedWeight);
  const needed = remainingWeight ? (target - earnedPoints) * 100 / remainingWeight : null;
  const projectedFinal = evaluations.reduce((sum, item) => {
    const enteredGrade = simulatedGrades[item.id];
    const grade = enteredGrade === "" ? item.grade : (enteredGrade ?? item.grade);
    return grade === undefined || grade === null ? sum : sum + grade * item.weight / 100;
  }, 0);
  const projectedMissingWeight = evaluations.reduce((sum, item) => {
    const enteredGrade = simulatedGrades[item.id];
    return sum + ((enteredGrade === "" ? item.grade : (enteredGrade ?? item.grade)) == null ? item.weight : 0);
  }, 0);
  const sortedEvaluations = [...evaluations].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  useEffect(() => {
    if (!isModalOpen) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setDraft(null);
        setDeleteConfirmation(null);
        setSimulationDeleteConfirmation(null);
        setSimulationModalOpen(false);
      }
    }
    document.addEventListener("keydown", closeOnEscape);
    if (draft) evaluationTitleRef.current?.focus();
    else if (deleteConfirmation) deleteCancelRef.current?.focus();
    else if (simulationDeleteConfirmation) deleteCancelRef.current?.focus();
    else simulationNameRef.current?.focus();
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return undefined;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [isModalOpen]);

  async function submitEvaluation(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const gradeValue = String(form.get("grade") ?? "").trim();
    const values = { title: String(form.get("title") ?? ""), description: String(form.get("description") ?? "").trim(), type: String(form.get("type") ?? "Tarea"), weight: Number(form.get("weight")), completed: draft.completed ?? false };
    if (values.title.trim().length > 25) {
      setEvaluationError("El nombre de la evaluación no puede superar los 25 caracteres.");
      return;
    }
    const otherWeight = evaluations.reduce((sum, item) => sum + (item.id === draft.id ? 0 : item.weight), 0);
    const availableWeight = Math.max(0, 100 - otherWeight);
    if (!Number.isFinite(values.weight) || values.weight > availableWeight + 0.0001) {
      setEvaluationError(`El porcentaje total no puede superar el 100%. Solo quedan ${availableWeight.toFixed(1)}% disponibles para esta materia.`);
      return;
    }
    setEvaluationError("");
    const dateValue = String(form.get("date") ?? "");
    if (dateValue) values.date = dateValue;
    if (gradeValue !== "") values.grade = Number(gradeValue);
    else if (draft.id && draft.grade === "") values.clearGrade = true;
    const saved = await onSaveEvaluation(draft?.id ? { ...values, evaluationId: draft.id } : values);
    if (saved) setDraft(null);
    else setEvaluationError("No se pudo guardar la evaluación. Revisa los datos e inténtalo de nuevo.");
  }

  async function confirmDeleteEvaluation() {
    if (!deleteConfirmation || deletePending) return;
    setDeletePending(true);
    setDeleteError("");
    const deleted = await onDeleteEvaluation(deleteConfirmation.id);
    setDeletePending(false);
    if (deleted) setDeleteConfirmation(null);
    else setDeleteError("No se pudo eliminar la evaluación. Inténtalo de nuevo.");
  }

  async function confirmDeleteSimulation() {
    if (!simulationDeleteConfirmation || simulationDeletePending) return;
    const simulation = simulationDeleteConfirmation;
    setSimulationDeletePending(true);
    setSimulationDeleteError("");
    const deleted = await onDeleteSimulation(simulation.id);
    setSimulationDeletePending(false);
    if (deleted) {
      setOptimisticSimulations((current) => {
        const next = new Map(current);
        next.delete(simulation.id);
        return next;
      });
      if (editingSimulationId === simulation.id) cancelScenarioEdit();
      setSimulationDeleteConfirmation(null);
    } else setSimulationDeleteError("No se pudo eliminar la simulación. Inténtalo de nuevo.");
  }

  async function saveScenario(event) {
    event.preventDefault();
    if (hasInvalidSimulatedGrade) {
      setSimulationError("Las notas simuladas deben estar entre 0 y 20.");
      return;
    }
    const projectedGrades = evaluations.filter((item) => simulatedGrades[item.id] != null && simulatedGrades[item.id] !== "").map((item) => ({ evaluationId: item.id, grade: Number(simulatedGrades[item.id]) }));
    try {
      const savedSimulation = await onSaveSimulation({ simulationId: editingSimulationId || undefined, name: simulationName, projectedGrades });
      if (savedSimulation?.id) setOptimisticSimulations((current) => new Map(current).set(savedSimulation.id, savedSimulation));
      setSimulationError("");
      setSimulationName("");
      setSimulatedGrades({});
      setEditingSimulationId("");
      setSimulationModalOpen(false);
    } catch (error) {
      const message = error?.data?.message ?? error?.message ?? "";
      const readableMessage = String(message).replace(/^.*Uncaught Error:\s*/s, "").split(/\r?\n/)[0].trim();
      setSimulationError(readableMessage || "No se pudieron guardar los cambios de la simulación.");
    }
  }

  function editScenario(scenario) {
    setSimulationError("");
    setEditingSimulationId(scenario.id);
    setSimulationName(scenario.name);
    setSimulatedGrades(Object.fromEntries(scenario.projectedGrades.map((entry) => [entry.evaluationId, String(entry.grade)])));
    setSimulationModalOpen(true);
  }

  function cancelScenarioEdit() {
    setSimulationError("");
    setSimulationModalOpen(false);
    setEditingSimulationId("");
    setSimulationName("");
    setSimulatedGrades({});
  }

  function startNewScenario() {
    setSimulationError("");
    setEditingSimulationId("");
    setSimulationName("");
    setSimulatedGrades({});
    setSimulationModalOpen(true);
  }

  return <article className={`quarter-course-tracker${simulationsOnly ? " is-simulations-only" : ""}`}>
    <header className="quarter-course-heading"><div><p className="eyebrow">Seguimiento de materia</p><h2>{subject.name}</h2><span>{subject.code}{readOnly && <strong className="quarter-readonly-badge">Solo lectura</strong>}</span></div>
      <div className="quarter-course-heading-actions"><button className={`secondary-action quarter-inline-action quarter-tracker-toggle${collapsed ? " is-collapsed" : ""}`} type="button" aria-expanded={!collapsed} aria-controls="quarter-tracker-content" onClick={() => setCollapsed((current) => !current)}><span>{collapsed ? "Mostrar seguimiento" : "Ocultar seguimiento"}</span><i className="quarter-tracker-toggle-icon" aria-hidden="true" /></button></div>
    </header>
    <div id="quarter-tracker-content" className="quarter-course-tracker-content" hidden={collapsed}>
    <div className="quarter-grade-summary">
      <div><span>Acumulado</span><strong>{earnedPoints.toFixed(2)} / 20</strong></div>
      <div><span>Porcentaje calificado</span><strong>{gradedWeight.toFixed(1)}%</strong></div>
      <div><span>Promedio de lo calificado</span><strong>{gradedWeight ? `${(earnedPoints * 100 / gradedWeight).toFixed(2)} / 20` : "Sin notas"}</strong></div>
    </div>
    <p className="quarter-calculation-note">{needed === null ? (earnedPoints >= target ? "Ya alcanzaste la nota mínima." : `No queda porcentaje sin nota: el resultado final es ${earnedPoints.toFixed(2)} / 20.`) : needed <= 0 ? "Ya alcanzaste la nota mínima; las evaluaciones restantes pueden subir tu promedio." : needed <= 20 ? `Para llegar a ${target}/20, necesitas promediar ${needed.toFixed(2)}/20 en el ${remainingWeight.toFixed(1)}% restante.` : `Con el ${remainingWeight.toFixed(1)}% pendiente no es posible llegar a ${target}/20; necesitarías ${needed.toFixed(2)}/20.`}</p>

    <div className="quarter-section-heading"><div><h3>Evaluaciones</h3><p>Los porcentajes registrados suman {evaluations.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}% de 100%.</p></div>{!readOnly && <button className="primary-action quarter-inline-action" type="button" onClick={() => { setEvaluationError(""); setDraft({ title: "", description: "", type: "Parcial", weight: "", date: "", grade: "", completed: false }); }}>Añadir evaluación</button>}</div>
    {draft && createPortal(<div className="quarter-evaluation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}>
      <form key={draft.id ?? "new-evaluation"} className="quarter-evaluation-modal" role="dialog" aria-modal="true" aria-labelledby="quarter-evaluation-modal-title" onSubmit={submitEvaluation}>
        <header className="quarter-evaluation-modal-header">
          <div><p className="eyebrow">{draft.id ? "Editar registro" : "Seguimiento de evaluaciones"}</p><h2 id="quarter-evaluation-modal-title">{draft.id ? "Editar evaluación" : "Nueva evaluación"}</h2><span>{subject.name} · {subject.code}</span></div>
          <button className="quarter-modal-close" type="button" aria-label="Cerrar" onClick={() => setDraft(null)}>×</button>
        </header>
        <div className="quarter-evaluation-modal-fields">
          <label className="quarter-evaluation-title-field">Nombre de la evaluación<input ref={evaluationTitleRef} name="title" required maxLength="25" defaultValue={draft.title} placeholder="Ej. Parcial de cálculo" /></label>
          <label className="quarter-evaluation-type-field">Tipo<EvaluationTypeSelect value={draft.type ?? "Tarea"} onChange={(type) => setDraft((current) => ({ ...current, type }))} /></label>
          <label className="quarter-evaluation-weight-field">Porcentaje<input name="weight" type="number" required min="0.1" max="100" step="0.1" defaultValue={draft.weight} placeholder="Ej. 25" aria-invalid={Boolean(evaluationError)} onChange={(event) => {
            const weight = Number(event.target.value);
            const otherWeight = evaluations.reduce((sum, item) => sum + (item.id === draft.id ? 0 : item.weight), 0);
            const availableWeight = Math.max(0, 100 - otherWeight);
            setEvaluationError(event.target.value && Number.isFinite(weight) && weight > availableWeight + 0.0001
              ? `El total superaría el 100%. Solo quedan ${availableWeight.toFixed(1)}% disponibles para esta materia.`
              : "");
          }} /></label>
          <label className="quarter-evaluation-date-field">Fecha<input name="date" type="date" defaultValue={draft.date} onClick={(event) => event.currentTarget.showPicker?.()} /></label>
          <label className="quarter-evaluation-grade-field">Nota obtenida<input name="grade" type="number" min="0" max="20" step="0.01" value={draft.grade ?? ""} onChange={(event) => setDraft((current) => ({ ...current, grade: clampGradeInput(event.target.value) }))} placeholder="Sobre 20" /></label>
          <label className="quarter-evaluation-completed quarter-evaluation-completed-modal"><input type="checkbox" checked={Boolean(draft.completed)} onChange={(event) => setDraft((current) => ({ ...current, completed: event.target.checked }))} /><span>Realizada</span></label>
          {draft.grade !== "" && draft.grade != null && <button className="secondary-action quarter-inline-action quarter-grade-clear" type="button" onClick={() => setDraft((current) => ({ ...current, grade: "" }))}>Quitar nota</button>}
          <label className="quarter-evaluation-description-field">Descripción <span>(opcional)</span><textarea name="description" maxLength="1000" defaultValue={draft.description ?? ""} placeholder="Añade temas, indicaciones o detalles que quieras recordar…" /></label>
        </div>
        {evaluationError && <p className="quarter-evaluation-error" role="alert">{evaluationError}</p>}
        <footer className="quarter-evaluation-modal-footer"><button className="secondary-action quarter-inline-action" type="button" onClick={() => setDraft(null)}>Cancelar</button><button className="primary-action quarter-inline-action" type="submit" disabled={Boolean(evaluationError)}>Guardar evaluación</button></footer>
      </form>
    </div>, document.body)}
    {deleteConfirmation && createPortal(<div className="quarter-evaluation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deletePending) setDeleteConfirmation(null); }}>
      <section className="quarter-calendar-day-modal quarter-delete-evaluation-modal" role="alertdialog" aria-modal="true" aria-labelledby="quarter-delete-evaluation-title" aria-describedby="quarter-delete-evaluation-description">
        <header><div><p className="eyebrow">Confirmar eliminación</p><h2 id="quarter-delete-evaluation-title">¿Eliminar evaluación?</h2></div><button className="quarter-modal-close" type="button" aria-label="Cerrar" disabled={deletePending} onClick={() => setDeleteConfirmation(null)}>×</button></header>
        <p id="quarter-delete-evaluation-description">Se eliminará “{deleteConfirmation.title}” y no se podrá recuperar.</p>
        {deleteError && <p className="quarter-evaluation-error" role="alert">{deleteError}</p>}
        <footer className="quarter-delete-evaluation-actions"><button ref={deleteCancelRef} className="secondary-action quarter-inline-action" type="button" disabled={deletePending} onClick={() => setDeleteConfirmation(null)}>Cancelar</button><button className="primary-action quarter-inline-action quarter-delete-confirm-button" type="button" disabled={deletePending} onClick={() => void confirmDeleteEvaluation()}>{deletePending ? "Eliminando…" : "Eliminar evaluación"}</button></footer>
      </section>
    </div>, document.body)}
    {simulationDeleteConfirmation && createPortal(<div className="quarter-evaluation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !simulationDeletePending) setSimulationDeleteConfirmation(null); }}>
      <section className="quarter-calendar-day-modal quarter-delete-evaluation-modal" role="alertdialog" aria-modal="true" aria-labelledby="quarter-delete-simulation-title" aria-describedby="quarter-delete-simulation-description">
        <header><div><p className="eyebrow">Confirmar eliminación</p><h2 id="quarter-delete-simulation-title">¿Eliminar simulación?</h2></div><button className="quarter-modal-close" type="button" aria-label="Cerrar" disabled={simulationDeletePending} onClick={() => setSimulationDeleteConfirmation(null)}>×</button></header>
        <p id="quarter-delete-simulation-description">Se eliminará “{simulationDeleteConfirmation.name}” y no se podrá recuperar.</p>
        {simulationDeleteError && <p className="quarter-evaluation-error" role="alert">{simulationDeleteError}</p>}
        <footer className="quarter-delete-evaluation-actions"><button ref={deleteCancelRef} className="secondary-action quarter-inline-action" type="button" disabled={simulationDeletePending} onClick={() => setSimulationDeleteConfirmation(null)}>Cancelar</button><button className="primary-action quarter-inline-action quarter-delete-confirm-button" type="button" disabled={simulationDeletePending} onClick={() => void confirmDeleteSimulation()}>{simulationDeletePending ? "Eliminando…" : "Eliminar simulación"}</button></footer>
      </section>
    </div>, document.body)}
    <div className="quarter-evaluation-list">{sortedEvaluations.map((item) => <div className="quarter-evaluation-row" key={item.id}>
      <div className="quarter-evaluation-header"><div className="quarter-evaluation-copy"><strong>{item.title}</strong><div className="quarter-evaluation-tags"><span className="quarter-evaluation-tag">{item.type ?? "Tarea"}</span><span className="quarter-evaluation-tag">{item.weight}%</span><span className="quarter-evaluation-tag">{item.date ? formatDate(item.date) : "Sin fecha"}</span></div></div>
        <div className="quarter-evaluation-badges"><strong className={item.completed ? "quarter-evaluation-status is-complete" : "quarter-evaluation-status"}>{item.completed ? "Realizada" : "Pendiente"}</strong>{item.grade != null && <span className={`quarter-evaluation-grade-tag is-${gradeTone(Number(item.grade))}`}>{Number(item.grade).toFixed(2)} / 20</span>}</div>
      </div>
      {item.description && <p className="quarter-evaluation-description">{item.description}</p>}
      {!readOnly && <div className="quarter-evaluation-management">
        <button className="secondary-action quarter-evaluation-row-button" type="button" onClick={() => { setEvaluationError(""); setDraft({ ...item, weight: String(item.weight), date: item.date ?? "", grade: item.grade ?? "" }); }}>Editar</button>
        <button className="secondary-action quarter-evaluation-row-button is-delete" type="button" aria-label={`Eliminar ${item.title}`} onClick={() => { setDeleteError(""); setDeleteConfirmation(item); }}>Eliminar</button>
      </div>}
    </div>)}{evaluations.length === 0 && <p className="quarter-empty-state">Todavía no agregaste evaluaciones a esta materia.</p>}</div>

    {simulationsOnly && <section className="quarter-simulator">
      <div className="quarter-section-heading"><div><h3>Simulaciones guardadas</h3><p>{readOnly ? "Tus simulaciones guardadas se conservan para consulta." : evaluations.length > 0 ? "Prueba resultados sin modificar tus evaluaciones reales." : "Las simulaciones guardadas se conservan aunque se eliminen sus evaluaciones."}</p></div>{!readOnly && evaluations.length > 0 && <button className="primary-action quarter-inline-action" type="button" onClick={startNewScenario}>Crear simulación</button>}</div>
      {visibleSimulations.length > 0 && <div className="quarter-saved-simulations">{visibleSimulations.map((scenario) => {
        const evaluationsById = new Map(evaluations.map((item) => [item.id, item]));
        const accumulatedPoints = scenario.projectedGrades.reduce((sum, entry) => {
          const evaluation = evaluationsById.get(entry.evaluationId);
          return sum + (evaluation ? Number(entry.grade) * evaluation.weight / 100 : 0);
        }, 0);
        const simulatedWeight = scenario.projectedGrades.reduce((sum, entry) => sum + (evaluationsById.get(entry.evaluationId)?.weight ?? 0), 0);
        return <details className={`quarter-saved-simulation${readOnly ? "" : " has-actions"}`} key={scenario.id}>
          <summary><span>{scenario.name}</span><small>{scenario.projectedGrades.length} {scenario.projectedGrades.length === 1 ? "nota" : "notas"}</small></summary>
          {!readOnly && <div className="quarter-saved-simulation-summary-actions"><button className="secondary-action quarter-inline-action" type="button" onClick={() => editScenario(scenario)}>Editar</button><button className="secondary-action quarter-inline-action quarter-simulation-delete" type="button" onClick={() => { setSimulationDeleteError(""); setSimulationDeleteConfirmation(scenario); }}>Eliminar</button></div>}
          <div className="quarter-saved-simulation-content">
            {scenario.projectedGrades.length > 0
              ? scenario.projectedGrades.map((entry) => {
                const evaluation = evaluationsById.get(entry.evaluationId);
                return <div className="quarter-saved-simulation-grade" key={entry.evaluationId}>
                  <div className="quarter-saved-simulation-copy">
                    <strong>{evaluation?.title ?? "Evaluación"}</strong>
                    {evaluation && <div className="quarter-evaluation-tags"><span className="quarter-evaluation-tag">{evaluation.type ?? "Tarea"}</span><span className="quarter-evaluation-tag">{evaluation.weight}% de la materia</span></div>}
                  </div>
                  <div className="quarter-saved-simulation-result">
                    <strong className={`quarter-evaluation-grade-tag is-${gradeTone(Number(entry.grade))}`}>{Number(entry.grade).toFixed(2)} / 20</strong>
                    {evaluation && <small>Aporta {(Number(entry.grade) * evaluation.weight / 100).toFixed(2)} pts</small>}
                  </div>
                </div>;
              })
              : <p className="quarter-empty-state">Esta simulación no tiene notas estimadas.</p>}
            <div className="quarter-saved-simulation-total">
              <div><span>Total acumulado de la materia</span><small>{simulatedWeight.toFixed(1)}% cubierto en esta simulación</small></div>
              <strong className={`quarter-evaluation-grade-tag is-${gradeTone(accumulatedPoints)}`}>{accumulatedPoints.toFixed(2)} / 20</strong>
            </div>
          </div>
        </details>;
      })}</div>}
      {visibleSimulations.length === 0 && <p className="quarter-empty-state">No hay simulaciones guardadas para esta materia.</p>}
    </section>}
    {simulationModalOpen && createPortal(<div className="quarter-evaluation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancelScenarioEdit(); }}>
      <form ref={simulationFormRef} className="quarter-evaluation-modal quarter-simulation-modal" role="dialog" aria-modal="true" aria-labelledby="quarter-simulation-modal-title" onSubmit={saveScenario}>
        <header className="quarter-evaluation-modal-header">
          <div><p className="eyebrow">{editingSimulationId ? "Editar simulación" : "Nueva simulación"}</p><h2 id="quarter-simulation-modal-title">{editingSimulationId ? "Ajusta tus notas" : "Simular notas"}</h2><span>{subject.name} · {subject.code}</span></div>
          <button className="quarter-modal-close" type="button" aria-label="Cerrar" onClick={cancelScenarioEdit}>×</button>
        </header>
        <label className="quarter-simulation-name-field">Nombre de la simulación<input ref={simulationNameRef} aria-label="Nombre de simulación" maxLength="50" required placeholder="Ej. Me va bien en el parcial" value={simulationName} onChange={(event) => setSimulationName(event.target.value)} /></label>
        <div className="quarter-simulation-inputs">{evaluations.map((item) => <label key={item.id}><span>{item.title} · {item.weight}%</span><input type="number" min="0" max="20" step="0.1" aria-invalid={Number(simulatedGrades[item.id]) > 20 || Number(simulatedGrades[item.id]) < 0} placeholder={item.grade == null ? "Nota estimada" : `Real: ${item.grade}`} value={simulatedGrades[item.id] ?? ""} onChange={(event) => setSimulatedGrades((current) => ({ ...current, [item.id]: event.target.value }))} /></label>)}</div>
        {simulationError && <p className="quarter-evaluation-error" role="alert">{simulationError}</p>}
        {hasInvalidSimulatedGrade ? <p className="quarter-evaluation-error" role="alert">Las notas simuladas deben estar entre 0 y 20.</p> : <p className={`quarter-calculation-note is-${projectionTone(projectedFinal)}`}>{projectedMissingWeight ? `Falta simular ${projectedMissingWeight.toFixed(1)}% del trimestre. Proyección actual: ${projectedFinal.toFixed(2)} / 20, más las evaluaciones sin estimar.` : `Resultado proyectado: ${projectedFinal.toFixed(2)} / 20 · ${projectedFinal >= target ? "alcanzarías" : "no alcanzarías"} la meta de ${target}/20.`}</p>}
        <footer className="quarter-evaluation-modal-footer"><button className="secondary-action quarter-inline-action" type="button" onClick={cancelScenarioEdit}>Cancelar</button><button className="primary-action quarter-inline-action" type="submit" disabled={hasInvalidSimulatedGrade}>{editingSimulationId ? "Guardar cambios" : "Guardar simulación"}</button></footer>
      </form>
    </div>, document.body)}
    </div>
  </article>;
}

function EvaluationTypeSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeMenu(event) {
      if (event.key === "Escape") setOpen(false);
      if (event.type === "pointerdown" && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [open]);

  return <div ref={rootRef} className={`custom-select quarter-evaluation-type-select${open ? " is-open" : ""}`}>
    <input type="hidden" name="type" value={value} />
    <button className="custom-select-trigger" type="button" role="combobox" aria-label="Tipo de evaluación" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="custom-select-label">{value}</span><span className="custom-select-chevron" aria-hidden="true" />
    </button>
    {open && <div className="custom-select-menu" role="listbox" aria-label="Tipo de evaluación">
      <div className="custom-select-options">
        {EVALUATION_TYPES.map((type) => <button key={type} type="button" role="option" aria-selected={type === value} className={`custom-select-option${type === value ? " is-selected" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(type); setOpen(false); }}>
          <span className="custom-select-label">{type}</span>
        </button>)}
      </div>
    </div>}
  </div>;
}

export function SchedulePlanner({ subjects, scheduleBlocks, scheduleSubjects, termName = "", onSave, onClear }) {
  const [editingCode, setEditingCode] = useState("");
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [color, setColor] = useState(SCHEDULE_COLORS[0].value);
  const [classroom, setClassroom] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const clearCancelRef = useRef(null);
  const clearDialogRef = useRef(null);
  const clearingRef = useRef(false);
  clearingRef.current = clearing;
  const settingsByCode = new Map(scheduleSubjects.map((item) => [item.courseCode, item]));
  const subjectsByCode = new Map(subjects.map((subject) => [subject.code, subject]));
  const slotsByCode = new Map(subjects.map((subject) => [subject.code, []]));
  const slotMap = new Map();
  for (const block of scheduleBlocks) {
    if (!subjectsByCode.has(block.courseCode)) continue;
    slotsByCode.get(block.courseCode).push(block);
    slotMap.set(`${block.day}:${block.block}`, block.courseCode);
  }
  const occupiedByOtherSlots = new Map(scheduleBlocks
    .filter((block) => block.courseCode !== editingCode && subjectsByCode.has(block.courseCode))
    .map((block) => [`${block.day}:${block.block}`, subjectsByCode.get(block.courseCode).name]));
  const subject = subjectsByCode.get(editingCode);
  const activeColor = SCHEDULE_COLORS.find((item) => item.value === color) ?? SCHEDULE_COLORS[0];
  const modalOpen = Boolean(editingCode || clearConfirmation);

  useEffect(() => {
    if (editingCode && !subjects.some((course) => course.code === editingCode)) setEditingCode("");
  }, [editingCode, subjects]);

  useEffect(() => {
    if (!clearConfirmation) return undefined;
    const previousFocus = document.activeElement;
    clearCancelRef.current?.focus();
    function handleKeys(event) {
      if (event.key === "Escape" && !clearingRef.current) setClearConfirmation(false);
      if (event.key !== "Tab") return;
      const buttons = [...(clearDialogRef.current?.querySelectorAll("button:not(:disabled)") ?? [])];
      if (!buttons.length) { event.preventDefault(); return; }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeys);
    return () => { document.removeEventListener("keydown", handleKeys); previousFocus?.focus(); };
  }, [clearConfirmation]);

  async function confirmClear() {
    if (clearing) return;
    setClearing(true);
    setClearError("");
    try {
      if (await onClear()) setClearConfirmation(false);
      else setClearError("No se pudo limpiar el horario. Inténtalo de nuevo.");
    } catch {
      setClearError("No se pudo limpiar el horario. Inténtalo de nuevo.");
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    if (!editingCode) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setEditingCode("");
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editingCode]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const root = document.documentElement;
    const body = document.body;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    const previous = {
      rootOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      root.style.overflow = previous.rootOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPaddingRight;
    };
  }, [modalOpen]);

  function openEditor(course) {
    setEditingCode(course.code);
    setSelectedSlots((slotsByCode.get(course.code) ?? []).map((block) => `${block.day}:${block.block}`));
    const savedColor = settingsByCode.get(course.code)?.color;
    setClassroom(settingsByCode.get(course.code)?.classroom ?? "");
    const subjectIndex = subjects.findIndex((item) => item.code === course.code);
    setColor(savedColor ?? SCHEDULE_COLORS[subjectIndex % SCHEDULE_COLORS.length].value);
  }

  function downloadScheduleImage() {
    const scale = 2;
    const margin = 36;
    const timeWidth = 150;
    const dayWidth = 220;
    const headerHeight = 58;
    const rowHeight = 78;
    const width = margin * 2 + timeWidth + dayWidth * DAYS.length;
    const height = margin * 2 + 105 + headerHeight + rowHeight * BLOCKS.length;
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(scale, scale);

    const rootStyle = getComputedStyle(document.documentElement);
    const page = rootStyle.getPropertyValue("--page").trim() || "#190d09";
    const surface = rootStyle.getPropertyValue("--surface").trim() || "#24150f";
    const warmSurface = rootStyle.getPropertyValue("--surface-warm").trim() || "#2d1b14";
    const ink = rootStyle.getPropertyValue("--page-ink").trim() || "#fff6ea";
    const muted = rootStyle.getPropertyValue("--muted").trim() || "#ead3c4";
    const line = rootStyle.getPropertyValue("--line").trim() || "#56382b";
    context.fillStyle = page;
    context.fillRect(0, 0, width, height);
    context.fillStyle = ink;
    context.font = "700 28px Inter, system-ui, sans-serif";
    context.fillText("Horario de clases", margin, margin + 27);
    context.fillStyle = muted;
    context.font = "15px Inter, system-ui, sans-serif";
    context.fillText(`${termName || "Trimestre actual"} · Lunes a viernes`, margin, margin + 55);

    const gridX = margin;
    const gridY = margin + 82;
    context.font = "700 15px Inter, system-ui, sans-serif";
    drawScheduleCell(context, gridX, gridY, timeWidth, headerHeight, warmSurface, line);
    drawFittedText(context, "Bloque", gridX + timeWidth / 2, gridY + 36, timeWidth - 16, ink, "700 15px Inter, system-ui, sans-serif", "center");
    DAYS.forEach((day, dayIndex) => {
      const x = gridX + timeWidth + dayWidth * dayIndex;
      drawScheduleCell(context, x, gridY, dayWidth, headerHeight, warmSurface, line);
      drawFittedText(context, day, x + dayWidth / 2, gridY + 36, dayWidth - 16, ink, "700 15px Inter, system-ui, sans-serif", "center");
    });

    BLOCKS.forEach((time, block) => {
      const y = gridY + headerHeight + rowHeight * block;
      drawScheduleCell(context, gridX, y, timeWidth, rowHeight, warmSurface, line);
      drawFittedText(context, time, gridX + timeWidth / 2, y + rowHeight / 2 + 5, timeWidth - 12, muted, "600 13px Inter, system-ui, sans-serif", "center");
      DAYS.forEach((_, dayIndex) => {
        const x = gridX + timeWidth + dayWidth * dayIndex;
        const code = slotMap.get(`${dayIndex}:${block}`);
        const course = code ? subjectsByCode.get(code) : null;
        const settings = course ? settingsByCode.get(code) : null;
        const courseIndex = course ? subjects.findIndex((item) => item.code === code) : -1;
        const courseColor = course ? (SCHEDULE_COLORS.find((item) => item.value === settings?.color) ?? SCHEDULE_COLORS[courseIndex % SCHEDULE_COLORS.length]) : null;
        const fill = courseColor?.value ?? surface;
        const textColor = courseColor ? getScheduleTextColor(courseColor.value) : muted;
        drawScheduleCell(context, x, y, dayWidth, rowHeight, fill, line);
        if (!course) {
          context.fillStyle = muted;
          context.font = "600 14px Inter, system-ui, sans-serif";
          context.textAlign = "center";
          context.fillText("·", x + dayWidth / 2, y + rowHeight / 2 + 5);
          return;
        }
        context.textAlign = "center";
        drawFittedText(context, course.code, x + dayWidth / 2, y + 27, dayWidth - 18, textColor, "700 16px Inter, system-ui, sans-serif", "center");
        drawFittedText(context, course.name, x + dayWidth / 2, y + 47, dayWidth - 18, textColor, "600 12px Inter, system-ui, sans-serif", "center");
        if (settings?.classroom) drawFittedText(context, `Salón ${settings.classroom}`, x + dayWidth / 2, y + 65, dayWidth - 18, textColor, "600 11px Inter, system-ui, sans-serif", "center");
      });
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "horario-trimestre.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function toggleSlot(day, block, checked) {
    const key = `${day}:${block}`;
    setSelectedSlots((current) => checked ? [...new Set([...current, key])] : current.filter((slot) => slot !== key));
  }

  async function save() {
    setSaving(true);
    const saved = await onSave({
      courseCode: editingCode,
      color,
      classroom: classroom.trim(),
      blocks: selectedSlots.map((slot) => {
        const [day, block] = slot.split(":").map(Number);
        return { day, block };
      }),
    });
    setSaving(false);
    if (saved) setEditingCode("");
  }

  return <section className="quarter-pane quarter-schedule-pane">
    <div className="quarter-section-heading"><div><h2>Horario de clases</h2><p>Elige una materia para asignarle días, bloques y un color. Disponible gratis para todas tus materias.</p></div><div className="quarter-schedule-actions"><button className="secondary-action" type="button" disabled={!scheduleBlocks.length && !scheduleSubjects.length} onClick={() => { setClearError(""); setClearConfirmation(true); }}>Limpiar horario</button><button className="primary-action" type="button" disabled={!slotMap.size} onClick={downloadScheduleImage}>Descargar PNG</button></div></div>
    {!subjects.length ? <p className="quarter-empty-state">Selecciona tus materias para crear el horario.</p> : <>
      <div className="quarter-schedule-subjects">{subjects.map((course, index) => {
        const assigned = slotsByCode.get(course.code) ?? [];
        const settings = settingsByCode.get(course.code);
        const courseColor = SCHEDULE_COLORS.find((item) => item.value === settings?.color) ?? SCHEDULE_COLORS[index % SCHEDULE_COLORS.length];
        const days = [...new Set(assigned.map((item) => item.day))].sort((a, b) => a - b).map((day) => DAYS[day]);
        return <button className="quarter-schedule-subject" key={course.code} type="button" onClick={() => openEditor(course)}>
          <span className="quarter-subject-swatch" style={{ backgroundColor: courseColor.value }} aria-hidden="true" />
          <span className="quarter-schedule-subject-copy"><strong>{course.name}</strong><small>{course.code} · {assigned.length ? `${days.join(", ")} · ${assigned.length} bloque(s)` : "Sin horario asignado"}{settings?.classroom ? ` · Salón ${settings.classroom}` : ""}</small></span>
          <span className="quarter-schedule-edit-label">Configurar</span>
        </button>;
      })}</div>
      <div className="quarter-schedule-scroll"><table className="quarter-schedule quarter-schedule-week"><thead><tr><th>Bloque</th>{DAYS.map((day) => <th key={day}><span className="quarter-schedule-day-full">{day}</span><span className="quarter-schedule-day-short">{day.slice(0, 3)}</span></th>)}</tr></thead><tbody>{BLOCKS.map((time, block) => <tr key={time}><th>{time}</th>{DAYS.map((day, dayIndex) => {
        const code = slotMap.get(`${dayIndex}:${block}`);
        const course = code ? subjectsByCode.get(code) : null;
        const settings = course ? settingsByCode.get(code) : null;
        const courseColor = course ? (SCHEDULE_COLORS.find((item) => item.value === settings?.color) ?? SCHEDULE_COLORS[subjects.findIndex((item) => item.code === code) % SCHEDULE_COLORS.length]) : null;
        return <td key={day} className={course ? "has-class" : "is-free"} style={course ? { backgroundColor: courseColor.value, color: getScheduleTextColor(courseColor.value) } : undefined}>
          {course ? <span title={`${course.name} · ${course.code}${settings?.classroom ? ` · Salón ${settings.classroom}` : ""}`}>{course.code}<small>{course.name}</small>{settings?.classroom && <small className="quarter-schedule-room">Salón {settings.classroom}</small>}</span> : <span aria-label="Bloque libre">·</span>}
        </td>;
      })}</tr>)}</tbody></table></div>
    </>}

    {clearConfirmation && createPortal(<div className="quarter-evaluation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !clearing) setClearConfirmation(false); }}>
      <section ref={clearDialogRef} className="quarter-calendar-day-modal quarter-delete-evaluation-modal" role="dialog" aria-modal="true" aria-labelledby="quarter-clear-title" aria-describedby="quarter-clear-description" aria-busy={clearing}>
        <header><h2 id="quarter-clear-title">¿Limpiar horario?</h2><button className="quarter-modal-close" type="button" aria-label="Cerrar" disabled={clearing} onClick={() => setClearConfirmation(false)}>×</button></header>
        <p id="quarter-clear-description">Se eliminarán todos los bloques, colores y salones del horario de este trimestre. Tus materias seleccionadas y evaluaciones se conservarán. Esta acción no se puede deshacer.</p>
        {clearError && <p role="alert">{clearError}</p>}
        <footer className="quarter-delete-evaluation-actions"><button ref={clearCancelRef} type="button" className="secondary-action quarter-inline-action" disabled={clearing} onClick={() => setClearConfirmation(false)}>Cancelar</button><button type="button" className="primary-action quarter-inline-action quarter-delete-confirm-button" disabled={clearing} onClick={() => void confirmClear()}>{clearing ? "Limpiando…" : "Confirmar limpieza"}</button></footer>
      </section>
    </div>, document.body)}
    {subject && createPortal(<div className="quarter-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCode(""); }}>
      <section className="quarter-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="quarter-schedule-modal-title">
        <header><div><p className="eyebrow">Horario de clases</p><h2 id="quarter-schedule-modal-title">{subject.name}</h2><span>{subject.code}</span></div><button className="quarter-modal-close" type="button" aria-label="Cerrar" onClick={() => setEditingCode("")}>×</button></header>
        <div className="quarter-color-picker"><strong>Color de la materia</strong><div>{SCHEDULE_COLORS.map((option) => <button key={option.value} type="button" className={color === option.value ? "is-selected" : ""} style={{ backgroundColor: option.value }} aria-label={option.name} title={option.name} aria-pressed={color === option.value} onClick={() => setColor(option.value)} />)}</div></div>
        <label className="quarter-classroom-field">Salón<input type="text" maxLength="50" value={classroom} onChange={(event) => setClassroom(event.target.value)} placeholder="Ej. A2-106" /></label>
        <div className="quarter-schedule-modal-grid-wrap"><table className="quarter-schedule quarter-schedule-modal-grid"><thead><tr><th>Bloque</th>{DAYS.map((day) => <th key={day}>{day}</th>)}</tr></thead><tbody>{BLOCKS.map((time, block) => <tr key={time}><th>{time}</th>{DAYS.map((day, dayIndex) => {
          const key = `${dayIndex}:${block}`;
          const occupiedBy = occupiedByOtherSlots.get(key);
          return <td key={day}><label className={occupiedBy ? "is-occupied" : ""} aria-label={`${day}, ${time}${occupiedBy ? `, ocupado por ${occupiedBy}` : ""}`} title={occupiedBy ? `Ocupado por ${occupiedBy}` : undefined}><input type="checkbox" checked={selectedSlots.includes(key)} disabled={Boolean(occupiedBy)} onChange={(event) => toggleSlot(dayIndex, block, event.target.checked)} /><span /></label></td>;
        })}</tr>)}</tbody></table></div>
        <p className="quarter-schedule-conflict-note">Los bloques ocupados por otra materia no se pueden seleccionar.</p>
        <footer><button type="button" className="secondary-action" onClick={() => setEditingCode("")}>Cancelar</button><button type="button" className="primary-action" disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar horario"}</button></footer>
      </section>
    </div>, document.body)}
  </section>;
}

function drawScheduleCell(context, x, y, width, height, fill, border) {
  context.fillStyle = fill;
  context.fillRect(x, y, width, height);
  context.strokeStyle = border;
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

function getScheduleTextColor(hexColor) {
  if (scheduleInkCache.has(hexColor)) return scheduleInkCache.get(hexColor);
  const raw = hexColor.replace("#", "");
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16) / 255);
  if (rgb.some((channel) => !Number.isFinite(channel))) return "#fffaf2";
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rgb[0]) hue = 60 * (((rgb[1] - rgb[2]) / delta) % 6);
    else if (max === rgb[1]) hue = 60 * ((rgb[2] - rgb[0]) / delta + 2);
    else hue = 60 * ((rgb[0] - rgb[1]) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const backgroundLuminance = luminance(rgb);
  let bestColor = "#fffaf2";
  let bestDistance = Infinity;
  for (let step = 0; step <= 100; step += 1) {
    const distance = step / 100;
    for (const candidateLightness of [lightness - distance, lightness + distance]) {
      const candidate = hslToRgb(hue, saturation, Math.max(0, Math.min(1, candidateLightness)));
      const candidateLuminance = luminance(candidate);
      const contrast = (Math.max(backgroundLuminance, candidateLuminance) + 0.05) / (Math.min(backgroundLuminance, candidateLuminance) + 0.05);
      if (contrast >= 4.5) {
        bestColor = `rgb(${candidate.map((channel) => Math.round(channel * 255)).join(", ")})`;
        bestDistance = distance;
        break;
      }
    }
    if (Number.isFinite(bestDistance)) break;
  }
  scheduleInkCache.set(hexColor, bestColor);
  return bestColor;
}

function hslToRgb(hue, saturation, lightness) {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const channels = hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
      : hue < 180 ? [0, chroma, x]
        : hue < 240 ? [0, x, chroma]
          : hue < 300 ? [x, 0, chroma]
            : [chroma, 0, x];
  return channels.map((channel) => channel + match);
}

function luminance(rgb) {
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function drawFittedText(context, value, x, y, maxWidth, color, font, align = "left") {
  let text = String(value);
  context.save();
  context.font = font;
  context.fillStyle = color;
  context.textAlign = align;
  while (text.length > 1 && context.measureText(text).width > maxWidth) text = `${text.slice(0, -2)}…`;
  context.fillText(text, x, y);
  context.restore();
}

function QuarterCalendar({ evaluations, subjects, courseColors, month, onMonthChange }) {
  const [selectedDate, setSelectedDate] = useState("");
  const today = new Date();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstOffset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysCount = new Date(year, monthIndex + 1, 0).getDate();
  const eventMap = groupBy(evaluations.filter((item) => item.date), "date");
  const selectedEvents = selectedDate ? eventMap[selectedDate] ?? [] : [];
  const legendSubjects = [...new Set(evaluations.filter((item) => item.date).map((item) => item.courseCode))]
    .map((courseCode) => subjects.get(courseCode) ?? { code: courseCode, name: courseCode })
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
  const cells = [...Array(firstOffset).fill(null), ...Array.from({ length: daysCount }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);

  useEffect(() => {
    if (!selectedDate) return undefined;
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    function closeOnEscape(event) {
      if (event.key === "Escape") setSelectedDate("");
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      root.style.overflow = previousRootOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [selectedDate]);

  return <section className="quarter-pane">
    <div className="quarter-section-heading quarter-calendar-heading"><div><h2>Calendario de evaluaciones</h2><p>Fechas de entrega y evaluaciones de las materias con seguimiento.</p></div><div className="quarter-month-controls"><button type="button" aria-label="Mes anterior" onClick={() => onMonthChange(new Date(year, monthIndex - 1, 1))}>‹</button><button className="quarter-month-today" type="button" onClick={() => onMonthChange(new Date(today.getFullYear(), today.getMonth(), 1))}>Hoy</button><strong><span className="quarter-month-full">{month.toLocaleDateString("es", { month: "long", year: "numeric" })}</span><span className="quarter-month-compact">{month.toLocaleDateString("es", { month: "long", year: "numeric" })}</span></strong><button type="button" aria-label="Mes siguiente" onClick={() => onMonthChange(new Date(year, monthIndex + 1, 1))}>›</button></div></div>
    {legendSubjects.length > 0 && <div className="quarter-calendar-legend" aria-label="Leyenda de materias"><strong>Materias</strong>{legendSubjects.map((subject) => {
      const color = courseColors.get(subject.code) ?? SCHEDULE_COLORS[0].value;
      return <span className="quarter-calendar-legend-item" key={subject.code}><i style={{ backgroundColor: color }} aria-hidden="true" /><span>{subject.name}<small>{subject.code}</small></span></span>;
    })}</div>}
    <div className="quarter-calendar-grid">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => <strong className="quarter-calendar-weekday" key={day}>{day}</strong>)}
      {cells.map((day, index) => {
        const date = day ? `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
        const isToday = day === today.getDate() && year === today.getFullYear() && monthIndex === today.getMonth();
        const events = eventMap[date] ?? [];
        const dayContent = <><strong>{day}</strong>{events.length > 0 && <span className="quarter-calendar-events" aria-hidden="true">{events.map((item) => {
          const color = courseColors.get(item.courseCode) ?? SCHEDULE_COLORS[0].value;
          return <small className="quarter-calendar-event" key={item.id} title={`${item.title} · ${subjects.get(item.courseCode)?.name ?? item.courseCode}`} style={{ backgroundColor: color, color: getScheduleTextColor(color) }}><strong>{item.title}</strong></small>;
        })}</span>}</>;
        if (!day) return <div className="quarter-calendar-day is-empty" key={`${date}-${index}`} />;
        return <button className={`quarter-calendar-day${isToday ? " is-today" : ""}`} key={date} type="button" aria-current={isToday ? "date" : undefined} aria-label={`${new Date(year, monthIndex, day).toLocaleDateString("es", { day: "numeric", month: "long" })}: ${events.length ? `${events.length} evaluaciones` : "sin evaluaciones"}. Ver detalle.`} onClick={() => setSelectedDate(date)}>{dayContent}</button>;
      })}
    </div>
    {evaluations.filter((item) => item.date).length === 0 && <p className="quarter-empty-state">Agrega fechas a tus evaluaciones para verlas aquí.</p>}
    {selectedDate && createPortal(<div className="quarter-evaluation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedDate(""); }}>
      <section className="quarter-calendar-day-modal" role="dialog" aria-modal="true" aria-labelledby="quarter-calendar-day-title">
        <header><div><p className="eyebrow">Calendario de evaluaciones</p><h2 id="quarter-calendar-day-title">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2></div><button className="quarter-modal-close" type="button" aria-label="Cerrar" onClick={() => setSelectedDate("")}>×</button></header>
        {selectedEvents.length ? <div className="quarter-calendar-day-modal-list">{selectedEvents.map((item) => {
          const subject = subjects.get(item.courseCode);
          const color = courseColors.get(item.courseCode) ?? SCHEDULE_COLORS[0].value;
          return <article key={item.id} className="quarter-calendar-day-modal-item">
            <span className="quarter-calendar-day-modal-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
            <div><strong>{item.title}</strong><span>{subject?.name ?? item.courseCode} · {item.courseCode}</span>
              <div className="quarter-evaluation-tags"><span className="quarter-evaluation-tag">{item.type ?? "Tarea"}</span><span className="quarter-evaluation-tag">{item.weight}%</span>{item.grade != null && <span className={`quarter-evaluation-grade-tag is-${gradeTone(Number(item.grade))}`}>{Number(item.grade).toFixed(2)} / 20</span>}</div>
              {item.description && <p>{item.description}</p>}
            </div>
          </article>;
        })}</div> : <p className="quarter-empty-state">No hay evaluaciones para este día.</p>}
      </section>
    </div>, document.body)}
  </section>;
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key];
    (groups[value] ??= []).push(item);
    return groups;
  }, {});
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es", { day: "numeric", month: "short" });
}
