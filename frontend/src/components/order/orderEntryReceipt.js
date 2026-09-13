// The client freezes one wire command. Only the server's durable receipt can
// confirm it; a normal order search is not evidence about this submission.
export const entrySubmissionError = (key, status) =>
  Object.assign(new Error(key), {
    errorKey: key,
    status,
    code:
      key === "order.save.readbackUnconfirmed"
        ? "WRITE_READBACK_UNCONFIRMED"
        : key === "security.sessionWriteBlocked"
          ? "SESSION_WRITE_BLOCKED"
          : undefined,
  });
export const validOrderId = (id) =>
  (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
  (typeof id === "string" && /^[1-9]\d*$/.test(id));
const invalid = () => {
  throw entrySubmissionError("order.save.incomplete");
};
const unconfirmed = () => {
  throw entrySubmissionError("order.save.readbackUnconfirmed");
};
const id = (value) => (validOrderId(value) ? String(value) : invalid());
const ids = (values) => {
  if (!Array.isArray(values)) return invalid();
  const result = values.map((value) => id(value?.id ?? value));
  if (new Set(result).size !== result.length) return invalid();
  return result.join(",");
};
const csv = (value) => {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return unconfirmed();
  const parts = value.split(",");
  if (
    parts.some((v) => !validOrderId(v)) ||
    new Set(parts).size !== parts.length
  )
    return unconfirmed();
  return parts.sort().join(",");
};

const expectedOrderLabels = (form, reject) => {
  const labels = form.labelPersistRequest;
  const result = new Map();
  if (labels == null) return result;
  // Match OrderLabelPersistRequest and the real LabelsSection payload. Camel
  // aliases are ignored by that DTO and must not silently lose user choices.
  if (
    typeof labels !== "object" ||
    Array.isArray(labels) ||
    labels.orderCells != null ||
    labels.sampleRows != null ||
    (labels.order_cells != null && !Array.isArray(labels.order_cells))
  )
    return reject();
  for (const cell of labels.order_cells || []) {
    const preset = Number(cell?.preset_id);
    const quantity = Number(cell?.qty);
    if (
      !validOrderId(cell?.preset_id) ||
      !Number.isSafeInteger(preset) ||
      preset > 2147483647 ||
      !["string", "number"].includes(typeof cell?.qty) ||
      cell.qty === "" ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0 ||
      quantity > 2147483647 ||
      result.has(preset)
    )
      return reject();
    result.set(preset, quantity);
  }
  for (const [preset, quantity] of result)
    if (quantity === 0) result.delete(preset);
  return result;
};

const emptyId = (value) => value == null || value === "";
export const isFirstEntry = (form, orderId) =>
  emptyId(orderId) &&
  emptyId(form.sampleOrderItems?.sampleId) &&
  (form.sampleOrderItems?.modified == null ||
    form.sampleOrderItems.modified === false);

export const isPersistedEntry = (form, orderId) => {
  const supplied = [orderId, form.sampleOrderItems?.sampleId].filter(
    (value) => !emptyId(value),
  );
  return (
    supplied.length > 0 &&
    supplied.every(validOrderId) &&
    new Set(supplied.map(String)).size === 1
  );
};

// A transport status alone cannot prove the transaction was rejected. Match
// only the existing backend's explicit validation contracts, never conflicts.
export const isEntryInputRejection = (data) => {
  if (
    !data ||
    Array.isArray(data) ||
    typeof data !== "object" ||
    data.receipt != null ||
    data.success === true
  )
    return false;
  if (data.success === false)
    return (
      data.code === "ENTRY_SUBMISSION_INVALID" &&
      typeof data.message === "string" &&
      data.message.trim().length > 0
    );
  return (
    data.success == null &&
    data.code == null &&
    typeof data.error === "string" &&
    data.error.trim().length > 0 &&
    Array.isArray(data.fieldErrors) &&
    Array.isArray(data.globalErrors) &&
    data.fieldErrors.every(
      (field) =>
        typeof field?.field === "string" &&
        typeof field.defaultMessage === "string",
    ) &&
    data.globalErrors.every((error) => typeof error === "string")
  );
};

export const freezeEntrySubmission = async (form, samples) => {
  if (
    !form.orderEntryOnly ||
    form.collectionOnly ||
    form.sampleXML ||
    !form.sampleOrderItems?.labNo?.trim() ||
    !samples.length
  )
    return invalid();
  expectedOrderLabels(form, invalid);
  const requestedSpecimens = samples.map((sample, index) => {
    // A logical tube defaults to one; malformed/zero quantities are not defaults.
    if (
      sample.quantity != null &&
      !["number", "string"].includes(typeof sample.quantity)
    )
      return invalid();
    const requestedQuantity =
      sample.quantity == null || sample.quantity === ""
        ? 1
        : Number(sample.quantity);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0)
      return invalid();
    const requestedTests = ids(sample.tests || []);
    if (!requestedTests) return invalid();
    return {
      typeOfSampleId: id(sample.sampleTypeId),
      sortOrder: index,
      requestedQuantity,
      unitOfMeasureId: sample.quantityUnit ? id(sample.quantityUnit) : null,
      requestedTests,
      requestedPanels: ids(sample.panels || []),
    };
  });
  const body = JSON.stringify({ ...form, requestedSpecimens });
  const bytes = new TextEncoder().encode(body);
  if (bytes.byteLength > 16 * 1024 * 1024) return invalid();
  // Fail before dispatch when crypto is unavailable; never fall back to a weak key.
  const submissionId = globalThis.crypto.randomUUID();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("raw-json-v1\n" + body),
  );
  const requestHash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return Object.freeze({ submissionId, requestHash, body });
};

export const verifyEntryReceipt = (data, command) => {
  const sent = JSON.parse(command.body);
  const r = data?.receipt;
  const environmental =
    sent.sampleOrderItems.environmentalFields?.workflowType === "environmental";
  const eqa = sent.sampleOrderItems.isEQASample === true;
  const patient = sent.patientProperties;
  if (
    data?.success !== true ||
    typeof data.replayed !== "boolean" ||
    !r ||
    r.version !== 1 ||
    r.submissionId !== command.submissionId ||
    r.requestHash !== command.requestHash ||
    r.hashVersion !== "raw-json-v1" ||
    typeof r.createdAt !== "string" ||
    !Number.isFinite(Date.parse(r.createdAt)) ||
    !validOrderId(r.sampleId) ||
    r.labNo !== sent.sampleOrderItems.labNo ||
    r.workflowType !== (environmental ? "environmental" : "clinical") ||
    (environmental ? r.patientId != null : !validOrderId(r.patientId)) ||
    (!environmental &&
      !eqa &&
      patient?.patientUpdateStatus !== "ADD" &&
      String(r.patientId) !== String(patient?.patientPK)) ||
    !Array.isArray(r.requestedSpecimens) ||
    r.requestedSpecimens.length !== sent.requestedSpecimens.length ||
    !Array.isArray(r.labelRequests)
  )
    return unconfirmed();
  const tubeIds = new Set();
  r.requestedSpecimens.forEach((tube, index) => {
    const expected = sent.requestedSpecimens[index];
    if (
      !tube ||
      !validOrderId(tube.id) ||
      tubeIds.has(String(tube.id)) ||
      String(tube.sampleId) !== String(r.sampleId) ||
      tube.sortOrder !== index ||
      tube.typeOfSampleId !== expected.typeOfSampleId ||
      tube.requestedQuantity !== expected.requestedQuantity ||
      (tube.unitOfMeasureId || null) !== expected.unitOfMeasureId ||
      csv(tube.requestedTests) !== csv(expected.requestedTests) ||
      csv(tube.requestedPanels) !== csv(expected.requestedPanels) ||
      tube.status !== "REQUESTED" ||
      (tube.sampleItemId != null && tube.sampleItemId !== "")
    )
      return unconfirmed();
    tubeIds.add(String(tube.id));
  });
  const expectedLabels = expectedOrderLabels(sent, unconfirmed);
  const labelIds = new Set();
  for (const label of r.labelRequests) {
    if (
      !label ||
      !validOrderId(label.id) ||
      labelIds.has(String(label.id)) ||
      !Number.isInteger(label.quantity) ||
      label.quantity <= 0 ||
      expectedLabels.get(label.presetId) !== label.quantity
    )
      return unconfirmed();
    labelIds.add(String(label.id));
    expectedLabels.delete(label.presetId);
  }
  if (expectedLabels.size) return unconfirmed();
  return {
    id: String(r.sampleId),
    labNumber: r.labNo,
    patientProperties: environmental ? {} : { patientPK: String(r.patientId) },
    entryReceipt: r,
    submissionId: command.submissionId,
  };
};
