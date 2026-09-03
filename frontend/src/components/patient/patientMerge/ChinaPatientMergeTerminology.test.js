import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import zh from "../../../languages/zh.json";
import zhCN from "../../../languages/zh_CN.json";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

const expectedTerms = {
  "patient.merge.title": "重复患者档案合并",
  "patient.merge.patientResults": "患者查询结果",
  "patient.merge.orders": "检验申请",
  "patient.merge.samples": "标本",
  "patient.merge.testResults": "检验结果",
  "patient.merge.demographics": "基本信息",
  "patient.merge.primaryPatient": "保留的患者档案",
  "patient.merge.clearSelection": "清除当前选择",
  "patient.dataSource.local": "本系统",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China duplicate-patient terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});

test("patient merge controls do not expose hard-coded English labels", () => {
  const source = ["PatientSearchPanel.tsx", "PatientCard.tsx"]
    .map((file) => fs.readFileSync(path.join(currentDirectory, file), "utf8"))
    .join("\n");

  expect(source).not.toMatch(
    /(?:header|iconDescription|backwardText|forwardText)\s*:\s*["'][A-Za-z]/,
  );
  expect(source).not.toContain('iconDescription="Clear selection"');
});
