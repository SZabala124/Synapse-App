import { useMemo, useRef, useState } from "react";
import { LatexBlock } from "./latexReader";
import { ToolMetaTags } from "./ToolMetaTags";

export function RationalizationToolModal({ onClose }) {
  const [mode, setMode] = useState("auto");
  const [expression, setExpression] = useState("3/sqrt(2)");
  const expressionRef = useRef(null);
  const result = useMemo(() => rationalizeExpression(expression, mode), [expression, mode]);

  function updateExpressionInput(event) {
    const input = event.target;
    const rawValue = input.value;
    const cursor = input.selectionStart ?? rawValue.length;
    const beforeCursor = rawValue.slice(0, cursor);
    const nextExpression = sanitizeRationalInput(rawValue);
    const nextCursor = sanitizeRationalInput(beforeCursor).length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => input.setSelectionRange(nextCursor, nextCursor));
  }

  function insertSymbol(symbol) {
    const input = expressionRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const nextExpression = sanitizeRationalInput(`${expression.slice(0, start)}${symbol}${expression.slice(end)}`);
    setExpression(nextExpression);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + symbol.length, start + symbol.length);
    });
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal truth-tool-modal algebra-tool-modal">
        <header>
          <div>
            <h2>Racionalizacion</h2>
            <ToolMetaTags topic="Radicales y conjugados" />
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="truth-tool-layout algebra-tool-layout">
          <form className="truth-tool-form algebra-tool-form">
            <label>
              Que vas a racionalizar
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="auto">Detectar automaticamente</option>
                <option value="single-radical">Denominador con una raiz</option>
                <option value="conjugate">Denominador con conjugado</option>
                <option value="two-radicals">Dos radicales</option>
              </select>
            </label>
            <label>
              Fraccion
              <textarea
                ref={expressionRef}
                value={expression}
                onChange={updateExpressionInput}
                rows={4}
                placeholder="Ej: 3/sqrt(2)"
              />
            </label>
            <div className="truth-operator-row algebra-operator-row" aria-label="Simbolos disponibles">
              {["+", "-", "/", "(", ")", "sqrt(", "2", "3", "5"].map((symbol) => (
                <button type="button" key={symbol} onClick={() => insertSymbol(symbol)}>{symbol}</button>
              ))}
            </div>
            <p className="truth-tool-hint">Escribe raices como sqrt(2). Ejemplos: 3/sqrt(2), 1/(2+sqrt(3)), (sqrt(3)-sqrt(2))/(sqrt(3)+sqrt(2)).</p>
            <button className="secondary-action truth-clear-button" type="button" onClick={() => setExpression("")} disabled={!expression}>
              Borrar fraccion
            </button>
          </form>

          <section className="truth-result-panel algebra-result-panel" aria-live="polite">
            {result.error ? (
              <p className="auth-error">{result.error}</p>
            ) : (
              <>
                <div className="truth-summary">
                  <span>{result.kind}</span>
                  <strong>{result.answer}</strong>
                </div>
                <LatexBlock title="Resultado" lines={[result.latexAnswer]} />
                <div className="algebra-steps">
                  <h3>Explicacion paso a paso</h3>
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

function rationalizeExpression(input, requestedMode) {
  const expression = sanitizeRationalInput(input).replace(/\s+/g, "");
  if (!expression) return { error: "Escribe una fraccion para racionalizar." };
  try {
    const fraction = splitTopLevelFraction(expression);
    if (!fraction) throw new Error("Usa una fraccion con /, por ejemplo 3/sqrt(2).");
    const mode = requestedMode === "auto" ? detectRationalMode(fraction.denominator) : requestedMode;
    if (mode === "single-radical") return rationalizeSingleRadical(fraction);
    if (mode === "conjugate") return rationalizeConjugate(fraction);
    if (mode === "two-radicals") return rationalizeConjugate(fraction, "Racionalizacion con dos radicales");
    return { error: "No pude detectar el tipo de racionalizacion." };
  } catch (error) {
    return { error: error?.message ?? "No se pudo racionalizar la fraccion." };
  }
}

function detectRationalMode(denominator) {
  const terms = parseRadicalSum(stripOuterParens(denominator));
  if (terms.length === 1 && terms[0].radicand) return "single-radical";
  if (terms.length === 2 && terms.some((term) => term.radicand)) {
    return terms.every((term) => term.radicand) ? "two-radicals" : "conjugate";
  }
  return "unknown";
}

function rationalizeSingleRadical(fraction) {
  const denominatorTerm = parseRadicalTerm(stripOuterParens(fraction.denominator));
  if (!denominatorTerm.radicand) throw new Error("El denominador debe ser una sola raiz.");
  const numerator = stripOuterParens(fraction.numerator);
  const radical = radicalToLatex(denominatorTerm);
  const denominatorProduct = denominatorTerm.coefficient * denominatorTerm.coefficient * denominatorTerm.radicand;
  const numeratorProducts = multiplySumByRadical(numerator, denominatorTerm);
  const finalNumerator = termsToLatex(numeratorProducts);
  return {
    kind: "Denominador con una raiz",
    answer: `${finalNumerator}/${denominatorProduct}`,
    latexAnswer: `\\frac{${finalNumerator}}{${denominatorProduct}}`,
    steps: [
      { title: "Identificamos la raiz en el denominador", lines: [`\\frac{${textToLatex(numerator)}}{${radical}}`] },
      { title: "Multiplicamos por la misma raiz arriba y abajo", lines: [`\\frac{${textToLatex(numerator)}}{${radical}}\\cdot\\frac{${radical}}{${radical}}`] },
      { title: "Distribuimos la raiz en el numerador", lines: [`(${textToLatex(numerator)})(${radical})=${finalNumerator}`] },
      { title: "El denominador queda sin radical", lines: [`${radical}\\cdot ${radical}=${denominatorProduct}`] },
      { title: "Resultado racionalizado", lines: [`\\frac{${finalNumerator}}{${denominatorProduct}}`] },
    ],
  };
}

function rationalizeConjugate(fraction, kind = "Denominador con conjugado") {
  const numerator = stripOuterParens(fraction.numerator);
  const denominatorTerms = parseRadicalSum(stripOuterParens(fraction.denominator));
  if (denominatorTerms.length !== 2) throw new Error("El denominador debe tener dos terminos.");
  const conjugateTerms = [denominatorTerms[0], { ...denominatorTerms[1], coefficient: -denominatorTerms[1].coefficient }];
  const denominatorLatex = termsToLatex(denominatorTerms);
  const conjugateLatex = termsToLatex(conjugateTerms);
  const denominatorResult = differenceOfSquares(denominatorTerms);
  const numeratorResult = `(${textToLatex(numerator)})(${conjugateLatex})`;
  return {
    kind,
    answer: `${numeratorResult}/${denominatorResult}`,
    latexAnswer: `\\frac{${numeratorResult}}{${denominatorResult}}`,
    steps: [
      { title: "Identificamos el conjugado", lines: [`\\text{Conjugado de } ${denominatorLatex}\\text{ es } ${conjugateLatex}`] },
      { title: "Multiplicamos arriba y abajo por el conjugado", lines: [`\\frac{${textToLatex(numerator)}}{${denominatorLatex}}\\cdot\\frac{${conjugateLatex}}{${conjugateLatex}}`] },
      { title: "Aplicamos suma por diferencia en el denominador", lines: [`(${denominatorLatex})(${conjugateLatex})=${denominatorResult}`] },
      { title: "Resultado racionalizado", lines: [`\\frac{${numeratorResult}}{${denominatorResult}}`] },
    ],
  };
}

function sanitizeRationalInput(value) {
  return value
    .replaceAll("√", "sqrt")
    .split("")
    .filter((char) => /[0-9a-zA-Z+\-*/^().,\s]/.test(char))
    .join("");
}

function splitTopLevelFraction(expression) {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "/" && depth === 0) {
      return { numerator: expression.slice(0, index), denominator: expression.slice(index + 1) };
    }
  }
  return null;
}

function stripOuterParens(value) {
  if (value.startsWith("(") && value.endsWith(")")) return value.slice(1, -1);
  return value;
}

function parseRadicalSum(expression) {
  const normalized = expression.replace(/^\+/, "").replace(/-/g, "+-");
  return normalized.split("+").filter(Boolean).map(parseRadicalTerm);
}

function parseRadicalTerm(value) {
  const match = value.match(/^([+-]?\d*)?sqrt\((\d+)\)$/);
  if (match) {
    const coefficient = match[1] === "-" ? -1 : Number(match[1] || 1);
    return { coefficient, radicand: Number(match[2]) };
  }
  return { coefficient: Number(value), radicand: null };
}

function radicalToLatex(term) {
  const coefficient = Math.abs(term.coefficient) === 1 ? "" : Math.abs(term.coefficient);
  const sign = term.coefficient < 0 ? "-" : "";
  return `${sign}${coefficient}\\sqrt{${term.radicand}}`;
}

function termsToLatex(terms) {
  return terms.map((term) => (term.radicand ? radicalToLatex(term) : String(term.coefficient))).join("+").replaceAll("+-", "-");
}

function differenceOfSquares(terms) {
  const left = squareTermValue(terms[0]);
  const right = squareTermValue(terms[1]);
  return `${left - right}`;
}

function squareTermValue(term) {
  return term.radicand ? term.coefficient * term.coefficient * term.radicand : term.coefficient * term.coefficient;
}

function multiplySumByRadical(text, radicalTerm) {
  return parseRadicalSum(stripOuterParens(text)).map((term) => multiplyRadicalTerms(term, radicalTerm));
}

function multiplyRadicalTerms(left, right) {
  if (!left.radicand && !right.radicand) return { coefficient: left.coefficient * right.coefficient, radicand: null };
  if (!left.radicand) return { coefficient: left.coefficient * right.coefficient, radicand: right.radicand };
  if (!right.radicand) return { coefficient: left.coefficient * right.coefficient, radicand: left.radicand };
  if (left.radicand === right.radicand) return { coefficient: left.coefficient * right.coefficient * left.radicand, radicand: null };
  return { coefficient: left.coefficient * right.coefficient, radicand: `${left.radicand}\\cdot ${right.radicand}` };
}

function textToLatex(value) {
  return value.replaceAll("sqrt(", "\\sqrt{").replaceAll(")", "}");
}
