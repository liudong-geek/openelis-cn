import { createIntl, createIntlCache } from "react-intl";
import en from "../../../languages/en.json";
import zh from "../../../languages/zh.json";
import { formatHistogramBin, formatTat, formatTatPriority } from "./tatUtils";

const makeIntl = (locale, messages) =>
  createIntl({ locale, messages }, createIntlCache());

describe("turnaround-time display localization", () => {
  const zhIntl = makeIntl("zh-CN", zh);
  const enIntl = makeIntl("en-US", en);

  test.each([
    [2.5, "2小时30分钟"],
    [2, "2小时"],
    [0.5, "30分钟"],
    [0, "0分钟"],
  ])("renders %s hours in natural Chinese", (hours, expected) => {
    expect(formatTat(hours, zhIntl)).toBe(expected);
  });

  test("retains English compatibility outside the China profile", () => {
    expect(formatTat(2.5, enIntl)).toBe("2h 30m");
  });

  test.each([
    ["STAT", "急诊"],
    ["Routine", "常规"],
    ["ASAP", "尽快处理"],
    ["untranslated-priority", "其他优先级"],
  ])("does not expose backend priority code %s", (priority, expected) => {
    expect(formatTatPriority(priority, zhIntl)).toBe(expected);
  });

  test.each([
    ["0-1h", "0–1小时"],
    ["48h+", "48小时以上"],
  ])("localizes histogram bin %s", (bin, expected) => {
    expect(formatHistogramBin(bin, zhIntl)).toBe(expected);
  });
});
