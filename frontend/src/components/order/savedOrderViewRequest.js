import { readOpenElisResponse } from "../utils/readOpenElisResponse";

export class SavedOrderViewError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) => typeof value === "string" && /^[1-9]\d{0,9}$/.test(value);
const text = (value) => value == null || typeof value === "string";
const optionalId = (value) => value == null || id(value);
const version = (value) =>
  value == null ||
  (typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)));
const warnings = (value) =>
  Array.isArray(value) &&
  value.length <= 50 &&
  value.every(
    (item) => typeof item === "string" && /^[A-Z][A-Z0-9_]{0,100}$/.test(item),
  );
const roles = (value) => {
  if (
    !Array.isArray(value) ||
    value.some((role) => typeof role !== "string" || !role.trim())
  )
    throw new SavedOrderViewError("unavailable");
  return [...new Set(value)].sort();
};

// A masked CSRF token rotates on reads. Ownership uses the authenticated actor,
// real session and grants, never a credential or a cached order object.
export const savedOrderSessionKey = (value) => {
  if (value?.authenticated === false)
    throw new SavedOrderViewError("unauthenticated");
  if (
    !record(value) ||
    value.authenticated !== true ||
    !id(value.userId) ||
    typeof value.sessionId !== "string" ||
    !value.sessionId.trim() ||
    (value.loginLabUnit != null && typeof value.loginLabUnit !== "string") ||
    (value.userLabRolesMap != null && !record(value.userLabRolesMap))
  )
    throw new SavedOrderViewError("unavailable");
  const scope =
    value.userLabRolesMap == null
      ? null
      : Object.keys(value.userLabRolesMap)
          .sort()
          .map((unit) => [unit, roles(value.userLabRolesMap[unit])]);
  return JSON.stringify([
    value.userId,
    value.sessionId,
    roles(value.roles),
    value.loginLabUnit ?? null,
    scope,
  ]);
};

export const validSavedOrderNumber = (value) =>
  typeof value === "string" &&
  Boolean(value.trim()) &&
  value === value.trim() &&
  value.length <= 25 &&
  !/[\u0000-\u001f\u007f]/.test(value);
export const savedOrderNumberFromSearch = (search) => {
  const params = new URLSearchParams(search);
  const numbers = params.getAll("labNumber");
  return numbers.length === 1 && validSavedOrderNumber(numbers[0])
    ? numbers[0]
    : null;
};

const readJson = async (endpoint, signal) => {
  if (signal.aborted) throw new SavedOrderViewError("unavailable");
  const response = await readOpenElisResponse(endpoint, signal);
  if (response.status === 401) throw new SavedOrderViewError("unauthenticated");
  if (response.status === 403) throw new SavedOrderViewError("forbidden");
  if (response.status === 404) throw new SavedOrderViewError("notFound");
  if (response.status === 409) throw new SavedOrderViewError("conflict");
  if (response.status === 400) throw new SavedOrderViewError("invalid");
  if (
    response.status !== 200 ||
    response.redirected ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    !response.body ||
    Number(response.headers.get("content-length")) > 2 * 1024 * 1024
  )
    throw new SavedOrderViewError("unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > 2 * 1024 * 1024)
        throw new SavedOrderViewError("unavailable");
      chunks.push(chunk.value);
    }
    if (signal.aborted) throw new SavedOrderViewError("unavailable");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new SavedOrderViewError("unavailable");
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

const checkOwner = async (signal, expectedOwner) => {
  const current = savedOrderSessionKey(await readJson("/session", signal));
  if (!expectedOwner || signal.aborted || current !== expectedOwner)
    throw new SavedOrderViewError("scope");
};
const status = (value, type) =>
  value.statusType === type &&
  optionalId(value.statusId) &&
  text(value.statusCode) &&
  text(value.statusName) &&
  version(value.lastupdated);

export const validateSavedOrder = (value, labNumber, owner) => {
  if (
    !record(value) ||
    value.queryVersion !== "2" ||
    value.currentUserId !== JSON.parse(owner)[0] ||
    !record(value.query) ||
    value.query.labNumber !== labNumber ||
    !id(value.orderId) ||
    value.labNumber !== labNumber ||
    value.readOnly !== true ||
    typeof value.canModify !== "boolean" ||
    value.isEditable !== value.canModify ||
    (value.canModify
      ? value.modifyUnavailableReason != null
      : !["MODIFY_PERMISSION_DENIED", "INCOMPLETE_ORDER_DATA"].includes(
          value.modifyUnavailableReason,
        )) ||
    !warnings(value.warningCodes) ||
    (value.patient != null &&
      (!record(value.patient) ||
        !id(value.patient.patientId) ||
        ["firstName", "lastName", "gender", "birthDate", "nationalId"].some(
          (key) => !text(value.patient[key]),
        ))) ||
    !record(value.sampleOrderItems) ||
    !Array.isArray(value.samples) ||
    value.samples.length > 2000 ||
    !Array.isArray(value.requests) ||
    value.requests.length > 2000
  )
    throw new SavedOrderViewError("unavailable");
  if (
    [
      "requestDate",
      "collectionDate",
      "receivedDateForDisplay",
      "receivedTime",
      "priority",
      "referringSiteName",
      "referringSiteCode",
      "referringSiteDepartmentName",
      "providerFirstName",
      "providerLastName",
    ].some((key) => !text(value.sampleOrderItems[key]))
  )
    throw new SavedOrderViewError("unavailable");
  const sampleIds = new Set();
  const analysisIds = new Set();
  for (const sample of value.samples) {
    if (
      !record(sample) ||
      !id(sample.sampleItemId) ||
      sampleIds.has(sample.sampleItemId) ||
      !optionalId(sample.sampleTypeId) ||
      !status(sample, "SAMPLE") ||
      !warnings(sample.warningCodes) ||
      !Array.isArray(sample.analyses) ||
      sample.analyses.length > 2000 ||
      (sample.quantity != null && !Number.isFinite(sample.quantity)) ||
      [
        "barcode",
        "typeName",
        "collectionDate",
        "collectionTime",
        "receivedDate",
        "receivedTime",
        "unitOfMeasureName",
        "collector",
      ].some((key) => !text(sample[key]))
    )
      throw new SavedOrderViewError("unavailable");
    sampleIds.add(sample.sampleItemId);
    for (const analysis of sample.analyses) {
      if (
        !record(analysis) ||
        !id(analysis.analysisId) ||
        analysisIds.has(analysis.analysisId) ||
        !optionalId(analysis.testId) ||
        !optionalId(analysis.panelId) ||
        !optionalId(analysis.testSectionId) ||
        !warnings(analysis.warningCodes) ||
        !status(analysis, "ANALYSIS") ||
        ["testName", "panelName"].some((key) => !text(analysis[key]))
      )
        throw new SavedOrderViewError("unavailable");
      analysisIds.add(analysis.analysisId);
    }
  }
  const requestIds = new Set();
  for (const request of value.requests) {
    if (
      !record(request) ||
      !id(request.sampleTypeRequestId) ||
      requestIds.has(request.sampleTypeRequestId) ||
      !optionalId(request.sampleItemId) ||
      (request.sampleItemId != null && !sampleIds.has(request.sampleItemId)) ||
      !optionalId(request.sampleTypeId) ||
      !text(request.typeName) ||
      !(
        request.status === null ||
        ["REQUESTED", "COLLECTED", "CANCELLED"].includes(request.status)
      ) ||
      !version(request.lastupdated) ||
      (request.requestedQuantity != null &&
        !Number.isFinite(request.requestedQuantity)) ||
      !warnings(request.warningCodes) ||
      !Array.isArray(request.tests) ||
      request.tests.length > 2000 ||
      new Set(request.tests.map((test) => test?.testId)).size !==
        request.tests.length ||
      request.tests.some(
        (test) => !record(test) || !id(test.testId) || !text(test.testName),
      ) ||
      !Array.isArray(request.panels) ||
      request.panels.length > 2000 ||
      new Set(request.panels.map((panel) => panel?.panelId)).size !==
        request.panels.length ||
      request.panels.some(
        (panel) =>
          !record(panel) || !id(panel.panelId) || !text(panel.panelName),
      )
    )
      throw new SavedOrderViewError("unavailable");
    requestIds.add(request.sampleTypeRequestId);
  }
  return value;
};

export async function readSavedOrder(labNumber, signal, owner) {
  if (!validSavedOrderNumber(labNumber))
    throw new SavedOrderViewError("invalid");
  await checkOwner(signal, owner);
  const params = new URLSearchParams({ queryVersion: "2", labNumber });
  const value = validateSavedOrder(
    await readJson(`/rest/order/saved?${params}`, signal),
    labNumber,
    owner,
  );
  await checkOwner(signal, owner);
  return value;
}
