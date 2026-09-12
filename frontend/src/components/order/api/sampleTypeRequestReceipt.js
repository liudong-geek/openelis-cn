import { entrySubmissionError, validOrderId } from "../orderEntrySubmission";

export const unconfirmedRequestReceipt = () =>
  entrySubmissionError("order.save.readbackUnconfirmed");

const optionalId = (value) =>
  value === null || value === undefined || value === "" ? "" : String(value);
const selectionIds = (value) => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string") return null;
  const ids = value.split(",").map((id) => id.trim());
  return ids.every(validOrderId) ? ids.join(",") : null;
};

// Verify this single creation response against the dispatched JSON snapshot.
// This is not a persistent receipt or evidence that the whole order committed.
export const verifyRequestReceipt = (data, sent) => {
  const tests = selectionIds(sent.requestedTests);
  const panels = selectionIds(sent.requestedPanels);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    data.success === false ||
    !validOrderId(data.id) ||
    !validOrderId(data.sampleId) ||
    String(data.sampleId) !== String(sent.sampleId) ||
    !validOrderId(data.typeOfSampleId) ||
    String(data.typeOfSampleId) !== String(sent.typeOfSampleId) ||
    !Number.isInteger(data.sortOrder) ||
    data.sortOrder !== (sent.sortOrder ?? 0) ||
    !Number.isFinite(data.requestedQuantity) ||
    data.requestedQuantity !== (sent.requestedQuantity ?? 1) ||
    optionalId(data.unitOfMeasureId) !== optionalId(sent.unitOfMeasureId) ||
    tests === null ||
    panels === null ||
    selectionIds(data.requestedTests) !== tests ||
    selectionIds(data.requestedPanels) !== panels ||
    data.status !== "REQUESTED" ||
    optionalId(data.sampleItemId) !== ""
  ) {
    throw unconfirmedRequestReceipt();
  }
  return data;
};
