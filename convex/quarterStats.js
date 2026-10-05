export function evaluationStats(evaluations) {
  return evaluations.reduce((stats, evaluation) => {
    stats.count += 1;
    if (evaluation.grade !== undefined && evaluation.grade !== null) {
      stats.gradedCount += 1;
      stats.accumulatedPoints += evaluation.grade * evaluation.weight / 100;
    }
    return stats;
  }, { count: 0, gradedCount: 0, accumulatedPoints: 0 });
}

export function nextQuarterVersions(current, keys) {
  const versions = { ...current };
  for (const key of new Set(keys)) versions[key] = (versions[key] ?? 0) + 1;
  return versions;
}
