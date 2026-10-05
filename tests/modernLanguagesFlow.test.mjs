import test from "node:test";
import assert from "node:assert/strict";
import { flowPrograms, sharedCourseInstances } from "../convex/flowData.js";

test("Modern Languages curriculum has eleven periods and a minors column", () => {
  const languages = flowPrograms.find((program) => program.id === "idiomas");

  assert.ok(languages);
  assert.equal(languages.name, "Idiomas Modernos");
  assert.deepEqual(languages.periodLabels, ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "Minors"]);
  assert.deepEqual(languages.periods.map((period) => period.length), Array(12).fill(5));
  assert.equal(languages.periods.flat().length, 60);
});

test("Modern Languages curriculum includes chart courses and codes", () => {
  const languages = flowPrograms.find((program) => program.id === "idiomas");
  const entries = new Set(languages.periods.flat().map(({ code, name }) => `${code} ${name}`));

  for (const entry of [
    "FBTLI03 Introducción a Idiomas",
    "FBTLI14 Inglés IV",
    "BPTLI22 Gramática del Inglés",
    "BPELI31/41 Francés I / Alemán I",
    "FBTPS04 Pensamiento Computacional",
    "FBTHE05 Investigación y Sustentabilidad",
    "FPTI51 Taller de Trabajo de Grado",
    "FGE Electiva V",
  ]) {
    assert.ok(entries.has(entry), `Missing chart entry: ${entry}`);
  }
});

test("common Modern Languages courses inherit status through shared names", () => {
  const languages = flowPrograms.find((program) => program.id === "idiomas");
  const course = languages.periods.flat().find(({ code }) => code === "FBTPS04");
  const shared = sharedCourseInstances(course);

  assert.ok(shared.some(({ career, name }) => career === "sistemas" && name === "Pensamiento Computacional"));
  assert.ok(shared.some(({ career, name }) => career === "psicologia" && name === "Pensamiento Computacional"));
});

test("Modern Languages reuses existing subjects when codes or punctuation differ", () => {
  const languages = flowPrograms.find((program) => program.id === "idiomas");
  const englishFour = languages.periods.flat().find(({ name }) => name === "Inglés IV");
  const sharedEnglish = sharedCourseInstances(englishFour);
  const venezuela = languages.periods.flat().find(({ code }) => code === "FBTHE11");
  const sharedVenezuela = sharedCourseInstances(venezuela);

  assert.ok(sharedEnglish.some(({ career, code }) => career === "sistemas" && code === "FBTLI13"));
  assert.ok(sharedVenezuela.some(({ career, name }) => career === "sistemas" && name === "Venezuela, Identidad y Contexto"));
});
