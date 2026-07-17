import { useMemo, useRef, useState } from "react";
import { LatexBlock } from "./latexReader";
import { parseLinearTerms, polynomialToLatex, sanitizeAlgebraInput, simplifyPolynomial, termToLatex } from "./AlgebraOperationsTool";
import { ToolMetaTags } from "./ToolMetaTags";

export function FactorizationToolModal({ onClose }) {
  const [mode, setMode] = useState("auto");
  const [expression, setExpression] = useState("6x + 12");
  const expressionRef = useRef(null);
  const result = useMemo(() => factorExpression(expression, mode), [expression, mode]);

  function updateExpressionInput(event) {
    const input = event.target;
    const rawValue = input.value;
    const cursor = input.selectionStart ?? rawValue.length;
    const beforeCursor = rawValue.slice(0, cursor);
    const nextExpression = sanitizeAlgebraInput(rawValue);
    const nextCursor = sanitizeAlgebraInput(beforeCursor).length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => input.setSelectionRange(nextCursor, nextCursor));
  }

  function insertSymbol(symbol) {
    const input = expressionRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const nextExpression = sanitizeAlgebraInput(`${expression.slice(0, start)}${symbol}${expression.slice(end)}`);
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
            <h2>Factorizacion</h2>
            <ToolMetaTags topic="Factor comun, agrupacion y trinomios" />
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="truth-tool-layout algebra-tool-layout">
          <form className="truth-tool-form algebra-tool-form">
            <label>
              Que vas a factorizar
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="auto">Detectar automaticamente</option>
                <option value="common-factor">Factor comun</option>
                <option value="grouping">Factorizacion por agrupacion</option>
                <option value="perfect-square">Trinomio cuadrado perfecto</option>
                <option value="difference-squares">Diferencia de cuadrados</option>
                <option value="quadratic">Trinomio de segundo grado</option>
              </select>
            </label>
            <label>
              Expresion
              <textarea
                ref={expressionRef}
                value={expression}
                onChange={updateExpressionInput}
                rows={4}
                placeholder="Ej: 6x + 12"
              />
            </label>
            <div className="truth-operator-row algebra-operator-row" aria-label="Simbolos disponibles">
              {["+", "-", "^", "/", "(", ")", "x", "a", "b"].map((symbol) => (
                <button type="button" key={symbol} onClick={() => insertSymbol(symbol)}>{symbol}</button>
              ))}
            </div>
            <p className="truth-tool-hint">Acepta polinomios simples con letras, exponentes, enteros, decimales y fracciones.</p>
            <button className="secondary-action truth-clear-button" type="button" onClick={() => setExpression("")} disabled={!expression}>
              Borrar expresion
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

function factorExpression(input, requestedMode) {
  const expression = sanitizeAlgebraInput(input).replace(/\s+/g, "");
  if (!expression) return { error: "Escribe una expresion para factorizar." };
  try {
    const terms = parsePolynomial(expression);
    const mode = requestedMode === "auto" ? detectFactorizationMode(terms) : requestedMode;
    if (mode === "common-factor") return factorCommon(terms);
    if (mode === "grouping") return factorByGrouping(terms);
    if (mode === "perfect-square") return factorPerfectSquare(terms);
    if (mode === "difference-squares") return factorDifferenceSquares(terms);
    if (mode === "quadratic") return factorQuadratic(terms);
    return { error: "No pude detectar el metodo. Prueba con factor comun, diferencia de cuadrados o un trinomio cuadratico." };
  } catch (error) {
    return { error: error?.message ?? "No se pudo factorizar la expresion." };
  }
}

function detectFactorizationMode(terms) {
  if (terms.length === 4) return "grouping";
  if (isPerfectSquareTrinomial(terms)) return "perfect-square";
  if (isDifferenceSquares(terms)) return "difference-squares";
  if (terms.length === 3 && terms.some((term) => term.power === 2)) return "quadratic";
  return "common-factor";
}

function factorCommon(terms) {
  const factor = commonFactor(terms);
  if (Math.abs(factor.coefficient) === 1 && factor.power === 0) throw new Error("No encontre un factor comun distinto de 1.");
  const inside = terms.map((term) => ({
    coefficient: term.coefficient / factor.coefficient,
    variable: term.variable,
    power: term.power - factor.power,
  }));
  return {
    kind: "Factor comun",
    answer: `${termToLatex(factor)}(${polynomialToLatex(inside)})`,
    latexAnswer: `${polynomialToLatex(terms)}=${termToLatex(factor)}(${polynomialToLatex(inside)})`,
    steps: [
      { title: "Buscamos el mayor factor comun", lines: [`MFC=${termToLatex(factor)}`] },
      { title: "Dividimos cada termino entre el factor comun", lines: inside.map((term, index) => `${termToLatex(terms[index])}\\div ${termToLatex(factor)}=${termToLatex(term)}`) },
      { title: "Escribimos como producto", lines: [`${termToLatex(factor)}(${polynomialToLatex(inside)})`] },
    ],
  };
}

function factorByGrouping(terms) {
  if (terms.length !== 4) throw new Error("La agrupacion necesita cuatro terminos.");
  const firstGroup = terms.slice(0, 2);
  const secondGroup = terms.slice(2, 4);
  const firstFactor = commonFactor(firstGroup);
  const secondFactor = commonFactor(secondGroup);
  const firstInside = firstGroup.map((term) => divideTerm(term, firstFactor));
  const secondInside = secondGroup.map((term) => divideTerm(term, secondFactor));
  if (polynomialToLatex(firstInside) !== polynomialToLatex(secondInside)) throw new Error("No se formo un binomio comun al agrupar.");
  return {
    kind: "Factorizacion por agrupacion",
    answer: `(${polynomialToLatex(firstInside)})(${termToLatex(firstFactor)}+${termToLatex(secondFactor)})`.replaceAll("+-", "-"),
    latexAnswer: `${polynomialToLatex(terms)}=(${polynomialToLatex(firstInside)})(${termToLatex(firstFactor)}+${termToLatex(secondFactor)})`.replaceAll("+-", "-"),
    steps: [
      { title: "Agrupamos de dos en dos", lines: [`(${polynomialToLatex(firstGroup)})+(${polynomialToLatex(secondGroup)})`] },
      { title: "Sacamos factor comun en cada grupo", lines: [`${termToLatex(firstFactor)}(${polynomialToLatex(firstInside)})+${termToLatex(secondFactor)}(${polynomialToLatex(secondInside)})`.replaceAll("+-", "-")] },
      { title: "Sacamos el binomio comun", lines: [`(${polynomialToLatex(firstInside)})(${termToLatex(firstFactor)}+${termToLatex(secondFactor)})`.replaceAll("+-", "-")] },
    ],
  };
}

function factorPerfectSquare(terms) {
  if (!isPerfectSquareTrinomial(terms)) throw new Error("No parece un trinomio cuadrado perfecto.");
  const ordered = orderByPower(terms);
  const firstRoot = sqrtTerm(ordered[0]);
  const lastRoot = sqrtTerm(ordered[2]);
  const sign = ordered[1].coefficient < 0 ? "-" : "+";
  return {
    kind: "Trinomio cuadrado perfecto",
    answer: `(${termToLatex(firstRoot)}${sign}${termToLatex(lastRoot)})^2`,
    latexAnswer: `${polynomialToLatex(terms)}=(${termToLatex(firstRoot)}${sign}${termToLatex(lastRoot)})^2`,
    steps: [
      { title: "Reconocemos la forma", lines: ["A^2+2AB+B^2=(A+B)^2"] },
      {
        title: "Verificamos que los extremos sean cuadrados perfectos",
        lines: [
          `${termToLatex(ordered[0])}=(${termToLatex(firstRoot)})^2`,
          `${termToLatex(ordered[2])}=(${termToLatex(lastRoot)})^2`,
        ],
      },
      { title: "Calculamos las raices de los extremos", lines: [`A=${termToLatex(firstRoot)},\\quad B=${termToLatex(lastRoot)}`] },
      { title: "Verificamos el termino central", lines: [`2AB=2(${termToLatex(firstRoot)})(${termToLatex(lastRoot)})=${termToLatex({ ...ordered[1], coefficient: Math.abs(ordered[1].coefficient) })}`] },
      { title: "Escribimos el cuadrado", lines: [`(${termToLatex(firstRoot)}${sign}${termToLatex(lastRoot)})^2`] },
    ],
  };
}

function factorDifferenceSquares(terms) {
  if (!isDifferenceSquares(terms)) throw new Error("La forma debe ser A^2-B^2.");
  const ordered = orderByPower(terms);
  const firstRoot = sqrtTerm(ordered[0]);
  const secondRoot = sqrtTerm({ ...ordered[1], coefficient: Math.abs(ordered[1].coefficient) });
  return {
    kind: "Diferencia de cuadrados",
    answer: `(${termToLatex(firstRoot)}-${termToLatex(secondRoot)})(${termToLatex(firstRoot)}+${termToLatex(secondRoot)})`,
    latexAnswer: `${polynomialToLatex(terms)}=(${termToLatex(firstRoot)}-${termToLatex(secondRoot)})(${termToLatex(firstRoot)}+${termToLatex(secondRoot)})`,
    steps: [
      { title: "Usamos la formula", lines: ["A^2-B^2=(A-B)(A+B)"] },
      {
        title: "Verificamos que sea una diferencia de cuadrados",
        lines: [
          `${termToLatex(ordered[0])}=(${termToLatex(firstRoot)})^2`,
          `${termToLatex({ ...ordered[1], coefficient: Math.abs(ordered[1].coefficient) })}=(${termToLatex(secondRoot)})^2`,
        ],
      },
      { title: "Identificamos A y B", lines: [`A=${termToLatex(firstRoot)},\\quad B=${termToLatex(secondRoot)}`] },
      { title: "Sustituimos en (A-B)(A+B)", lines: [`(${termToLatex(firstRoot)}-${termToLatex(secondRoot)})(${termToLatex(firstRoot)}+${termToLatex(secondRoot)})`] },
      { title: "Comprobamos el producto", lines: [`(${termToLatex(firstRoot)})^2-(${termToLatex(secondRoot)})^2=${polynomialToLatex(terms)}`] },
    ],
  };
}

function factorQuadratic(terms) {
  const ordered = orderByPower(terms);
  const a = ordered.find((term) => term.power === 2)?.coefficient ?? 0;
  const b = ordered.find((term) => term.power === 1)?.coefficient ?? 0;
  const c = ordered.find((term) => term.power === 0)?.coefficient ?? 0;
  if (a !== 1) throw new Error("Por ahora el trinomio de segundo grado soporta coeficiente principal 1.");
  const pair = integerPairForSumProduct(b, c);
  if (!pair) throw new Error("No encontre dos numeros enteros que multipliquen c y sumen b.");
  return {
    kind: "Trinomio de segundo grado",
    answer: `(x${signedNumber(pair[0])})(x${signedNumber(pair[1])})`,
    latexAnswer: `${polynomialToLatex(terms)}=(x${signedNumber(pair[0])})(x${signedNumber(pair[1])})`,
    steps: [
      { title: "Buscamos dos numeros", lines: [`m\\cdot n=${c},\\quad m+n=${b}`] },
      { title: "Encontramos la pareja", lines: [`m=${pair[0]},\\quad n=${pair[1]}`] },
      { title: "Armamos los factores", lines: [`(x${signedNumber(pair[0])})(x${signedNumber(pair[1])})`] },
    ],
  };
}

function parsePolynomial(expression) {
  return simplifyPolynomial(parseLinearTerms(expression));
}

function commonFactor(terms) {
  const sign = terms[0]?.coefficient < 0 ? -1 : 1;
  const coefficient = sign * terms.map((term) => Math.abs(term.coefficient)).reduce((current, value) => gcd(current, value));
  const variableTerms = terms.filter((term) => term.variable);
  const sameVariable = variableTerms.length === terms.length && variableTerms.every((term) => term.variable === variableTerms[0].variable);
  const power = sameVariable ? Math.min(...variableTerms.map((term) => term.power)) : 0;
  return { coefficient, variable: sameVariable && power > 0 ? variableTerms[0].variable : "", power };
}

function divideTerm(term, factor) {
  return { coefficient: term.coefficient / factor.coefficient, variable: term.variable, power: term.power - factor.power };
}

function orderByPower(terms) {
  return [...terms].sort((a, b) => b.power - a.power);
}

function isPerfectSquareTrinomial(terms) {
  if (terms.length !== 3) return false;
  const ordered = orderByPower(terms);
  if (ordered[0].power !== 2 || ordered[2].power !== 0) return false;
  const firstRoot = sqrtTerm(ordered[0]);
  const lastRoot = sqrtTerm(ordered[2]);
  return Math.abs(Math.abs(ordered[1].coefficient) - Math.abs(2 * firstRoot.coefficient * lastRoot.coefficient)) < 1e-10;
}

function isDifferenceSquares(terms) {
  if (terms.length !== 2) return false;
  const ordered = orderByPower(terms);
  return ordered[0].coefficient > 0 && ordered[1].coefficient < 0 && isPerfectSquareNumber(ordered[0].coefficient) && isPerfectSquareNumber(Math.abs(ordered[1].coefficient));
}

function sqrtTerm(term) {
  if (!isPerfectSquareNumber(Math.abs(term.coefficient))) throw new Error("Un extremo no tiene raiz exacta.");
  return { coefficient: Math.sqrt(Math.abs(term.coefficient)), variable: term.variable, power: term.power / 2 };
}

function isPerfectSquareNumber(value) {
  const root = Math.sqrt(value);
  return Math.abs(root - Math.round(root)) < 1e-10;
}

function integerPairForSumProduct(sum, product) {
  const limit = Math.max(20, Math.abs(product) + Math.abs(sum) + 4);
  for (let left = -limit; left <= limit; left += 1) {
    for (let right = -limit; right <= limit; right += 1) {
      if (left * right === product && left + right === sum) return [left, right];
    }
  }
  return null;
}

function signedNumber(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function gcd(left, right) {
  const a = Math.round(Math.abs(left) * 1000000);
  const b = Math.round(Math.abs(right) * 1000000);
  return gcdInteger(a, b) / 1000000;
}

function gcdInteger(left, right) {
  return right === 0 ? left : gcdInteger(right, left % right);
}
