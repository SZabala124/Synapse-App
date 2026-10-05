import test from "node:test";
import assert from "node:assert/strict";
import { flowPrograms, sharedCourseInstances } from "../convex/flowData.js";

test("Psychology curriculum has 12 periods with five courses each", () => {
  const psychology = flowPrograms.find((program) => program.id === "psicologia");

  assert.ok(psychology);
  assert.equal(psychology.name, "Psicología");
  assert.equal(psychology.periods.length, 12);
  assert.deepEqual(psychology.periods.map((period) => period.length), Array(12).fill(5));
});

test("Psychology flow includes the codes and subjects from the provided chart", () => {
  const psychology = flowPrograms.find((program) => program.id === "psicologia");
  const courses = psychology.periods.flat();
  const entries = new Set(courses.map(({ code, name }) => `${code} ${name}`));

  for (const entry of [
    "FBTCC03 Introducción a la Psicología",
    "BPTCC08 Psicología del Desarrollo del Niño y Adolescente",
    "BPTMM30 Estadística I",
    "FPTCC13/FPTCC14 Práctica Profesional I",
    "FPTCC23/FPTCC24 Práctica Profesional II",
    "FPTCC29 Práctica Profesional III",
    "FPTCC30 Ética del Psicólogo",
    "FPSCC01 Seminario de Tendencias Actuales",
  ]) {
    assert.ok(entries.has(entry), `Missing chart entry: ${entry}`);
  }
  assert.equal(courses.length, 60);
});

test("Psychology shares the engineering code for Investigación y Sustentabilidad", () => {
  const psychology = flowPrograms.find((program) => program.id === "psicologia");
  const course = psychology.periods.flat().find(({ name }) => name === "Investigación y Sustentabilidad");

  assert.equal(course?.code, "FBTEC05");
});

test("Psychology preserves the chart's prerequisite chains and suggested markers", () => {
  const courses = flowPrograms.find((program) => program.id === "psicologia").periods.flat();
  const expected = {
    FBTMM07: "FBTMM04",
    BPTCC08: "BPTCC05 (S)", BPTCC03: "FBTCC03 (S)", BPTMM30: "FBTMM07 (S)",
    BPTCC12: "BPTCC08 (S)", BPTCC04: "BPTCC01 (S)", BPTCC06: "BPTCC03 (S)", BPTMM31: "BPTMM30 (S)",
    BPTCC10: "BPTCC12 (S)", BPTCC07: "BPTCC04 (S)", BPTMM32: "BPTMM31 (S)", BPTCC14: "BPTCC09 (S)",
    BPTCC15: "BPTCC10 (S)", BPTCC11: "BPTCC06 (S)", BPTCC13: "BPTMM32 (S)",
    FPTCC01: "BPTCC15", BPTCC24: "BPTCC11", BPTCC22: "BPTCC17", BPTCC18: "BPTCC13 (S)", FPTCC27: "BPTCC15",
    FPTCC03: "FPTCC01", BPTCC16: "FPTCC01", BPTCC21: "BPTCC17 + BPTMM32 (S)", BPTCC23: "BPTCC11",
    FPTCC07: "FPTCC03", BPTCC20: "BPTCC16", BPTCC19: "FPTCC04 (S)", FPTCC09: "FPTCC04", FPTCC08: "FPTCC05 (S)",
    FPTCC28: "FPTCC03", FPTCC32: "FPTCC03", FPTCC11: "FPTCC08 (S)", FPTCC31: "FPTCC03",
  };
  for (const [code, prereq] of Object.entries(expected)) {
    assert.equal(courses.find((course) => course.code === code)?.prereq, prereq, code);
  }
  // Keep the existing shared English identities; V requires IV, not itself.
  const englishIV = courses.find((course) => course.name === "Inglés IV");
  const englishV = courses.find((course) => course.name === "Inglés V");
  assert.equal(englishV.prereq, englishIV.code);
  for (const code of ["FBTCC03", "BPTCC05", "BPTCC01", "BPTCC17", "FPTCC04", "FPTCC02", "FPTCC05", "FPTCC06", "FGE"]) {
    assert.ok(courses.filter((course) => course.code === code).every((course) => !course.prereq), code);
  }
});

test("Psychology includes credit thresholds and all combined thesis requirements", () => {
  const courses = flowPrograms.find((program) => program.id === "psicologia").periods.flat();
  for (const [code, prereq] of Object.entries({
    "FPTCC13/FPTCC14": "135 créditos", "FPTCC23/FPTCC24": "135 créditos",
    FPTCC19: "BPTCC21 + BPTCC22 + 120 créditos", FPTCC30: "120 créditos",
    FPTCC29: "165 créditos", FPSCC01: "135 créditos",
  })) assert.equal(courses.find((course) => course.code === code)?.prereq, prereq, code);
});

test("shared course instances match normalized names across careers and codes", () => {
  const target = flowPrograms.find((program) => program.id === "psicologia").periods.flat()
    .find(({ code }) => code === "FBTEC05");
  const shared = sharedCourseInstances(target);

  assert.ok(shared.some(({ career, code }) => career === "sistemas" && code === "FBTEC05"));
  assert.ok(shared.some(({ career, code }) => career === "idiomas" && code === "FBTHE05"));
  assert.ok(shared.every(({ name }) => name === target.name));
});

test("generic electives do not share state across careers", () => {
  const target = flowPrograms.find((program) => program.id === "psicologia").periods.flat()
    .find(({ code, name }) => code === "FGE" && name === "Electiva 1");

  assert.deepEqual(sharedCourseInstances({ ...target, career: "psicologia" }).map(({ career }) => career), ["psicologia"]);
});
