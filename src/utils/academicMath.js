export function isPerfectSquareTrinomialCoefficients(a, b, c, epsilon = 1e-10) {
  if (!(a > 0) || !(c > 0)) return false;
  const rootA = Math.sqrt(a);
  const rootC = Math.sqrt(c);
  if (!Number.isInteger(rootA) || !Number.isInteger(rootC)) return false;
  return Math.abs(Math.abs(b) - 2 * rootA * rootC) < epsilon;
}

export function factorMonicQuadratic(b, c) {
  const discriminant = b * b - 4 * c;
  if (discriminant < 0) return null;
  const sqrtDiscriminant = Math.sqrt(discriminant);
  if (Number.isInteger(sqrtDiscriminant)) {
    const left = (-b - sqrtDiscriminant) / 2;
    const right = (-b + sqrtDiscriminant) / 2;
    if (Number.isInteger(left) && Number.isInteger(right)) {
      return {
        answer: `(x${signed(-left)})(x${signed(-right)})`,
        roots: [left, right],
        exact: true,
      };
    }
  }
  if (b % 2 === 0 && discriminant % 4 === 0) {
    const center = b / 2;
    const radicand = discriminant / 4;
    return {
      answer: `(x${signed(center)}-\\sqrt{${radicand}})(x${signed(center)}+\\sqrt{${radicand}})`,
      roots: [`${-center}-\\sqrt{${radicand}}`, `${-center}+\\sqrt{${radicand}}`],
      exact: true,
    };
  }
  return {
    answer: `\\left(x+\\frac{${b}+\\sqrt{${discriminant}}}{2}\\right)\\left(x+\\frac{${b}-\\sqrt{${discriminant}}}{2}\\right)`,
    roots: [`\\frac{${-b}-\\sqrt{${discriminant}}}{2}`, `\\frac{${-b}+\\sqrt{${discriminant}}}{2}`],
    exact: true,
  };
}

export function isQuadraticInjectiveOnInterval(a, b, left, right, epsilon = 1e-10) {
  if (Math.abs(a) < epsilon) return Math.abs(right - left) < epsilon;
  const min = Math.min(left, right);
  const max = Math.max(left, right);
  const vertex = -b / (2 * a);
  return vertex <= min + epsilon || vertex >= max - epsilon;
}

function signed(value) {
  return value >= 0 ? `+${value}` : String(value);
}
