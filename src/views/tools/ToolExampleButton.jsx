import { useState } from "react";

export function ToolExampleButton({ examples, onLoad }) {
  const [lastIndex, setLastIndex] = useState(-1);
  const [loadedLabel, setLoadedLabel] = useState("");

  function generateExample() {
    const availableIndexes = examples.map((_, index) => index).filter((index) => index !== lastIndex);
    const nextIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    const example = examples[nextIndex];
    setLastIndex(nextIndex);
    setLoadedLabel(example.label);
    onLoad(example);
  }

  return (
    <div className="tool-example-control">
      <button className="secondary-action" type="button" onClick={generateExample}>
        Generar ejemplo de prueba
      </button>
      {loadedLabel && <small aria-live="polite">Ejemplo cargado: {loadedLabel}</small>}
    </div>
  );
}
