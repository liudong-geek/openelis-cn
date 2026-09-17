import {
  createRecollection,
  readRecollection,
  RecollectionTransportError,
} from "./recollectionTransport";

const id = (value: unknown) => /^[1-9]\d*$/.test(String(value ?? ""));
const uuid = (value: unknown) =>
  /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(String(value ?? ""));
const digest = (value: unknown) => /^[a-f0-9]{64}$/.test(String(value ?? ""));
const labNo = (value: unknown) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,24}$/.test(String(value ?? ""));

export type RecollectionReceipt = {
  success: true;
  version: 1;
  replayed: boolean;
  operationId: string;
  sampleId: string;
  labNo: string;
  patientId: string;
  sourceRequestId: string;
  sourceSampleItemId: string;
  sourceDecisionOperationId: string;
  evidenceDigest: string;
  createdBy: string;
  createdAt: string;
  request: {
    id: string;
    sortOrder: number;
    typeOfSampleId: string;
    requestedQuantity: number;
    unitOfMeasureId: string | null;
    testIds: string[];
    panelIds: string[];
    status: "REQUESTED";
    sampleItemId: null;
    createdAt: string;
    lastUpdated: string;
  };
};

export function validateRecollectionReceipt(
  value: unknown,
  expected: {
    sampleId: string;
    sourceSampleItemId: string;
    operationId?: string;
  },
): RecollectionReceipt {
  const receipt = value as RecollectionReceipt;
  if (
    !receipt ||
    receipt.success !== true ||
    receipt.version !== 1 ||
    typeof receipt.replayed !== "boolean" ||
    !uuid(receipt.operationId) ||
    receipt.sampleId !== expected.sampleId ||
    receipt.sourceSampleItemId !== expected.sourceSampleItemId ||
    (expected.operationId && receipt.operationId !== expected.operationId) ||
    !labNo(receipt.labNo) ||
    !id(receipt.patientId) ||
    !id(receipt.sourceRequestId) ||
    !uuid(receipt.sourceDecisionOperationId) ||
    !digest(receipt.evidenceDigest) ||
    !id(receipt.createdBy) ||
    !Number.isFinite(Date.parse(receipt.createdAt)) ||
    !receipt.request ||
    !id(receipt.request.id) ||
    !Number.isSafeInteger(receipt.request.sortOrder) ||
    receipt.request.sortOrder < 1 ||
    !id(receipt.request.typeOfSampleId) ||
    !Number.isFinite(receipt.request.requestedQuantity) ||
    receipt.request.requestedQuantity <= 0 ||
    receipt.request.status !== "REQUESTED" ||
    receipt.request.sampleItemId !== null ||
    !Array.isArray(receipt.request.testIds) ||
    receipt.request.testIds.length === 0 ||
    !receipt.request.testIds.every(id) ||
    new Set(receipt.request.testIds).size !== receipt.request.testIds.length ||
    !Array.isArray(receipt.request.panelIds) ||
    !receipt.request.panelIds.every(id) ||
    new Set(receipt.request.panelIds).size !==
      receipt.request.panelIds.length ||
    (receipt.request.unitOfMeasureId !== null &&
      !id(receipt.request.unitOfMeasureId)) ||
    !Number.isFinite(Date.parse(receipt.request.createdAt)) ||
    !Number.isFinite(Date.parse(receipt.request.lastUpdated))
  )
    throw new RecollectionTransportError();
  return receipt;
}

export function recollectionCandidate(current: any, decision: any) {
  const item = current?.physicalSpecimens?.find(
    (value: any) => value.id === decision?.sampleItemId,
  );
  const request = current?.requestedSpecimens?.find(
    (value: any) => value.id === item?.requestId,
  );
  if (
    decision?.state !== "RECORDED" ||
    decision?.recordedDecision !== "REJECTED" ||
    !uuid(decision.operationId) ||
    !digest(decision.evidenceDigest) ||
    !item?.rejected ||
    item?.voided ||
    request?.status !== "COLLECTED" ||
    request?.sampleItemId !== item?.id ||
    !id(current?.sampleId) ||
    !labNo(current?.labNo) ||
    !id(current?.patient?.id) ||
    !id(request?.id) ||
    !id(item?.id)
  )
    return null;
  return { item, request, decision };
}

export async function submitRecollection(
  current: any,
  decision: any,
  csrf: string,
  signal: AbortSignal,
) {
  const candidate = recollectionCandidate(current, decision);
  if (!candidate || !csrf || !globalThis.crypto?.randomUUID)
    throw new RecollectionTransportError("RECOLLECTION_INVALID", 400);
  const operationId = globalThis.crypto.randomUUID().toLowerCase();
  const command = {
    version: 1,
    operationId,
    sampleId: String(current.sampleId),
    labNo: current.labNo,
    patientId: String(current.patient.id),
    sourceRequestId: String(candidate.request.id),
    sourceSampleItemId: String(candidate.item.id),
    sourceDecisionOperationId: candidate.decision.operationId,
    expectedEvidenceDigest: candidate.decision.evidenceDigest,
  };
  const value = await createRecollection(JSON.stringify(command), csrf, signal);
  return validateRecollectionReceipt(value, {
    sampleId: command.sampleId,
    sourceSampleItemId: command.sourceSampleItemId,
    operationId,
  });
}

export async function recoverRecollection(
  sampleId: string,
  sourceSampleItemId: string,
  signal: AbortSignal,
) {
  if (!id(sampleId) || !id(sourceSampleItemId))
    throw new RecollectionTransportError("RECOLLECTION_INVALID", 400);
  const value = await readRecollection(sampleId, sourceSampleItemId, signal);
  return validateRecollectionReceipt(value, { sampleId, sourceSampleItemId });
}
