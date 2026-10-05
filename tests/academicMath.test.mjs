import test from "node:test";
import assert from "node:assert/strict";
import {
  factorMonicQuadratic,
  isPerfectSquareTrinomialCoefficients,
  isQuadraticInjectiveOnInterval,
} from "../src/utils/academicMath.js";

test("x^2 + 2x - 1 is not a perfect square and factors exactly over the reals", () => {
  assert.equal(isPerfectSquareTrinomialCoefficients(1, 2, -1), false);
  assert.equal(factorMonicQuadratic(2, -1).answer, "(x+1-\\sqrt{2})(x+1+\\sqrt{2})");
});

test("x^2 is not injective on [-1, 1] but is injective on either monotone side", () => {
  assert.equal(isQuadraticInjectiveOnInterval(1, 0, -1, 1), false);
  assert.equal(isQuadraticInjectiveOnInterval(1, 0, 0, 1), true);
  assert.equal(isQuadraticInjectiveOnInterval(1, 0, -1, 0), true);
});
