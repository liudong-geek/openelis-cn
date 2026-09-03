import { describe, expect, it } from "vitest";
import { createPatientValidationSchema } from "./CreatePatientValidationShema";

const isPatientDateValid = (birthDateForDisplay, dateLocale) =>
  createPatientValidationSchema({
    PATIENT_NATIONAL_ID_REQUIRED: "false",
    DEFAULT_DATE_LOCALE: dateLocale,
  }).isValid({
    birthDateForDisplay,
    gender: "M",
  });

describe("patient birth-date locale validation", () => {
  it.each(["zh", "zh-CN"])(
    "accepts a real year-first date for %s",
    async (locale) => {
      await expect(isPatientDateValid("1990/05/15", locale)).resolves.toBe(
        true,
      );
      await expect(isPatientDateValid("05/15/1990", locale)).resolves.toBe(
        false,
      );
    },
  );

  it("keeps en-US month-first validation", async () => {
    await expect(isPatientDateValid("05/15/1990", "en-US")).resolves.toBe(true);
  });

  it("keeps fr-FR day-first validation", async () => {
    await expect(isPatientDateValid("15/05/1990", "fr-FR")).resolves.toBe(true);
  });
});
