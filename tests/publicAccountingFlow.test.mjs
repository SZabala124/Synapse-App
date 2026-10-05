import test from "node:test";
import assert from "node:assert/strict";
import { flowPrograms, sharedCourseInstances } from "../convex/flowData.js";

const program = flowPrograms.find(({ id }) => id === "contaduria-publica");

test("Public Accounting curriculum has twelve periods with five courses each", () => {
  assert.ok(program);
  assert.equal(program.name, "Contaduría Pública");
  assert.deepEqual(program.periodLabels, ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]);
  assert.deepEqual(program.periods.map((period) => period.length), Array(12).fill(5));
  assert.equal(program.periods.flat().length, 60);
});

test("Public Accounting chart preserves its subject codes and prerequisite chains", () => {
  const courses = program.periods.flat();
  const byCodeAndName = new Map(courses.map((course) => [`${course.code}:${course.name}`, course]));

  for (const [code, name] of [
    ["BPTBC27", "Contabilidad I"],
    ["BPTBC28", "Contabilidad II"],
    ["FPTBC69", "Contabilidad de Costos II"],
    ["FPTBC75", "Contabilidad Avanzada"],
    ["FPTBC71", "Tributos I"],
    ["FPTBC72", "Tributos II"],
    ["FPTBC73", "Tributos III"],
    ["BPTGF83", "Taller de Trabajo de Grado (Contaduría Pública)"],
  ]) {
    assert.ok(byCodeAndName.has(`${code}:${name}`), `Missing chart course ${code} ${name}`);
  }

  assert.equal(byCodeAndName.get("BPTBC28:Contabilidad II").prereq, "BPTBC27");
  assert.equal(byCodeAndName.get("FPTBC69:Contabilidad de Costos II").prereq, "BPTBC30");
  assert.equal(byCodeAndName.get("FPTBC75:Contabilidad Avanzada").prereq, "FPTBC68");
  assert.equal(byCodeAndName.get("FPTBC72:Tributos II").prereq, "FPTBC71");
  assert.equal(byCodeAndName.get("FPTBC73:Tributos III").prereq, "FPTBC72");
  assert.equal(byCodeAndName.get("BPTGF83:Taller de Trabajo de Grado (Contaduría Pública)").prereq, "105 créditos");

  const accountingStatistics = courses.filter(({ name }) => name.includes("Estadística") && name.includes("Contaduría Pública"));
  assert.equal(accountingStatistics.length, 2);
  assert.ok(accountingStatistics.every((course) => sharedCourseInstances({ ...course, career: program.id })
    .every((instance) => instance.career === program.id)));
});

test("shared courses inherit statuses while electives and seminars stay career-specific", () => {
  for (const [name, career, code] of [
    ["Inglés IV", "idiomas", "FBTLI14"],
    ["Investigación y Sustentabilidad", "idiomas", "FBTHE05"],
    ["Principios de Economía", "economia-empresarial", "BPTAK30"],
    ["Contabilidad I", "economia-empresarial", "BPTBC27"],
  ]) {
    const course = program.periods.flat().find((item) => item.name === name);
    assert.ok(course, `Missing shared course ${name}`);
    assert.ok(sharedCourseInstances({ ...course, career: program.id })
      .some((instance) => instance.career === career && instance.code === code), `Not shared: ${name}`);
  }

  const seminars = program.periods.flat().filter(({ code }) => code === "FPSXXX");
  assert.deepEqual(seminars.map(({ name }) => name), [
    "Seminario Profesional I",
    "Seminario Profesional II",
    "Seminario Profesional III",
  ]);
  assert.ok(seminars.every((seminar) => sharedCourseInstances({ ...seminar, career: program.id }).length === 1));

  const electives = program.periods.flat().filter(({ code }) => code === "FGE");
  assert.equal(electives.length, 4);
  assert.deepEqual(electives.map(({ name }) => name), ["Electiva I", "Electiva II", "Electiva III", "Electiva IV"]);
  assert.ok(electives.every((elective) => sharedCourseInstances({ ...elective, career: program.id }).length === 1));
});
