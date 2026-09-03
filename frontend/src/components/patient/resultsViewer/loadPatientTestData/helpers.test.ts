import { describe, expect, it } from "vitest";
import { assessValue } from "./helpers";

describe("assessValue", () => {
  it("does not classify a qualitative result as normal without an interpretation", () => {
    expect(assessValue({})("Positive")).toBe("UNKNOWN");
  });

  it("does not classify a numeric result as normal when no reference range exists", () => {
    expect(assessValue({})("7.2")).toBe("UNKNOWN");
  });

  it("classifies a numeric result as normal only when it is inside a supplied reference range", () => {
    expect(assessValue({ lowNormal: 4, hiNormal: 10 })("7.2")).toBe("NORMAL");
  });
});
