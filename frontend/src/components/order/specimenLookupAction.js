import { intakeHash, intakeId, intakeUuid } from "./intakeDecision";
import { receiptInstant } from "./specimenReceipt";

// A row selected in the table is only a read view. Writes are bound to the
// exact physical barcode returned by the server, never to a chosen order row.
export function exactLookupTube(result, code) {
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
    tube.rejected
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

export function sameLookupAction(before, after, code, kind) {
  const first = exactLookupTube(before, code);
  const second = exactLookupTube(after, code);
  if (
    !first ||
    !second ||
    lookupActionKind(before, code) !== kind ||
    lookupActionKind(after, code) !== kind
  )
    return false;
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

export function lookupWriteRecorded(result, code, kind, command) {
  const selected = exactLookupTube(result, code);
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
    kind === "accept" &&
    selected.tube.decisionState === "RECORDED" &&
    selected.tube.recordedDecision === "ACCEPTED" &&
    selected.tube.operationId === command.operationId
  );
}
