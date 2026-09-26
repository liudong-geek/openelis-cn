import {
  intakeHash,
  intakeId,
  intakeUuid,
  verifyIntakeReason,
} from "./intakeDecision";
import { receiptInstant } from "./specimenReceipt";

// A row selected in the table is only a read view. Writes are bound to the
// exact physical barcode returned by the server, never to a chosen order row.
export function exactLookupTube(result, code, { allowRejected = false } = {}) {
  const current = result?.current;
  const selection = result?.selection;
  if (
    result?.matchedKind !== "specimen" ||
    result?.readOnly !== true ||
    current?.patientMasked !== false ||
    !intakeId(current?.patient?.id) ||
    ![current.patient.firstName, current.patient.lastName].some(Boolean) ||
    ![current.patient.birthDate, current.patient.nationalId].some(Boolean) ||
    ![
      current.sampleId,
      selection?.sampleId,
      selection?.sampleItemId,
      selection?.requestId,
    ].every(intakeId) ||
    current.sampleId !== selection.sampleId ||
    !Array.isArray(current.requestedSpecimens) ||
    !Array.isArray(current.physicalSpecimens)
  )
    return null;
  const requests = current.requestedSpecimens.filter(
    (row) =>
      row.id === selection.requestId &&
      row.sampleItemId === selection.sampleItemId,
  );
  const tubes = current.physicalSpecimens.filter(
    (row) =>
      row.id === selection.sampleItemId &&
      row.requestId === selection.requestId,
  );
  if (requests.length !== 1 || tubes.length !== 1) return null;
  const request = requests[0];
  const tube = tubes[0];
  if (
    code !== `${current.labNo}.${tube.sortOrder}` ||
    request.status !== "COLLECTED" ||
    request.typeOfSampleId !== tube.typeOfSampleId ||
    tube.voided ||
    (tube.rejected && !allowRejected)
  )
    return null;
  return { current, request, tube };
}

export function lookupActionKind(result, code) {
  const selected = exactLookupTube(result, code);
  if (!selected) return null;
  const { tube } = selected;
  if (
    tube.decisionState === "NOT_RECORDED" &&
    !tube.receivedDate &&
    tube.collectionDate
  ) {
    try {
      receiptInstant(tube.collectionDate);
      return "receipt";
    } catch {
      return null;
    }
  }
  if (
    tube.decisionState === "NOT_RECORDED" &&
    tube.receivedDate &&
    tube.collectionDate &&
    intakeHash(tube.expectedEvidenceDigest) &&
    !tube.operationId
  )
    return "accept";
  return null;
}

export function sameLookupAction(before, after, code, kind, reasonId = null) {
  const first = exactLookupTube(before, code);
  const second = exactLookupTube(after, code);
  const availableKind = kind === "reject" ? "accept" : kind;
  if (
    !first ||
    !second ||
    lookupActionKind(before, code) !== availableKind ||
    lookupActionKind(after, code) !== availableKind
  )
    return false;
  if (kind === "reject") {
    const reason = (result) =>
      result.current.intakeReasons?.state === "READY"
        ? result.current.intakeReasons.items.find(
            (item) => item.id === reasonId,
          )
        : null;
    const original = reason(before);
    const current = reason(after);
    if (
      !original ||
      !current ||
      original.namespace !== current.namespace ||
      original.id !== current.id ||
      original.version !== current.version ||
      original.label !== current.label
    )
      return false;
  }
  return (
    first.current.patient.id === second.current.patient.id &&
    first.current.patient.firstName === second.current.patient.firstName &&
    first.current.patient.lastName === second.current.patient.lastName &&
    first.current.patient.birthDate === second.current.patient.birthDate &&
    first.current.patient.nationalId === second.current.patient.nationalId &&
    first.current.patient.gender === second.current.patient.gender &&
    first.current.labNo === second.current.labNo &&
    first.current.orderStatusId === second.current.orderStatusId &&
    first.request.id === second.request.id &&
    first.request.typeOfSampleId === second.request.typeOfSampleId &&
    first.tube.id === second.tube.id &&
    first.tube.sortOrder === second.tube.sortOrder &&
    first.tube.typeOfSampleId === second.tube.typeOfSampleId &&
    first.tube.statusId === second.tube.statusId &&
    first.tube.collectionDate === second.tube.collectionDate &&
    first.tube.receivedDate === second.tube.receivedDate &&
    first.tube.expectedEvidenceDigest === second.tube.expectedEvidenceDigest
  );
}

export function buildLookupReceipt(result, code, instant) {
  const selected = exactLookupTube(result, code);
  if (!selected || lookupActionKind(result, code) !== "receipt") return null;
  try {
    if (receiptInstant(instant) < receiptInstant(selected.tube.collectionDate))
      return null;
  } catch {
    return null;
  }
  return {
    sampleId: selected.current.sampleId,
    labNo: selected.current.labNo,
    patientId: selected.current.patient.id,
    tubes: [
      {
        requestId: selected.request.id,
        sampleItemId: selected.tube.id,
        collectionDate: selected.tube.collectionDate,
        receivedDate: instant,
      },
    ],
  };
}

export function buildLookupAccept(result, code, operationId) {
  const selected = exactLookupTube(result, code);
  if (
    !selected ||
    lookupActionKind(result, code) !== "accept" ||
    !intakeUuid(operationId)
  )
    return null;
  return {
    version: 1,
    operationId,
    sampleId: selected.current.sampleId,
    labNo: selected.current.labNo,
    patientId: selected.current.patient.id,
    requestId: selected.request.id,
    sampleItemId: selected.tube.id,
    decision: "ACCEPTED",
    reason: null,
    expectedEvidenceDigest: selected.tube.expectedEvidenceDigest,
  };
}

export function buildLookupReject(result, code, operationId, reasonId) {
  const selected = exactLookupTube(result, code);
  if (
    !selected ||
    lookupActionKind(result, code) !== "accept" ||
    !intakeUuid(operationId) ||
    result.current.intakeReasons?.state !== "READY"
  )
    return null;
  try {
    const selectedReason = result.current.intakeReasons.items.find(
      (item) => item.id === reasonId,
    );
    const reason = verifyIntakeReason(selectedReason);
    return {
      version: 1,
      operationId,
      sampleId: selected.current.sampleId,
      labNo: selected.current.labNo,
      patientId: selected.current.patient.id,
      requestId: selected.request.id,
      sampleItemId: selected.tube.id,
      decision: "REJECTED",
      reason,
      expectedEvidenceDigest: selected.tube.expectedEvidenceDigest,
    };
  } catch {
    return null;
  }
}

export function lookupRecollectionResult(result, code) {
  const selected = exactLookupTube(result, code, { allowRejected: true });
  if (
    !selected ||
    !selected.tube.rejected ||
    selected.tube.decisionState !== "RECORDED" ||
    selected.tube.recordedDecision !== "REJECTED" ||
    !intakeUuid(selected.tube.operationId) ||
    !intakeHash(selected.tube.recordedEvidenceDigest)
  )
    return null;
  try {
    const reason = verifyIntakeReason(selected.tube.recordedReason, true);
    return {
      current: {
        ...selected.current,
        specimenDecisions: [
          {
            sampleItemId: selected.tube.id,
            state: "RECORDED",
            recordedDecision: "REJECTED",
            operationId: selected.tube.operationId,
            evidenceDigest: selected.tube.recordedEvidenceDigest,
            reason,
          },
        ],
      },
    };
  } catch {
    return null;
  }
}

export function lookupWriteRecorded(result, code, kind, command) {
  const selected = exactLookupTube(result, code, {
    allowRejected: kind === "reject",
  });
  if (!selected) return false;
  if (kind === "receipt") {
    try {
      const expected = command.tubes?.[0];
      return (
        command.tubes.length === 1 &&
        command.sampleId === selected.current.sampleId &&
        command.labNo === selected.current.labNo &&
        command.patientId === selected.current.patient.id &&
        expected.requestId === selected.request.id &&
        expected.sampleItemId === selected.tube.id &&
        receiptInstant(expected.collectionDate) ===
          receiptInstant(selected.tube.collectionDate) &&
        receiptInstant(expected.receivedDate) ===
          receiptInstant(selected.tube.receivedDate)
      );
    } catch {
      return false;
    }
  }
  return (
    (kind === "accept" || kind === "reject") &&
    selected.tube.decisionState === "RECORDED" &&
    selected.tube.recordedDecision === command.decision &&
    selected.tube.operationId === command.operationId &&
    (kind !== "reject" ||
      (selected.tube.rejected &&
        selected.tube.recordedEvidenceDigest ===
          command.expectedEvidenceDigest &&
        selected.tube.recordedReason?.namespace === command.reason?.namespace &&
        selected.tube.recordedReason?.id === command.reason?.id &&
        selected.tube.recordedReason?.version === command.reason?.version &&
        selected.tube.recordedReason?.label === command.reason?.label))
  );
}
