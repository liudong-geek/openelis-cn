import { describe, expect, it } from "vitest";
import {
  confirmedPatientSaveId,
  formatPatientMaintenanceName,
  patientMaintenanceMatches,
  patientMediaMatches,
} from "./patientMaintenanceContract";
describe("patient maintenance save contract", () => {
  it.each([
    undefined,
    {},
    { status: 200 },
    { status: "failure" },
    { status: "success" },
    { status: "success", patientId: "43" },
    { status: "success", patientPK: "42" },
    { status: "success", patientId: "42", error: "failed" },
    { status: "success", patientId: "42", statusCode: 500 },
  ])("does not accept an unconfirmed result %j", (response) =>
    expect(confirmedPatientSaveId(response, "42")).toBeNull(),
  );
  it("requires explicit success and the expected complete ID", () =>
    expect(
      confirmedPatientSaveId({ status: "success", patientId: "42" }, "42"),
    ).toBe("42"));
  it("uses Chinese family-name order without an inserted space", () =>
    expect(
      formatPatientMaintenanceName({ lastName: "陈", firstName: "晓宁" }),
    ).toBe("陈晓宁"));
  it("compares core data, nested contacts and every address level", () => {
    const draft = {
      patientPK: "42",
      firstName: "SIM",
      patientContact: { person: { firstName: "Contact" } },
      addressHierarchy_1: "district",
    };
    const saved = {
      patientPK: "42",
      firstName: "SIM",
      patientContact: { person: { firstName: "Contact" } },
      addressHierarchy: { addressHierarchy_1: "district" },
    };
    expect(patientMaintenanceMatches(saved, draft, "42")).toBe(true);
    expect(
      patientMaintenanceMatches({ ...saved, patientPK: "43" }, draft, "42"),
    ).toBe(false);
    expect(
      patientMaintenanceMatches(
        { ...saved, patientContact: { person: { firstName: "other" } } },
        draft,
        "42",
      ),
    ).toBe(false);
    expect(
      patientMaintenanceMatches(
        { ...saved, addressHierarchy: {} },
        draft,
        "42",
      ),
    ).toBe(false);
  });
  describe.each(["gpsLatitude", "gpsLongitude"])(
    "exact decimal readback for %s",
    (field) => {
      it.each([
        ["31.200000", "31.2"],
        ["  +0031.200000  ", "31.2"],
        ["-121.500000", "-00121.50"],
        ["0.000000", "-0"],
        ["31.200000", "3.12e1"],
        ["31.200000", "312E-1"],
        ["0.012000", "1200e-5"],
        ["100.000000", "1e+2"],
        [".120000", "0.12"],
        ["1.000000", "1."],
      ])(
        "confirms a numerically exact stored representation %s vs %s",
        (stored, input) => {
          expect(
            patientMaintenanceMatches(
              { patientPK: "42", [field]: stored },
              { patientPK: "42", [field]: input },
              "42",
            ),
          ).toBe(true);
        },
      );
      it.each([
        ["31.200000", "31.2000000000000001"],
        ["31.200000", "31.200001"],
        ["-31.200000", "31.2"],
        ["0.000000", "0.0000001"],
        ["0.012000", "1200e-4"],
        ["31.200000", ""],
        ["31.200000", "31.2junk"],
        ["31.200000", "NaN"],
        ["31.200000", "Infinity"],
        ["NaN", "NaN"],
        ["Infinity", "Infinity"],
        ["1e309", "2e309"],
      ])(
        "refuses a different value, precision loss or invalid representation %s vs %s",
        (stored, input) => {
          expect(
            patientMaintenanceMatches(
              { patientPK: "42", [field]: stored },
              { patientPK: "42", [field]: input },
              "42",
            ),
          ).toBe(false);
        },
      );
      it("only matches blank coordinates with blank coordinates", () => {
        expect(
          patientMaintenanceMatches(
            { patientPK: "42", [field]: null },
            { patientPK: "42", [field]: "  " },
            "42",
          ),
        ).toBe(true);
        expect(
          patientMaintenanceMatches(
            { patientPK: "42", [field]: "" },
            { patientPK: "42", [field]: "0" },
            "42",
          ),
        ).toBe(false);
      });
    },
  );
  it("decimal normalization does not relax any other patient text field", () => {
    const draft = {
      patientPK: "42",
      gpsLatitude: "31.2",
      nationalId: "0031.2000",
    };
    const saved = {
      patientPK: "42",
      gpsLatitude: "31.200000",
      nationalId: "31.2",
    };
    expect(patientMaintenanceMatches(saved, draft, "42")).toBe(false);
    expect(
      patientMaintenanceMatches(
        { ...saved, nationalId: "0031.2000 " },
        draft,
        "42",
      ),
    ).toBe(false);
  });
  it("compares media bytes with or without the backend data URL prefix", () => {
    expect(patientMediaMatches("data:image/jpeg;base64,abc", "abc")).toBe(true);
    expect(patientMediaMatches("data:image/jpeg;base64,abc", "def")).toBe(
      false,
    );
  });
});
