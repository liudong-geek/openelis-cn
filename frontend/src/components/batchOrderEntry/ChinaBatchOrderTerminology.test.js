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
  "batchOrder.setup.receipt.title": "接收信息",
  "batchOrder.setup.specimen.title": "标本与检验项目",
  "batchOrder.setup.barcode.title": "条码与送检设置",
  "batchOrder.setup.barcode.method": "条码分配方式",
  "batchOrder.setup.readiness.title": "开始前检查",
  "batchOrder.setup.start": "进入批量录入",
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

test("batch setup presents an ordered three-step preparation flow", () => {
  const setupSource = readFileSync(
    `${process.cwd()}/src/components/batchOrderEntry/SampleBatchEntrySetup.jsx`,
    "utf8",
  );
  const specimenSource = readFileSync(
    `${process.cwd()}/src/components/batchOrderEntry/SampleType.jsx`,
    "utf8",
  );
  const combinedSource = `${setupSource}\n${specimenSource}`;

  expect(combinedSource).toContain('id="batchOrder.setup.receipt.title"');
  expect(combinedSource).toContain('id="batchOrder.setup.specimen.title"');
  expect(combinedSource).toContain('id="batchOrder.setup.barcode.title"');
  expect(setupSource).toContain('id="batchOrder.setup.readiness.title"');
  expect(setupSource).toContain('id="batchOrder.setup.start"');
  expect(combinedSource.match(/batch-order-setup__step-number/g)).toHaveLength(
    3,
  );
});
