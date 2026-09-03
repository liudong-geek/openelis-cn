import zh from "../../../languages/zh.json";
import zhCN from "../../../languages/zh_CN.json";

const expectedTerms = {
  "reports.tat.segment.receiptToTesting": "标本签收到开始检验",
  "reports.tat.clickRowHint": "点击行查看明细结果",
  "reports.tat.labUnit": "专业组",
  "reports.tat.testPanel": "检验项目/组合项目",
  "reports.tat.sampleType": "标本类型",
  "reports.tat.test": "检验项目",
  "reports.tat.testingStarted": "已开始检验",
  "reports.tat.column.labUnit": "专业组",
  "select.start.date.referredTests": "开始日期（年/月/日）",
  "select.end.date.referredTests": "结束日期（年/月/日）",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China turnaround-time terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});
