import { describe, expect, test } from "vitest";
import { validateCalculationExpression } from "./calculationExpression";

describe("calculated-test expression validation", () => {
  test.each([
    "2 + 3 * 4",
    "(2 + 3) * 4",
    "5 >= 0 && 5 <= 10",
    "5 >= -Infinity && 5 <= Infinity",
    "5 < 0 || 5 > 10",
  ])("accepts the supported grammar: %s", (expression) => {
    expect(() => validateCalculationExpression(expression)).not.toThrow();
  });

  test.each([
    "1; window.location = '/'",
    "alert(1)",
    "1 +",
    "(1 + 2",
    "1 && 2",
  ])("rejects executable or malformed content: %s", (expression) => {
    expect(() => validateCalculationExpression(expression)).toThrow();
  });
});
