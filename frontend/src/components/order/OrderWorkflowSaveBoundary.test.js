import { describe, expect, it } from "vitest";
import {
  allowsImplicitOrderSave,
  hasUncollectedTypedSample,
} from "./OrderContext";

describe("later order step write boundary", () => {
  it("does not run generic autosave on label or QA pages", () => {
    expect(allowsImplicitOrderSave("/order/label")).toBe(false);
    expect(allowsImplicitOrderSave("/order/qa/")).toBe(false);
    expect(allowsImplicitOrderSave("/order/collect")).toBe(false);
  });

  it("distinguishes a logical request from a persisted physical tube", () => {
    expect(
      hasUncollectedTypedSample([{ sampleTypeId: "21", sampleItemId: "" }]),
    ).toBe(true);
    expect(
      hasUncollectedTypedSample([
        { sampleTypeId: "21", sampleItemId: "draft" },
      ]),
    ).toBe(true);
    expect(
      hasUncollectedTypedSample([{ sampleTypeId: "21", sampleItemId: "7" }]),
    ).toBe(false);
    expect(
      hasUncollectedTypedSample([
        { sampleTypeId: "21", sampleItemId: "7" },
        { sampleTypeId: "22", sampleItemId: "" },
      ]),
    ).toBe(true);
  });
});
