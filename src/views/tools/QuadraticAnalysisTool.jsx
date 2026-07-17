import { useMemo, useRef, useState } from "react";
import { LatexBlock } from "./latexReader";
import { parseLinearTerms, polynomialToLatex, sanitizeAlgebraInput } from "./AlgebraOperationsTool";
import { ToolMetaTags } from "./ToolMetaTags";

const FORM_OPTIONS = [
  { value: "general", label: "Forma general: ax^2 + bx + c" },
  { value: "vertex", label: "Forma vertice: a(x - h)^2 + k" },
  { value: "coefficients", label: "Coeficientes: a, b, c" },
];

const EXAMPLES_BY_MODE = {
  general: "2x^2+4x-6",
  vertex: "2(x+1)^2-8",
  coefficients: { a: "2", b: "4", c: "-6" },
};

export function QuadraticAnalysisToolModal({ onClose }) {
  const [mode, setMode] = useState("general");
  const [expression, setExpression] = useState(EXAMPLES_BY_MODE.general);
  const [coefficients, setCoefficients] = useState(EXAMPLES_BY_MODE.coefficients);
  const expressionRef = useRef(null);
  const result = useMemo(() => analyzeQuadratic(mode, expression, coefficients), [mode, expression, coefficients]);

  function updateExpressionInput(event) {
    const input = event.target;
    const rawValue = input.value;
    const cursor = input.selectionStart ?? rawValue.length;
    const nextExpression = sanitizeQuadraticInput(rawValue);
    const nextCursor = sanitizeQuadraticInput(rawValue.slice(0, cursor)).length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => input.setSelectionRange(nextCursor, nextCursor));
  }

  function insertSymbol(symbol) {
    const input = expressionRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const nextExpression = sanitizeQuadraticInput(`${expression.slice(0, start)}${symbol}${expression.slice(end)}`);
    const nextCursor = start + symbol.length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    if (nextMode === "general" || nextMode === "vertex") setExpression(EXAMPLES_BY_MODE[nextMode]);
    if (nextMode === "coefficients") setCoefficients(EXAMPLES_BY_MODE.coefficients);
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal truth-tool-modal quadratic-tool-modal">
        <header>
          <div>
            <h2>Analisis grafico de cuadraticas</h2>
            <ToolMetaTags topic="Parabolas, dominio, rango y crecimiento" />
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="truth-tool-layout algebra-tool-layout quadratic-tool-layout">
          <form className="truth-tool-form algebra-tool-form">
            <label>
              Como vas a escribir la funcion
              <select value={mode} onChange={(event) => changeMode(event.target.value)}>
                {FORM_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
            </label>

            {mode === "coefficients" ? (
              <div className="quadratic-coefficient-grid">
                {["a", "b", "c"].map((key) => (
                  <label key={key}>
                    {key}
                    <input
                      value={coefficients[key]}
                      onChange={(event) => setCoefficients((current) => ({ ...current, [key]: sanitizeNumberInput(event.target.value) }))}
                      placeholder={key === "a" ? "2" : key === "b" ? "4" : "-6"}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <label>
                Funcion f(x)
                <textarea
                  ref={expressionRef}
                  value={expression}
                  onChange={updateExpressionInput}
                  rows={4}
                  placeholder={mode === "vertex" ? "Ej: 2(x+1)^2-8" : "Ej: x^2 - 2x - 3"}
                />
              </label>
            )}

            {mode !== "coefficients" && (
              <div className="truth-operator-row algebra-operator-row quadratic-operator-row" aria-label="Simbolos de funciones cuadraticas">
                {["x", "^2", "(", ")", "+", "-", "/", "f(x)=", "sqrt()"].map((symbol) => (
                  <button type="button" key={symbol} onClick={() => insertSymbol(symbol)}>{symbol}</button>
                ))}
              </div>
            )}

            <p className="truth-tool-hint">Usa funciones cuadraticas sencillas con variable x. En forma vertice se acepta a(x-h)^2+k; en forma general, ax^2+bx+c.</p>
            <button className="secondary-action truth-clear-button" type="button" onClick={() => mode === "coefficients" ? setCoefficients({ a: "", b: "", c: "" }) : setExpression("")}>
              Borrar datos
            </button>
          </form>

          <section className="truth-result-panel algebra-result-panel quadratic-result-panel" aria-live="polite">
            {result.error ? (
              <p className="auth-error">{result.error}</p>
            ) : (
              <>
                <div className="truth-summary">
                  <span>{result.concavity}</span>
                  <strong>Vertice: {result.vertexText}</strong>
                  <span>Eje: x = {formatNumber(result.h)}</span>
                </div>
                <QuadraticGraph analysis={result} />
                <LatexBlock title="Funcion" lines={[result.functionLatex]} />
                <div className="quadratic-facts">
                  {result.facts.map((fact) => (
                    <article key={fact.label}>
                      <span>{fact.label}</span>
                      <strong>{fact.value}</strong>
                    </article>
                  ))}
                </div>
                <div className="algebra-steps">
                  <h3>Explicacion detallada</h3>
                  {result.steps.map((step, index) => (
                    <LatexBlock title={`${index + 1}. ${step.title}`} lines={step.lines} key={`${step.title}-${index}`} />
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

function analyzeQuadratic(mode, expression, coefficients) {
  try {
    const quadratic = mode === "coefficients" ? parseCoefficients(coefficients) : parseQuadraticExpression(expression, mode);
    if (Math.abs(quadratic.a) < 1e-10) return { error: "El coeficiente a no puede ser 0; si a=0 no hay parabola." };
    const { a, b, c } = quadratic;
    const h = -b / (2 * a);
    const k = evaluateQuadratic(a, b, c, h);
    const discriminant = b ** 2 - 4 * a * c;
    const roots = rootsFor(a, b, c, discriminant);
    const yIntercept = c;
    const opensUp = a > 0;
    const domain = "\\mathbb{R}";
    const range = opensUp ? `[${formatNumber(k)},\\infty)` : `(-\\infty,${formatNumber(k)}]`;
    const decreasing = opensUp ? `(-\\infty,${formatNumber(h)})` : `(${formatNumber(h)},\\infty)`;
    const increasing = opensUp ? `(${formatNumber(h)},\\infty)` : `(-\\infty,${formatNumber(h)})`;
    const polynomial = polynomialToLatex([
      { coefficient: a, variable: "x", power: 2 },
      { coefficient: b, variable: "x", power: 1 },
      { coefficient: c, variable: "", power: 0 },
    ].filter((term) => Math.abs(term.coefficient) > 1e-10));

    return {
      a,
      b,
      c,
      h,
      k,
      discriminant,
      roots,
      yIntercept,
      concavity: opensUp ? "Abre hacia arriba" : "Abre hacia abajo",
      vertexText: `(${formatNumber(h)}, ${formatNumber(k)})`,
      functionLatex: `f(x)=${polynomial}`,
      facts: [
        { label: "Concavidad", value: opensUp ? "Parabola con minimo" : "Parabola con maximo" },
        { label: "Corte con Y", value: `(0, ${formatNumber(yIntercept)})` },
        { label: "Cortes con X", value: roots.length ? roots.map((root) => `(${formatNumber(root)}, 0)`).join(" y ") : "No corta al eje X" },
        { label: "Dominio", value: "Todos los reales" },
        { label: "Rango", value: opensUp ? `[${formatNumber(k)}, ∞)` : `(-∞, ${formatNumber(k)}]` },
      ],
      steps: [
        { title: "Forma general", lines: [`f(x)=ax^2+bx+c`, `a=${formatNumber(a)},\\quad b=${formatNumber(b)},\\quad c=${formatNumber(c)}`] },
        { title: "Vertice y eje de simetria", lines: [`h=\\frac{-b}{2a}=\\frac{-(${formatNumber(b)})}{2(${formatNumber(a)})}=${formatNumber(h)}`, `k=f(h)=f(${formatNumber(h)})=${formatNumber(k)}`, `V=(${formatNumber(h)},${formatNumber(k)}),\\quad \\text{eje: }x=${formatNumber(h)}`] },
        { title: "Concavidad", lines: [opensUp ? "a>0\\Rightarrow \\text{la parabola abre hacia arriba y el vertice es minimo}" : "a<0\\Rightarrow \\text{la parabola abre hacia abajo y el vertice es maximo}"] },
        { title: "Cortes con los ejes", lines: [`\\Delta=b^2-4ac=${formatNumber(discriminant)}`, roots.length ? roots.map((root) => `x=${formatNumber(root)}\\Rightarrow (${formatNumber(root)},0)`) : ["\\Delta<0\\Rightarrow \\text{no hay cortes reales con el eje X}"], [`f(0)=c=${formatNumber(c)}\\Rightarrow (0,${formatNumber(c)})`]].flat() },
        { title: "Dominio y rango", lines: [`D_f=${domain}`, `R_f=${range}`] },
        { title: "Decrecimiento y crecimiento", lines: [`\\text{Decrece en }${decreasing}`, `\\text{Crece en }${increasing}`] },
      ],
    };
  } catch (error) {
    return { error: error?.message ?? "No pude analizar esa funcion cuadratica." };
  }
}

function QuadraticGraph({ analysis }) {
  const [viewport, setViewport] = useState({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [hoverPoint, setHoverPoint] = useState(null);
  const dragRef = useRef(null);
  const basePoints = sampleGraphPoints(analysis);
  const baseBounds = graphBounds(basePoints, analysis);
  const bounds = viewBounds(baseBounds, viewport);
  const points = sampleGraphPoints(analysis, bounds.minX, bounds.maxX);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${toSvgX(point.x, bounds)} ${toSvgY(point.y, bounds)}`).join(" ");
  const vertex = { x: toSvgX(analysis.h, bounds), y: toSvgY(analysis.k, bounds) };
  const yAxis = toSvgX(0, bounds);
  const xAxis = toSvgY(0, bounds);
  const xIntersections = analysis.roots.filter((root) => root >= bounds.minX && root <= bounds.maxX);
  const visibleVertex = isPointVisible(analysis.h, analysis.k, bounds);
  const hoverSvgPoint = hoverPoint ? { x: toSvgX(hoverPoint.x, bounds), y: toSvgY(hoverPoint.y, bounds) } : null;

  function updateZoom(nextZoom) {
    setViewport((current) => ({ ...current, zoom: clamp(nextZoom, 0.45, 8) }));
  }

  function resetView() {
    setViewport({ zoom: 1, offsetX: 0, offsetY: 0 });
    setHoverPoint(null);
  }

  function graphPointFromEvent(event) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * 720;
    const x = fromSvgX(svgX, bounds);
    return { x, y: evaluateQuadratic(analysis.a, analysis.b, analysis.c, x) };
  }

  function moveHover(event) {
    if (dragRef.current) return;
    setHoverPoint(graphPointFromEvent(event));
  }

  function startPan(event) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, bounds };
  }

  function panGraph(event) {
    if (!dragRef.current) {
      moveHover(event);
      return;
    }
    const start = dragRef.current;
    const dx = ((event.clientX - start.x) / 624) * (start.bounds.maxX - start.bounds.minX);
    const dy = ((event.clientY - start.y) / 348) * (start.bounds.maxY - start.bounds.minY);
    setViewport((current) => ({ ...current, offsetX: current.offsetX - dx, offsetY: current.offsetY + dy }));
    dragRef.current = { x: event.clientX, y: event.clientY, bounds: viewBounds(baseBounds, viewport) };
  }

  function endPan(event) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setHoverPoint(graphPointFromEvent(event));
  }

  return (
    <div className="quadratic-graph-card">
      <div className="quadratic-graph-toolbar" aria-label="Controles de grafica">
        <button type="button" onClick={() => updateZoom(viewport.zoom * 1.22)}>+</button>
        <button type="button" onClick={() => updateZoom(viewport.zoom / 1.22)}>-</button>
        <button type="button" onClick={resetView}>Reset</button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
      </div>
      <svg
        viewBox="0 0 720 420"
        role="img"
        aria-label="Grafica de la funcion cuadratica"
        onMouseMove={moveHover}
        onMouseLeave={() => setHoverPoint(null)}
        onPointerDown={startPan}
        onPointerMove={panGraph}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <line className="quadratic-axis" x1="48" y1={xAxis} x2="672" y2={xAxis} />
        <line className="quadratic-axis" x1={yAxis} y1="36" x2={yAxis} y2="384" />
        <line className="quadratic-symmetry" x1={vertex.x} y1="36" x2={vertex.x} y2="384" />
        <path className="quadratic-curve" d={path} />
        {xIntersections.map((root) => (
          <g key={root}>
            <circle className="quadratic-root-point" cx={toSvgX(root, bounds)} cy={toSvgY(0, bounds)} r="5" />
            <text className="quadratic-label quadratic-root-label" x={Math.min(toSvgX(root, bounds) + 10, 590)} y={Math.max(toSvgY(0, bounds) - 10, 50)}>
              ({formatNumber(root)}, 0)
            </text>
          </g>
        ))}
        {visibleVertex && <circle className="quadratic-vertex-point" cx={vertex.x} cy={vertex.y} r="6" />}
        {visibleVertex && <text className="quadratic-label" x={Math.min(vertex.x + 12, 600)} y={Math.max(vertex.y - 10, 48)}>V({formatNumber(analysis.h)}, {formatNumber(analysis.k)})</text>}
        {hoverSvgPoint && isPointVisible(hoverPoint.x, hoverPoint.y, bounds) && (
          <g className="quadratic-hover-point">
            <line x1={hoverSvgPoint.x} y1={hoverSvgPoint.y} x2={hoverSvgPoint.x} y2={xAxis} />
            <circle cx={hoverSvgPoint.x} cy={hoverSvgPoint.y} r="5" />
            <text x={Math.min(hoverSvgPoint.x + 12, 540)} y={Math.max(hoverSvgPoint.y - 14, 50)}>
              ({formatPreciseNumber(hoverPoint.x)}, {formatPreciseNumber(hoverPoint.y)})
            </text>
          </g>
        )}
        <text className="quadratic-label symmetry-label" x={Math.min(vertex.x + 8, 590)} y="62">x={formatNumber(analysis.h)}</text>
        <text className="quadratic-axis-label" x="676" y={xAxis - 6}>x</text>
        <text className="quadratic-axis-label" x={yAxis + 8} y="34">y</text>
      </svg>
    </div>
  );
}

function parseQuadraticExpression(input, mode) {
  const expression = sanitizeQuadraticInput(input).replace(/^f\(x\)=/, "").replace(/\s+/g, "");
  if (!expression) throw new Error("Escribe una funcion cuadratica.");
  if (mode === "vertex" || /\([^()]+\)\^2/.test(expression)) return parseVertexForm(expression);
  const terms = parseLinearTerms(expression);
  const a = terms.find((term) => term.variable === "x" && term.power === 2)?.coefficient ?? 0;
  const b = terms.find((term) => term.variable === "x" && term.power === 1)?.coefficient ?? 0;
  const c = terms.find((term) => !term.variable || term.power === 0)?.coefficient ?? 0;
  if (!a) throw new Error("La forma general debe incluir un termino con x^2.");
  return { a, b, c };
}

function parseVertexForm(expression) {
  const match = expression.match(/^([+-]?(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?)\((x[+-]\d+(?:\.\d+)?)\)\^2([+-]\d+(?:\.\d+)?)?$/);
  if (!match) throw new Error("Usa forma vertice como 2(x+1)^2-8 o -(x-3)^2+4.");
  const a = parseCoefficient(match[1], true);
  const inside = match[2].replace("x", "");
  const h = -Number(inside);
  const k = Number(match[3] ?? 0);
  return { a, b: -2 * a * h, c: a * h * h + k };
}

function parseCoefficients(coefficients) {
  return {
    a: parseRequiredNumber(coefficients.a, "a"),
    b: parseRequiredNumber(coefficients.b || "0", "b"),
    c: parseRequiredNumber(coefficients.c || "0", "c"),
  };
}

function rootsFor(a, b, c, discriminant) {
  if (discriminant < -1e-10) return [];
  if (Math.abs(discriminant) < 1e-10) return [-b / (2 * a)];
  return [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
}

function sampleGraphPoints({ a, b, c, h, roots }, visibleMinX, visibleMaxX) {
  const candidates = [h - 4, h + 4, 0, h, ...roots];
  const minX = visibleMinX ?? Math.min(...candidates) - 1;
  const maxX = visibleMaxX ?? Math.max(...candidates) + 1;
  return Array.from({ length: 180 }, (_, index) => {
    const x = minX + ((maxX - minX) * index) / 179;
    return { x, y: evaluateQuadratic(a, b, c, x) };
  });
}

function graphBounds(points, analysis) {
  const xs = points.map((point) => point.x);
  const ys = [...points.map((point) => point.y), 0, analysis.k, analysis.yIntercept];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const yPadding = Math.max(1, (maxY - minY) * 0.12);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: minY - yPadding,
    maxY: maxY + yPadding,
  };
}

function toSvgX(x, bounds) {
  return 48 + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * 624;
}

function toSvgY(y, bounds) {
  return 384 - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * 348;
}

function fromSvgX(svgX, bounds) {
  return bounds.minX + ((svgX - 48) / 624) * (bounds.maxX - bounds.minX);
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

function isPointVisible(x, y, bounds) {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function evaluateQuadratic(a, b, c, x) {
  return a * x * x + b * x + c;
}

function sanitizeQuadraticInput(value) {
  return sanitizeAlgebraInput(value).replace(/[^0-9a-z+\-*/^().=\s]/g, "");
}

function sanitizeNumberInput(value) {
  return value.replaceAll("−", "-").split("").filter((char) => /[0-9+\-./]/.test(char)).join("");
}

function parseRequiredNumber(value, label) {
  if (!String(value).trim()) throw new Error(`Escribe el coeficiente ${label}.`);
  return parseCoefficient(value, false);
}

function parseCoefficient(value, allowImplicit) {
  if (!value || value === "+") return allowImplicit ? 1 : 0;
  if (value === "-") return -1;
  if (value.includes("/")) {
    const [numerator, denominator] = value.split("/").map(Number);
    if (!denominator) throw new Error("La fraccion no puede tener denominador cero.");
    return numerator / denominator;
  }
  const number = Number(value);
  if (Number.isNaN(number)) throw new Error(`No pude leer el numero "${value}".`);
  return number;
}

function formatNumber(value) {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function formatPreciseNumber(value) {
  const rounded = Number(Number(value).toFixed(6));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
