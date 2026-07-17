import { useMemo, useRef, useState } from "react";
import { ToolMetaTags } from "./ToolMetaTags";

export function TruthTableModal({ onClose }) {
  const [variableCount, setVariableCount] = useState(2);
  const [expression, setExpression] = useState("(q ∧ p) → (q ↔ p)");
  const expressionRef = useRef(null);
  const variables = ["p", "q", "r", "s"].slice(0, variableCount);
  const result = useMemo(() => buildTruthTable(expression, variables), [expression, variables]);

  function updateExpressionInput(event) {
    const input = event.target;
    const rawValue = input.value;
    const cursor = input.selectionStart ?? rawValue.length;
    const beforeCursor = rawValue.slice(0, cursor);
    const nextExpression = sanitizeLogicInput(rawValue, variables);
    const nextCursor = sanitizeLogicInput(beforeCursor, variables).length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => input.setSelectionRange(nextCursor, nextCursor));
  }

  function updateVariableCount(nextVariableCount) {
    const nextVariables = ["p", "q", "r", "s"].slice(0, nextVariableCount);
    setVariableCount(nextVariableCount);
    setExpression((current) => sanitizeLogicInput(current, nextVariables));
  }

  function insertOperator(operator) {
    const input = expressionRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? expression.length;
    const nextExpression = `${expression.slice(0, start)}${operator}${expression.slice(end)}`;
    const nextCursor = start + operator.length;
    setExpression(nextExpression);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <div className="course-detail-overlay is-visible" role="dialog" aria-modal="true">
      <section className="course-detail-modal truth-tool-modal">
        <header>
          <div>
            <h2>Tabla de verdad de proposiciones</h2>
            <ToolMetaTags topic="Proposiciones Logicas y Tablas de la Verdad" />
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Cerrar</button>
        </header>

        <div className="truth-tool-layout">
          <form className="truth-tool-form">
            <label>
              Variables
              <select value={variableCount} onChange={(event) => updateVariableCount(Number(event.target.value))}>
                <option value={2}>2 variables: p, q</option>
                <option value={3}>3 variables: p, q, r</option>
                <option value={4}>4 variables: p, q, r, s</option>
              </select>
            </label>
            <label>
              Proposicion
              <textarea
                ref={expressionRef}
                value={expression}
                onChange={updateExpressionInput}
                rows={4}
                placeholder="Ej: (q ∧ p) → (q ↔ p)"
              />
            </label>
            <div className="truth-operator-row" aria-label="Operadores disponibles">
              {["¬", "∧", "∨", "→", "↔", "(", ")"].map((operator) => (
                <button type="button" key={operator} onClick={() => insertOperator(operator)}>{operator}</button>
              ))}
            </div>
            <p className="truth-tool-hint">Tambien puedes escribir !, ~, &, ^, | o v como atajos. Usa solo las variables seleccionadas.</p>
            <button className="secondary-action truth-clear-button" type="button" onClick={() => setExpression("")} disabled={!expression}>
              Borrar proposicion
            </button>
          </form>

          <section className="truth-result-panel" aria-live="polite">
            {result.error ? (
              <p className="auth-error">{result.error}</p>
            ) : (
              <>
                <div className="truth-summary">
                  <span>Filas: {result.rows.length}</span>
                  <span>Columnas: {result.columns.length}</span>
                  <strong>{result.classification}</strong>
                </div>
                <div className="truth-table-scroll" tabIndex="0">
                  <table className="truth-table">
                    <thead>
                      <tr>
                        <th className="truth-row-number-head">#</th>
                        {result.columns.map((column) => <th key={column.key}>{column.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, rowIndex) => (
                        <tr key={row.key}>
                          <th className="truth-row-number" scope="row">{rowIndex + 1}</th>
                          {result.columns.map((column) => (
                            <td className={row.values[column.key] ? "is-true" : "is-false"} key={column.key}>
                              {row.values[column.key] ? "V" : "F"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="truth-conclusion">{result.conclusion}</p>
              </>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function buildTruthTable(input, variables) {
  try {
    const tokens = tokenizeLogic(input);
    if (tokens.length === 0) return { error: "Escribe una proposicion para generar la tabla." };
    const parser = createLogicParser(tokens);
    const ast = parser.parseExpression();
    if (parser.peek()) return { error: `No se pudo interpretar "${parser.peek().value}".` };
    const usedVariables = Array.from(collectVariables(ast));
    const invalidVariable = usedVariables.find((variable) => !variables.includes(variable));
    if (invalidVariable) return { error: `La variable "${invalidVariable}" no esta entre las variables seleccionadas.` };
    if (usedVariables.length < 2) return { error: "Usa al menos dos variables en la proposicion." };

    const expressionColumns = collectExpressionColumns(ast);
    const columns = [
      ...variables.map((variable) => ({ key: variable, label: variable })),
      ...expressionColumns.map((node, index) => ({ key: `expr-${index}`, label: formatExpression(node), node })),
    ];
    const rows = buildAssignments(variables).map((assignment, index) => {
      const values = Object.fromEntries(variables.map((variable) => [variable, assignment[variable]]));
      expressionColumns.forEach((node, nodeIndex) => {
        values[`expr-${nodeIndex}`] = evaluateAst(node, assignment);
      });
      return { key: `row-${index}`, values };
    });
    const finalKey = columns[columns.length - 1].key;
    const finalValues = rows.map((row) => row.values[finalKey]);
    const allTrue = finalValues.every(Boolean);
    const allFalse = finalValues.every((value) => !value);
    return {
      columns,
      rows,
      classification: allTrue ? "Tautologia" : allFalse ? "Contradiccion" : "Contingencia",
      conclusion: allTrue
        ? "Como la proposicion final es verdadera en todos los casos, se concluye que es una tautologia."
        : allFalse
          ? "Como la proposicion final es falsa en todos los casos, se concluye que es una contradiccion."
          : "Como la proposicion final cambia de valor segun el caso, se concluye que es una contingencia.",
    };
  } catch (error) {
    return { error: error?.message ?? "No se pudo calcular la tabla de verdad." };
  }
}

function normalizeLogicSymbols(value) {
  return value.replaceAll("<->", "↔").replaceAll("->", "→");
}

function sanitizeLogicInput(value, variables) {
  const allowedVariables = new Set(variables);
  let cleanValue = "";
  for (const char of normalizeLogicSymbols(value)) {
    const lowerChar = char.toLowerCase();
    if (allowedVariables.has(lowerChar)) cleanValue += lowerChar;
    else if (/\s/.test(char) || "()¬∧∨→↔!~&^|".includes(char)) cleanValue += char;
    else if (lowerChar === "v") cleanValue += "v";
  }
  return cleanValue;
}

function tokenizeLogic(input) {
  const tokens = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[pqrs]/i.test(char)) {
      tokens.push({ type: "variable", value: char.toLowerCase() });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }
    const three = input.slice(index, index + 3);
    const two = input.slice(index, index + 2);
    if (three === "<->") {
      tokens.push({ type: "operator", value: "iff" });
      index += 3;
      continue;
    }
    if (two === "->") {
      tokens.push({ type: "operator", value: "implies" });
      index += 2;
      continue;
    }
    if (char === "↔") tokens.push({ type: "operator", value: "iff" });
    else if (char === "→") tokens.push({ type: "operator", value: "implies" });
    else if (char === "∧" || char === "&" || char === "^") tokens.push({ type: "operator", value: "and" });
    else if (char === "∨" || char === "|" || char.toLowerCase() === "v") tokens.push({ type: "operator", value: "or" });
    else if (char === "¬" || char === "!" || char === "~") tokens.push({ type: "operator", value: "not" });
    else throw new Error(`Simbolo no reconocido: "${char}".`);
    index += 1;
  }
  return tokens;
}

function createLogicParser(tokens) {
  let position = 0;
  const api = { peek: () => tokens[position], consume: () => tokens[position++], parseExpression: () => parseIff() };
  function parseIff() {
    let node = parseImplies();
    while (api.peek()?.value === "iff") {
      api.consume();
      node = { type: "iff", left: node, right: parseImplies() };
    }
    return node;
  }
  function parseImplies() {
    let node = parseOr();
    while (api.peek()?.value === "implies") {
      api.consume();
      node = { type: "implies", left: node, right: parseOr() };
    }
    return node;
  }
  function parseOr() {
    let node = parseAnd();
    while (api.peek()?.value === "or") {
      api.consume();
      node = { type: "or", left: node, right: parseAnd() };
    }
    return node;
  }
  function parseAnd() {
    let node = parseNot();
    while (api.peek()?.value === "and") {
      api.consume();
      node = { type: "and", left: node, right: parseNot() };
    }
    return node;
  }
  function parseNot() {
    if (api.peek()?.value === "not") {
      api.consume();
      return { type: "not", child: parseNot() };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const token = api.consume();
    if (!token) throw new Error("La proposicion esta incompleta.");
    if (token.type === "variable") return { type: "variable", name: token.value };
    if (token.type === "(") {
      const node = api.parseExpression();
      if (api.peek()?.type !== ")") throw new Error("Falta cerrar un parentesis.");
      api.consume();
      return node;
    }
    throw new Error(`No se esperaba "${token.value}".`);
  }
  return api;
}

function collectVariables(node, variables = new Set()) {
  if (node.type === "variable") variables.add(node.name);
  if (node.child) collectVariables(node.child, variables);
  if (node.left) collectVariables(node.left, variables);
  if (node.right) collectVariables(node.right, variables);
  return variables;
}

function collectExpressionColumns(ast) {
  const columns = [];
  const seen = new Set();
  function visit(node) {
    if (node.type === "variable") return;
    if (node.child) visit(node.child);
    if (node.left) visit(node.left);
    if (node.right) visit(node.right);
    const label = formatExpression(node);
    if (!seen.has(label)) {
      seen.add(label);
      columns.push(node);
    }
  }
  visit(ast);
  return columns;
}

function evaluateAst(node, values) {
  if (node.type === "variable") return values[node.name];
  if (node.type === "not") return !evaluateAst(node.child, values);
  if (node.type === "and") return evaluateAst(node.left, values) && evaluateAst(node.right, values);
  if (node.type === "or") return evaluateAst(node.left, values) || evaluateAst(node.right, values);
  if (node.type === "implies") return !evaluateAst(node.left, values) || evaluateAst(node.right, values);
  if (node.type === "iff") return evaluateAst(node.left, values) === evaluateAst(node.right, values);
  return false;
}

function formatExpression(node) {
  if (node.type === "variable") return node.name;
  if (node.type === "not") return `¬${formatChild(node.child)}`;
  const operators = { and: "∧", or: "∨", implies: "→", iff: "↔" };
  return `${formatChild(node.left)} ${operators[node.type]} ${formatChild(node.right)}`;
}

function formatChild(node) {
  return node.type === "variable" || node.type === "not" ? formatExpression(node) : `(${formatExpression(node)})`;
}

function buildAssignments(variables) {
  return Array.from({ length: 2 ** variables.length }, (_, rowIndex) => {
    const values = {};
    variables.forEach((variable, variableIndex) => {
      values[variable] = ((rowIndex >> (variables.length - variableIndex - 1)) & 1) === 0;
    });
    return values;
  });
}
