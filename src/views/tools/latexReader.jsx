export function LatexBlock({ title, lines }) {
  return (
    <section className="latex-block">
      <h4>{title}</h4>
      {lines.map((line, index) => (
        <div className="latex-line" key={`${line}-${index}`}>
          <LatexReader value={line} />
        </div>
      ))}
    </section>
  );
}

function LatexReader({ value }) {
  return <span className="latex-reader">{renderReadableLatex(value)}</span>;
}

function renderReadableLatex(value) {
  const cleanValue = value
    .replaceAll("\\left", "")
    .replaceAll("\\right", "")
    .replaceAll("\\cdot", "·")
    .replaceAll("\\div", "÷")
    .replaceAll("\\Rightarrow", "⇒")
    .replaceAll("\\Delta", "Δ")
    .replaceAll("\\infty", "∞")
    .replaceAll("\\mathbb{R}", "ℝ")
    .replaceAll("\\leq", "≤")
    .replaceAll("\\le", "≤")
    .replaceAll("\\geq", "≥")
    .replaceAll("\\ge", "≥")
    .replaceAll("\\to", "→")
    .replaceAll("\\cup", "∪")
    .replaceAll("\\quad", "   ")
    .replaceAll("\\,", " ");
  const parts = [];
  let index = 0;

  while (index < cleanValue.length) {
    if (cleanValue.startsWith("\\frac", index)) {
      const numerator = readBraceContent(cleanValue, index + 5);
      const denominator = numerator ? readBraceContent(cleanValue, numerator.end) : null;
      if (numerator && denominator) {
        parts.push(
          <span className="latex-fraction" key={`frac-${index}`}>
            <span className="latex-fraction-top">{renderReadableLatex(numerator.content)}</span>
            <span className="latex-fraction-bottom">{renderReadableLatex(denominator.content)}</span>
          </span>,
        );
        index = denominator.end;
        continue;
      }
    }
    if (cleanValue.startsWith("\\sqrt", index)) {
      const radicand = readBraceContent(cleanValue, index + 5);
      if (radicand) {
        parts.push(
          <span className="latex-root" key={`sqrt-${index}`}>
            <span className="latex-root-symbol">√</span>
            <span className="latex-root-radicand">{renderReadableLatex(radicand.content)}</span>
          </span>,
        );
        index = radicand.end;
        continue;
      }
    }
    if (cleanValue.startsWith("\\text", index)) {
      const text = readBraceContent(cleanValue, index + 5);
      if (text) {
        parts.push(<span className="latex-text" key={`text-${index}`}>{text.content}</span>);
        index = text.end;
        continue;
      }
    }
    const powerMatch = cleanValue.slice(index).match(/^\^\{([^}]+)\}/);
    if (powerMatch) {
      parts.push(<sup key={`sup-${index}`}>{powerMatch[1]}</sup>);
      index += powerMatch[0].length;
      continue;
    }
    const singlePowerMatch = cleanValue.slice(index).match(/^\^([0-9a-zA-Z]+)/);
    if (singlePowerMatch) {
      parts.push(<sup key={`sup-${index}`}>{singlePowerMatch[1]}</sup>);
      index += singlePowerMatch[0].length;
      continue;
    }
    const subscriptMatch = cleanValue.slice(index).match(/^_\{([^}]+)\}/);
    if (subscriptMatch) {
      parts.push(<sub key={`sub-${index}`}>{renderReadableLatex(subscriptMatch[1])}</sub>);
      index += subscriptMatch[0].length;
      continue;
    }
    const singleSubscriptMatch = cleanValue.slice(index).match(/^_([0-9a-zA-Z]+)/);
    if (singleSubscriptMatch) {
      parts.push(<sub key={`sub-${index}`}>{singleSubscriptMatch[1]}</sub>);
      index += singleSubscriptMatch[0].length;
      continue;
    }
    const char = cleanValue[index];
    if (char === "\\" || char === "{" || char === "}") {
      index += 1;
      continue;
    }
    if ((char === "-" || char === "+") && isUnarySign(cleanValue, index)) {
      parts.push(<span className="latex-sign" key={`sign-${index}`}>{char}</span>);
      index += 1;
      continue;
    }
    if ("≤≥⇒→∪".includes(char)) {
      parts.push(<span className="latex-operator latex-wide-operator" key={`op-${index}`}>{char}</span>);
    } else if (char === ",") {
      parts.push(<span className="latex-comma" key={`comma-${index}`}>{char}</span>);
    } else if ("=+-·÷<>".includes(char)) {
      parts.push(<span className="latex-operator" key={`op-${index}`}>{char}</span>);
    } else {
      parts.push(char);
    }
    index += 1;
  }

  return parts;
}

function isUnarySign(value, signIndex) {
  const previous = previousMeaningfulChar(value, signIndex);
  return !previous || "(,[=+-·÷⇒→<>≤≥".includes(previous);
}

function previousMeaningfulChar(value, beforeIndex) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (!/\s/.test(value[index])) return value[index];
  }
  return "";
}

function readBraceContent(value, startIndex) {
  if (value[startIndex] !== "{") return null;
  let depth = 0;
  for (let index = startIndex; index < value.length; index += 1) {
    if (value[index] === "{") depth += 1;
    if (value[index] === "}") depth -= 1;
    if (depth === 0) {
      return {
        content: value.slice(startIndex + 1, index),
        end: index + 1,
      };
    }
  }
  return null;
}
