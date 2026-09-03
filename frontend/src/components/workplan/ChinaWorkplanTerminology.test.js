import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";
import { readFileSync } from "node:fs";
import { getWorkplanResultRoute } from "./Workplan";

const expectedTerms = {
  "banner.menu.workplan": "检验工作单",
  "banner.menu.workplan.test": "按检验项目",
  "banner.menu.workplan.panel": "按组合项目",
  "banner.menu.workplan.bench": "按专业组",
  "input.placeholder.selectPanel": "选择组合项目",
  "input.placeholder.selectTest": "选择检验项目",
  "input.placeholder.selectTestSection": "选择专业组",
  "quick.entry.accession.number": "实验室编号",
  "workplan.print": "打印检验工作单",
  "workplan.panel.types": "组合项目",
  "workplan.test.types": "检验项目",
  "workplan.unit.types": "专业组",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China work-list terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});

test.each(["Workplan.jsx", "WorkplanSearchForm.jsx"])(
  "%s does not expose English image or navigation descriptions",
  (file) => {
    const source = readFileSync(
      `${process.cwd()}/src/components/workplan/${file}`,
      "utf8",
    );

    expect(source).not.toContain('alt="nonconforming"');
    expect(source).not.toContain('alt="Loading ..."');
    expect(source).not.toContain('iconDescription="previous"');
    expect(source).not.toContain('iconDescription="next"');
  },
);

test("workplan result links use the unified workbench without a page reload", () => {
  expect(getWorkplanResultRoute("26 001/A")).toBe(
    "/Results?accessionNumber=26%20001%2FA",
  );

  const source = readFileSync(
    `${process.cwd()}/src/components/workplan/Workplan.jsx`,
    "utf8",
  );
  expect(source).not.toContain("href={`/result?");
});
