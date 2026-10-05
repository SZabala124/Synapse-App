import test from "node:test";
import assert from "node:assert/strict";
import { missingFlowRequirements, prerequisiteCourseCodes, parsePrerequisiteGroups } from "../src/utils/flowPrerequisites.js";
import { flowPrograms } from "../convex/flowData.js";

const parent = { id: "parent", code: "BPTCC01", status: "Pendiente", credits: 3 };
const child = { id: "child", code: "BPTCC04", prereq: "BPTCC01 (S)", status: "Pendiente", credits: 3 };

test("suggested prerequisites block until the parent is completed", () => {
  for (const status of ["Pendiente", "En curso", "Planificada"]) {
    assert.equal(missingFlowRequirements(child, { "COURSE::parent": status }, [parent, child]).length, 1);
  }
  assert.equal(missingFlowRequirements(child, { "COURSE::parent": "Cursada" }, [parent, child]).length, 0);
  assert.equal(parsePrerequisiteGroups(child.prereq)[0].label, "BPTCC01 (S)");
});

test("suggested markers work without spaces and with lowercase letters", () => {
  assert.deepEqual(prerequisiteCourseCodes("BPTCC01(S) + BPTCC03 (s)"), ["BPTCC01", "BPTCC03"]);
  assert.equal(missingFlowRequirements({ ...child, prereq: "BPTCC01(s)" }, {}, [parent, child]).length, 1);
});

test("combined prerequisites still require every course and the credit threshold", () => {
  const other = { id: "other", code: "BPTCC22", status: "Pendiente", credits: 3 };
  const thesis = { ...child, prereq: "BPTCC01 (S) + BPTCC22 + 6 créditos" };
  assert.equal(missingFlowRequirements(thesis, { "COURSE::parent": "Cursada" }, [parent, other]).length, 2);
  assert.equal(missingFlowRequirements(thesis, { "COURSE::parent": "Cursada", "COURSE::other": "Cursada" }, [parent, other]).length, 0);
});

test("alternative prerequisites preserve OR semantics with suggested markers", () => {
  const course = { ...child, prereq: "BPTCC01 (S) o BPTCC22" };
  const other = { id: "other", code: "BPTCC22", status: "Cursada", credits: 3 };
  assert.equal(missingFlowRequirements(course, {}, [parent, other]).length, 0);
});

test("combined course codes are parsed as the existing combined subject", () => {
  assert.deepEqual(prerequisiteCourseCodes("BPELI31/41 (S) + FPTCC13/FPTCC14"), ["BPELI31/41", "FPTCC13/FPTCC14"]);
  const parent = { id: "combined", code: "BPELI31/41", status: "Pendiente", credits: 3 };
  const child = { prereq: "BPELI31/41" };
  assert.equal(missingFlowRequirements(child, {}, [parent]).length, 1);
  assert.equal(missingFlowRequirements(child, { "COURSE::combined": "En curso" }, [parent]).length, 1);
  assert.equal(missingFlowRequirements(child, { "COURSE::combined": "Cursada" }, [parent]).length, 0);
});

test("every French/German level after I stays blocked until its preceding level is completed", () => {
  const courses = flowPrograms.find((program) => program.id === "idiomas").periods.flat()
    .map((course, index) => ({ ...course, id: String(index) }));
  const languages = courses.filter((course) => course.code.startsWith("BPELI"));
  assert.equal(languages.length, 8);
  for (const [index, course] of languages.entries()) {
    if (index === 0) continue;
    assert.equal(missingFlowRequirements(course, {}, courses).length, 1, course.code);
    assert.equal(missingFlowRequirements(course, { [`COURSE::${languages[index - 1].id}`]: "Cursada" }, courses).length, 0, course.code);
  }
});

test("Modern Languages missing prerequisite chains now point to existing courses", () => {
  const courses = flowPrograms.find((program) => program.id === "idiomas").periods.flat()
    .map((course, index) => ({ ...course, id: String(index) }));
  for (const code of ["FBTLI15", "BPTMM20", "FPDMK01", "FPTLI04", "FPTLI17", "FPTLI08", "FPTLI09", "FPTLI12", "FPTI51", "FPTLI16"]) {
    const course = courses.find((item) => item.code === code);
    assert.ok(missingFlowRequirements(course, {}, courses).length > 0, code);
    for (const parent of prerequisiteCourseCodes(course.prereq)) assert.ok(courses.some((item) => item.code === parent), `${code}: ${parent}`);
  }
});
