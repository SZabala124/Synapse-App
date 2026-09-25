import { useMemo, useRef, useState } from "react";
import { LatexBlock } from "./latexReader";
import { ToolMetaTags } from "./ToolMetaTags";
import { ToolExampleButton } from "./ToolExampleButton";

const ALGEBRA_EXAMPLES = [
  { label: "distributiva", mode: "distributive", expression: "5(2x-3)" },
  { label: "producto de binomios", mode: "binomial-product", expression: "(x+4)(x-2)" },
  { label: "cuadrado de binomio", mode: "square", expression: "(2x+3)^2" },
  { label: "suma por diferencia", mode: "difference-squares", expression: "(x-5)(x+5)" },
];

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
              Qué vas a escribir
              <select value={mode} onChange={(event) => setMode(event.target.value)}>
                <option value="auto">Detectar automáticamente</option>
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
            <div className="truth-operator-row algebra-operator-row" aria-label="Símbolos algebraicos disponibles">
              {["+", "-", "×", "^", "/", "(", ")", "[", "]", "{", "}", "x", "a", "b"].map((symbol) => (
                <button type="button" key={symbol} onClick={() => insertAlgebraSymbol(symbol)}>{symbol}</button>
              ))}
            </div>
            <p className="truth-tool-hint">Puedes escribir números enteros, decimales, fracciones, letras, signos, potencias y agrupadores.</p>
            <ToolExampleButton
              examples={ALGEBRA_EXAMPLES}
              onLoad={(example) => {
                setMode(example.mode);
                setExpression(example.expression);
              }}
            />
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
    if (mode === "distributive" && isDistributiveForm(expression)) return solveDistributive(expression);
    if (mode === "binomial-product" && isBinomialProductForm(expression)) return solveBinomialProduct(expression);
    if (mode === "square" && isBinomialSquareForm(expression)) return solveBinomialSquare(expression);
    if (mode === "difference-squares" && isDifferenceSquaresForm(expression)) return solveDifferenceSquares(expression);
    return solveGeneralPolynomial(expression);
  } catch (error) {
    return { error: error?.message ?? "No se pudo resolver la expresion." };
  }
}

function detectAlgebraMode(expression) {
  if (isBinomialSquareForm(expression)) return "square";
  if (isDifferenceSquaresForm(expression)) return "difference-squares";
  if (isBinomialProductForm(expression)) return "binomial-product";
  if (isDistributiveForm(expression)) return "distributive";
  return "unknown";
}

function isDistributiveForm(expression) {
  const match = expression.match(/^([+-]?(?:(?:\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)?[a-z]+|\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?))\(([^()]+)\)$/);
  return Boolean(match && parseLinearTerms(match[2]).length === 2);
}

function isBinomialProductForm(expression) {
  const groups = expression.match(/\([^()]+\)/g) ?? [];
  return groups.length === 2 && groups.join("") === expression
    && groups.every((group) => parseLinearTerms(group.slice(1, -1)).length === 2);
}

function isBinomialSquareForm(expression) {
  const match = expression.match(/^\(([^()]+)\)\^2$/);
  return Boolean(match && parseLinearTerms(match[1]).length === 2);
}

function isDifferenceSquaresForm(expression) {
  const groups = expression.match(/\([^()]+\)/g) ?? [];
  return groups.length === 2 && groups.join("") === expression && isDifferenceSquaresExpression(groups);
}

function solveDistributive(expression) {
  const match = expression.match(/^(.+?)\(([^()]+)\)$/);
  if (!match) throw new Error("Para distributiva usa una forma como 3(x+4).");
  const factor = parseAlgebraTerm(match[1]);
  const insideTerms = parseLinearTerms(match[2]);
  if (insideTerms.length !== 2) throw new Error("La distributiva acepta dos términos dentro del paréntesis.");
  const products = insideTerms.map((term) => multiplyTerms(factor, term));
  const simplified = simplifyPolynomial(products);
  return {
    kind: "Distributiva",
    answer: polynomialToLatex(simplified),
    latexAnswer: `${termToLatex(factor)}(${linearTermsToLatex(insideTerms)})=${polynomialToLatex(simplified)}`,
    steps: [
      { title: "Identificamos la propiedad", lines: ["a(b+c)=ab+ac"] },
      { title: "Multiplicamos el factor por cada término", lines: [`${factorToLatex(factor)}\\cdot ${factorToLatex(insideTerms[0])}+${factorToLatex(factor)}\\cdot ${factorToLatex(insideTerms[1])}`] },
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
      { title: "Multiplicamos término por término", lines: [`${factorToLatex(leftTerms[0])}\\cdot ${factorToLatex(rightTerms[0])}+${factorToLatex(leftTerms[0])}\\cdot ${factorToLatex(rightTerms[1])}+${factorToLatex(leftTerms[1])}\\cdot ${factorToLatex(rightTerms[0])}+${factorToLatex(leftTerms[1])}\\cdot ${factorToLatex(rightTerms[1])}`] },
      { title: "Reducimos términos semejantes", lines: [`${products.map(termToLatex).join("+").replaceAll("+-", "-")}=${polynomialToLatex(simplified)}`] },
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
      { title: "Elevamos cada término al cuadrado", lines: [`(${termToLatex(leftTerms[0])})^2-(${termToLatex(absoluteTerm(leftTerms[1]))})^2`] },
      { title: "Resultado simplificado", lines: [polynomialToLatex(simplified)] },
    ],
  };
}

function solveGeneralPolynomial(expression) {
  const simplified = parsePolynomialExpression(expression);
  const detailedSteps = explainSquaredBinomialProduct(expression);
  return {
    kind: "Desarrollo algebraico",
    answer: polynomialToLatex(simplified),
    latexAnswer: `${expression}=${polynomialToLatex(simplified)}`,
    steps: detailedSteps ?? [
      { title: "Desarrollamos y agrupamos términos semejantes", lines: [`${expression}=${polynomialToLatex(simplified)}`] },
    ],
  };
}

function explainSquaredBinomialProduct(expression) {
  const bothSquared = expression.match(/^(\([^()]+\))\^2(\([^()]+\))\^2$/);
  if (bothSquared) return explainProductOfSquaredBinomials(expression, bothSquared);

  const rightSquared = expression.match(/^(\([^()]+\))(\([^()]+\))\^2$/);
  const leftSquared = expression.match(/^(\([^()]+\))\^2(\([^()]+\))$/);
  if (!rightSquared && !leftSquared) return null;

  const outerGroup = (rightSquared ?? leftSquared)[rightSquared ? 1 : 2];
  const squaredGroup = (rightSquared ?? leftSquared)[rightSquared ? 2 : 1];
  const outerTerms = parseLinearTerms(outerGroup.slice(1, -1));
  const squareTerms = parseLinearTerms(squaredGroup.slice(1, -1));
  if (outerTerms.length !== 2 || squareTerms.length !== 2) return null;

  const [a, b] = squareTerms;
  const bMagnitude = absoluteTerm(b);
  const middleSign = b.coefficient < 0 ? "-" : "+";
  const squareA = multiplyTerms(a, a);
  const productAB = multiplyTerms(a, b);
  const doubleProduct = { ...productAB, coefficient: 2 * productAB.coefficient };
  const squareB = multiplyTerms(b, b);
  const squareExpansion = [squareA, doubleProduct, squareB];
  const squarePolynomial = simplifyPolynomial(squareExpansion);
  const expandedBinomial = polynomialToLatex(squarePolynomial);
  const distributedProducts = outerTerms.flatMap((outerTerm) => squarePolynomial.map((innerTerm) => multiplyTerms(outerTerm, innerTerm)));
  const groupedProducts = polynomialToLatex(distributedProducts);
  const outerExpansion = outerTerms.map((outerTerm) => {
    const products = squarePolynomial.map((innerTerm) => multiplyTerms(outerTerm, innerTerm));
    return `${factorToLatex(outerTerm)}(${expandedBinomial})=${polynomialToLatex(products)}`;
  });

  return [
    {
      title: "Identificamos la estructura de la expresión",
      lines: [`(${linearTermsToLatex(outerTerms)})(${linearTermsToLatex(squareTerms)})^2`, "Primero desarrollamos el binomio que está elevado al cuadrado."],
    },
    {
      title: "Aplicamos la fórmula del cuadrado de un binomio",
      lines: [
        b.coefficient < 0 ? "(A-B)^2=A^2-2AB+B^2" : "(A+B)^2=A^2+2AB+B^2",
        `(${linearTermsToLatex(squareTerms)})^2=(${termToLatex(a)})^2${middleSign}2(${termToLatex(a)})(${termToLatex(bMagnitude)})+(${termToLatex(bMagnitude)})^2`,
      ],
    },
    {
      title: "Calculamos cada término del cuadrado",
      lines: [
        `${termToLatex(squareA)}+${termToLatex(doubleProduct)}+${termToLatex(squareB)}=${polynomialToLatex(squareExpansion)}`.replaceAll("+-", "-"),
        `(${linearTermsToLatex(squareTerms)})^2=${expandedBinomial}`,
      ],
    },
    {
      title: "Sustituimos el resultado en la expresión original",
      lines: [`(${linearTermsToLatex(outerTerms)})(${expandedBinomial})`],
    },
    {
      title: "Aplicamos la distributiva a cada término del primer binomio",
      lines: outerExpansion,
    },
    {
      title: "Sumamos los productos obtenidos",
      lines: [`${expression}=${groupedProducts}`],
    },
    {
      title: "Reducimos los términos semejantes",
      lines: [`${groupedProducts}=${polynomialToLatex(parsePolynomialExpression(expression))}`],
    },
  ];
}

function explainProductOfSquaredBinomials(expression, match) {
  const leftTerms = parseLinearTerms(match[1].slice(1, -1));
  const rightTerms = parseLinearTerms(match[2].slice(1, -1));
  if (leftTerms.length !== 2 || rightTerms.length !== 2) return null;

  const leftExpanded = expandBinomialSquare(leftTerms);
  const rightExpanded = expandBinomialSquare(rightTerms);
  const leftLatex = polynomialToLatex(leftExpanded);
  const rightLatex = polynomialToLatex(rightExpanded);
  const products = leftExpanded.flatMap((leftTerm) => rightExpanded.map((rightTerm) => multiplyTerms(leftTerm, rightTerm)));
  const rawProduct = polynomialToLatex(products);
  const rows = leftExpanded.map((leftTerm) => {
    const rowProducts = rightExpanded.map((rightTerm) => multiplyTerms(leftTerm, rightTerm));
    return `${factorToLatex(leftTerm)}(${rightLatex})=${polynomialToLatex(rowProducts)}`;
  });
  const finalResult = polynomialToLatex(parsePolynomialExpression(expression));

  return [
    {
      title: "Identificamos los dos binomios al cuadrado",
      lines: [`(${linearTermsToLatex(leftTerms)})^2(${linearTermsToLatex(rightTerms)})^2`, "Desarrollamos cada cuadrado por separado antes de multiplicar."],
    },
    {
      title: "Aplicamos la fórmula del cuadrado de un binomio",
      lines: [
        "(A+B)^2=A^2+2AB+B^2  y  (A-B)^2=A^2-2AB+B^2",
        `(${linearTermsToLatex(leftTerms)})^2=${squareBinomialFormulaLine(leftTerms)}`,
        `(${linearTermsToLatex(rightTerms)})^2=${squareBinomialFormulaLine(rightTerms)}`,
      ],
    },
    {
      title: "Calculamos cada cuadrado",
      lines: [`(${linearTermsToLatex(leftTerms)})^2=${leftLatex}`, `(${linearTermsToLatex(rightTerms)})^2=${rightLatex}`],
    },
    {
      title: "Sustituimos ambos resultados en la expresión original",
      lines: [`(${leftLatex})(${rightLatex})`],
    },
    {
      title: "Distribuimos cada término del primer trinomio",
      lines: rows,
    },
    {
      title: "Reunimos los nueve productos",
      lines: [`${expression}=${rawProduct}`],
    },
    {
      title: "Reducimos los términos semejantes",
      lines: [`${rawProduct}=${finalResult}`],
    },
  ];
}

function expandBinomialSquare(terms) {
  const [first, second] = terms;
  const firstSquare = multiplyTerms(first, first);
  const crossProduct = multiplyTerms(first, second);
  const middleTerm = { ...crossProduct, coefficient: crossProduct.coefficient * 2 };
  const secondSquare = multiplyTerms(second, second);
  return simplifyPolynomial([firstSquare, middleTerm, secondSquare]);
}

function squareBinomialFormulaLine(terms) {
  const [first, second] = terms;
  const secondMagnitude = absoluteTerm(second);
  const sign = second.coefficient < 0 ? "-" : "+";
  return `(${termToLatex(first)})^2${sign}2(${termToLatex(first)})(${termToLatex(secondMagnitude)})+(${termToLatex(secondMagnitude)})^2`;
}

function parsePolynomialExpression(expression) {
  const tokens = expression.match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?|[a-z]+|[()+\-*^]/g) ?? [];
  if (tokens.join("") !== expression) throw new Error("Revisa la expresión: hay un símbolo o una operación que no puedo interpretar.");
  let position = 0;

  function parseSum() {
    let result = parseProduct();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const sign = tokens[position++] === "-" ? -1 : 1;
      const next = parseProduct().map((term) => ({ ...term, coefficient: term.coefficient * sign }));
      result = simplifyPolynomial([...result, ...next]);
    }
    return result;
  }

  function parseProduct() {
    let result = parseUnary();
    while (position < tokens.length && tokens[position] !== ")" && tokens[position] !== "+" && tokens[position] !== "-") {
      if (tokens[position] === "*") position += 1;
      else if (!/^(?:\(|\d|[a-z])/.test(tokens[position] ?? "")) break;
      result = multiplyPolynomials(result, parseUnary());
    }
    return result;
  }

  function parseUnary() {
    if (tokens[position] === "+") {
      position += 1;
      return parseUnary();
    }
    if (tokens[position] === "-") {
      position += 1;
      return parseUnary().map((term) => ({ ...term, coefficient: -term.coefficient }));
    }
    let result = parsePrimary();
    if (tokens[position] === "^") {
      position += 1;
      const exponent = Number(tokens[position++]);
      if (!Number.isInteger(exponent) || exponent < 0 || exponent > 8) throw new Error("Usa exponentes enteros entre 0 y 8.");
      result = polynomialPower(result, exponent);
    }
    return result;
  }

  function parsePrimary() {
    const token = tokens[position++];
    if (!token) throw new Error("La expresión está incompleta.");
    if (token === "(") {
      const nested = parseSum();
      if (tokens[position++] !== ")") throw new Error("Falta cerrar un paréntesis.");
      return nested;
    }
    if (token === ")") throw new Error("Hay un paréntesis de cierre sin pareja.");
    if (!/^(?:\d|[a-z])/.test(token)) throw new Error(`No pude leer el término "${token}".`);
    return [parseAlgebraTerm(token)];
  }

  const result = parseSum();
  if (position < tokens.length) {
    if (tokens[position] === ")") throw new Error("Hay un paréntesis de cierre sin pareja.");
    throw new Error(`No pude interpretar "${tokens.slice(position).join("")}".`);
  }
  return simplifyPolynomial(result);
}

function multiplyPolynomials(left, right) {
  return simplifyPolynomial(left.flatMap((leftTerm) => right.map((rightTerm) => multiplyTerms(leftTerm, rightTerm))));
}

function polynomialPower(polynomial, exponent) {
  let result = [{ coefficient: 1, variable: "", power: 0 }];
  for (let count = 0; count < exponent; count += 1) result = multiplyPolynomials(result, polynomial);
  return result;
}

export function parseLinearTerms(expression) {
  const normalized = expression.replace(/^\+/, "").replace(/-/g, "+-");
  return normalized.split("+").filter(Boolean).map(parseAlgebraTerm);
}

export function parseAlgebraTerm(value) {
  const cleanValue = value.replace(/[{}\[\]]/g, "").replace(/\*/g, "");
  const match = cleanValue.match(/^([+-]?(?:(?:\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?)?)([a-z]+)?(?:\^(\d+))?$/i);
  if (!match) throw new Error(`No pude leer el término "${value}".`);
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
