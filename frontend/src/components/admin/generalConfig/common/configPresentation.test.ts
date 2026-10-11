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

for (const [locale, messages] of [
  ["zh", zh],
  ["zh-CN", zhCN],
] as const) {
  test.each([
    {
      name: "reportPageNumbers",
      description: "use page numbers on reports",
      translated: {
        name: "报告页码显示",
        description: "启用后在报告中显示页码。",
      },
    },
    {
      name: "SiteName",
      description: "The name of the site for reports and header",
      translated: {
        name: "报告机构名称",
        description: "报告及页眉中显示的机构名称。",
      },
    },
  ])(`presents $name through the ${locale} catalog`, (field) => {
    expect(
      getConfigPresentation(
        field.name,
        field.description,
        createIntl({ locale, messages }),
      ),
    ).toEqual(field.translated);
  });
}

test.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])(
  "resolves the built-in director instruction key in %s",
  (locale, messages) => {
    expect(
      getConfigPresentation(
        "lab director",
        "instructions.site.lab.director",
        createIntl({ locale, messages }),
      ),
    ).toEqual({
      name: "检验科负责人姓名",
      description: "报告中显示的检验科负责人姓名。",
    });
  },
);

test.each([
  {
    name: "additional site info",
    description: "additional information for report header",
    instruction: "siteInformation.instruction.headerInfo",
  },
  {
    name: "headerLeftImage",
    description: "image for the left side of report header",
    instruction:
      "Use file upload to set the lab logo for the left side of report header. The file must be either a jpg, png or gif.",
  },
  {
    name: "headerRightImage",
    description: "image for the right side of report header",
    instruction:
      "Use file upload to set the lab logo for the right side of report header. The file must be either a jpg, png or gif.",
  },
  {
    name: "labDirectorName",
    description: "image for lab director name",
    instruction: "Enter the name of the lab director",
  },
  {
    name: "labDirectorTitle",
    description: "image for lab director title",
    instruction: "Enter the title of the lab director",
  },
  {
    name: "labDirectorSignature",
    description: "image for lab director signature",
    instruction: "Select a jpg file that contains the lab directors signature.",
  },
  {
    name: "reportPageNumbers",
    description: "use page numbers on reports",
    instruction: "siteInformation.instruction.pageNumbers",
  },
  {
    name: "SiteName",
    description: "The name of the site for reports and header",
    instruction: "instructions.site.name",
  },
])(
  "presents the built-in $name detail instruction like its list description",
  (field) => {
    const expected = getConfigPresentation(
      field.name,
      field.description,
      chinese,
    );
    expect(
      getConfigPresentation(field.name, field.instruction, chinese),
    ).toEqual(expected);
    expect(expected.description).not.toBe(field.description);
  },
);

test("limits instruction-key replacement to the exact built-in field and description", () => {
  expect(
    getConfigPresentation(
      "lab director",
      "instructions.site.lab.director（院方自定义）",
      chinese,
    ),
  ).toEqual({
    name: "检验科负责人姓名",
    description: "instructions.site.lab.director（院方自定义）",
  });
  expect(
    getConfigPresentation(
      "headerLeftImage",
      "instructions.site.lab.director",
      chinese,
    ),
  ).toEqual({
    name: "报告页眉左侧标识",
    description: "instructions.site.lab.director",
  });
  for (const name of ["SiteName", "reportPageNumbers"]) {
    expect(
      getConfigPresentation(name, "院方自定义说明", chinese).description,
    ).toBe("院方自定义说明");
  }
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
