import type { EntryRow } from "./resultEntryState";
import { positiveId } from "./resultEntryState";
import { worklistRowKey } from "./PolymorphicResultCell";

export const resultReadbackPath = (row: EntryRow): string | null =>
  typeof row.accessionNumber === "string" &&
  row.accessionNumber.trim() === row.accessionNumber &&
  row.accessionNumber.length > 0 &&
  row.accessionNumber.length <= 256
    ? "/rest/LogbookResults?" +
      new URLSearchParams({
        labNumber: row.accessionNumber,
        doRange: "false",
        finished: "false",
      }).toString()
    : null;

const selections = (value: unknown): string | null => {
  try {
    if (typeof value !== "string") return null;
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const groups = Object.entries(parsed).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    if (!groups.length) return null;
    return JSON.stringify(
      groups.map(([key, values]) => {
        if (!/^(0|[1-9][0-9]*)$/.test(key) || typeof values !== "string")
          throw Error();
        const ids = values.split(",").sort();
        if (
          ids.some((id) => !positiveId(id)) ||
          new Set(ids).size !== ids.length
        )
          throw Error();
        return [key, ids];
      }),
    );
  } catch {
    return null;
  }
};

/** A POST receipt is not a saved row. Reopen only an independently bound result. */
export function confirmedResultReadback<T extends EntryRow>(
  submitted: T,
  receipt: { analysisLastupdated?: string; analysisStatusId?: string },
  response: unknown,
  current: T[],
): T[] | null {
  if (
    !response ||
    typeof response !== "object" ||
    !resultReadbackPath(submitted)
  )
    return null;
  const rows = (response as { testResult?: unknown }).testResult;
  if (!Array.isArray(rows)) return null;
  const group = rows.filter((row) => row?.analysisId === submitted.analysisId);
  const existing = current.filter(
    (row) => row.analysisId === submitted.analysisId,
  );
  if (!group.length || group.length !== existing.length) return null;
  const keys = new Set<string>();
  for (const row of group) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const key = worklistRowKey(row);
    const original = existing.find((item) => worklistRowKey(item) === key);
    if (
      !original ||
      keys.has(key) ||
      !positiveId(row.analysisId) ||
      !positiveId(row.sampleItemId) ||
      !positiveId(row.testId) ||
      row.sampleItemId !== original.sampleItemId ||
      row.testId !== original.testId ||
      row.accessionNumber !== submitted.accessionNumber ||
      row.accessionNumber !== original.accessionNumber ||
      row.resultType !== original.resultType ||
      row.analysisLastupdated !== receipt.analysisLastupdated ||
      row.analysisStatusId !== receipt.analysisStatusId ||
      // Legacy pending rows serialize patientId=null; Logbook enriches it.
      // A missing identifier is not evidence of a patient change. Known IDs
      // must still match, in addition to the actual task/tube/test binding.
      (original.patientId != null && row.patientId !== original.patientId) ||
      (row.patientId != null && !positiveId(row.patientId))
    )
      return null;
    keys.add(key);
  }
  const saved = group.find(
    (row) => worklistRowKey(row) === worklistRowKey(submitted),
  );
  const multiple = submitted.resultType === "M" || submitted.resultType === "C";
  if (
    !saved ||
    !positiveId(saved.resultId) ||
    (!multiple &&
      positiveId(submitted.resultId) &&
      submitted.resultId !== saved.resultId)
  )
    return null;
  if (multiple) {
    const expected = selections(submitted.multiSelectResultValues);
    if (!expected || selections(saved.multiSelectResultValues) !== expected)
      return null;
  } else if (
    typeof submitted.resultValue !== "string" ||
    saved.rawResultValue !== submitted.resultValue
  )
    return null;
  if (
    (saved.hasQualifiedResult === true) !==
    (submitted.hasQualifiedResult === true)
  )
    return null;
  if (
    submitted.hasQualifiedResult === true &&
    (!positiveId(saved.qualifiedResultId) ||
      saved.qualifiedResultValue !== submitted.qualifiedResultValue ||
      saved.qualifiedResultId === saved.resultId ||
      (!multiple &&
        positiveId(submitted.qualifiedResultId) &&
        submitted.qualifiedResultId !== saved.qualifiedResultId) ||
      saved.hasQualifiedResult !== true)
  )
    return null;
  return group as T[];
}
