import {
  entrySubmissionError,
  validOrderId,
  verifyEntryReceipt,
} from "./orderEntryReceipt";

export const ENTRY_CHECKPOINT_KEY = "lis.entry.pending.v1";
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const hash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fail = (key = "order.recovery.invalidReceipt") => {
  throw entrySubmissionError(key);
};

// One unresolved first-entry operation per browser tab. Never persist a patient,
// accession number, command body, receipt, user ID, or authentication credential.
export const readEntryCheckpoint = () => {
  try {
    const raw = sessionStorage.getItem(ENTRY_CHECKPOINT_KEY);
    if (raw === null) return { checkpoint: null, error: null };
    if (raw.length > 256) return fail();
    const value = JSON.parse(raw);
    if (
      !value ||
      Object.keys(value).sort().join(",") !==
        "requestHash,submissionId,version" ||
      value.version !== 1 ||
      !uuid(value.submissionId) ||
      !hash(value.requestHash)
    )
      return fail();
    return { checkpoint: value, error: null };
  } catch {
    return { checkpoint: null, error: "order.recovery.storageUnavailable" };
  }
};
export const rememberEntryCheckpoint = (command) => {
  const previous = readEntryCheckpoint();
  if (previous.error) return fail(previous.error);
  if (previous.checkpoint) return fail("order.save.readbackUnconfirmed");
  if (!uuid(command?.submissionId) || !hash(command?.requestHash))
    return fail();
  const value = {
    version: 1,
    submissionId: command.submissionId,
    requestHash: command.requestHash,
  };
  try {
    sessionStorage.setItem(ENTRY_CHECKPOINT_KEY, JSON.stringify(value));
    const result = readEntryCheckpoint();
    if (
      result.error ||
      result.checkpoint?.submissionId !== value.submissionId ||
      result.checkpoint?.requestHash !== value.requestHash
    )
      return fail();
    return result;
  } catch {
    return fail("order.recovery.storageUnavailable");
  }
};
export const forgetEntryCheckpoint = (reference) => {
  const current = readEntryCheckpoint();
  if (current.error) return fail(current.error);
  if (!current.checkpoint) return current;
  if (
    current.checkpoint.submissionId !== reference.submissionId ||
    current.checkpoint.requestHash !== reference.requestHash
  )
    return fail();
  try {
    sessionStorage.removeItem(ENTRY_CHECKPOINT_KEY);
    const result = readEntryCheckpoint();
    if (result.checkpoint || result.error) return fail();
    return result;
  } catch {
    return fail("order.recovery.storageUnavailable");
  }
};

const validCsv = (value, required = false) => {
  if (value == null || value === "") return !required;
  if (typeof value !== "string") return false;
  const values = value.split(",");
  return values.every(validOrderId) && new Set(values).size === values.length;
};
export const verifyRecoveredEntryReceipt = (data, reference, command) => {
  const r = data?.receipt;
  if (
    !uuid(reference?.submissionId) ||
    data?.success !== true ||
    data.replayed !== true ||
    !r ||
    r.version !== 1 ||
    r.submissionId !== reference.submissionId ||
    !hash(r.requestHash) ||
    (reference.requestHash && r.requestHash !== reference.requestHash) ||
    r.hashVersion !== "raw-json-v1" ||
    typeof r.createdAt !== "string" ||
    !Number.isFinite(Date.parse(r.createdAt)) ||
    !validOrderId(r.sampleId) ||
    typeof r.labNo !== "string" ||
    !r.labNo.trim() ||
    r.labNo.length > 256 ||
    !["clinical", "environmental"].includes(r.workflowType) ||
    (r.workflowType === "clinical"
      ? !validOrderId(r.patientId)
      : r.patientId != null) ||
    !Array.isArray(r.requestedSpecimens) ||
    !r.requestedSpecimens.length ||
    !Array.isArray(r.labelRequests)
  )
    return fail();
  const tubeIds = new Set();
  r.requestedSpecimens.forEach((tube, index) => {
    if (
      !validOrderId(tube?.id) ||
      tubeIds.has(String(tube.id)) ||
      String(tube.sampleId) !== String(r.sampleId) ||
      tube.sortOrder !== index ||
      !validOrderId(tube.typeOfSampleId) ||
      (tube.unitOfMeasureId != null &&
        tube.unitOfMeasureId !== "" &&
        !validOrderId(tube.unitOfMeasureId)) ||
      typeof tube.requestedQuantity !== "number" ||
      !Number.isFinite(tube.requestedQuantity) ||
      tube.requestedQuantity <= 0 ||
      !validCsv(tube.requestedTests, true) ||
      !validCsv(tube.requestedPanels) ||
      tube.status !== "REQUESTED" ||
      (tube.sampleItemId != null && tube.sampleItemId !== "")
    )
      return fail();
    tubeIds.add(String(tube.id));
  });
  const labelIds = new Set(),
    presets = new Set();
  for (const label of r.labelRequests) {
    if (
      ![label?.id, label?.presetId, label?.quantity].every(
        (v) => Number.isInteger(v) && v > 0 && v <= 2147483647,
      ) ||
      labelIds.has(label.id) ||
      presets.has(label.presetId)
    )
      return fail();
    labelIds.add(label.id);
    presets.add(label.presetId);
  }
  if (command) verifyEntryReceipt(data, command);
  return r;
};

export const recoverEntrySubmission = async ({
  reference,
  command,
  read,
  isCurrent,
  signal,
  resource = "history",
  verify = verifyRecoveredEntryReceipt,
}) => {
  if (!uuid(reference?.submissionId)) return fail("order.recovery.invalidCode");
  if (!["history", "current"].includes(resource)) return fail();
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timer;
  const current = () => {
    if (signal?.aborted || controller.signal.aborted || !isCurrent())
      return fail("order.progress.requestChanged");
  };
  try {
    current();
    return await Promise.race([
      (async () => {
        const response = await read(
          `/rest/SamplePatientEntry/submissions/${reference.submissionId}${resource === "current" ? "/current" : ""}`,
          controller.signal,
        );
        current();
        if ([401, 403].includes(response.status))
          return fail("order.recovery.permission");
        if (response.status === 404) return fail("order.recovery.notFound");
        if (resource === "current" && response.status === 409)
          return fail("order.recovery.currentUnavailable");
        if (
          response.status !== 200 ||
          response.redirected ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          return fail();
        const data = await response.json();
        current();
        return verify(data, reference, command);
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(entrySubmissionError("order.recovery.unavailable"));
        }, 25000);
      }),
    ]);
  } catch (error) {
    throw error?.errorKey
      ? error
      : entrySubmissionError("order.recovery.unavailable");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
};
