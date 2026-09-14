import type { EntryRow } from "./resultEntryState";
import { entryBlocked, positiveId } from "./resultEntryState";

/** A shortcut to the existing review query, bound to a confirmed server row. */
export function resultReviewHandoffPath(
  row: EntryRow,
  confirmed?: EntryRow,
): string | null {
  if (
    !confirmed ||
    entryBlocked(row) ||
    entryBlocked(confirmed) ||
    !positiveId(confirmed.resultId) ||
    !positiveId(confirmed.analysisId) ||
    !positiveId(confirmed.sampleItemId) ||
    !positiveId(confirmed.testId) ||
    typeof confirmed.analysisLastupdated !== "string" ||
    !confirmed.analysisLastupdated ||
    typeof confirmed.accessionNumber !== "string" ||
    !confirmed.accessionNumber ||
    confirmed.accessionNumber.trim() !== confirmed.accessionNumber ||
    confirmed.accessionNumber.length > 256 ||
    [
      "analysisId",
      "sampleItemId",
      "testId",
      "testResultComponentId",
      "resultId",
      "accessionNumber",
      "analysisLastupdated",
      "analysisStatusId",
    ].some((field) => row[field] !== confirmed[field])
  ) {
    return null;
  }
  // Review is at order scope. The review page re-queries its authorized rows;
  // this link neither marks a result reviewed nor posts any local result values.
  return (
    "/AccessionValidation?" +
    new URLSearchParams({
      accessionNumber: confirmed.accessionNumber,
    }).toString()
  );
}
