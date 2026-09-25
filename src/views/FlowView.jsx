import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { flowPrograms as curriculumPrograms } from "../../convex/flowData";
import { RatingSummary } from "./MaterialsView";
import { matchesFuzzySearch } from "../utils/fuzzySearch";

const statusOptions = ["Cursada", "En curso", "Planificada", "Pendiente"];
const difficultyLabels = ["Sin calificar", "Muy Fácil", "Fácil", "Medio", "Difícil", "Muy Difícil", "Extremo"];
const additionalRequirementsByCareer = {
  sistemas: [
    { code: "BPTDI01", name: "Servicio comunitario", note: "FGTDI01 y 90 créditos requeridos" },
    { code: "FPTIS04", name: "Defensa de trabajo de grado", note: "FPTSP22 requerido" },
  ],
  mecanica: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 créditos requeridos" },
    { code: "FPTIM04", name: "Defensa de trabajo de grado", note: "FPTSP22 requerido" },
  ],
  electrica: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 créditos requeridos" },
    { code: "FPTIE23", name: "Defensa de trabajo de grado", note: "FPTSP22 requerido" },
  ],
  produccion: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 créditos requeridos" },
    { code: "FPTIP04", name: "Defensa TG", note: "FPTSP22 requerido" },
  ],
  quimica: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 créditos requeridos" },
    { code: "FPTIQ04", name: "Defensa TG", note: "FPTSP22 requerido" },
  ],
};

export function FlowView({
  flowPeriods,
  flowStatuses,
  difficultyRatings = {},
  isAdmin = false,
  onStatusChange,
  onPeriodStatusChange,
  onDifficultyRatingChange,
  difficultyRatingError = "",
  flowStatusError = "",
  flowProgram,
  materials = [],
  careers = [],
  selectedCareer = "sistemas",
  cacheStatus = "Cache local",
  onCareerChange,
  onOpenMaterialInLibrary,
}) {
  const boardRef = useRef(null);
  const boardScrollLeftRef = useRef(0);
  const dragRef = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0, nextScrollLeft: 0, frame: 0 });
  const [openMenu, setOpenMenu] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [requirementNotice, setRequirementNotice] = useState(null);
  const [statusChangeConfirmation, setStatusChangeConfirmation] = useState(null);
  const [activeSubsection, setActiveSubsection] = useState("flow");
  const [ratingSort, setRatingSort] = useState("desc");
  const [ratingSearch, setRatingSearch] = useState("");

  const officialCourseNames = useMemo(() => {
    const names = new Map();
    curriculumPrograms.forEach((program) => {
      program.periods.flat().forEach((course) => {
        const code = normalizeCourseCode(course.code);
        const name = String(course.name ?? "").trim();
        if (!names.has(code) && name && normalizeCourseCode(name) !== code) {
          names.set(code, name);
        }
      });
    });
    return names;
  }, []);
  const flowPeriodsWithIds = useMemo(() => flowPeriods.map((period, periodIndex) =>
    period.map((course, courseIndex) => ({
      ...course,
      name: resolveCourseName(course, officialCourseNames),
      id: course.id ?? `${selectedCareer}-${periodIndex + 1}-${courseIndex + 1}-${course.code}`,
    })),
  ), [flowPeriods, officialCourseNames, selectedCareer]);
  const allCourses = useMemo(() => flowPeriodsWithIds.flat(), [flowPeriodsWithIds]);
  const rankedCourses = useMemo(() => allCourses
    .map((course) => ({ course, stars: difficultyRatings[course.code] ?? 0 }))
    .sort((a, b) => {
      if (!a.stars && b.stars) return 1;
      if (a.stars && !b.stars) return -1;
      const starDifference = ratingSort === "desc" ? b.stars - a.stars : a.stars - b.stars;
      return starDifference || a.course.name.localeCompare(b.course.name) || a.course.id.localeCompare(b.course.id);
    }), [allCourses, difficultyRatings, ratingSort]);
  const searchedCourses = useMemo(() => rankedCourses.filter(({ course }) =>
    matchesCourseSearch(ratingSearch, course),
  ), [rankedCourses, ratingSearch]);
  const completed = allCourses.filter((course) => visibleStatus(course, flowStatuses, allCourses) === "Cursada");
  const totalCourses = allCourses.length;
  const credits = completed.reduce((sum, course) => sum + course.credits, 0);
  const totalCredits = allCourses.reduce((sum, course) => sum + course.credits, 0);
  const percent = totalCourses ? Math.round((completed.length / totalCourses) * 100) : 0;
  const careerOptions = careers.length ? careers : [{ id: selectedCareer, name: flowProgram?.name ?? "Ingeniería de Sistemas" }];
  const canSwitchCareer = careerOptions.length > 1;
  const additionalRequirements = additionalRequirementsByCareer[selectedCareer] ?? [
    { code: "BPTHE71", name: "Servicio comunitario", note: "90 créditos requeridos" },
    { code: "FPTSP22", name: "Defensa de trabajo de grado", note: "120 créditos requeridos" },
  ];

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const expectedScrollLeft = boardScrollLeftRef.current;
    if (expectedScrollLeft > 0 && Math.abs(board.scrollLeft - expectedScrollLeft) > 2) {
      board.scrollLeft = expectedScrollLeft;
    }
  }, [flowPeriods, flowStatuses, materials]);

  useEffect(() => {
    if (!openMenu) return undefined;

    const closeStatusMenu = () => setOpenMenu(null);
    // Capture catches both the page scroll and the board's horizontal scroll.
    window.addEventListener("scroll", closeStatusMenu, true);
    window.addEventListener("resize", closeStatusMenu);

    return () => {
      window.removeEventListener("scroll", closeStatusMenu, true);
      window.removeEventListener("resize", closeStatusMenu);
    };
  }, [openMenu]);

  function rememberBoardScroll() {
    if (!dragRef.current.active && boardRef.current) {
      boardScrollLeftRef.current = boardRef.current.scrollLeft;
    }
    setOpenMenu(null);
  }

  function updateStatus(course, nextStatus) {
    const currentStatus = flowStatuses[courseKey(course)] ?? course.status;
    const descendants = getDescendants(course.code, allCourses);

    if (currentStatus === "Cursada" && nextStatus !== "Cursada" && descendants.length > 0) {
      setStatusChangeConfirmation({ course, nextStatus, descendants });
      setOpenMenu(null);
      return;
    }

    applyStatusChange(course, nextStatus);
  }

  function applyStatusChange(course, nextStatus, descendants = []) {
    descendants.forEach((child) => onStatusChange(courseKey(child), "Pendiente", child.name));
    onStatusChange(courseKey(course), nextStatus, course.name);
    setOpenMenu(null);
  }

  function updatePeriodStatus(courses, nextStatus, periodNumber) {
    const availableCourses = courses.filter((course) => !isLocked(course, flowStatuses, allCourses));
    if (availableCourses.length === 0) {
      const blockedCourse = courses.find((course) => isLocked(course, flowStatuses, allCourses));
      if (blockedCourse) setRequirementNotice({ course: blockedCourse, requirements: missingRequirementDetails(blockedCourse, flowStatuses, allCourses) });
      return;
    }

    const targetKeys = new Set(availableCourses.map(courseKey));
    const affectedDescendants = new Map();
    if (nextStatus !== "Cursada") {
      availableCourses.forEach((course) => {
        const currentStatus = flowStatuses[courseKey(course)] ?? course.status;
        if (currentStatus !== "Cursada") return;
        getDescendants(course.code, allCourses).forEach((descendant) => {
          const key = courseKey(descendant);
          if (!targetKeys.has(key)) affectedDescendants.set(key, descendant);
        });
      });
    }

    const descendants = Array.from(affectedDescendants.values());
    if (descendants.length > 0) {
      setStatusChangeConfirmation({ periodNumber, periodCourses: availableCourses, nextStatus, descendants });
      setOpenMenu(null);
      return;
    }

    applyPeriodStatusChange(availableCourses, nextStatus);
  }

  function applyPeriodStatusChange(courses, nextStatus, descendants = []) {
    const changesByKey = new Map();
    const periodKeys = new Set(courses.map(courseKey));
    descendants.forEach((course) => {
      if (!periodKeys.has(courseKey(course))) changesByKey.set(courseKey(course), { courseCode: courseKey(course), status: "Pendiente", courseName: course.name });
    });
    courses.forEach((course) => changesByKey.set(courseKey(course), { courseCode: courseKey(course), status: nextStatus, courseName: course.name }));
    const changes = Array.from(changesByKey.values());

    if (onPeriodStatusChange) onPeriodStatusChange(changes);
    else changes.forEach((change) => onStatusChange(change.courseCode, change.status, change.courseName));
    setOpenMenu(null);
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const board = boardRef.current;
    if (!board) return;
    const scrollbarBuffer = 18;
    if (event.clientY >= board.getBoundingClientRect().bottom - scrollbarBuffer) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      scrollLeft: board.scrollLeft,
      nextScrollLeft: board.scrollLeft,
      frame: 0,
    };
    board.classList.add("is-grabbing");
  }

  function handlePointerMove(event) {
    if (!dragRef.current.active || !boardRef.current) return;
    const delta = event.clientX - dragRef.current.startX;
    if (Math.abs(delta) > 4) {
      dragRef.current.moved = true;
      boardRef.current.classList.add("is-dragging");
    }
    dragRef.current.nextScrollLeft = dragRef.current.scrollLeft - delta;
    if (dragRef.current.frame) return;
    dragRef.current.frame = window.requestAnimationFrame(() => {
      if (boardRef.current) {
        boardRef.current.scrollLeft = dragRef.current.nextScrollLeft;
        boardScrollLeftRef.current = boardRef.current.scrollLeft;
      }
      dragRef.current.frame = 0;
    });
  }

  function endDrag(event) {
    if (!dragRef.current.active) return;
    if (dragRef.current.frame) {
      window.cancelAnimationFrame(dragRef.current.frame);
      dragRef.current.frame = 0;
    }
    if (boardRef.current) {
      boardRef.current.scrollLeft = dragRef.current.nextScrollLeft;
      boardScrollLeftRef.current = boardRef.current.scrollLeft;
    }
    dragRef.current.active = false;
    window.setTimeout(() => {
      dragRef.current.moved = false;
    }, 80);
    boardRef.current?.classList.remove("is-grabbing", "is-dragging");
  }

  function suppressClickAfterDrag(event) {
    if (!dragRef.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleCardClick(course, isLocked) {
    if (dragRef.current.moved) return;
    if (isLocked) {
      setRequirementNotice({
        course,
        requirements: missingRequirementDetails(course, flowStatuses, allCourses),
      });
      return;
    }
    setSelectedCourse(course);
  }

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div>
          <h1>Flujograma académico</h1>
          <p>Consulta materias por periodo, revisa prelaciones y cambia estados desde el tag de cada materia.</p>
        </div>
        <div className="stat-stack flow-stat-stack">
          <span className="flow-program-chip flow-program-chip-large">{flowProgram?.name ?? "Ingeniería de Sistemas"}</span>
          <div className="flow-progress-metrics">
            <span><strong>{percent}%</strong><small>completado</small></span>
            <span><strong>{completed.length}/{totalCourses}</strong><small>materias cursadas</small></span>
            <span><strong>{credits}/{totalCredits}</strong><small>créditos cursados</small></span>
          </div>
        </div>
      </div>

      <section className="career-flow-panel">
        <div className="flow-toolbar">
          <div>
            <h2>{activeSubsection === "flow" ? "Flujograma interactivo" : "Calificaciones de materias"}</h2>
            <p className="meta-line flow-context-line">
              <span>{activeSubsection === "flow"
                ? "Arrastra el tablero para moverte. Pulsa la tarjeta para ver detalles."
                : "Consulta la dificultad de las materias según las estrellas asignadas."}</span>
            </p>
          </div>
          {canSwitchCareer && (
            <CareerSelect
              options={careerOptions}
              value={selectedCareer}
              onChange={(value) => onCareerChange?.(value)}
            />
          )}
          {activeSubsection === "flow" ? (
            <div className="flow-status-legend" aria-label="Estados del flujograma">
              <span className="flow-status is-completed">Cursada</span>
              <span className="flow-status is-current">En curso</span>
              <span className="flow-status is-planned">Planificada</span>
              <span className="flow-status is-pending">Pendiente</span>
              <span className="flow-status is-locked">Bloqueada</span>
            </div>
          ) : (
            <div className="flow-rating-order" role="group" aria-label="Ordenar calificaciones">
              <button
                className={ratingSort === "desc" ? "is-active" : ""}
                type="button"
                aria-pressed={ratingSort === "desc"}
                onClick={() => setRatingSort("desc")}
              >Mayor a menor</button>
              <button
                className={ratingSort === "asc" ? "is-active" : ""}
                type="button"
                aria-pressed={ratingSort === "asc"}
                onClick={() => setRatingSort("asc")}
              >Menor a mayor</button>
            </div>
          )}
        </div>

        <div className="flow-subsection-tabs" role="tablist" aria-label="Secciones del flujograma">
          <button
            id="flow-tab-board"
            className={activeSubsection === "flow" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeSubsection === "flow"}
            aria-controls="flow-panel-board"
            onClick={() => setActiveSubsection("flow")}
          >Flujograma</button>
          <button
            id="flow-tab-ratings"
            className={activeSubsection === "ratings" ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={activeSubsection === "ratings"}
            aria-controls="flow-panel-ratings"
            onClick={() => setActiveSubsection("ratings")}
          >Calificaciones</button>
        </div>

        {difficultyRatingError && <p className="flow-rating-error" role="alert">{difficultyRatingError}</p>}
        {flowStatusError && <p className="flow-rating-error" role="alert">{flowStatusError}</p>}

        {activeSubsection === "flow" ? (
          <div id="flow-panel-board" role="tabpanel" aria-labelledby="flow-tab-board">
        <div
          className="flow-board"
          aria-label="Flujograma por periodos"
          ref={boardRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={endDrag}
          onScroll={rememberBoardScroll}
          onClickCapture={suppressClickAfterDrag}
        >
          {flowPeriodsWithIds.map((courses, index) => (
            <section className="flow-period" key={index}>
              <div className="flow-period-header">
                <span>{index + 1}</span>
                <strong>Periodo</strong>
                {(() => {
                  const rawStatuses = courses.map((course) => flowStatuses[courseKey(course)] ?? course.status);
                  const currentStatus = rawStatuses.every((status) => status === rawStatuses[0]) ? rawStatuses[0] : "Mixto";
                  const periodMenuKey = `period-${index}`;
                  const lockedCount = courses.filter((course) => isLocked(course, flowStatuses, allCourses)).length;
                  return (
                    <button
                      className={`flow-status flow-period-status-trigger ${statusOptions.includes(currentStatus) ? statusClass(currentStatus) : "is-pending"}`}
                      type="button"
                      aria-label={`Cambiar estado de todas las materias del periodo ${index + 1}`}
                      aria-haspopup="listbox"
                      aria-expanded={openMenu?.key === periodMenuKey}
                      onClick={(event) => {
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        setOpenMenu({ key: periodMenuKey, x: rect.left, y: rect.bottom + 8, label: `Cambiar estado del periodo ${index + 1}`, description: lockedCount ? `${lockedCount} materia${lockedCount === 1 ? " bloqueada" : "s bloqueadas"} por prelación no cambiarán.` : "Se actualizarán las materias desbloqueadas del periodo." });
                      }}
                    >
                      <span>{statusOptions.includes(currentStatus) ? currentStatus : "Cambiar estado"}</span>
                      <span className="flow-period-status-chevron" aria-hidden="true" />
                    </button>
                  );
                })()}
              </div>
              <div className="flow-course-list">
                {courses.map((course, courseIndex) => {
                  const renderKey = course.id ?? `${selectedCareer}-${index}-${courseIndex}-${course.code}`;
                  const locked = isLocked(course, flowStatuses, allCourses);
                  const status = locked ? "Bloqueada" : (flowStatuses[courseKey(course)] ?? course.status);
                  const rawStatus = flowStatuses[courseKey(course)] ?? course.status;
                  return (
                    <article
                      className={`flow-course-card ${statusClass(status)}`}
                      key={renderKey}
                      onClick={() => handleCardClick(course, locked)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleCardClick(course, locked);
                      }}
                    >
                      <span className="flow-prereq">{course.prereq || "Sin prelación"}</span>
                      <strong className="flow-course-code">{course.code}</strong>
                      <h3 className="flow-course-name">{course.name}</h3>
                      <DifficultyStars
                        stars={difficultyRatings[course.code] ?? 0}
                        canEdit={isAdmin}
                        onChange={(stars) => onDifficultyRatingChange?.(course.code, stars)}
                        label={`Dificultad de ${course.name}`}
                      />
                      <div className="flow-card-tags">
                        <button
                          className={`flow-status ${statusClass(status)} flow-status-dropdown`}
                          data-flow-status-trigger
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded={openMenu?.key === renderKey}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (locked) {
                              setRequirementNotice({ course, requirements: missingRequirementDetails(course, flowStatuses, allCourses) });
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            setOpenMenu({ key: renderKey, x: rect.left, y: rect.bottom + 8 });
                          }}
                        >
                          {status}
                        </button>
                      </div>
                      <div className="flow-hours">
                        <span><b>A</b>{course.hours?.a ?? 4}</span>
                        <span><b>PS</b>{course.hours?.ps ?? 0}</span>
                        <span><b>L</b>{course.hours?.l ?? 0}</span>
                        <span><b>AA</b>{course.hours?.aa ?? 4}</span>
                        <span><b>C</b>{course.credits}</span>
                      </div>

                      {openMenu?.key === renderKey && createPortal(
                        <StatusMenu
                          x={openMenu.x}
                          y={openMenu.y}
                          rawStatus={rawStatus}
                          onClose={() => setOpenMenu(null)}
                          onSelect={(option) => updateStatus(course, option)}
                        />,
                        document.body,
                      )}
                    </article>
                  );
                })}
              </div>
              {openMenu?.key === `period-${index}` && createPortal(
                <StatusMenu
                  x={openMenu.x}
                  y={openMenu.y}
                  rawStatus=""
                  label={openMenu.label}
                  description={openMenu.description}
                  onClose={() => setOpenMenu(null)}
                  onSelect={(option) => updatePeriodStatus(courses, option, index + 1)}
                />,
                document.body,
              )}
            </section>
          ))}
        </div>

        <div className="flow-footer">
          <section className="flow-legend-box">
            <h3>Requisitos adicionales</h3>
            <div className="additional-requirements">
              {additionalRequirements.map((requirement) => (
                <article className="requirement-card" key={requirement.code}>
                  <strong>{requirement.code} · {requirement.name}</strong>
                  <span>{requirement.note}</span>
                </article>
              ))}
            </div>
          </section>
          <section className="flow-legend-box">
            <h3>Leyenda</h3>
            <dl>
              <div><dt>A</dt><dd>Horas de aula</dd></div>
              <div><dt>PS</dt><dd>Horas de prácticas supervisadas</dd></div>
              <div><dt>L</dt><dd>Horas de laboratorio</dd></div>
              <div><dt>AA</dt><dd>Horas de aprendizaje autonomo</dd></div>
              <div><dt>C</dt><dd>Número de créditos</dd></div>
            </dl>
          </section>
        </div>
          </div>
        ) : (
          <div id="flow-panel-ratings" className="flow-ratings-panel" role="tabpanel" aria-labelledby="flow-tab-ratings">
            <label className="flow-ratings-search">
              <span>Buscar materia</span>
              <input
                type="search"
                value={ratingSearch}
                onChange={(event) => setRatingSearch(event.target.value)}
                placeholder="Nombre o código..."
                aria-label="Buscar materia por nombre o código"
              />
            </label>
            <div className="flow-ratings-table-wrap">
              <table className="flow-ratings-table">
                <thead>
                  <tr>
                    <th scope="col">Materia</th>
                    <th scope="col">Código</th>
                    <th scope="col">Estrellas</th>
                    <th scope="col">Dificultad</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedCourses.length === 0 && (
                    <tr><td className="flow-ratings-empty" colSpan={4}>No se encontraron materias.</td></tr>
                  )}
                  {searchedCourses.map(({ course, stars }) => (
                    <tr key={course.id}>
                      <th scope="row">{course.name}</th>
                      <td>{course.code}</td>
                      <td>
                        <DifficultyStars
                          stars={stars}
                          canEdit={isAdmin}
                          onChange={(nextStars) => onDifficultyRatingChange?.(course.code, nextStars)}
                          label={`Dificultad de ${course.name}`}
                        />
                      </td>
                      <td><span className={`flow-rating-tag is-level-${stars || "unrated"}`}>{difficultyLabels[stars]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {requirementNotice && createPortal(
        <NoticeModal notice={requirementNotice} onClose={() => setRequirementNotice(null)} />,
        document.body,
      )}
      {selectedCourse && createPortal(
        <CourseModal
          course={selectedCourse}
          status={visibleStatus(selectedCourse, flowStatuses, allCourses)}
          difficultyStars={difficultyRatings[selectedCourse.code] ?? 0}
          isAdmin={isAdmin}
          allCourses={allCourses}
          materials={materials}
          onStatusChange={(nextStatus) => updateStatus(selectedCourse, nextStatus)}
          onDifficultyRatingChange={(stars) => onDifficultyRatingChange?.(selectedCourse.code, stars)}
          onOpenMaterialInLibrary={onOpenMaterialInLibrary}
          onClose={() => setSelectedCourse(null)}
        />,
        document.body,
      )}
      {statusChangeConfirmation && createPortal(
        <StatusChangeModal
          course={statusChangeConfirmation.course}
          nextStatus={statusChangeConfirmation.nextStatus}
          affectedCount={statusChangeConfirmation.descendants.length}
          onCancel={() => setStatusChangeConfirmation(null)}
          onConfirm={() => {
            if (statusChangeConfirmation.periodCourses) {
              applyPeriodStatusChange(statusChangeConfirmation.periodCourses, statusChangeConfirmation.nextStatus, statusChangeConfirmation.descendants);
            } else {
              applyStatusChange(statusChangeConfirmation.course, statusChangeConfirmation.nextStatus, statusChangeConfirmation.descendants);
            }
            setStatusChangeConfirmation(null);
          }}
          periodNumber={statusChangeConfirmation.periodNumber}
        />,
        document.body,
      )}
    </section>
  );
}

function CareerSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (!selected) return null;

  return (
    <div className={open ? "flow-career-select custom-select is-open" : "flow-career-select custom-select"} ref={rootRef}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Seleccionar programa"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="custom-select-label">{selected.name}</span>
        <span className="custom-select-chevron" aria-hidden="true" />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label="Seleccionar programa">
          <div className="custom-select-options">
            {options.map((option) => (
              <button
                className={option.id === selected.id ? "custom-select-option is-selected" : "custom-select-option"}
                type="button"
                role="option"
                aria-selected={option.id === selected.id}
                key={option.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="custom-select-label">{option.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusMenu({ x, y, rawStatus, label = "Cambiar estado", description = "", onSelect, onClose }) {
  return (
    <>
      <button
        className="flow-status-menu-backdrop"
        type="button"
        aria-label="Cerrar menu"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <div
        className="flow-status-menu is-visible"
        role="listbox"
        aria-label={label === "Cambiar estado" ? "Cambiar estado de la materia" : label}
        style={{ left: x, top: y }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span aria-hidden="true">{label}</span>
        {description && <small>{description}</small>}
        {statusOptions.map((option) => (
          <button
            className={`flow-status-option ${statusClass(option)}`}
            key={option}
            type="button"
            role="option"
            aria-selected={option === rawStatus}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSelect(option);
            }}
          >
            {option === rawStatus ? `${option} actual` : option}
          </button>
        ))}
      </div>
    </>
  );
}

function NoticeModal({ notice, onClose }) {
  return (
    <div className="requirement-notice-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal">
        <header>
          <div>
            <h2>{notice.course.name}</h2>
            <span>{notice.course.code}</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>
        <div className="course-detail-body">
          <div className="course-detail-requirements">
            <strong>Materia bloqueada</strong>
            <p>Necesitas completar estas condiciones para poder abrirla:</p>
            <ul>
              {notice.requirements.map((requirement) => (
                <li key={requirement.code}>
                  <strong>{requirement.code}</strong>
                  <span>{requirement.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function DifficultyStars({ stars, canEdit, onChange, label }) {
  return (
    <div className={canEdit ? "flow-difficulty is-editable" : "flow-difficulty"} aria-label={`${label}: ${stars} de 6 estrellas`}>
      <span className="flow-difficulty-label">
        <span className="flow-difficulty-label-desktop">Dificultad</span>
        <span className="flow-difficulty-label-mobile">Dif.</span>
      </span>
      <div className="flow-difficulty-stars" role={canEdit ? "group" : undefined} aria-label={label}>
        {Array.from({ length: 6 }, (_, index) => {
          const value = index + 1;
          const active = value <= stars;
          return canEdit ? (
            <button
              className={active ? "flow-difficulty-star is-active" : "flow-difficulty-star"}
              key={value}
              type="button"
              aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
              aria-pressed={stars === value}
              title={`Asignar ${value} ${value === 1 ? "estrella" : "estrellas"}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange?.(value);
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              ★
            </button>
          ) : (
            <span className={active ? "flow-difficulty-star is-active" : "flow-difficulty-star"} key={value} aria-hidden="true">★</span>
          );
        })}
      </div>
      <span className="flow-difficulty-count">{stars || "–"}/6</span>
    </div>
  );
}

function CourseModal({
  course,
  status,
  difficultyStars,
  isAdmin,
  allCourses,
  materials,
  onClose,
  onStatusChange,
  onDifficultyRatingChange,
  onOpenMaterialInLibrary,
}) {
  const prereqText = formatPrereq(course.prereq, allCourses);
  const courseMaterials = materialsForCourse(course, materials);

  function openMaterialInLibrary(material) {
    onOpenMaterialInLibrary?.(material, course);
    onClose();
  }

  return (
    <div className="course-detail-overlay course-info-overlay is-visible" role="dialog" aria-modal="true">
        <section className="course-detail-modal course-info-modal">
          <header>
            <div>
              <h2>{course.name}</h2>
              <span>{course.code}</span>
            </div>
            <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
          </header>
          <div className="course-detail-body">
            <div className="course-detail-status">
              <label className="course-detail-status-select">
                Estado
                <CourseStatusDropdown
                  status={status === "Bloqueada" ? "Pendiente" : status}
                  onSelect={onStatusChange}
                />
              </label>
              <span className="flow-status is-pending">{prereqText}</span>
            </div>
            <DifficultyStars
              stars={difficultyStars}
              canEdit={isAdmin}
              onChange={onDifficultyRatingChange}
              label={`Dificultad de ${course.name}`}
            />
            <dl className="course-detail-grid">
              <div><dt>Creditos</dt><dd>{course.credits}</dd></div>
              <div><dt>Horas</dt><dd>A {course.hours?.a ?? 4} · PS {course.hours?.ps ?? 0} · L {course.hours?.l ?? 0} · AA {course.hours?.aa ?? 4}</dd></div>
              <div><dt>Periodo sugerido</dt><dd>Segun flujograma activo</dd></div>
              <div>
                <dt>Prelación</dt>
                <dd className="course-detail-scrollline">
                  <span>{prereqText}</span>
                </dd>
              </div>
            </dl>
            <section className="course-materials-section">
              <div>
                <h3>Materiales de esta materia</h3>
                <span>{courseMaterials.length} recurso(s)</span>
              </div>
              {courseMaterials.length > 0 ? (
                <div className="course-materials-list">
                  {courseMaterials.map((material) => (
                    <article className="course-material-card" key={material.id}>
                      <div className="course-material-card-tags">
                        <span>{material.format}</span>
                        <span className="course-material-level">{material.level}</span>
                      </div>
                      <strong>{material.title}</strong>
                      <small>
                        {material.viewCount ?? 0} vistas · <RatingSummary average={material.ratingAverage ?? 0} />
                      </small>
                      <div className="course-material-actions">
                        <button className="small-action" type="button" onClick={() => openMaterialInLibrary(material)}>
                          Materiales
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="course-materials-empty">Todavía no hay materiales guardados para esta materia.</p>
              )}
            </section>
          </div>
        </section>
      </div>
  );
}

function CourseStatusDropdown({ status, onSelect }) {
  const [menuPosition, setMenuPosition] = useState(null);

  useEffect(() => {
    if (!menuPosition) return undefined;
    const closeMenu = () => setMenuPosition(null);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menuPosition]);

  return (
    <>
      <button
        className={`flow-status ${statusClass(status)} flow-status-dropdown course-detail-status-trigger`}
        type="button"
        data-flow-status-trigger
        aria-haspopup="listbox"
        aria-expanded={Boolean(menuPosition)}
        onClick={(event) => {
          if (menuPosition) {
            setMenuPosition(null);
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          setMenuPosition({ x: rect.left, y: rect.bottom + 6 });
        }}
      >
        {status}
      </button>
      {menuPosition && createPortal(
        <StatusMenu
          x={menuPosition.x}
          y={menuPosition.y}
          rawStatus={status}
          onClose={() => setMenuPosition(null)}
          onSelect={(nextStatus) => {
            setMenuPosition(null);
            onSelect?.(nextStatus);
          }}
        />,
        document.body,
      )}
    </>
  );
}

function StatusChangeModal({ course, periodNumber, nextStatus, affectedCount, onCancel, onConfirm }) {
  return (
    <div className="course-detail-overlay flow-status-confirm-overlay is-visible" role="dialog" aria-modal="true" aria-labelledby="flow-status-confirm-title">
      <section className="course-detail-modal flow-status-confirm-modal">
        <header>
          <div>
            <p className="eyebrow">Cambio de estado</p>
            <h2 id="flow-status-confirm-title">{periodNumber ? `¿Cambiar periodo ${periodNumber}?` : `¿Cambiar ${course.code}?`}</h2>
          </div>
          <button className="quiet-button" type="button" onClick={onCancel}>Cerrar</button>
        </header>
        <div className="course-detail-body">
          <p>{periodNumber ? `Este cambio afecta ${affectedCount} materia${affectedCount === 1 ? "" : "s"} dependiente${affectedCount === 1 ? "" : "s"}. Al cambiar las materias desbloqueadas del periodo a “${nextStatus}”, sus dependientes volverán a pendiente o bloqueadas.` : `Esta materia desbloquea ${affectedCount} materia${affectedCount === 1 ? "" : "s"}. Al cambiarla a “${nextStatus}”, sus materias dependientes volverán a pendiente o bloqueadas.`}</p>
          <div className="flow-status-confirm-actions">
            <button className="secondary-action" type="button" onClick={onCancel}>Cancelar</button>
            <button className="primary-action" type="button" onClick={onConfirm}>Cambiar estado</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function materialsForCourse(course, materials) {
  const code = normalizeText(course.code);
  const name = normalizeText(course.name);
  return materials.filter((material) => {
    const subjectList = Array.isArray(material.subjects) && material.subjects.length > 0 
      ? material.subjects 
      : (material.subject ? [material.subject] : []);
      
    return subjectList.some((subject) => {
      const normalizedSubject = normalizeText(subject);
      return normalizedSubject === code || normalizedSubject === name || normalizedSubject.includes(code) || normalizedSubject.includes(name);
    });
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchesCourseSearch(query, course) {
  return matchesFuzzySearch(query, [course.name, course.code]);
}

function visibleStatus(course, statuses, allCourses) {
  return isLocked(course, statuses, allCourses) ? "Bloqueada" : (statuses[courseKey(course)] ?? course.status);
}

function isLocked(course, statuses, allCourses) {
  return missingRequirements(course, statuses, allCourses).length > 0;
}

function missingRequirements(course, statuses, allCourses) {
  const reqs = parsePrereqs(course.prereq);
  return reqs.filter((code) => {
    const parent = allCourses.find((item) => item.code === code);
    if (!parent) return false;
    return (statuses[courseKey(parent)] ?? parent.status) !== "Cursada";
  });
}

function missingRequirementDetails(course, statuses, allCourses) {
  return missingRequirements(course, statuses, allCourses).map((code) => {
    const parent = allCourses.find((item) => item.code === code);
    return {
      code,
      name: parent?.name ?? "Requisito académico",
    };
  });
}

function formatPrereq(prereq, allCourses) {
  const codes = parsePrereqs(prereq);
  if (!codes.length) return "No requiere";
  return codes
    .map((code) => {
      const course = allCourses.find((item) => item.code === code);
      return course ? `${code} · ${course.name}` : code;
    })
    .join(" + ");
}

function parsePrereqs(prereq) {
  if (!prereq) return [];
  return prereq.split("+").map((item) => item.trim()).filter(Boolean);
}

function getDescendants(code, allCourses) {
  const found = new Map();
  let frontier = [code];
  while (frontier.length) {
    const current = frontier.shift();
    const children = allCourses.filter((course) => parsePrereqs(course.prereq).includes(current));
    children.forEach((child) => {
      if (!found.has(child.code)) {
        found.set(child.code, child);
        frontier.push(child.code);
      }
    });
  }
  return Array.from(found.values());
}

function statusClass(status) {
  return {
    Cursada: "is-completed",
    "En curso": "is-current",
    Planificada: "is-planned",
    Pendiente: "is-pending",
    Bloqueada: "is-locked",
  }[status] ?? "is-pending";
}

function courseKey(course) {
  return course.code === "FGE" ? `FGE::${course.id}` : course.code;
}

function resolveCourseName(course, officialCourseNames) {
  const code = normalizeCourseCode(course.code);
  const name = String(course.name ?? "").trim();
  if (!name || normalizeCourseCode(name) === code) {
    return officialCourseNames.get(code) || name || course.code;
  }
  return name;
}

function normalizeCourseCode(value) {
  return String(value ?? "").trim().toLocaleUpperCase();
}
