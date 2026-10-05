import test from "node:test";
import assert from "node:assert/strict";
import { flowPrograms, sharedCourseInstances } from "../convex/flowData.js";

test("International Studies curriculum has twelve periods with five courses each", () => {
  const program = flowPrograms.find(({ id }) => id === "estudios-internacionales");

  assert.ok(program);
  assert.equal(program.name, "Estudios Internacionales");
  assert.deepEqual(program.periodLabels, ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);
  assert.deepEqual(program.periods.map((period) => period.length), Array(12).fill(5));
});

test("International Studies chart includes the pictured course codes and prerequisite chains", () => {
  const program = flowPrograms.find(({ id }) => id === "estudios-internacionales");
  const courses = program.periods.flat();
  const byCode = new Map(courses.map((course) => [course.code, course]));

  for (const [code, name] of [
    ["BPTEI03", "Teoría de Relaciones Internacionales I"],
    ["BPTEI04", "Teoría de Relaciones Internacionales II"],
    ["FPTEI15", "Organizaciones Internacionales"],
    ["BPTEJ00", "Derecho Internacional Público"],
    ["BPTEP08", "Metodología Cualitativa"],
    ["FPTEI28", "Retos y Amenazas Globales"],
  ]) {
    assert.equal(byCode.get(code)?.name, name, `Missing or mismatched course ${code}`);
  }

  assert.equal(byCode.get("BPTEI04").prereq, "BPTEI03");
  assert.equal(byCode.get("FPTEI14").prereq, "BPTEI04");
  assert.equal(byCode.get("FPTEI17").prereq, "FPTEI16");
  assert.equal(byCode.get("BPTHE20").prereq, "BPTHE19");

  assert.deepEqual(program.periods[9].map(({ code, name }) => `${code} ${name}`), [
    "FPTEI19 Política Comercial e Integración",
    "FPTEP23 Relaciones Internacionales de Latinoamérica y el Caribe",
    "FPSEIXX Seminario Regiones y Países I",
    "FPTEI24 Política Exterior II",
    "FGE Electiva FG1 3",
  ]);
  assert.deepEqual(program.periods[10].map(({ code, name }) => `${code} ${name}`), [
    "BPTEI25 Derecho Diplomático y Consular",
    "FPTEP07 Taller de Trabajo Final de Grado",
    "FPSEIXX Seminario Regiones y Países II",
    "FPTEI10 Análisis del Entorno",
    "FGE Electiva FG1 4",
  ]);
  assert.equal(byCode.get("FPTEP07").prereq, "135 créditos");
});

test("International Studies common courses share status with existing career instances", () => {
  const program = flowPrograms.find(({ id }) => id === "estudios-internacionales");
  const cases = [
    ["Inglés IV", "idiomas", "FBTLI14"],
    ["Inglés V", "idiomas", "FBTLI15"],
    ["Investigación y Sustentabilidad", "idiomas", "FBTHE05"],
    ["Pensamiento Computacional", "sistemas", "FBTPS04"],
    ["Venezuela: Identidad y Contexto", "idiomas", "FBTHE11"],
  ];

  for (const [name, career, code] of cases) {
    const course = program.periods.flat().find((item) => item.name === name);
    assert.ok(course, `Missing shared course ${name}`);
    assert.ok(sharedCourseInstances({ ...course, career: program.id })
      .some((instance) => instance.career === career && instance.code === code), `Not shared: ${name}`);
  }
});
