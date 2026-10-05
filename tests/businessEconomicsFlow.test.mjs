import test from "node:test";
import assert from "node:assert/strict";
import { flowPrograms, sharedCourseInstances } from "../convex/flowData.js";

const program = flowPrograms.find(({ id }) => id === "economia-empresarial");

test("Business Economics curriculum has twelve periods with five courses each", () => {
  assert.ok(program);
  assert.equal(program.name, "Economía Empresarial");
  assert.deepEqual(program.periodLabels, ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);
  assert.deepEqual(program.periods.map((period) => period.length), Array(12).fill(5));
  assert.equal(program.periods.flat().length, 60);
});

test("Business Economics curriculum keeps the chart's course codes and prerequisite chains", () => {
  const courses = program.periods.flat();
  const byCodeAndName = new Map(courses.map((course) => [`${course.code}:${course.name}`, course]));

  for (const [code, name] of [
    ["BPTAK30", "Principios de Economía"],
    ["FBTAK01", "Elaboración de Reportes Empresariales"],
    ["BPTMA21", "Estadística I (Economía Empresarial)"],
    ["BPTMA22", "Estadística II (Economía Empresarial)"],
    ["FPTAK28", "Herramientas Tecnológicas I"],
    ["FPTAK29", "Herramientas Tecnológicas II"],
    ["FPTBC05", "Bootcamp de Analítica de Datos"],
  ]) {
    assert.ok(byCodeAndName.has(`${code}:${name}`), `Missing chart course ${code} ${name}`);
  }

  assert.equal(byCodeAndName.get("FPTAK01:Microeconomía II").prereq, "BPTAK01+FBTMA02");
  assert.equal(byCodeAndName.get("BPTMA22:Estadística II (Economía Empresarial)").prereq, "BPTMA21");
  assert.equal(byCodeAndName.get("BPTGP83:Taller de Trabajo de Grado").prereq, "135 créditos");
  assert.equal(byCodeAndName.get("FPTAK06:Economía Internacional II").prereq, "FPTAK05");
});

test("Economics statistics stay separate while shared foundational courses inherit status", () => {
  const courses = program.periods.flat();
  const statistics = courses.filter(({ name }) => name.includes("Estadística") && name.includes("Economía Empresarial"));
  assert.equal(statistics.length, 2);

  for (const course of statistics) {
    assert.deepEqual(sharedCourseInstances({ ...course, career: program.id })
      .map(({ career }) => career), [program.id]);
  }

  for (const [name, career, code] of [
    ["Matemática Básica", "sistemas", "FBTMM01"],
    ["Inglés IV", "idiomas", "FBTLI14"],
    ["Investigación y Sustentabilidad", "idiomas", "FBTHE05"],
    ["Competencias para Emprender", "psicologia", "FBTEM01"],
    ["Ideas Emprendedoras", "psicologia", "FBTEM02"],
    ["Mundo Global: Tendencias y Transformaciones", "idiomas", "FBTEP02"],
    ["Venezuela: Identidad y Contexto", "idiomas", "FBTHE11"],
  ]) {
    const course = courses.find((item) => item.name === name);
    assert.ok(course, `Missing shared course ${name}`);
    assert.ok(sharedCourseInstances({ ...course, career: program.id })
      .some((instance) => instance.career === career && instance.code === code), `Not shared: ${name}`);
  }
});

test("the three professional seminars share their generic code but keep independent statuses", () => {
  const seminars = program.periods[8].filter(({ code }) => code === "FPSXXXX");

  assert.deepEqual(seminars.map(({ name }) => name), [
    "Seminario Profesional I",
    "Seminario Profesional II",
    "Seminario Profesional III",
  ]);
  for (const seminar of seminars) {
    const instances = sharedCourseInstances({ ...seminar, career: program.id });
    assert.equal(instances.length, 1);
    assert.equal(instances[0].name, seminar.name);
  }
});
