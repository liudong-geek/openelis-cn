import { sameRow } from "../cypress/pages/ResultsPage";

const expected = {
  kind: "positive",
  analysisId: "101",
  sampleItemId: "201",
  testId: "31",
  labNo: "CI-RESULTS",
  analysisLastupdated: "1791852000000",
};
const actual = {
  analysisId: "101",
  sampleItemId: "201",
  testId: "31",
  accessionNumber: "CI-RESULTS",
  analysisLastupdated: "1791852000000",
  readOnly: false,
};
const missingIntake = "error.results.specimenIntakeMissing";

test("the current positive row accepts omitted, null or empty serialized reasons", () => {
  for (const resultEntryBlockedReason of [undefined, null, ""]) {
    expect(() =>
      sameRow({ ...actual, resultEntryBlockedReason }, expected),
    ).not.toThrow();
  }
});

test("the current negative row requires its exact blocked admission", () => {
  const negative = { ...expected, kind: "negative" };
  const blocked = {
    ...actual,
    readOnly: true,
    resultEntryBlockedReason: missingIntake,
  };
  expect(() => sameRow(blocked, negative)).not.toThrow();
  for (const change of [
    { readOnly: false },
    { resultEntryBlockedReason: undefined },
    { resultEntryBlockedReason: "error.results.specimenIntakeChanged" },
  ]) {
    expect(() => sameRow({ ...blocked, ...change }, negative)).toThrow();
  }
});

test.each([
  { readOnly: undefined },
  { readOnly: "false" },
  { readOnly: true },
  { resultEntryBlockedReason: false },
  { resultEntryBlockedReason: missingIntake },
])("missing or incorrect current permission fails: %j", (change) => {
  expect(() => sameRow({ ...actual, ...change }, expected)).toThrow();
});

test.each([
  "analysisId",
  "sampleItemId",
  "testId",
  "accessionNumber",
  "analysisLastupdated",
])("the existing identity/version check still rejects a changed %s", (key) => {
  expect(() => sameRow({ ...actual, [key]: "999" }, expected)).toThrow();
});

test("a well-formed older analysis version still fails", () => {
  expect(() =>
    sameRow({ ...actual, analysisLastupdated: "1791851999999" }, expected),
  ).toThrow();
});

test("version=false keeps the existing post-save contract", () => {
  const saved = {
    ...actual,
    analysisLastupdated: "1791852001000",
    readOnly: undefined,
  };
  expect(() => sameRow(saved, expected, false)).not.toThrow();
  expect(() =>
    sameRow({ ...saved, sampleItemId: "999" }, expected, false),
  ).toThrow();
  expect(() =>
    sameRow({ ...saved, analysisLastupdated: "bad-version" }, expected, false),
  ).toThrow();
});
