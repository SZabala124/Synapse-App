export function parsePrerequisiteGroups(prereq) {
  if (!prereq) return [];
  const normalized = prereq.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized.split("+").map((group) => ({
    label: group.trim(),
    alternatives: group.split(/\s+(?:o|or)\s+/i).map((part) => part.trim()).filter(Boolean).map((label) => {
      const part = label.replace(/\s*\(s\)\s*$/i, "").trim();
      const bpCredits = part.match(/\b(\d+)\s*(?:(?:cr|cred(?:itos?)?)\.?\s*)?(?:c\s*bp|bp)\b/i);
      if (bpCredits) return { type: "bpCredits", value: Number(bpCredits[1]) };
      const credits = part.match(/\b(\d+)\s*(?:cr|cred(?:itos?)?|creditos?)\b\.?/i);
      if (credits) return { type: "credits", value: Number(credits[1]) };
      if (/^[A-Z]{2,}[A-Z0-9]*(?:\/(?:[A-Z]{2,}[A-Z0-9]*|\d+))*$/i.test(part)) return { type: "course", code: part.toUpperCase() };
      return { type: "other" };
    }),
  })).filter((group) => group.alternatives.length);
}

export function prerequisiteCourseCodes(prereq) {
  return parsePrerequisiteGroups(prereq).flatMap((group) => group.alternatives
    .filter((requirement) => requirement.type === "course").map((requirement) => requirement.code));
}

export function missingFlowRequirements(course, statuses, allCourses) {
  const status = (item) => statuses[`COURSE::${item.id}`] ?? item.status;
  const bpCredits = allCourses.reduce((sum, item) =>
    sum + (item.code.toUpperCase().startsWith("BP") && status(item) === "Cursada" ? 3 : 0), 0);
  const earnedCredits = allCourses.reduce((sum, item) =>
    sum + (status(item) === "Cursada" ? item.credits : 0), 0);
  return parsePrerequisiteGroups(course.prereq).filter((group) => !group.alternatives.some((requirement) => {
    if (requirement.type === "bpCredits") return bpCredits >= requirement.value;
    if (requirement.type === "credits") return earnedCredits >= requirement.value;
    if (requirement.type === "course") {
      const parent = allCourses.find((item) => item.code === requirement.code);
      return !parent || status(parent) === "Cursada";
    }
    return true;
  }));
}
