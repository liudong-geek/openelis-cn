import { resultSpecimenBlocks } from "./resultSpecimenBlocks";
import { EntryRow } from "./resultEntryState";

const reason = "error.results.specimenIntakeMissing";
const row = (analysisId: string, extra: Partial<EntryRow> = {}): EntryRow => ({
  id: "0",
  analysisId,
  sampleItemId: "201",
  accessionNumber: "SIM-ORDER",
  resultType: "N",
  readOnly: true,
  resultEntryBlockedReason: reason,
  ...extra,
});

test("one true tube and reason has one explanation and counts tasks rather than components", () => {
  const rows = [
    row("101", { testResultComponentId: "701" }),
    row("101", { testResultComponentId: "702" }),
    row("102"),
  ];
  const before = JSON.stringify(rows);
  const result = resultSpecimenBlocks(rows, rows);
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ reason, analysisCount: 2 });
  expect([...result[0].rowKeys]).toEqual(["101-701", "101-702", "102-primary"]);
  expect(JSON.stringify(rows)).toBe(before);
});

test("same printed identifiers do not merge separate tubes or missing identities", () => {
  const rows = [
    row("101"),
    row("102", { sampleItemId: "202" }),
    row("103", { sampleItemId: undefined }),
    row("104", { accessionNumber: "" }),
  ];
  const result = resultSpecimenBlocks(rows, rows);
  expect(result).toHaveLength(2);
  expect(result.map((entry) => [...entry.rowKeys])).toEqual([
    ["101-primary"],
    ["102-primary"],
  ]);
});

test.each([
  "error.results.testIntakeChanged",
  "error.results.reviewedResultLocked",
  "error.results.analysisEntryUnavailable",
  "error.results.statusConfigurationInvalid",
  "error.results.unknownFutureReason",
  undefined,
])(
  "analysis-specific or unclassified reason %s is not presented as a tube restriction",
  (resultEntryBlockedReason) => {
    const rows = [row("101", { resultEntryBlockedReason })];
    expect(resultSpecimenBlocks(rows, rows)).toEqual([]);
  },
);

test("pagination shows only relevant explanations but counts the full filtered task scope", () => {
  const rows = [row("101"), row("102"), row("103", { sampleItemId: "202" })];
  const result = resultSpecimenBlocks(rows, [rows[0]]);
  expect(result).toHaveLength(1);
  expect(result[0].analysisCount).toBe(2);
  expect(result[0].group.rows).toEqual([rows[0], rows[1]]);
  expect(resultSpecimenBlocks([rows[0]], [rows[0]])[0].analysisCount).toBe(1);
});

test("different known facts retain separate explanations without altering the input", () => {
  const rows = [
    row("101"),
    row("102", { resultEntryBlockedReason: "error.results.specimenRejected" }),
    row("103", { readOnly: false, resultEntryBlockedReason: undefined }),
  ];
  const result = resultSpecimenBlocks(rows, rows);
  expect(result.map((item) => item.reason)).toEqual([
    reason,
    "error.results.specimenRejected",
  ]);
  expect(result.every((item) => item.analysisCount === 1)).toBe(true);
  expect(rows[2].readOnly).toBe(false);
  expect(result.every((item) => !item.rowKeys.has("103-primary"))).toBe(true);
});
