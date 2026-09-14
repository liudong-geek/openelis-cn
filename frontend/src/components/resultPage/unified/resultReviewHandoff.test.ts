import { resultReviewHandoffPath } from "./resultReviewHandoff";
import type { EntryRow } from "./resultEntryState";

const saved: EntryRow = {
  id: "0",
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  resultId: "601",
  resultType: "N",
  resultValue: "0",
  accessionNumber: "SIM-ORDER-301&part=2",
  analysisLastupdated: "2000",
  analysisStatusId: "15",
};

test("the review link carries the complete confirmed order identity", () => {
  const path = resultReviewHandoffPath(saved, { ...saved });
  expect(path?.split("?")[0]).toBe("/AccessionValidation");
  const params = new URLSearchParams(path?.split("?")[1]);
  expect([...params]).toEqual([["accessionNumber", saved.accessionNumber]]);
});

test("a local row or a POST receipt cannot create a review handoff", () => {
  expect(resultReviewHandoffPath(saved)).toBeNull();
  expect(
    resultReviewHandoffPath(saved, { ...saved, resultId: undefined }),
  ).toBeNull();
});

test.each([
  "analysisId",
  "sampleItemId",
  "testId",
  "testResultComponentId",
  "resultId",
  "accessionNumber",
  "analysisLastupdated",
  "analysisStatusId",
])("a changed %s invalidates the old confirmation", (field) => {
  expect(
    resultReviewHandoffPath({ ...saved, [field]: "999" }, saved),
  ).toBeNull();
});

test("blocked or unbound rows cannot advertise a review handoff", () => {
  expect(
    resultReviewHandoffPath({ ...saved, readOnly: true }, saved),
  ).toBeNull();
  expect(
    resultReviewHandoffPath(saved, { ...saved, accessionNumber: " " }),
  ).toBeNull();
});
