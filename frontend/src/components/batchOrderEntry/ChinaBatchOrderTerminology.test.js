import { readFileSync } from "node:fs";
import en from "../../languages/en.json";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const expectedTerms = {
  "accession.entry": "实验室编号录入",
  "banner.menu.sampleBatchEntry": "批量申请录入",
  "order.entry.setup": "批量申请设置",
  "order.entry.setup.batch": "批量申请录入",
  "sample.type": "标本类型",
  "sample.entry.panels": "组合项目",
  "sample.entry.available.tests": "可选检验项目",
  "batchOrder.search.panels": "搜索组合项目",
  "batchOrder.search.panels.placeholder": "输入组合项目名称",
  "batchOrder.search.tests": "搜索检验项目",
  "batchOrder.search.tests.placeholder": "输入检验项目名称",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China batch request terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});

test.each(Object.keys(expectedTerms))(
  "English compatibility resource defines %s",
  (id) => {
    expect(en[id]).toEqual(expect.any(String));
    expect(en[id].trim()).not.toBe("");
  },
);

test.each([
  ["SampleType.jsx", 'labelText="Sample Type"'],
  ["SampleType.jsx", 'labelText="Search Panels"'],
  ["SampleType.jsx", 'placeholder="Search panels..."'],
  ["SampleType.jsx", 'labelText="Search Tests"'],
  ["SampleType.jsx", 'placeholder="Search tests..."'],
  ["SampleBatchEntry.jsx", 'description="Loading Dasboard..."'],
  ["SampleBatchEntrySetup.jsx", 'description="Loading Dasboard..."'],
])("%s does not expose %s", (file, hardcodedText) => {
  const source = readFileSync(
    `${process.cwd()}/src/components/batchOrderEntry/${file}`,
    "utf8",
  );
  expect(source).not.toContain(hardcodedText);
});
