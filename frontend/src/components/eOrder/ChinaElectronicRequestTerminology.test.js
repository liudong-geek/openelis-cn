import { readFileSync } from "node:fs";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const expectedTerms = {
  "banner.menu.eorders": "待接收电子申请",
  "sidenav.label.incomingorder": "待接收申请",
  "eorder.header": "待接收电子申请",
  "eorder.allInfo": "申请详情",
  "eorder.button.enterOrder": "接收申请",
  "eorder.button.editOrder": "修改申请",
  "eorder.facility.requesting": "送检机构",
  "eorder.id.national": "身份证件号",
  "eorder.labnumber.referring": "原机构检验号",
  "eorder.requestDate": "申请日期",
  "eorder.search.noresults": "未找到电子检验申请",
  "eorder.status": "处理状态",
  "eorder.test.name": "检验项目",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China electronic request terminology for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});

test.each([
  ["EOrder.jsx", 'aria-label="expand row"'],
  ["EOrderSearch.jsx", 'description="Loading Orders..."'],
  ["EOrderSearch.jsx", 'iconDescription="previous"'],
  ["EOrderSearch.jsx", 'iconDescription="next"'],
])("%s does not expose %s", (file, hardcodedText) => {
  const source = readFileSync(
    `${process.cwd()}/src/components/eOrder/${file}`,
    "utf8",
  );
  expect(source).not.toContain(hardcodedText);
});
