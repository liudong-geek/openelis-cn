import { describe, expect, it } from "vitest";
import {
  convertIsoToBackendDate,
  getDatePickerFormat,
  getDatePickerPlaceholder,
  toLocalIsoDate,
} from "./orderDateUtils";
import { getDateFnsDateFormat } from "../common/dateLocaleUtils";

describe("order date API contract", () => {
  it("uses the configured day-first backend format", () => {
    expect(convertIsoToBackendDate("2026-08-21", "fr-FR")).toBe("21/08/2026");
    expect(getDateFnsDateFormat("fr-FR")).toBe("dd/MM/yyyy");
    expect(getDatePickerFormat("fr-FR")).toBe("d/m/Y");
    expect(getDatePickerPlaceholder("fr-FR")).toBe("dd/mm/yyyy");
  });

  it("keeps month-first compatibility for en-US installations", () => {
    expect(convertIsoToBackendDate("2026-08-21", "en-US")).toBe("08/21/2026");
    expect(getDateFnsDateFormat("en-US")).toBe("MM/dd/yyyy");
    expect(getDatePickerFormat("en-US")).toBe("m/d/Y");
  });

  it.each(["zh", "zh-CN"])(
    "uses the China year-first format for %s installations",
    (locale) => {
      expect(convertIsoToBackendDate("2026-08-21", locale)).toBe("2026/08/21");
      expect(getDateFnsDateFormat(locale)).toBe("yyyy/MM/dd");
      expect(getDatePickerFormat(locale)).toBe("Y/m/d");
      expect(getDatePickerPlaceholder(locale)).toBe("yyyy/mm/dd");
    },
  );

  it("does not rewrite an already formatted backend date", () => {
    expect(convertIsoToBackendDate("21/08/2026", "fr-FR")).toBe("21/08/2026");
  });

  it("derives today from the workstation calendar instead of UTC", () => {
    const localDate = new Date(2026, 7, 21, 0, 30);
    expect(toLocalIsoDate(localDate)).toBe("2026-08-21");
  });
});
