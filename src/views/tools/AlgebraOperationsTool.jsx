import { useMemo, useRef, useState } from "react";
import { LatexBlock } from "./latexReader";
import { ToolMetaTags } from "./ToolMetaTags";

export function AlgebraToolModal({ onClose }) {
  const [mode, setMode] = useState("auto");
  const [expression, setExpression] = useState("(4x - 5)(4x - 2)");
  const expressionRef = useRef(null);
  const result = useMemo(() => solveAlgebraExpression(expression, mode), [expression, mode]);

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

  function preventInvalidAlgebraInput(event) {
    if (event.inputType?.startsWith("delete") || !event.data) return;
    if (!sanitizeAlgebraInput(event.data)) event.preventDefault();
  }

  function insertAlgebraSymbol(symbol) {
    const input = expressionRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const nextExpression = sanitizeAlgebraInput(`${expression.slice(0, start)}${symbol}${expression.slice(end)}`);
    const nextCursor = start + symbol.length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal truth-tool-modal algebra-tool-modal">
        <header>
          <div>
            <h2>Operaciones algebraicas</h2>
            <ToolMetaTags topic="Distributiva y Productos Notables" />
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="truth-tool-layout algebra-tool-layout">
          <form className="truth-tool-form algebra-tool-form">
            <label>
              Que vas a escribir
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="auto">Detectar automaticamente</option>
                <option value="distributive">Distributiva: a(b + c)</option>
                <option value="binomial-product">Producto de binomios: (a + b)(c + d)</option>
                <option value="square">Cuadrado de binomio: (a ± b)^2</option>
                <option value="difference-squares">Suma por diferencia: (a - b)(a + b)</option>
              </select>
            </label>
            <label>
              Expresion
              <textarea
                ref={expressionRef}
                value={expression}
                onBeforeInput={preventInvalidAlgebraInput}
                onChange={updateExpressionInput}
                rows={4}
                placeholder="Ej: (4x - 5)(4x - 2)"
              />
            </label>
            <div className="truth-operator-row algebra-operator-row" aria-label="Simbolos algebraicos disponibles">
              {["+", "-", "×", "^", "/", "(", ")", "[", "]", "{", "}", "x", "a", "b"].map((symbol) => (
                <button type="button" key={symbol} onClick={() => insertAlgebraSymbol(symbol)}>{symbol}</button>
              ))}
            </div>
            <p className="truth-tool-hint">Puedes escribir numeros enteros, decimales, fracciones, letras, signos, potencias y agrupadores.</p>
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

export function sanitizeAlgebraInput(value) {
  return value
    .replaceAll("−", "-")
    .replaceAll("·", "*")
    .replaceAll("×", "*")
    .split("")
    .filter((char) => /[0-9a-zA-Z+\-*/^().,[\]{}\s]/.test(char))
    .join("")
    .replace(/[A-Z]/g, (char) => char.toLowerCase());
}

export function solveAlgebraExpression(input, requestedMode) {
  const expression = sanitizeAlgebraInput(input).replace(/\s+/g, "");
  if (!expression) return { error: "Escribe una expresion algebraica para resolver." };
  try {
    const mode = requestedMode === "auto" ? detectAlgebraMode(expression) : requestedMode;
    if (mode === "distributive") return solveDistributive(expression);
    if (mode === "binomial-product") return solveBinomialProduct(expression);
    if (mode === "square") return solveBinomialSquare(expression);
    if (mode === "difference-squares") return solveDifferenceSquares(expression);
    return { error: "No pude detectar el tipo de operacion. Prueba con a(b+c), (a+b)(c+d), (a+b)^2 o (a-b)(a+b)." };
  } catch (error) {
    return { error: error?.message ?? "No se pudo resolver la expresion." };
  }
}

function detectAlgebraMode(expression) {
  if (/\)\^2$/.test(expression)) return "square";
  const groups = expression.match(/\([^()]+\)/g) ?? [];
  if (groups.length === 2 && isDifferenceSquaresExpression(groups)) return "difference-squares";
  if (groups.length === 2) return "binomial-product";
  if (/^[+-]?(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?[a-z]?\([^()]+\)$/.test(expression)) return "distributive";
  return "unknown";
}

function solveDistributive(expression) {
  const match = expression.match(/^(.+?)\(([^()]+)\)$/);
  if (!match) throw new Error("Para distributiva usa una forma como 3(x+4).");
  const factor = parseAlgebraTerm(match[1]);
  const insideTerms = parseLinearTerms(match[2]);
  if (insideTerms.length !== 2) throw new Error("La distributiva acepta dos terminos dentro del parentesis.");
  const products = insideTerms.map((term) => multiplyTerms(factor, term));
  const simplified = simplifyPolynomial(products);
  return {
    kind: "Distributiva",
    answer: polynomialToLatex(simplified),
    latexAnswer: `${termToLatex(factor)}(${linearTermsToLatex(insideTerms)})=${polynomialToLatex(simplified)}`,
    steps: [
      { title: "Identificamos la propiedad", lines: ["a(b+c)=ab+ac"] },
      { title: "Multiplicamos el factor por cada termino", lines: [`${factorToLatex(factor)}\\cdot ${factorToLatex(insideTerms[0])}+${factorToLatex(factor)}\\cdot ${factorToLatex(insideTerms[1])}`] },
      { title: "Calculamos y simplificamos", lines: [`${products.map(termToLatex).join("+").replaceAll("+-", "-")}=${polynomialToLatex(simplified)}`] },
    ],
  };
}

function solveBinomialProduct(expression) {
  const groups = expression.match(/\(([^()]+)\)/g);
  if (!groups || groups.length !== 2) throw new Error("Usa una forma como (4x-5)(4x-2).");
  const leftTerms = parseLinearTerms(groups[0].slice(1, -1));
  const rightTerms = parseLinearTerms(groups[1].slice(1, -1));
  const products = [
    multiplyTerms(leftTerms[0], rightTerms[0]),
    multiplyTerms(leftTerms[0], rightTerms[1]),
    multiplyTerms(leftTerms[1], rightTerms[0]),
    multiplyTerms(leftTerms[1], rightTerms[1]),
  ];
  const simplified = simplifyPolynomial(products);
  return {
    kind: "Producto de binomios",
    answer: polynomialToLatex(simplified),
    latexAnswer: `(${linearTermsToLatex(leftTerms)})(${linearTermsToLatex(rightTerms)})=${polynomialToLatex(simplified)}`,
    steps: [
      { title: "Aplicamos la distributiva doble", lines: ["(a+b)(c+d)=ac+ad+bc+bd"] },
      { title: "Multiplicamos termino por termino", lines: [`${factorToLatex(leftTerms[0])}\\cdot ${factorToLatex(rightTerms[0])}+${factorToLatex(leftTerms[0])}\\cdot ${factorToLatex(rightTerms[1])}+${factorToLatex(leftTerms[1])}\\cdot ${factorToLatex(rightTerms[0])}+${factorToLatex(leftTerms[1])}\\cdot ${factorToLatex(rightTerms[1])}`] },
      { title: "Reducimos terminos semejantes", lines: [`${products.map(termToLatex).join("+").replaceAll("+-", "-")}=${polynomialToLatex(simplified)}`] },
    ],
  };
}

function solveBinomialSquare(expression) {
  const match = expression.match(/^\(([^()]+)\)\^2$/);
  if (!match) throw new Error("Usa una forma como (x+7)^2.");
  const terms = parseLinearTerms(match[1]);
  const firstSquare = multiplyTerms(terms[0], terms[0]);
  const baseProduct = multiplyTerms(terms[0], terms[1]);
  const doubleProduct = { ...baseProduct, coefficient: baseProduct.coefficient * 2 };
  const secondSquare = multiplyTerms(terms[1], terms[1]);
  const simplified = simplifyPolynomial([firstSquare, doubleProduct, secondSquare]);
  const positiveSecondTerm = absoluteTerm(terms[1]);
  const middleSign = terms[1].coefficient < 0 ? "-" : "+";
  return {
    kind: "Producto notable",
    answer: polynomialToLatex(simplified),
    latexAnswer: `(${linearTermsToLatex(terms)})^2=${polynomialToLatex(simplified)}`,
    steps: [
      { title: "Usamos el cuadrado de un binomio", lines: [terms[1].coefficient < 0 ? "(A-B)^2=A^2-2AB+B^2" : "(A+B)^2=A^2+2AB+B^2"] },
      { title: "Sustituimos A y B", lines: [`A=${termToLatex(terms[0])},\\quad B=${termToLatex(positiveSecondTerm)}`] },
      { title: "Escribimos la formula con esos valores", lines: [`(${linearTermsToLatex(terms)})^2=(${termToLatex(terms[0])})^2${middleSign}2(${termToLatex(terms[0])})(${termToLatex(positiveSecondTerm)})+(${termToLatex(positiveSecondTerm)})^2`] },
      { title: "Calculamos cada parte por separado", lines: [`(${termToLatex(terms[0])})^2=${termToLatex(firstSquare)}`, `2(${termToLatex(terms[0])})(${termToLatex(positiveSecondTerm)})=${termToLatex({ ...doubleProduct, coefficient: Math.abs(doubleProduct.coefficient) })}`, `(${termToLatex(positiveSecondTerm)})^2=${termToLatex(secondSquare)}`] },
      { title: "Juntamos los resultados", lines: [`${termToLatex(firstSquare)}+${termToLatex(doubleProduct)}+${termToLatex(secondSquare)}`.replaceAll("+-", "-")] },
      { title: "Ordenamos de mayor a menor grado", lines: [polynomialToLatex(simplified)] },
    ],
  };
}

function solveDifferenceSquares(expression) {
  const groups = expression.match(/\(([^()]+)\)/g);
  if (!groups || groups.length !== 2 || !isDifferenceSquaresExpression(groups)) throw new Error("Usa una forma como (x-7)(x+7).");
  const leftTerms = parseLinearTerms(groups[0].slice(1, -1));
  const rightTerms = parseLinearTerms(groups[1].slice(1, -1));
  const firstSquare = multiplyTerms(leftTerms[0], leftTerms[0]);
  const secondSquare = multiplyTerms(leftTerms[1], leftTerms[1]);
  const simplified = simplifyPolynomial([firstSquare, { ...secondSquare, coefficient: -Math.abs(secondSquare.coefficient) }]);
  return {
    kind: "Suma por diferencia",
    answer: polynomialToLatex(simplified),
    latexAnswer: `(${linearTermsToLatex(leftTerms)})(${linearTermsToLatex(rightTerms)})=${polynomialToLatex(simplified)}`,
    steps: [
      { title: "Usamos el producto notable", lines: ["(A-B)(A+B)=A^2-B^2"] },
      { title: "Elevamos cada termino al cuadrado", lines: [`(${termToLatex(leftTerms[0])})^2-(${termToLatex(absoluteTerm(leftTerms[1]))})^2`] },
      { title: "Resultado simplificado", lines: [polynomialToLatex(simplified)] },
    ],
  };
}

export function parseLinearTerms(expression) {
  const normalized = expression.replace(/^\+/, "").replace(/-/g, "+-");
  return normalized.split("+").filter(Boolean).map(parseAlgebraTerm);
}

export function parseAlgebraTerm(value) {
  const cleanValue = value.replace(/[{}\[\]]/g, "").replace(/\*/g, "");
  const match = cleanValue.match(/^([+-]?(?:(?:\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?)?)([a-z]+)?(?:\^(\d+))?$/i);
  if (!match) throw new Error(`No pude leer el termino "${value}".`);
  const variable = match[2]?.toLowerCase() ?? "";
  const coefficient = parseCoefficient(match[1], variable);
  const power = variable ? Number(match[3] ?? 1) : 0;
  return { coefficient, variable, power };
}

function parseCoefficient(value, variable) {
  if (!value || value === "+") return variable ? 1 : 0;
  if (value === "-") return -1;
  if (value.includes("/")) {
    const [numerator, denominator] = value.split("/").map(Number);
    if (!denominator) throw new Error("La fraccion no puede tener denominador cero.");
    return numerator / denominator;
  }
  return Number(value);
}

export function multiplyTerms(left, right) {
  const variable = multiplyVariableParts(left, right);
  return { coefficient: left.coefficient * right.coefficient, variable: variable.name, power: variable.power };
}

export function simplifyPolynomial(terms) {
  const grouped = new Map();
  for (const term of terms) {
    const key = `${term.variable || ""}:${term.power}`;
    grouped.set(key, (grouped.get(key) ?? 0) + term.coefficient);
  }
  return Array.from(grouped.entries())
    .map(([key, coefficient]) => {
      const [variable, power] = key.split(":");
      return { coefficient, variable, power: Number(power) };
    })
    .filter((term) => Math.abs(term.coefficient) > 1e-10)
    .sort((a, b) => b.power - a.power || a.variable.localeCompare(b.variable));
}

function multiplyVariableParts(left, right) {
  if (!left.variable) return { name: right.variable || "", power: right.power ?? 0 };
  if (!right.variable) return { name: left.variable, power: left.power ?? 0 };
  if (left.variable === right.variable) return { name: left.variable, power: (left.power ?? 0) + (right.power ?? 0) };
  return { name: `${variableWithPower(left.variable, left.power)}${variableWithPower(right.variable, right.power)}`, power: 1 };
}

function variableWithPower(variable, power) {
  return power > 1 ? `${variable}^{${power}}` : variable;
}

function isDifferenceSquaresExpression(groups) {
  const left = parseLinearTerms(groups[0].slice(1, -1));
  const right = parseLinearTerms(groups[1].slice(1, -1));
  return left.length === 2 && right.length === 2
    && sameTermAbs(left[0], right[0])
    && sameTermAbs(left[1], right[1])
    && left[0].coefficient === right[0].coefficient
    && left[1].coefficient === -right[1].coefficient;
}

function sameTermAbs(left, right) {
  return left.variable === right.variable && left.power === right.power && Math.abs(left.coefficient) === Math.abs(right.coefficient);
}

export function termToLatex(term) {
  const coefficient = roundNumber(term.coefficient);
  const absCoefficient = Math.abs(coefficient);
  const sign = coefficient < 0 ? "-" : "";
  if (!term.variable || term.power === 0) return `${coefficient}`;
  const coefficientText = absCoefficient === 1 ? "" : `${absCoefficient}`;
  const powerText = term.power === 1 ? "" : `^{${term.power}}`;
  return `${sign}${coefficientText}${term.variable}${powerText}`;
}

export function polynomialToLatex(terms) {
  if (!terms.length) return "0";
  return terms.map(termToLatex).join("+").replaceAll("+-", "-");
}

function factorToLatex(term) {
  const text = termToLatex(term);
  return term.coefficient < 0 ? `(${text})` : text;
}

function absoluteTerm(term) {
  return { ...term, coefficient: Math.abs(term.coefficient) };
}

function linearTermsToLatex(terms) {
  return terms.map(termToLatex).join("+").replaceAll("+-", "-");
}

function roundNumber(value) {
  return Number(Number(value).toFixed(8));
}
