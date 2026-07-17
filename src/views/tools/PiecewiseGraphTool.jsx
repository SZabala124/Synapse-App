import { useMemo, useRef, useState } from "react";
import { LatexBlock } from "./latexReader";
import { ToolMetaTags } from "./ToolMetaTags";

const PRESETS = {
  parcial: [
    { id: "a", x1: "-5", y1: "-2", start: "open", x2: "-2", y2: "2", end: "closed" },
    { id: "b", x1: "-1", y1: "3", start: "closed", x2: "2", y2: "3", end: "closed" },
    { id: "c", x1: "4", y1: "-3", start: "open", x2: "7", y2: "1", end: "closed" },
  ],
  noInjective: [
    { id: "a", x1: "-4", y1: "-1", start: "closed", x2: "0", y2: "3", end: "closed" },
    { id: "b", x1: "1", y1: "3", start: "closed", x2: "5", y2: "-1", end: "closed" },
  ],
  injective: [
    { id: "a", x1: "-4", y1: "-3", start: "closed", x2: "-1", y2: "-1", end: "open" },
    { id: "b", x1: "0", y1: "0", start: "closed", x2: "4", y2: "3", end: "closed" },
  ],
};

const EQUATION_TYPE_OPTIONS = [
  { value: "linear", label: "Recta: mx + b" },
  { value: "quadratic", label: "Parabola: ax^2 + bx + c" },
];

export function PiecewiseGraphToolModal({ onClose }) {
  const [segments, setSegments] = useState(PRESETS.parcial);
  const [creationMode, setCreationMode] = useState("points");
  const [creationError, setCreationError] = useState("");
  const [equationDraft, setEquationDraft] = useState({
    type: "linear",
    m: "1",
    b: "0",
    a: "1",
    qB: "0",
    c: "0",
    x1: "-3",
    x2: "3",
    start: "closed",
    end: "closed",
  });
  const analysis = useMemo(() => analyzeSegments(segments), [segments]);

  function updateSegment(id, key, value) {
    setCreationError("");
    setSegments((current) => current.map((segment) => segment.id === id ? { ...segment, [key]: sanitizeSegmentValue(key, value) } : segment));
  }

  function addSegment() {
    const nextSegment = { id: String(Date.now()), x1: "0", y1: "0", start: "closed", x2: "2", y2: "1", end: "closed" };
    addSegmentSafely(nextSegment);
  }

  function clearSegments() {
    setCreationError("");
    setSegments([]);
  }

  function removeSegment(id) {
    setCreationError("");
    setSegments((current) => current.filter((segment) => segment.id !== id));
  }

  function updateEquationDraft(key, value) {
    setEquationDraft((current) => ({ ...current, [key]: sanitizeSegmentValue(key, value) }));
  }

  function addEquationSegment() {
    addSegmentSafely(equationDraft.type === "quadratic"
      ? {
        id: String(Date.now()),
        kind: "quadratic",
        a: equationDraft.a,
        b: equationDraft.qB,
        c: equationDraft.c,
        x1: equationDraft.x1,
        x2: equationDraft.x2,
        start: equationDraft.start,
        end: equationDraft.end,
      }
      : {
        id: String(Date.now()),
        kind: "linear-equation",
        m: equationDraft.m,
        b: equationDraft.b,
        x1: equationDraft.x1,
        x2: equationDraft.x2,
        start: equationDraft.start,
        end: equationDraft.end,
      });
  }

  function addSegmentSafely(nextSegment) {
    try {
      const parsedCurrent = segments.map(parseSegment);
      const parsedNext = parseSegment(nextSegment);
      const conflict = findVerticalConflict([...parsedCurrent, parsedNext]);
      if (conflict) {
        setCreationError(`No se puede agregar: en x=${formatNumber(conflict.x)} habria dos valores de y (${formatNumber(conflict.y1)} y ${formatNumber(conflict.y2)}).`);
        return;
      }
      setCreationError("");
      setSegments((current) => [...current, nextSegment]);
    } catch (error) {
      setCreationError(error?.message ?? "No se pudo agregar esa grafica.");
    }
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal truth-tool-modal piecewise-tool-modal">
        <header>
          <div>
            <h2>Lectura de graficas por tramos</h2>
            <ToolMetaTags topic="Puntos abiertos, cerrados e inyectividad" />
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="truth-tool-layout algebra-tool-layout piecewise-tool-layout">
          <form className="truth-tool-form piecewise-tool-form">
            <div className="piecewise-creation-controls">
              <label>
                Plantilla
                <select onChange={(event) => setSegments(PRESETS[event.target.value])} defaultValue="parcial">
                  <option value="parcial">Grafica por tramos tipo parcial</option>
                  <option value="noInjective">Ejemplo no inyectivo</option>
                  <option value="injective">Ejemplo inyectivo</option>
                </select>
              </label>
              <label>
                Metodo de creacion
                <select value={creationMode} onChange={(event) => setCreationMode(event.target.value)}>
                  <option value="points">Mediante puntos</option>
                  <option value="equations">Mediante ecuaciones</option>
                </select>
              </label>
            </div>

            {creationMode === "points" && (
              <>
                <div className="piecewise-segment-list">
                  {segments.map((segment, index) => (
                    <fieldset className="piecewise-segment-editor" key={segment.id}>
                      <legend>Tramo {index + 1}</legend>
                      <div className="piecewise-endpoint-editor">
                        <span>Inicio</span>
                        <select value={segment.start} onChange={(event) => updateSegment(segment.id, "start", event.target.value)} aria-label="Tipo de punto inicial">
                          <option value="closed">Cerrado</option>
                          <option value="open">Abierto</option>
                        </select>
                        <label>x<input value={segment.x1} onChange={(event) => updateSegment(segment.id, "x1", event.target.value)} aria-label="x inicial" /></label>
                        <label>y<input value={segment.y1 ?? ""} onChange={(event) => updateSegment(segment.id, "y1", event.target.value)} aria-label="y inicial" disabled={segment.kind === "quadratic" || segment.kind === "linear-equation"} /></label>
                      </div>
                      <div className="piecewise-endpoint-editor">
                        <span>Final</span>
                        <select value={segment.end} onChange={(event) => updateSegment(segment.id, "end", event.target.value)} aria-label="Tipo de punto final">
                          <option value="closed">Cerrado</option>
                          <option value="open">Abierto</option>
                        </select>
                        <label>x<input value={segment.x2} onChange={(event) => updateSegment(segment.id, "x2", event.target.value)} aria-label="x final" /></label>
                        <label>y<input value={segment.y2 ?? ""} onChange={(event) => updateSegment(segment.id, "y2", event.target.value)} aria-label="y final" disabled={segment.kind === "quadratic" || segment.kind === "linear-equation"} /></label>
                      </div>
                      <button className="small-action" type="button" onClick={() => removeSegment(segment.id)}>Quitar</button>
                    </fieldset>
                  ))}
                </div>
                <div className="piecewise-action-row">
                  <button className="secondary-action" type="button" onClick={addSegment}>Agregar tramo</button>
                </div>
                {creationError && <p className="auth-error">{creationError}</p>}
                <button className="secondary-action piecewise-clear-all-button" type="button" onClick={clearSegments}>Borrar todas las graficas</button>
              </>
            )}

            {creationMode === "equations" && (
            <section className="piecewise-equation-builder">
              <p>Datos de la ecuacion</p>
              <PiecewiseSelect
                ariaLabel="Tipo de ecuacion"
                value={equationDraft.type}
                options={EQUATION_TYPE_OPTIONS}
                onChange={(nextType) => updateEquationDraft("type", nextType)}
              />
              {equationDraft.type === "linear" ? (
                <div className="piecewise-equation-grid">
                  <label>m<input value={equationDraft.m} onChange={(event) => updateEquationDraft("m", event.target.value)} /></label>
                  <label>b<input value={equationDraft.b} onChange={(event) => updateEquationDraft("b", event.target.value)} /></label>
                </div>
              ) : (
                <div className="piecewise-equation-grid">
                  <label>a<input value={equationDraft.a} onChange={(event) => updateEquationDraft("a", event.target.value)} /></label>
                  <label>b<input value={equationDraft.qB} onChange={(event) => updateEquationDraft("qB", event.target.value)} /></label>
                  <label>c<input value={equationDraft.c} onChange={(event) => updateEquationDraft("c", event.target.value)} /></label>
                </div>
              )}
              <div className="piecewise-equation-grid">
                <label>Desde x<input value={equationDraft.x1} onChange={(event) => updateEquationDraft("x1", event.target.value)} /></label>
                <label>Hasta x<input value={equationDraft.x2} onChange={(event) => updateEquationDraft("x2", event.target.value)} /></label>
              </div>
              <div className="piecewise-equation-grid">
                <label>Inicio<select value={equationDraft.start} onChange={(event) => updateEquationDraft("start", event.target.value)}><option value="closed">Cerrado</option><option value="open">Abierto</option></select></label>
                <label>Final<select value={equationDraft.end} onChange={(event) => updateEquationDraft("end", event.target.value)}><option value="closed">Cerrado</option><option value="open">Abierto</option></select></label>
              </div>
              <div className="piecewise-action-row">
                <button className="secondary-action" type="button" onClick={addEquationSegment}>Agregar ecuacion a la grafica</button>
              </div>
              {creationError && <p className="auth-error">{creationError}</p>}
              <div className="piecewise-equation-list">
                <p>Ecuaciones creadas</p>
                {segments.length === 0 && <span className="piecewise-empty-note">No hay ecuaciones creadas.</span>}
                {segments.map((segment, index) => (
                  <fieldset className="piecewise-equation-item" key={segment.id}>
                    <legend>Funcion {index + 1}</legend>
                    {segment.kind === "quadratic" ? (
                      <div className="piecewise-equation-grid">
                        <label>a<input value={segment.a} onChange={(event) => updateSegment(segment.id, "a", event.target.value)} /></label>
                        <label>b<input value={segment.b} onChange={(event) => updateSegment(segment.id, "b", event.target.value)} /></label>
                        <label>c<input value={segment.c} onChange={(event) => updateSegment(segment.id, "c", event.target.value)} /></label>
                      </div>
                    ) : segment.kind === "linear-equation" ? (
                      <div className="piecewise-equation-grid">
                        <label>m<input value={segment.m} onChange={(event) => updateSegment(segment.id, "m", event.target.value)} /></label>
                        <label>b<input value={segment.b} onChange={(event) => updateSegment(segment.id, "b", event.target.value)} /></label>
                      </div>
                    ) : (
                      <div className="piecewise-equation-grid">
                        <label>x1<input value={segment.x1} onChange={(event) => updateSegment(segment.id, "x1", event.target.value)} /></label>
                        <label>y1<input value={segment.y1} onChange={(event) => updateSegment(segment.id, "y1", event.target.value)} /></label>
                        <label>x2<input value={segment.x2} onChange={(event) => updateSegment(segment.id, "x2", event.target.value)} /></label>
                        <label>y2<input value={segment.y2} onChange={(event) => updateSegment(segment.id, "y2", event.target.value)} /></label>
                      </div>
                    )}
                    <div className="piecewise-equation-grid">
                      <label>Desde x<input value={segment.x1} onChange={(event) => updateSegment(segment.id, "x1", event.target.value)} /></label>
                      <label>Hasta x<input value={segment.x2} onChange={(event) => updateSegment(segment.id, "x2", event.target.value)} /></label>
                    </div>
                    <div className="piecewise-equation-grid">
                      <label>Inicio<select value={segment.start} onChange={(event) => updateSegment(segment.id, "start", event.target.value)}><option value="closed">Cerrado</option><option value="open">Abierto</option></select></label>
                      <label>Final<select value={segment.end} onChange={(event) => updateSegment(segment.id, "end", event.target.value)}><option value="closed">Cerrado</option><option value="open">Abierto</option></select></label>
                    </div>
                    <button className="small-action" type="button" onClick={() => removeSegment(segment.id)}>Quitar esta grafica</button>
                  </fieldset>
                ))}
                <button className="secondary-action piecewise-clear-all-button" type="button" onClick={clearSegments}>Borrar todas las graficas</button>
              </div>
            </section>
            )}

            <p className="truth-tool-hint">Primero escoge una plantilla y luego decide si quieres crear tramos mediante puntos o mediante ecuaciones.</p>
          </form>

          <section className="truth-result-panel algebra-result-panel piecewise-result-panel" aria-live="polite">
            {analysis.error ? (
              <p className="auth-error">{analysis.error}</p>
            ) : (
              <>
                <div className="truth-summary">
                  <span>{analysis.domainText}</span>
                  <strong>{analysis.injective ? "Es inyectiva" : "No es inyectiva"}</strong>
                  <span>{analysis.rangeText}</span>
                </div>
                <PiecewiseGraph analysis={analysis} />
                <LatexBlock title="Funcion por tramos" lines={analysis.equations} />
                <div className="algebra-steps">
                  <h3>Lectura e inyectividad</h3>
                  {analysis.steps.map((step, index) => (
                    <LatexBlock title={`${index + 1}. ${step.title}`} lines={step.lines} key={step.title + index} />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function PiecewiseSelect({ ariaLabel, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  function selectOption(nextValue) {
    onChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div className={open ? "custom-select piecewise-custom-select is-open" : "custom-select piecewise-custom-select"}>
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
        <span className="custom-select-label">{selected.label}</span>
        <span className="custom-select-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1} aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              className={option.value === selected.value ? "custom-select-option is-selected" : "custom-select-option"}
              type="button"
              role="option"
              aria-selected={option.value === selected.value}
              key={option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option.value)}
            >
              <span className="custom-select-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PiecewiseGraph({ analysis }) {
  const [viewport, setViewport] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef(null);
  const baseBounds = graphBoundsForSegments(analysis.segments);
  const bounds = viewBounds(baseBounds, viewport);
  const yAxis = toSvgX(0, bounds);
  const xAxis = toSvgY(0, bounds);

  function updateZoom(nextZoom) {
    setViewport((current) => ({ ...current, zoom: clamp(nextZoom, 0.45, 8) }));
  }

  function resetView() {
    setViewport({ zoom: 1, offsetX: 0, offsetY: 0 });
  }

  function startPan(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, bounds };
  }

  function panGraph(event) {
    if (!dragRef.current) return;
    const start = dragRef.current;
    const dx = ((event.clientX - start.x) / 624) * (start.bounds.maxX - start.bounds.minX);
    const dy = ((event.clientY - start.y) / 348) * (start.bounds.maxY - start.bounds.minY);
    setViewport((current) => ({ ...current, offsetX: current.offsetX - dx, offsetY: current.offsetY + dy }));
    dragRef.current = { x: event.clientX, y: event.clientY, bounds };
  }

  function endPan(event) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }

  return (
    <div className="quadratic-graph-card piecewise-graph-card">
      <div className="quadratic-graph-toolbar" aria-label="Controles de grafica">
        <button type="button" onClick={() => updateZoom(viewport.zoom * 1.22)}>+</button>
        <button type="button" onClick={() => updateZoom(viewport.zoom / 1.22)}>-</button>
        <button type="button" onClick={resetView}>Reset</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
      </div>
      <svg
        viewBox="0 0 720 420"
        role="img"
        aria-label="Grafica por tramos"
        onPointerDown={startPan}
        onPointerMove={panGraph}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <line className="quadratic-axis" x1="48" y1={xAxis} x2="672" y2={xAxis} />
        <line className="quadratic-axis" x1={yAxis} y1="36" x2={yAxis} y2="384" />
        {analysis.segments.map((segment) => (
          <g key={segment.id}>
            {segment.kind === "quadratic" ? (
              <path className="piecewise-segment-line" d={curvePath(segment, bounds)} />
            ) : (
              <line className="piecewise-segment-line" x1={toSvgX(segment.x1, bounds)} y1={toSvgY(segment.y1, bounds)} x2={toSvgX(segment.x2, bounds)} y2={toSvgY(segment.y2, bounds)} />
            )}
            <Endpoint x={segment.x1} y={segment.y1} open={segment.start === "open"} bounds={bounds} />
            <Endpoint x={segment.x2} y={segment.y2} open={segment.end === "open"} bounds={bounds} />
          </g>
        ))}
        {analysis.repeatedY !== null && (
          <line className="piecewise-horizontal-test" x1="48" x2="672" y1={toSvgY(analysis.repeatedY, bounds)} y2={toSvgY(analysis.repeatedY, bounds)} />
        )}
        <text className="quadratic-axis-label" x="676" y={xAxis - 6}>x</text>
        <text className="quadratic-axis-label" x={yAxis + 8} y="34">y</text>
      </svg>
    </div>
  );
}

function Endpoint({ x, y, open, bounds }) {
  return (
    <g>
      <circle className={open ? "piecewise-endpoint is-open" : "piecewise-endpoint"} cx={toSvgX(x, bounds)} cy={toSvgY(y, bounds)} r="6" />
      <text className="quadratic-label piecewise-point-label" x={toSvgX(x, bounds) + 9} y={toSvgY(y, bounds) - 9}>({formatNumber(x)}, {formatNumber(y)})</text>
    </g>
  );
}

function analyzeSegments(rawSegments) {
  try {
    const segments = rawSegments.map(parseSegment);
    if (!segments.length) {
      return {
        segments: [],
        equations: ["\\text{No hay tramos en la grafica.}"],
        domainText: "Dominio: vacio",
        rangeText: "Rango: vacio",
        injective: true,
        repeatedY: null,
        steps: [
          { title: "Grafica vacia", lines: ["\\text{Agrega un tramo por puntos o por ecuacion para iniciar la lectura.}"] },
        ],
      };
    }
    const verticalConflict = findVerticalConflict(segments);
    if (verticalConflict) {
      throw new Error(`No es una funcion: en x=${formatNumber(verticalConflict.x)} aparecen y=${formatNumber(verticalConflict.y1)} y y=${formatNumber(verticalConflict.y2)}.`);
    }
    const equations = segments.map(segmentEquation);
    const domainText = `Dominio: ${segments.map((segment) => intervalLatex(segment.x1, segment.x2, segment.start, segment.end)).join(" ∪ ")}`;
    const rangeText = `Rango: ${mergeRangeText(segments)}`;
    const injectivity = analyzeInjectivity(segments);
    const domainLines = segments.map((segment, index) => `D_${index + 1}=${intervalLatex(segment.x1, segment.x2, segment.start, segment.end)}`);
    const rangeLines = segments.map((segment, index) => {
      const range = yInterval(segment);
      return `R_${index + 1}=${rangeIntervalLatex(range)}`;
    });
    return {
      segments,
      equations,
      domainText,
      rangeText,
      injective: injectivity.injective,
      repeatedY: injectivity.repeatedY,
      steps: [
        { title: "Puntos abiertos y cerrados", lines: segments.map((segment) => `${pointLatex(segment.x1, segment.y1, segment.start)}\\to ${pointLatex(segment.x2, segment.y2, segment.end)}`) },
        { title: "Ecuaciones que generan la grafica", lines: equations },
        { title: "Dominio", lines: [...domainLines, `D_f=${segments.map((segment) => intervalLatex(segment.x1, segment.x2, segment.start, segment.end)).join("\\cup")}`] },
        { title: "Rango", lines: [...rangeLines, `R_f=${segments.map((segment) => rangeIntervalLatex(yInterval(segment))).join("\\cup")}`] },
        { title: "Prueba de inyectividad", lines: injectivity.lines },
      ],
    };
  } catch (error) {
    return { error: error?.message ?? "No pude leer esos tramos." };
  }
}

function parseSegment(segment) {
  const x1 = parseNumber(segment.x1, "x inicial");
  const x2 = parseNumber(segment.x2, "x final");
  if (x1 === x2) throw new Error("Un tramo no puede ser vertical, porque no seria funcion.");
  if (segment.kind === "quadratic") {
    const a = parseNumber(segment.a, "a");
    const b = parseNumber(segment.b, "b");
    const c = parseNumber(segment.c, "c");
    return { ...segment, a, b, c, x1, x2, y1: evaluateSegment({ kind: "quadratic", a, b, c }, x1), y2: evaluateSegment({ kind: "quadratic", a, b, c }, x2) };
  }
  if (segment.kind === "linear-equation") {
    const m = parseNumber(segment.m, "m");
    const b = parseNumber(segment.b, "b");
    return { ...segment, m, b, x1, x2, y1: m * x1 + b, y2: m * x2 + b };
  }
  const y1 = parseNumber(segment.y1, "y inicial");
  const y2 = parseNumber(segment.y2, "y final");
  return { ...segment, kind: "point-line", x1, y1, x2, y2 };
}

function segmentEquation(segment) {
  const inequality = intervalLatex(segment.x1, segment.x2, segment.start, segment.end, "x");
  if (segment.kind === "quadratic") return `f(x)=${quadraticLatex(segment.a, segment.b, segment.c)}\\quad,\\quad ${inequality}`;
  const m = segment.kind === "linear-equation" ? segment.m : (segment.y2 - segment.y1) / (segment.x2 - segment.x1);
  const b = segment.kind === "linear-equation" ? segment.b : segment.y1 - m * segment.x1;
  return `f(x)=${lineLatex(m, b)}\\quad,\\quad ${inequality}`;
}

function lineLatex(m, b) {
  if (Math.abs(m) < 1e-10) return formatNumber(b);
  const slope = Math.abs(m) === 1 ? (m < 0 ? "-x" : "x") : `${formatNumber(m)}x`;
  if (Math.abs(b) < 1e-10) return slope;
  return `${slope}${b >= 0 ? "+" : ""}${formatNumber(b)}`;
}

function analyzeInjectivity(segments) {
  const ranges = segments.map((segment) => yInterval(segment));
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const overlap = intervalOverlap(ranges[i], ranges[j]);
      if (overlap.exists) {
        return {
          injective: false,
          repeatedY: overlap.value,
          lines: [`\\text{Una recta horizontal en }y=${formatNumber(overlap.value)}\\text{ corta la grafica mas de una vez.}`, `\\text{Por lo tanto, la funcion no es inyectiva.}`],
        };
      }
    }
  }
  return {
    injective: true,
    repeatedY: null,
    lines: ["\\text{Ningun valor de }y\\text{ se repite entre los tramos.}", "\\text{Por la prueba de la recta horizontal, la funcion es inyectiva.}"],
  };
}

function findVerticalConflict(segments) {
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const overlap = xOverlap(segments[i], segments[j]);
      if (!overlap) continue;
      const candidates = candidateXValues(segments[i], segments[j], overlap);
      for (const x of candidates) {
        if (!includesX(segments[i], x) || !includesX(segments[j], x)) continue;
        const y1 = evaluateSegment(segments[i], x);
        const y2 = evaluateSegment(segments[j], x);
        if (Math.abs(y1 - y2) > 1e-7) return { x, y1, y2 };
      }
    }
  }
  return null;
}

function xOverlap(left, right) {
  const leftInterval = xInterval(left);
  const rightInterval = xInterval(right);
  const min = Math.max(leftInterval.min, rightInterval.min);
  const max = Math.min(leftInterval.max, rightInterval.max);
  if (min > max) return null;
  if (min === max && (!includesX(left, min) || !includesX(right, min))) return null;
  return { min, max };
}

function candidateXValues(left, right, overlap) {
  if (overlap.min === overlap.max) return [overlap.min];
  const values = [overlap.min, overlap.max, (overlap.min + overlap.max) / 2, left.x1, left.x2, right.x1, right.x2, 0]
    .filter((value) => value >= overlap.min && value <= overlap.max);
  const steps = 24;
  for (let index = 1; index < steps; index += 1) {
    values.push(overlap.min + ((overlap.max - overlap.min) * index) / steps);
  }
  return Array.from(new Set(values.map((value) => Number(value.toFixed(8)))));
}

function xInterval(segment) {
  const ascending = segment.x1 <= segment.x2;
  return {
    min: Math.min(segment.x1, segment.x2),
    max: Math.max(segment.x1, segment.x2),
    minIncluded: ascending ? segment.start === "closed" : segment.end === "closed",
    maxIncluded: ascending ? segment.end === "closed" : segment.start === "closed",
  };
}

function includesX(segment, x) {
  const interval = xInterval(segment);
  if (x < interval.min - 1e-9 || x > interval.max + 1e-9) return false;
  if (Math.abs(x - interval.min) < 1e-9) return interval.minIncluded;
  if (Math.abs(x - interval.max) < 1e-9) return interval.maxIncluded;
  return true;
}

function yInterval(segment) {
  const values = sampleSegment(segment).map((point) => point.y);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  if (segment.kind === "quadratic") {
    return { min: minValue, max: maxValue, minIncluded: true, maxIncluded: true };
  }
  const ascending = segment.y1 <= segment.y2;
  return {
    min: minValue,
    max: maxValue,
    minIncluded: ascending ? segment.start === "closed" : segment.end === "closed",
    maxIncluded: ascending ? segment.end === "closed" : segment.start === "closed",
  };
}

function intervalOverlap(left, right) {
  const min = Math.max(left.min, right.min);
  const max = Math.min(left.max, right.max);
  if (min < max) return { exists: true, value: (min + max) / 2 };
  if (min === max && includesY(left, min) && includesY(right, min)) return { exists: true, value: min };
  return { exists: false, value: null };
}

function includesY(interval, y) {
  if (y < interval.min || y > interval.max) return false;
  if (y === interval.min) return interval.minIncluded;
  if (y === interval.max) return interval.maxIncluded;
  return true;
}

function graphBoundsForSegments(segments) {
  if (!segments.length) return { minX: -5, maxX: 5, minY: -4, maxY: 4 };
  const samples = segments.flatMap(sampleSegment);
  const xs = [...samples.map((point) => point.x), 0];
  const ys = [...samples.map((point) => point.y), 0];
  const xPad = Math.max(1, (Math.max(...xs) - Math.min(...xs)) * 0.12);
  const yPad = Math.max(1, (Math.max(...ys) - Math.min(...ys)) * 0.16);
  return { minX: Math.min(...xs) - xPad, maxX: Math.max(...xs) + xPad, minY: Math.min(...ys) - yPad, maxY: Math.max(...ys) + yPad };
}

function viewBounds(baseBounds, viewport) {
  const centerX = (baseBounds.minX + baseBounds.maxX) / 2 + viewport.offsetX;
  const centerY = (baseBounds.minY + baseBounds.maxY) / 2 + viewport.offsetY;
  const width = (baseBounds.maxX - baseBounds.minX) / viewport.zoom;
  const height = (baseBounds.maxY - baseBounds.minY) / viewport.zoom;
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: centerY - height / 2,
    maxY: centerY + height / 2,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleSegment(segment) {
  if (segment.kind !== "quadratic") return [{ x: segment.x1, y: segment.y1 }, { x: segment.x2, y: segment.y2 }];
  const min = Math.min(segment.x1, segment.x2);
  const max = Math.max(segment.x1, segment.x2);
  return Array.from({ length: 80 }, (_, index) => {
    const x = min + ((max - min) * index) / 79;
    return { x, y: evaluateSegment(segment, x) };
  });
}

function curvePath(segment, bounds) {
  return sampleSegment(segment).map((point, index) => `${index === 0 ? "M" : "L"} ${toSvgX(point.x, bounds)} ${toSvgY(point.y, bounds)}`).join(" ");
}

function evaluateSegment(segment, x) {
  if (segment.kind === "quadratic") return segment.a * x * x + segment.b * x + segment.c;
  if (segment.kind === "linear-equation") return segment.m * x + segment.b;
  const m = (segment.y2 - segment.y1) / (segment.x2 - segment.x1);
  return m * x + (segment.y1 - m * segment.x1);
}

function toSvgX(x, bounds) {
  return 48 + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 624;
}

function toSvgY(y, bounds) {
  return 384 - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * 348;
}

function intervalLatex(left, right, start, end, variable = "") {
  const min = Math.min(left, right);
  const max = Math.max(left, right);
  const leftClosed = left <= right ? start === "closed" : end === "closed";
  const rightClosed = left <= right ? end === "closed" : start === "closed";
  if (variable) return `${formatNumber(min)}\\quad ${leftClosed ? "\\le" : "<"}\\quad ${variable}\\quad ${rightClosed ? "\\le" : "<"}\\quad ${formatNumber(max)}`;
  return `${leftClosed ? "[" : "("}${formatNumber(min)},${formatNumber(max)}${rightClosed ? "]" : ")"}`;
}

function mergeRangeText(segments) {
  return segments.map((segment) => rangeIntervalLatex(yInterval(segment)).replaceAll("\\,", " ")).join(" ∪ ");
}

function rangeIntervalLatex(range) {
  return `${range.minIncluded ? "[" : "("}${formatNumber(range.min)}\\,${formatNumber(range.max)}${range.maxIncluded ? "]" : ")"}`;
}

function quadraticLatex(a, b, c) {
  const parts = [];
  if (Math.abs(a) > 1e-10) parts.push(`${a === 1 ? "" : a === -1 ? "-" : formatNumber(a)}x^2`);
  if (Math.abs(b) > 1e-10) parts.push(`${b > 0 && parts.length ? "+" : ""}${b === 1 ? "" : b === -1 ? "-" : formatNumber(b)}x`);
  if (Math.abs(c) > 1e-10 || !parts.length) parts.push(`${c > 0 && parts.length ? "+" : ""}${formatNumber(c)}`);
  return parts.join("");
}

function pointLatex(x, y, state) {
  return `${state === "open" ? "\\text{abierto }" : "\\text{cerrado }"}\\quad (${formatNumber(x)}, ${formatNumber(y)})`;
}

function sanitizeSegmentValue(key, value) {
  if (key === "start" || key === "end" || key === "type") return value;
  return value.replaceAll("−", "-").split("").filter((char) => /[0-9+\-./]/.test(char)).join("");
}

function parseNumber(value, label) {
  if (!String(value).trim()) throw new Error(`Escribe ${label}.`);
  if (String(value).includes("/")) {
    const [top, bottom] = String(value).split("/").map(Number);
    if (!bottom) throw new Error("La fraccion no puede tener denominador cero.");
    return top / bottom;
  }
  const number = Number(value);
  if (Number.isNaN(number)) throw new Error(`No pude leer ${label}.`);
  return number;
}

function formatNumber(value) {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
