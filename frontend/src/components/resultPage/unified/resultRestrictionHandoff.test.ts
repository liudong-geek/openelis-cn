import { describe, expect, it } from "vitest";
import {
  restrictionIdentity,
  resultReturnPath,
  intakeHandoffPath,
  parseIntakeHandoff,
} from "./resultRestrictionHandoff";
const row = {
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  accessionNumber: "HMC-RAW.001",
  analysisLastupdated: "1777777777777",
};
describe("actual restricted-analysis handoff and criteria-only return", () => {
  it("preserves the exact raw accession and opaque millisecond version across URL encoding", () => {
    const identity = restrictionIdentity(row)!;
    const back = resultReturnPath(
      "?accessionNumber=HMC-RAW.001&testSectionId=9&status=4",
      2,
      25,
    );
    const url = intakeHandoffPath(identity, back);
    expect(parseIntakeHandoff(url.slice(url.indexOf("?")))).toEqual({
      identity,
      returnPath: back,
    });
    expect(url).not.toContain("owner");
    expect(url).not.toContain("canOpen");
  });
  it("never promotes a display index or guesses a missing true analysis", () => {
    expect(
      restrictionIdentity({ ...row, analysisId: undefined, id: "101" }),
    ).toBeNull();
    expect(restrictionIdentity({ ...row, sampleItemId: "" })).toBeNull();
    expect(restrictionIdentity({ ...row, testId: "2147483648" })).toBeNull();
  });
  it("rejects normalized or oversized raw accession and malformed versions", () => {
    for (const accessionNumber of [" A", "A ", "a".repeat(31), "A\nB"])
      expect(restrictionIdentity({ ...row, accessionNumber })).toBeNull();
    for (const analysisLastupdated of [
      "1e3",
      "",
      "1000.0",
      "9223372036854775808",
    ])
      expect(restrictionIdentity({ ...row, analysisLastupdated })).toBeNull();
  });
  it("returns only applied result criteria, page and page size, never clinical or owner cache", () => {
    const back = resultReturnPath(
      "?accessionNumber=RAW&scope=pending&status=ALL&owner=7&rows=patient&selectedTube=201",
      3,
      50,
    );
    expect(back).toBe(
      "/Results?accessionNumber=RAW&status=ALL&scope=pending&page=3&pageSize=50",
    );
  });
  it("rejects duplicate identity fields and external return targets", () => {
    const valid = intakeHandoffPath(
      restrictionIdentity(row)!,
      "/Results?page=1&pageSize=25",
    );
    expect(
      parseIntakeHandoff(valid.slice(valid.indexOf("?")) + "&analysisId=102"),
    ).toBeNull();
    const params = new URLSearchParams(valid.slice(valid.indexOf("?") + 1));
    params.set("returnTo", "https://example.invalid/Results");
    expect(parseIntakeHandoff("?" + params.toString())).toBeNull();
  });
  it("does not carry draft or cached clinical data from an otherwise local return", () => {
    const valid = intakeHandoffPath(
      restrictionIdentity(row)!,
      "/Results?page=2&pageSize=25",
    );
    const params = new URLSearchParams(valid.slice(valid.indexOf("?") + 1));
    params.set("returnTo", "/Results?page=2&pageSize=25&draft=medical-data");
    expect(parseIntakeHandoff("?" + params.toString())).toBeNull();
  });
});
