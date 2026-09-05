import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RatingSummary } from "./MaterialsView";

const statusOptions = ["Cursada", "En curso", "Planificada", "Pendiente"];
const additionalRequirementsByCareer = {
  sistemas: [
    { code: "BPTDI01", name: "Servicio comunitario", note: "FGTDI01 y 90 creditos requeridos" },
    { code: "FPTIS04", name: "Defensa de trabajo de grado", note: "FPTSP22 requerido" },
  ],
  mecanica: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 creditos requeridos" },
    { code: "FPTIM04", name: "Defensa de trabajo de grado", note: "FPTSP22 requerido" },
  ],
  electrica: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 creditos requeridos" },
    { code: "FPTIE23", name: "Defensa de trabajo de grado", note: "FPTSP22 requerido" },
  ],
  produccion: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 creditos requeridos" },
    { code: "FPTIP04", name: "Defensa TG", note: "FPTSP22 requerido" },
  ],
  quimica: [
    { code: "BPTHE71", name: "Servicio comunitario", note: "FGTHE01 y 90 creditos requeridos" },
    { code: "FPTIQ04", name: "Defensa TG", note: "FPTSP22 requerido" },
  ],
};

export function FlowView({
  flowPeriods,
  flowStatuses,
  onStatusChange,
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

  const allCourses = useMemo(() => flowPeriods.flat(), [flowPeriods]);
  const completed = allCourses.filter((course) => visibleStatus(course, flowStatuses, allCourses) === "Cursada");
  const totalCourses = allCourses.length;
  const credits = completed.reduce((sum, course) => sum + course.credits, 0);
  const totalCredits = allCourses.reduce((sum, course) => sum + course.credits, 0);
  const percent = totalCourses ? Math.round((completed.length / totalCourses) * 100) : 0;
  const careerOptions = careers.length ? careers : [{ id: selectedCareer, name: flowProgram?.name ?? "Ingenieria de Sistemas" }];
  const canSwitchCareer = careerOptions.length > 1;
  const additionalRequirements = additionalRequirementsByCareer[selectedCareer] ?? [
    { code: "BPTHE71", name: "Servicio comunitario", note: "90 creditos requeridos" },
    { code: "FPTSP22", name: "Defensa de trabajo de grado", note: "120 creditos requeridos" },
  ];

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const expectedScrollLeft = boardScrollLeftRef.current;
    if (expectedScrollLeft > 0 && Math.abs(board.scrollLeft - expectedScrollLeft) > 2) {
      board.scrollLeft = expectedScrollLeft;
    }
  }, [flowPeriods, flowStatuses, materials]);

  function rememberBoardScroll() {
    if (!dragRef.current.active && boardRef.current) {
      boardScrollLeftRef.current = boardRef.current.scrollLeft;
    }
  }

  function updateStatus(course, nextStatus) {
    const currentStatus = flowStatuses[course.code] ?? course.status;
    const descendants = getDescendants(course.code, allCourses);

    if (currentStatus === "Cursada" && nextStatus !== "Cursada" && descendants.length > 0) {
      const confirmed = window.confirm(
        `Esta materia desbloquea ${descendants.length} materia(s). Si la quitas de cursada, sus materias hijas volveran a pendiente/bloqueadas. Deseas continuar?`,
      );
      if (!confirmed) return;
      descendants.forEach((child) => onStatusChange(courseKey(child), "Pendiente"));
    }

    onStatusChange(courseKey(course), nextStatus);
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
          <h1>Flujograma academico</h1>
          <p>Consulta materias por periodo, revisa prelaciones y cambia estados desde el tag de cada materia.</p>
        </div>
        <div className="stat-stack flow-stat-stack">
          <span className="flow-program-chip flow-program-chip-large">{flowProgram?.name ?? "Ingenieria de Sistemas"}</span>
          <div className="flow-progress-metrics">
            <span><strong>{percent}%</strong><small>completado</small></span>
            <span><strong>{completed.length}/{totalCourses}</strong><small>materias cursadas</small></span>
            <span><strong>{credits}/{totalCredits}</strong><small>creditos cursados</small></span>
          </div>
        </div>
      </div>

      <section className="career-flow-panel">
        <div className="flow-toolbar">
          <div>
            <h2>Flujograma interactivo</h2>
            <p className="meta-line flow-context-line">
              <span>Arrastra el tablero para moverte. Pulsa la tarjeta para ver detalles.</span>
            </p>
          </div>
          {canSwitchCareer && (
            <select className="flow-career-select" aria-label="Seleccionar programa" value={selectedCareer} onChange={(event) => onCareerChange?.(event.target.value)}>
              {careerOptions.map((career) => (
                <option value={career.id} key={career.id}>{career.name}</option>
              ))}
            </select>
          )}
          <div className="flow-status-legend" aria-label="Estados del flujograma">
            <span className="flow-status is-completed">Cursada</span>
            <span className="flow-status is-current">En curso</span>
            <span className="flow-status is-planned">Planificada</span>
            <span className="flow-status is-pending">Pendiente</span>
            <span className="flow-status is-locked">Bloqueada</span>
          </div>
        </div>

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
          {flowPeriods.map((courses, index) => (
            <section className="flow-period" key={index}>
              <div className="flow-period-header">
                <span>{index + 1}</span>
                <strong>Periodo</strong>
              </div>
              <div className="flow-course-list">
                {courses.map((course) => {
                  const locked = isLocked(course, flowStatuses, allCourses);
                  const status = locked ? "Bloqueada" : (flowStatuses[courseKey(course)] ?? course.status);
                  const rawStatus = flowStatuses[courseKey(course)] ?? course.status;
                  return (
                    <article
                      className={`flow-course-card ${statusClass(status)}`}
                      key={courseKey(course)}
                      onClick={() => handleCardClick(course, locked)}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleCardClick(course, locked);
                      }}
                    >
                      <span className="flow-prereq">{course.prereq || "Sin prelacion"}</span>
                      <strong className="flow-course-code">{course.code}</strong>
                      <h3 className="flow-course-name">{course.name}</h3>
                      <div className="flow-card-tags">
                        <button
                          className={`flow-status ${statusClass(status)}`}
                          data-flow-status-trigger
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (locked) {
                              setRequirementNotice({ course, requirements: missingRequirementDetails(course, flowStatuses, allCourses) });
                              return;
                            }
                            const rect = event.currentTarget.getBoundingClientRect();
                            setOpenMenu({ key: courseKey(course), x: rect.left, y: rect.bottom + 8 });
                          }}
                        >
                          {status}
                        </button>
                        {locked && <span className="flow-lock-note">Requiere prelacion</span>}
                      </div>
                      <div className="flow-hours">
                        <span><b>A</b>{course.hours?.a ?? 4}</span>
                        <span><b>PS</b>{course.hours?.ps ?? 0}</span>
                        <span><b>L</b>{course.hours?.l ?? 0}</span>
                        <span><b>AA</b>{course.hours?.aa ?? 4}</span>
                        <span><b>C</b>{course.credits}</span>
                      </div>

                      {openMenu?.key === courseKey(course) && createPortal(
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
              <div><dt>PS</dt><dd>Horas de practicas supervisadas</dd></div>
              <div><dt>L</dt><dd>Horas de laboratorio</dd></div>
              <div><dt>AA</dt><dd>Horas de aprendizaje autonomo</dd></div>
              <div><dt>C</dt><dd>Numero de creditos</dd></div>
            </dl>
          </section>
        </div>
      </section>

      {requirementNotice && createPortal(
        <NoticeModal notice={requirementNotice} onClose={() => setRequirementNotice(null)} />,
        document.body,
      )}
      {selectedCourse && createPortal(
        <CourseModal
          course={selectedCourse}
          status={visibleStatus(selectedCourse, flowStatuses, allCourses)}
          allCourses={allCourses}
          materials={materials}
          onOpenMaterialInLibrary={onOpenMaterialInLibrary}
          onClose={() => setSelectedCourse(null)}
        />,
        document.body,
      )}
    </section>
  );
}

function StatusMenu({ x, y, rawStatus, onSelect, onClose }) {
  return (
    <>
      <button className="flow-status-menu-backdrop" type="button" aria-label="Cerrar menu" onClick={onClose} />
      <div
        className="flow-status-menu is-visible"
        style={{ left: x, top: y }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span>Cambiar estado</span>
        {statusOptions.map((option) => (
          <button
            className={`flow-status-option ${statusClass(option)}`}
            key={option}
            type="button"
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

function CourseModal({ course, status, allCourses, materials, onClose, onOpenMaterialInLibrary }) {
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
              <span className={`flow-status ${statusClass(status)}`}>{status}</span>
              <span className="flow-status is-pending">{prereqText}</span>
            </div>
            <dl className="course-detail-grid">
              <div><dt>Creditos</dt><dd>{course.credits}</dd></div>
              <div><dt>Horas</dt><dd>A {course.hours?.a ?? 4} · PS {course.hours?.ps ?? 0} · L {course.hours?.l ?? 0} · AA {course.hours?.aa ?? 4}</dd></div>
              <div><dt>Periodo sugerido</dt><dd>Segun flujograma activo</dd></div>
              <div>
                <dt>Prelacion</dt>
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
      name: parent?.name ?? "Requisito academico",
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
  return course.id ?? course.code;
}
