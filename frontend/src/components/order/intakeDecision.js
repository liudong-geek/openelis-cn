import { entrySubmissionError } from "./orderEntryReceipt";
import { receiptInstant } from "./specimenReceipt";
import { collectionMaster } from "./collectionRecovery";
import { verifyIntakeAdmission } from "./intakeAdmission";

export const intakeFailure = (key = "unknown") =>
  entrySubmissionError(`order.intakeDecision.${key}`);
export const intakeId = (v) =>
  typeof v === "string" && /^[1-9]\d{0,9}$/.test(v) && Number(v) <= 2147483647;
export const intakeUuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
export const intakeHash = (v) =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const fail = (key) => {
  throw intakeFailure(key);
};
const validTime = (v) => {
  try {
    receiptInstant(v);
    return true;
  } catch {
    return false;
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const label = (v) =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= 500 &&
  !/[\u0000-\u001f\u007f-\u009f]/.test(v);
export function verifyIntakeReason(reason, historical = false) {
  if (
    !reason ||
    !intakeId(reason.id) ||
    !validTime(reason.version) ||
    !label(reason.label) ||
    !(
      reason.namespace === "DICTIONARY:resultRejectionReasons" ||
      (historical && reason.namespace === "QA_EVENT")
    )
  )
    return fail("requery");
  return {
    namespace: reason.namespace,
    id: reason.id,
    version: reason.version,
    label: reason.label,
  };
}
export function verifyIntakeReasons(value) {
  try {
    if (
      !value ||
      value.schema !== 1 ||
      !["READY", "EMPTY", "UNAVAILABLE"].includes(value.state) ||
      !Array.isArray(value.items) ||
      value.items.length > 1000
    )
      return fail();
    const items = value.items.map((v) => verifyIntakeReason(v));
    if (
      new Set(items.map((i) => i.id)).size !== items.length ||
      (value.state === "READY" ? !items.length : items.length)
    )
      return fail();
    return { schema: 1, state: value.state, items };
  } catch {
    return { schema: 1, state: "UNAVAILABLE", items: [] };
  }
}
const unreadable = (id, state = "INVALID_RECORD") => ({
  sampleItemId: id,
  state,
  recordedDecision: null,
  operationId: null,
  reason: null,
  decidedBy: null,
  decidedAt: null,
  currentAcceptanceVerified: false,
  evidenceDigest: null,
});
// A missing optional projection from an older server never grants this new write.
export function verifyIntakeDecisions(values, current) {
  if (values === undefined) return undefined;
  const invalid = () => current.physicalSpecimens.map((t) => unreadable(t.id));
  try {
    if (
      !Array.isArray(values) ||
      values.length !== current.physicalSpecimens.length
    )
      return invalid();
    const ids = new Set(),
      operations = new Set();
    return values.map((row) => {
      const tube = current.physicalSpecimens.find(
        (t) => t.id === row?.sampleItemId,
      );
      if (
        !tube ||
        !intakeId(row.sampleItemId) ||
        ids.has(row.sampleItemId) ||
        row.currentAcceptanceVerified !== false ||
        ![
          "NOT_RECORDED",
          "LEGACY_REJECTION",
          "RECORDED",
          "REVIEW_REQUIRED",
          "INVALID_RECORD",
        ].includes(row.state)
      )
        return fail();
      ids.add(row.sampleItemId);
      if (row.state !== "RECORDED") {
        if (
          [
            row.recordedDecision,
            row.operationId,
            row.reason,
            row.decidedBy,
            row.decidedAt,
            row.evidenceDigest,
          ].some((v) => v !== null) ||
          (row.state === "NOT_RECORDED" && tube.rejected) ||
          (row.state === "LEGACY_REJECTION" && !tube.rejected)
        )
          return fail();
        return {
          ...unreadable(row.sampleItemId, row.state),
          resultEntryAdmission: verifyIntakeAdmission(
            row.resultEntryAdmission,
            current,
            tube,
          ),
        };
      }
      if (
        !intakeUuid(row.operationId) ||
        operations.has(row.operationId) ||
        !intakeId(row.decidedBy) ||
        !validTime(row.decidedAt) ||
        !intakeHash(row.evidenceDigest) ||
        !["ACCEPTED", "REJECTED"].includes(row.recordedDecision)
      )
        return fail();
      const reason =
        row.recordedDecision === "REJECTED"
          ? verifyIntakeReason(row.reason, true)
          : null;
      if (!reason && row.reason !== null) return fail();
      operations.add(row.operationId);
      return {
        ...unreadable(row.sampleItemId),
        state: "RECORDED",
        recordedDecision: row.recordedDecision,
        operationId: row.operationId,
        reason,
        decidedBy: row.decidedBy,
        decidedAt: row.decidedAt,
        evidenceDigest: row.evidenceDigest,
        resultEntryAdmission: verifyIntakeAdmission(
          row.resultEntryAdmission,
          current,
          tube,
        ),
      };
    });
  } catch {
    return invalid();
  }
}
export const digestIntakeText = async (text) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
// Match Java SpecimenIntakeEvidence.encode exactly: stable record property order,
// numeric analysis ordering, original microseconds (never Date.toISOString).
export function intakeEvidence(current, tube) {
  const request = current.requestedSpecimens.find(
    (r) => r.id === tube.requestId && r.sampleItemId === tube.id,
  );
  if (
    !request ||
    request.status !== "COLLECTED" ||
    request.typeOfSampleId !== tube.typeOfSampleId ||
    ![
      current.sampleId,
      current.patient?.id,
      request.id,
      tube.id,
      tube.typeOfSampleId,
    ].every(intakeId) ||
    ![
      current.lastUpdated,
      request.lastUpdated,
      tube.lastUpdated,
      tube.collectionDate,
      tube.receivedDate,
    ].every(validTime) ||
    receiptInstant(tube.receivedDate) < receiptInstant(tube.collectionDate) ||
    !Array.isArray(tube.analyses) ||
    !tube.analyses.length ||
    tube.analyses.length > 5000
  )
    return fail("requery");
  const analyses = tube.analyses
    .map((a) => {
      if (!intakeId(a.id) || !intakeId(a.testId) || !validTime(a.lastUpdated))
        return fail("requery");
      return { id: a.id, testId: a.testId, version: a.lastUpdated };
    })
    .sort((a, b) => Number(a.id) - Number(b.id));
  if (
    new Set(analyses.map((a) => a.id)).size !== analyses.length ||
    !request.testIds.every((id) => analyses.some((a) => a.testId === id))
  )
    return fail("requery");
  return {
    schema: 1,
    sampleVersion: current.lastUpdated,
    requestVersion: request.lastUpdated,
    itemVersion: tube.lastUpdated,
    typeOfSampleId: tube.typeOfSampleId,
    collectionDate: tube.collectionDate,
    receivedDate: tube.receivedDate,
    analyses,
  };
}
export function intakeOptions(result) {
  try {
    const c = result.current,
      master = (kind, id) => collectionMaster(c, kind, id);
    if (
      c.workflowType !== "clinical" ||
      c.sampleId !== result.receipt.sampleId ||
      c.patient?.id !== result.receipt.patientId ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,24}$/.test(c.labNo) ||
      !["Test Entered", "Testing Started"].includes(
        master("ORDER_STATUS", c.orderStatusId)?.name,
      )
    )
      return [];
    return c.physicalSpecimens.filter((tube) => {
      try {
        if (
          c.specimenDecisions?.find((d) => d.sampleItemId === tube.id)
            ?.state !== "NOT_RECORDED" ||
          tube.rejected ||
          tube.voided ||
          typeof tube.sortOrder !== "string" ||
          !/^[1-9]\d{0,4}$/.test(tube.sortOrder) ||
          c.physicalSpecimens.filter((t) => t.sortOrder === tube.sortOrder)
            .length !== 1 ||
          !master("TYPE", tube.typeOfSampleId)?.active ||
          master("SAMPLE_STATUS", tube.statusId)?.name !== "SampleEntered" ||
          !tube.analyses.every(
            (a) =>
              master("TEST", a.testId)?.active &&
              master("ANALYSIS_STATUS", a.statusId)?.name === "Not Tested",
          )
        )
          return false;
        intakeEvidence(c, tube);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}
export async function buildIntakeDecision(
  result,
  sampleItemId,
  decision,
  reasonId,
) {
  const tube = intakeOptions(result).find((t) => t.id === sampleItemId),
    c = result.current;
  if (!tube || !["ACCEPTED", "REJECTED"].includes(decision))
    return fail("incomplete");
  const reason =
    decision === "REJECTED"
      ? c.intakeReasons?.items.find((r) => r.id === reasonId)
      : null;
  if (
    decision === "REJECTED" &&
    (c.intakeReasons?.state !== "READY" || !reason)
  )
    return fail("reasonRequired");
  const command = {
    version: 1,
    operationId: crypto.randomUUID(),
    sampleId: c.sampleId,
    labNo: c.labNo,
    patientId: c.patient.id,
    requestId: tube.requestId,
    sampleItemId: tube.id,
    decision,
    reason: reason ? verifyIntakeReason(reason) : null,
    expectedEvidenceDigest: await digestIntakeText(
      JSON.stringify(intakeEvidence(c, tube)),
    ),
  };
  return command;
}
export function verifyIntakeAck(data, command, actor) {
  if (
    !data ||
    data.success !== true ||
    typeof data.replayed !== "boolean" ||
    data.currentAcceptanceVerified !== false ||
    ![
      "sampleId",
      "labNo",
      "patientId",
      "requestId",
      "sampleItemId",
      "operationId",
    ].every((k) => data[k] === command[k]) ||
    data.recordedDecision !== command.decision ||
    !same(data.reason && verifyIntakeReason(data.reason), command.reason) ||
    !intakeId(data.decidedBy) ||
    data.decidedBy !== actor ||
    !validTime(data.decidedAt)
  )
    return fail();
}
export const intakeRecordedFacts = (result, row) => {
  const tube = result.current.physicalSpecimens.find(
    (t) => t.id === row.sampleItemId,
  );
  if (!tube || row.state !== "RECORDED") return fail();
  return [
    result.current.sampleId,
    result.current.labNo,
    result.current.patient.id,
    tube.requestId,
    tube.id,
    row.recordedDecision,
    row.reason,
    row.evidenceDigest,
    row.decidedBy,
  ];
};
export const intakeCommandFacts = (c, actor) => [
  c.sampleId,
  c.labNo,
  c.patientId,
  c.requestId,
  c.sampleItemId,
  c.decision,
  c.reason,
  c.expectedEvidenceDigest,
  actor,
];
export function verifyIntakeReadback(result, command, actor, ack) {
  const row = result.current.specimenDecisions?.find(
    (d) => d.operationId === command.operationId,
  );
  if (
    !row ||
    !same(
      intakeRecordedFacts(result, row),
      intakeCommandFacts(command, actor),
    ) ||
    !ack ||
    row.decidedBy !== ack.decidedBy ||
    row.decidedAt !== ack.decidedAt
  )
    return fail();
}
