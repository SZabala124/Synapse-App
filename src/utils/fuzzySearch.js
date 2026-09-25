export function normalizeSearchText(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchesFuzzySearch(query, values) {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const targets = values.map(normalizeSearchText).filter(Boolean);
  const words = targets.flatMap((target) => target.split(/[^a-z0-9]+/).filter(Boolean));
  return terms.every((term) => (
    targets.some((target) => target.includes(term)) ||
    words.some((word) => isCloseSpelling(term, word))
  ));
}

function isCloseSpelling(searchTerm, word) {
  const maxDistance = searchTerm.length < 4 ? 0 : searchTerm.length < 8 ? 1 : 2;
  if (maxDistance === 0) return false;

  const minLength = Math.max(1, searchTerm.length - maxDistance);
  const maxLength = Math.min(word.length, searchTerm.length + maxDistance);
  for (let start = 0; start < word.length; start += 1) {
    for (let length = minLength; length <= maxLength && start + length <= word.length; length += 1) {
      if (editDistanceWithin(searchTerm, word.slice(start, start + length), maxDistance)) return true;
    }
  }
  return false;
}

function editDistanceWithin(left, right, maxDistance) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    if (Math.min(...current) > maxDistance) return false;
    previous = current;
  }
  return previous[right.length] <= maxDistance;
}
