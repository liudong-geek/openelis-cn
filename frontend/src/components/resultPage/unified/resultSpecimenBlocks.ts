import { worklistRowKey } from "./PolymorphicResultCell";
import { EntryRow, entryBlocked, positiveId } from "./resultEntryState";
import {
  groupResultSpecimens,
  ResultSpecimenGroup,
} from "./ResultSpecimenQueue";

// Presentation classification from the existing admission reasons. It does not
// propagate restrictions or decide whether a result may be saved.
const sharedSpecimenReasons = new Set([
  "error.results.specimenNotEligible",
  "error.results.specimenRejected",
  "error.results.specimenVoided",
  "error.results.specimenCanceled",
  "error.results.specimenDisposed",
  "error.results.specimenIntakeMissing",
  "error.results.specimenIntakeChanged",
]);

export interface SpecimenBlock<T extends EntryRow> {
  id: string;
  reason: string;
  group: ResultSpecimenGroup<T>;
  analysisCount: number;
  rowKeys: Set<string>;
}

export function resultSpecimenBlocks<T extends EntryRow>(
  scopedRows: T[],
  visibleRows: T[],
): SpecimenBlock<T>[] {
  const visibleKeys = new Set(visibleRows.map(worklistRowKey));
  const summaries: SpecimenBlock<T>[] = [];
  groupResultSpecimens(scopedRows).forEach((group, groupIndex) => {
    const subject = group.rows[0];
    if (
      !positiveId(subject.sampleItemId) ||
      typeof subject.accessionNumber !== "string" ||
      !subject.accessionNumber.trim()
    )
      return;
    const reasons = new Map<string, T[]>();
    for (const row of group.rows) {
      const reason = row.resultEntryBlockedReason;
      if (
        entryBlocked(row) &&
        typeof reason === "string" &&
        sharedSpecimenReasons.has(reason)
      ) {
        const members = reasons.get(reason) || [];
        members.push(row);
        reasons.set(reason, members);
      }
    }
    [...reasons].forEach(([reason, rows], reasonIndex) => {
      const rowKeys = new Set(rows.map(worklistRowKey));
      if (![...rowKeys].some((key) => visibleKeys.has(key))) return;
      summaries.push({
        // Opaque page-local markup identity; no patient, accession or tube data.
        id: `result-specimen-block-${groupIndex}-${reasonIndex}`,
        reason,
        group,
        analysisCount: new Set(rows.map((row) => row.analysisId)).size,
        rowKeys,
      });
    });
  });
  return summaries;
}
