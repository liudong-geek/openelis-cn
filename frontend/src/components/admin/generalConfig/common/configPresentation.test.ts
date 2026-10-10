import { createIntl } from "react-intl";
import { expect, test } from "vitest";
import en from "../../../../languages/en.json";
import zh from "../../../../languages/zh.json";
import zhCN from "../../../../languages/zh_CN.json";
import { getConfigPresentation } from "./configPresentation";

const chinese = createIntl({ locale: "zh-CN", messages: zh });

test("presents report fields through the active Chinese catalog without changing source data", () => {
  const source = {
    name: "headerLeftImage",
    description: "Image for the left side of report header",
    value: "custom-logo.png",
  };
  expect(
    getConfigPresentation(source.name, source.description, chinese),
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

test("uses translations from the selected catalog rather than a private Chinese label table", () => {
  const intl = createIntl({
    locale: "zh-CN",
    messages: {
      ...zh,
      "config.report.headerLeftImage.name": "页眉标识（院方用语）",
      "config.report.headerLeftImage.description": "当前词条提供的图片说明。",
    },
  });
  expect(
    getConfigPresentation(
      "headerLeftImage",
      "Image for the left side of report header",
      intl,
    ),
  ).toEqual({
    name: "页眉标识（院方用语）",
    description: "当前词条提供的图片说明。",
  });
});

test("supports the regional Chinese catalog", () => {
  expect(
    getConfigPresentation(
      "lab director",
      "The lab directors name for the reports",
      createIntl({ locale: "zh-CN", messages: zhCN }),
    ),
  ).toEqual({
    name: "检验科负责人姓名",
    description: "报告中显示的检验科负责人姓名。",
  });
});

test("preserves hospital descriptions and unknown configuration keys", () => {
  expect(
    getConfigPresentation("headerLeftImage", "院方自定义说明", chinese),
  ).toEqual({ name: "报告页眉左侧标识", description: "院方自定义说明" });
  expect(
    getConfigPresentation(
      "customReportField",
      "Hospital-specific description",
      chinese,
    ),
  ).toEqual({
    name: "customReportField",
    description: "Hospital-specific description",
  });
});

test("keeps existing English and uncatalogued locale presentation", () => {
  for (const intl of [
    createIntl({ locale: "en", messages: en }),
    createIntl({ locale: "fr", messages: {} }),
  ]) {
    expect(
      getConfigPresentation(
        "headerLeftImage",
        "Image for the left side of report header",
        intl,
      ),
    ).toEqual({
      name: "headerLeftImage",
      description: "Image for the left side of report header",
    });
  }
});
