import { expect, test } from "vitest";
import { getConfigPresentation } from "./configPresentation";

test("presents known report fields in Chinese without changing their source", () => {
  const source = {
    name: "headerLeftImage",
    description: "Image for the left side of report header",
    value: "custom-logo.png",
  };
  expect(
    getConfigPresentation(source.name, source.description, "zh-CN"),
  ).toEqual({
    name: "报告页眉左侧标识",
    description: "报告页眉左侧显示的标识图片。",
  });
  expect(source).toEqual({
    name: "headerLeftImage",
    description: "Image for the left side of report header",
    value: "custom-logo.png",
  });
});

test("keeps custom descriptions, unknown keys and other locales unchanged", () => {
  expect(
    getConfigPresentation("headerLeftImage", "院方自定义说明", "zh"),
  ).toEqual({ name: "报告页眉左侧标识", description: "院方自定义说明" });
  expect(
    getConfigPresentation(
      "customReportField",
      "Hospital-specific description",
      "zh",
    ),
  ).toEqual({
    name: "customReportField",
    description: "Hospital-specific description",
  });
  expect(
    getConfigPresentation(
      "headerLeftImage",
      "Image for the left side of report header",
      "fr",
    ),
  ).toEqual({
    name: "headerLeftImage",
    description: "Image for the left side of report header",
  });
});
