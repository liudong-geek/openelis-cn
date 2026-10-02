import { createIntl, createIntlCache } from "react-intl";
import zh from "../../languages/zh.json";
import en from "../../languages/en.json";
import {
  electronicOrderStatusLabel,
  electronicOrderPriorityLabel,
} from "./electronicOrderLabels";

const intl = (locale, messages) =>
  createIntl({ locale, messages }, createIntlCache());
const chinese = intl("zh-CN", zh);
const english = intl("en", en);

test.each([
  ["Entered", "已录入"],
  ["Cancelled", "已取消"],
  ["Realized", "已接收"],
  ["已实现", "已接收"],
  ["不符合订单", "不符合"],
  ["NonConforming", "不符合"],
  ["Non-conforming order", "不符合"],
  ["AwaitingSpecimen", "待确定标本"],
  ["Awaiting specimen", "待确定标本"],
])("localizes backend status %s", (value, label) => {
  expect(electronicOrderStatusLabel(value, chinese)).toBe(label);
  expect(electronicOrderStatusLabel(value, english)).not.toBe(label);
});

test.each([
  ["ROUTINE", "常规"],
  ["STAT", "急诊"],
  ["ASAP", "尽快处理"],
  ["TIMED", "指定时间"],
  ["Future STAT", "预定急诊"],
])("localizes backend priority %s", (value, label) => {
  expect(electronicOrderPriorityLabel(value, chinese)).toBe(label);
});

test("keeps localized and unknown values intact instead of guessing their meaning", () => {
  expect(electronicOrderStatusLabel("已接收", chinese)).toBe("已接收");
  expect(electronicOrderStatusLabel("HospitalCustomStatus", chinese)).toBe(
    "HospitalCustomStatus",
  );
  expect(electronicOrderPriorityLabel("HOSPITAL_LOCAL", chinese)).toBe(
    "HOSPITAL_LOCAL",
  );
  expect(electronicOrderStatusLabel(undefined, chinese)).toBe("");
  expect(electronicOrderPriorityLabel(null, chinese)).toBe("");
});
