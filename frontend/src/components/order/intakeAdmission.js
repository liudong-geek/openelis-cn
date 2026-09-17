import { receiptInstant } from "./specimenReceipt";

const blockedReasons = new Set([
  "error.results.specimenNotEligible",
  "error.results.specimenRejected",
  "error.results.specimenVoided",
  "error.results.specimenCanceled",
  "error.results.specimenDisposed",
  "error.results.specimenIntakeMissing",
  "error.results.specimenIntakeChanged",
  "error.results.testIntakeChanged",
  "error.results.reviewedResultLocked",
  "error.results.analysisEntryUnavailable",
  "error.results.statusConfigurationInvalid",
  "order.intakeAdmission.permission",
]);
const id = (value) =>
  typeof value === "string" &&
  /^[1-9]\d{0,9}$/.test(value) &&
  Number(value) <= 2147483647;
const unavailable = (current, tube) => ({
  schema: 1,
  sampleId: current?.sampleId,
  sampleItemId: tube?.id,
  itemVersion: tube?.lastUpdated,
  state: "UNAVAILABLE",
  analyses: [],
});

// This is a separate current-query projection. A historical ACCEPTED/QA record
// cannot fill missing evidence or grant entry. Preserve exact version strings.
export function verifyIntakeAdmission(value, current, tube) {
  const unknown = () => unavailable(current, tube);
  try {
    if (
      !value ||
      value.schema !== 1 ||
      !id(current.sampleId) ||
      !id(tube.id) ||
      value.sampleId !== current.sampleId ||
      value.sampleItemId !== tube.id ||
      value.itemVersion !== tube.lastUpdated ||
      !Array.isArray(value.analyses) ||
      !["READY", "PARTIAL", "BLOCKED", "UNAVAILABLE"].includes(value.state)
    )
      return unknown();
    if (value.state === "UNAVAILABLE") return unknown();
    receiptInstant(tube.lastUpdated);
    if (
      !Array.isArray(tube.analyses) ||
      !tube.analyses.length ||
      tube.analyses.length > 5000 ||
      value.analyses.length !== tube.analyses.length
    )
      return unknown();
    const expected = new Map();
    for (const analysis of tube.analyses) {
      if (!id(analysis.id) || !id(analysis.testId) || expected.has(analysis.id))
        return unknown();
      receiptInstant(analysis.lastUpdated);
      expected.set(analysis.id, analysis);
    }
    const analyses = value.analyses.map((row) => {
      const analysis = expected.get(row?.analysisId);
      if (
        !analysis ||
        row.testId !== analysis.testId ||
        row.analysisVersion !== analysis.lastUpdated ||
        typeof row.allowed !== "boolean" ||
        (row.allowed
          ? row.blockedReason !== null
          : !blockedReasons.has(row.blockedReason))
      )
        throw new Error("Invalid current result-entry projection");
      expected.delete(row.analysisId);
      return {
        analysisId: row.analysisId,
        testId: row.testId,
        analysisVersion: row.analysisVersion,
        allowed: row.allowed,
        blockedReason: row.blockedReason,
      };
    });
    const allowed = analyses.filter((row) => row.allowed).length;
    const state =
      allowed === analyses.length ? "READY" : allowed ? "PARTIAL" : "BLOCKED";
    if (expected.size || value.state !== state) return unknown();
    return { ...unknown(), state, analyses };
  } catch {
    return unknown();
  }
}

export function intakeAdmissionPath(result) {
  const current = result?.current;
  if (
    !current ||
    result.receipt?.sampleId !== current.sampleId ||
    result.receipt?.labNo !== current.labNo ||
    typeof current.labNo !== "string" ||
    !current.labNo.trim() ||
    current.labNo.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(current.labNo) ||
    !Array.isArray(current.specimenDecisions) ||
    !Array.isArray(current.physicalSpecimens) ||
    !current.specimenDecisions.some((row) => {
      const tube = current.physicalSpecimens.find(
        (item) => item.id === row.sampleItemId,
      );
      return (
        tube &&
        verifyIntakeAdmission(
          row.resultEntryAdmission,
          current,
          tube,
        ).analyses.some((analysis) => analysis.allowed)
      );
    })
  )
    return null;
  return `/result?type=order&accessionNumber=${encodeURIComponent(current.labNo)}&doRange=false`;
}
