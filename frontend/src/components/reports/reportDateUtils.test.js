import {
  formatReportApiDateForLocale,
  parseReportDisplayDateToApi,
} from "./reportDateUtils";

describe("report date boundary", () => {
  test.each([
    ["zh-CN", "2026/08/24", "2026-08-24"],
    ["zh_CN", "2026/08/24", "2026-08-24"],
    ["fr-FR", "24/08/2026", "2026-08-24"],
    ["en-US", "08/24/2026", "2026-08-24"],
  ])(
    "converts the %s display value to the ISO API contract",
    (locale, displayValue, apiValue) => {
      expect(parseReportDisplayDateToApi(displayValue, locale)).toBe(apiValue);
      expect(formatReportApiDateForLocale(apiValue, locale)).toBe(displayValue);
    },
  );

  test.each([
    ["2026/02/30", "zh-CN"],
    ["2026-08-24", "zh-CN"],
    ["", "zh-CN"],
  ])(
    "rejects invalid display dates without changing the API query",
    (value, locale) => {
      expect(parseReportDisplayDateToApi(value, locale)).toBe("");
    },
  );
});
