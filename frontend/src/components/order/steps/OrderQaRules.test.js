import { describe, expect, it } from "vitest";
import { isQaChecklistComplete } from "./OrderQA";

describe("order QA product rules", () => {
  it("does not treat an empty checklist as complete", () => {
    expect(isQaChecklistComplete([], {})).toBe(false);
  });

  it("requires every configured check to be explicitly verified", () => {
    const items = [{ itemKey: "patient" }, { itemKey: "sample" }];
    expect(isQaChecklistComplete(items, { patient: true, sample: false })).toBe(
      false,
    );
    expect(isQaChecklistComplete(items, { patient: true, sample: true })).toBe(
      true,
    );
  });
});
