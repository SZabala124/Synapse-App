import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { SchedulePlanner } from "../../src/views/QuarterView";
import "../../styles.css";

function Fixture() {
  const [calls, setCalls] = useState(0);
  const [subjects, setSubjects] = useState([{ code: "A", name: "Materia A" }, { code: "B", name: "Materia B" }]);
  const [blocks, setBlocks] = useState([{ courseCode: "A", day: 0, block: 1 }, { courseCode: "B", day: 1, block: 2 }]);
  const [settings, setSettings] = useState([{ courseCode: "A", color: "#ba624b", classroom: "A-1" }, { courseCode: "B", color: "#4d79a8", classroom: "B-1" }]);
  return <main style={{ padding: 20 }}>
    <output data-testid="clear-calls">{calls}</output>
    <button onClick={() => { setSubjects((items) => items.filter((item) => item.code !== "A")); setBlocks((items) => items.filter((item) => item.courseCode !== "A")); setSettings((items) => items.filter((item) => item.courseCode !== "A")); }}>Retirar materia A</button>
    <SchedulePlanner subjects={subjects} scheduleBlocks={blocks} scheduleSubjects={settings} onSave={async () => true} onClear={async () => {
      setCalls((value) => value + 1);
      setBlocks([]);
      setSettings([]);
      return true;
    }} />
  </main>;
}

createRoot(document.getElementById("root")).render(<Fixture />);
