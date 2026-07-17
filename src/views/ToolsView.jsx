import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AlgebraToolModal } from "./tools/AlgebraOperationsTool";
import { FactorizationToolModal } from "./tools/FactorizationTool";
import { PiecewiseGraphToolModal } from "./tools/PiecewiseGraphTool";
import { QuadraticAnalysisToolModal } from "./tools/QuadraticAnalysisTool";
import { RationalizationToolModal } from "./tools/RationalizationTool";
import { TruthTableModal } from "./tools/TruthTableTool";

const toolCatalog = [
  {
    id: "algebra-operations",
    title: "Operaciones algebraicas",
    subject: "sub-matematica-basica",
    type: "Algebra",
    topic: "Distributiva y Productos Notables",
    status: "Disponible",
    difficulty: "Pro",
    updatedAt: "2026-06-08",
    description: "Resuelve distributiva, productos de binomios y productos notables con explicacion paso a paso.",
  },
  {
    id: "truth-table",
    title: "Tabla de verdad de proposiciones",
    subject: "sub-matematica-basica",
    type: "Proposiciones Logicas",
    topic: "Proposiciones Logicas y Tablas de la Verdad",
    status: "Disponible",
    difficulty: "Pro",
    updatedAt: "2026-06-07",
    description: "Calcula la tabla de verdad completa para proposiciones logicas con 2 a 4 variables.",
  },
  {
    id: "factorization",
    title: "Factorizacion",
    subject: "sub-matematica-basica",
    type: "Algebra",
    topic: "Factor Comun, Agrupacion y Trinomios",
    status: "Disponible",
    difficulty: "Pro",
    updatedAt: "2026-06-09",
    description: "Factoriza expresiones por factor comun, agrupacion, diferencia de cuadrados y trinomios.",
  },
  {
    id: "rationalization",
    title: "Racionalizacion",
    subject: "sub-matematica-basica",
    type: "Algebra",
    topic: "Radicales y Conjugados",
    status: "Disponible",
    difficulty: "Pro",
    updatedAt: "2026-06-09",
    description: "Elimina radicales del denominador usando raices equivalentes y conjugados.",
  },
  {
    id: "quadratic-analysis",
    title: "Analisis grafico de cuadraticas",
    subject: "sub-matematica-basica",
    type: "Funciones",
    topic: "Parabolas, Vertice, Dominio y Rango",
    status: "Disponible",
    difficulty: "Pro",
    updatedAt: "2026-06-12",
    description: "Grafica una funcion cuadratica y calcula vertice, eje, concavidad, cortes, dominio, rango e intervalos.",
  },
  {
    id: "piecewise-graph",
    title: "Lectura de graficas por tramos",
    subject: "sub-matematica-basica",
    type: "Funciones",
    topic: "Tramos, Puntos Abiertos e Inyectividad",
    status: "Disponible",
    difficulty: "Pro",
    updatedAt: "2026-06-12",
    description: "Crea graficas por tramos con puntos abiertos o cerrados, obtiene sus ecuaciones y revisa inyectividad.",
  },
];

const fallbackSubjects = [
  { id: "sub-matematica-basica", name: "Matematica Basica" },
];

export function ToolsView({
  subjects,
  search,
  subject = "Todas",
  sort = "Recientes",
  limit = 6,
  hasMore = false,
  onLoadMore,
  onSearchChange,
  onSubjectChange,
  onSortChange,
  userEmail,
  currentPlan = "free",
  entitlements = null,
  toolsLocked = false,
}) {
  const [toolType, setToolType] = useState("Todos");
  const [activeTool, setActiveTool] = useState(null);
  const [accessPrompt, setAccessPrompt] = useState(null);
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const consumeToolAccess = useMutation(api.users.consumeToolAccess);
  const allSubjects = useMemo(() => mergeSubjects(subjects, fallbackSubjects), [subjects]);
  const allowedSubjectIds = useMemo(() => new Set(subjects.map((item) => item.id)), [subjects]);
  const visibleTools = useMemo(() => {
    const query = normalizeSearchText(search);
    const filtered = toolCatalog.filter((tool) => {
      if (allowedSubjectIds.size > 0 && !allowedSubjectIds.has(tool.subject)) return false;
      const subjectLabel = subjectName(allSubjects, tool.subject);
      const matchesSearch = !query || [tool.title, tool.type, tool.topic, tool.description, subjectLabel, tool.difficulty]
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(query);
      const matchesSubject = subject === "Todas" || tool.subject === subject;
      const matchesType = toolType === "Todos" || tool.type === toolType;
      return matchesSearch && matchesSubject && matchesType;
    });

    if (sort === "A-Z") return [...filtered].sort((left, right) => left.title.localeCompare(right.title));
    return [...filtered].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [allSubjects, allowedSubjectIds, search, sort, subject, toolType]);
  const shownTools = visibleTools.slice(0, limit);
  const canLoadMore = hasMore || shownTools.length < visibleTools.length;

  const scopedToolCatalog = toolCatalog.filter((tool) => allowedSubjectIds.size === 0 || allowedSubjectIds.has(tool.subject));
  const subjectCounts = countBy(scopedToolCatalog, "subject");
  const typeCounts = countBy(scopedToolCatalog, "type");
  const visibleSubjectOptions = allowedSubjectIds.size > 0
    ? allSubjects.filter((item) => allowedSubjectIds.has(item.id))
    : allSubjects;
  const subjectOptions = [
    { value: "Todas", label: "Todas las materias", count: scopedToolCatalog.length },
    ...visibleSubjectOptions.map((item) => ({ value: item.id, label: subjectName(allSubjects, item.id), count: subjectCounts.get(item.id) ?? 0 })),
  ];
  const typeOptions = [
    { value: "Todos", label: "Todos los tipos", count: scopedToolCatalog.length },
    ...Array.from(typeCounts.keys()).sort().map((type) => ({ value: type, label: type, count: typeCounts.get(type) ?? 0 })),
  ];

  function openToolFromKeyboard(event, tool) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openTool(tool);
  }

  async function openTool(tool) {
    const access = buildToolAccessPrompt(tool, {
      currentPlan,
      entitlements,
      userEmail,
      consumeToolAccess,
    });
    if (access && !access.allowed) {
      setAccessPrompt({ ...access, tool });
      return;
    }
    setActiveTool(tool);
  }

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [canLoadMore, shownTools.length]);

  useEffect(() => {
    if (!canLoadMore || !onLoadMore || !loadMoreRef.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      onLoadMore();
    }, { rootMargin: "240px" });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [canLoadMore, onLoadMore, shownTools.length]);

  return (
    <section className="workspace">
      <div className="workspace-header">
        <div className="materials-heading-copy">
          <p className="eyebrow">Calculadoras academicas</p>
          <h1>Herramientas</h1>
          <p>Calculadoras y asistentes de resolucion para problemas de distintas materias, sin depender de la biblioteca.</p>
        </div>
        <div className="library-search">
          <label className="library-search-field library-search-field-wide library-search-field-search">
            <span>Busqueda</span>
            <input value={search} onChange={(event) => onSearchChange(event.target.value)} type="search" placeholder="Buscar herramienta..." aria-label="Buscar herramienta" />
          </label>
          <div className="library-search-field library-search-field-subject">
            <span>Materia</span>
            <CustomSelect ariaLabel="Filtrar herramientas por materia" value={subject} options={subjectOptions} onChange={onSubjectChange} />
          </div>
          <div className="library-search-field">
            <span>Tipo</span>
            <CustomSelect ariaLabel="Filtrar herramientas por tipo" value={toolType} options={typeOptions} onChange={setToolType} />
          </div>
          <div className="library-search-field">
            <span>Orden</span>
            <CustomSelect ariaLabel="Ordenar herramientas" value={sort} options={["Recientes", "A-Z"].map((item) => ({ value: item, label: item }))} onChange={onSortChange} />
          </div>
        </div>
      </div>

      <div className="material-control-row">
        <div className="cache-note material-status-note">
          {toolsLocked ? "Herramientas disponibles desde el plan Pro" : `${visibleTools.length} herramientas encontradas`}
        </div>
      </div>

      {toolsLocked ? (
        <section className="tool-upgrade-panel" aria-label="Herramientas bloqueadas">
          <p className="eyebrow">Mejora tu plan</p>
          <h2>Las herramientas empiezan en Pro</h2>
          <p>Tu plan actual tiene 0 usos de herramientas disponibles. Para abrir calculadoras y asistentes academicos, mejora a Pro o Excellence.</p>
          <a className="primary-action" href="#plans">Ver planes</a>
        </section>
      ) : (
      <section className="material-grid tools-grid" aria-label="Herramientas academicas">
        {visibleTools.length === 0 && (
          <article className="material-empty-state">
            <h3>No hay herramientas con esos filtros</h3>
            <p>Prueba otra materia o una busqueda mas general.</p>
          </article>
        )}
        {shownTools.map((tool) => {
          const accessBadge = getToolAccessBadge(tool, { currentPlan, entitlements });

          return (
          <article
            className={["material-card", "tool-card", "is-clickable", accessBadge?.className].filter(Boolean).join(" ")}
            key={tool.id}
            role="button"
            tabIndex={0}
            aria-label={`Abrir ${tool.title}`}
            onClick={() => openTool(tool)}
            onKeyDown={(event) => openToolFromKeyboard(event, tool)}
          >
            {accessBadge && (
              <span className="material-access-badge tool-access-badge" title={accessBadge.title} aria-label={accessBadge.title}>
                <span aria-hidden="true">{accessBadge.icon}</span>
                {accessBadge.label}
              </span>
            )}
            <div className="tool-card-icon" aria-hidden="true">{tool.type.slice(0, 2).toUpperCase()}</div>
            <div className="material-card-main">
              <span className="format-pill">{tool.type}</span>
              <h3>{tool.title}</h3>
              <p className="tool-card-description">{tool.description}</p>
              <div className="material-meta">
                <span className="material-subject-chip">{subjectName(allSubjects, tool.subject)}</span>
                <span className="material-level-chip">{tool.difficulty}</span>
              </div>
              <div className="tool-topic-chip">{tool.topic}</div>
            </div>
          </article>
          );
        })}
        {canLoadMore && (
          <div className="material-load-sentinel" ref={loadMoreRef} aria-live="polite">
            Sigue bajando para cargar más
          </div>
        )}
      </section>
      )}

      {activeTool?.id === "truth-table" && createPortal(<TruthTableModal onClose={() => setActiveTool(null)} />, document.body)}
      {activeTool?.id === "algebra-operations" && createPortal(<AlgebraToolModal onClose={() => setActiveTool(null)} />, document.body)}
      {activeTool?.id === "factorization" && createPortal(<FactorizationToolModal onClose={() => setActiveTool(null)} />, document.body)}
      {activeTool?.id === "rationalization" && createPortal(<RationalizationToolModal onClose={() => setActiveTool(null)} />, document.body)}
      {activeTool?.id === "quadratic-analysis" && createPortal(<QuadraticAnalysisToolModal onClose={() => setActiveTool(null)} />, document.body)}
      {activeTool?.id === "piecewise-graph" && createPortal(<PiecewiseGraphToolModal onClose={() => setActiveTool(null)} />, document.body)}
      {accessPrompt && createPortal(
        <ToolAccessModal
          prompt={accessPrompt}
          onClose={() => setAccessPrompt(null)}
          onContinue={async () => {
            await accessPrompt.onConfirm?.();
            if (accessPrompt.needsConfirmation) setActiveTool(accessPrompt.tool);
            setAccessPrompt(null);
          }}
        />,
        document.body,
      )}
    </section>
  );
}

function buildToolAccessPrompt(tool, { currentPlan, entitlements, userEmail, consumeToolAccess }) {
  if (currentPlan === "excellence" || entitlements?.isAdmin) return { allowed: true };
  if (currentPlan === "free") {
    return {
      allowed: false,
      title: "Herramienta Pro",
      message: "Las herramientas no estan incluidas en el plan gratuito. Mejora a Pro para usar hasta 3 herramientas al mes o a Excellence para usarlas sin limites.",
      confirmLabel: "Ver planes",
      onConfirm: () => { window.location.hash = "plans"; },
    };
  }
  const usedIds = entitlements?.tools?.usedIds ?? [];
  if (usedIds.includes(tool.id)) return { allowed: true };
  const remaining = entitlements?.tools?.remaining ?? 0;
  if (remaining <= 0) {
    return {
      allowed: false,
      title: "Limite mensual alcanzado",
      message: "Ya usaste tus 3 herramientas de este mes. Excellence desbloquea todas las herramientas sin limite mensual.",
      confirmLabel: "Ver planes",
      onConfirm: () => { window.location.hash = "plans"; },
    };
  }
  return {
    allowed: false,
    needsConfirmation: true,
    title: "Usar herramienta",
    message: `Esta herramienta gastara 1 de tus 3 herramientas del mes. Te quedaran ${Math.max(0, remaining - 1)}.`,
    confirmLabel: "Usar herramienta",
    onConfirm: async () => {
      if (!userEmail) return;
      await consumeToolAccess({ email: userEmail, toolId: tool.id });
    },
  };
}

function getToolAccessBadge(tool, { currentPlan, entitlements }) {
  if (entitlements?.isAdmin || currentPlan === "excellence") {
    return {
      icon: "✓",
      label: "Desbloqueada",
      title: "Herramienta desbloqueada por tu plan.",
      className: "has-access-unlocked",
    };
  }
  if (currentPlan === "free") {
    return {
      icon: "⌁",
      label: "0 usos",
      title: "Tu plan gratis tiene 0 usos de herramientas. Mejora a Pro para desbloquear 3 herramientas al mes.",
      className: "has-access-locked",
    };
  }
  const usedIds = entitlements?.tools?.usedIds ?? [];
  const remaining = entitlements?.tools?.remaining ?? 0;
  if (usedIds.includes(tool.id)) {
    return {
      icon: "✓",
      label: `Desbloqueada · ${remaining} usos`,
      title: `Ya usaste cupo para esta herramienta este mes. Te quedan ${remaining} usos de herramientas.`,
      className: "has-access-unlocked",
    };
  }
  if (remaining > 0) {
    return {
      icon: "↯",
      label: `${remaining} usos`,
      title: `Esta herramienta usara uno de tus cupos mensuales. Te quedan ${remaining} usos.`,
      className: "has-access-quota",
    };
  }
  return {
    icon: "⌁",
    label: "0 usos",
    title: "Ya usaste tus 3 herramientas del mes.",
    className: "has-access-locked",
  };
}

function ToolAccessModal({ prompt, onClose, onContinue }) {
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    setBusy(true);
    try {
      await onContinue?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal feature-limit-modal">
        <header>
          <div>
            <p className="eyebrow">Uso de herramientas</p>
            <h2>{prompt.title}</h2>
          </div>
        </header>
        <div className="feature-limit-body">
          <p>{prompt.message}</p>
        </div>
        <footer className="feature-limit-actions">
          <button className="secondary-action" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="primary-action" type="button" onClick={handleContinue} disabled={busy}>
            {busy ? "Procesando..." : prompt.confirmLabel ?? "Continuar"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function CustomSelect({ ariaLabel, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  function selectOption(nextValue) {
    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div className={open ? "custom-select is-open" : "custom-select"}>
      <button
        className="custom-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <span className="custom-select-label">{selected?.label}</span>
        {selected?.count !== undefined && <span className="custom-select-count">{selected.count}</span>}
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              className={option.value === selected?.value ? "custom-select-option is-selected" : "custom-select-option"}
              type="button"
              role="option"
              aria-selected={option.value === selected?.value}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option.value)}
            >
              <span className="custom-select-label">{option.label}</span>
              {option.count !== undefined && <span className="custom-select-count">{option.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function mergeSubjects(subjects, extras) {
  const byId = new Map();
  for (const subject of [...subjects, ...extras]) byId.set(subject.id, subject);
  return Array.from(byId.values());
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = item?.[key];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function subjectName(subjects, id) {
  return prettifySpanishSubject(subjects.find((subject) => subject.id === id)?.name ?? id ?? "Materia");
}

function prettifySpanishSubject(value) {
  const cleanValue = String(value).trim();
  const knownSubjects = new Map([
    ["matematica basica", "Matemática Básica"],
  ]);
  return knownSubjects.get(cleanValue.toLowerCase()) ?? cleanValue;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
