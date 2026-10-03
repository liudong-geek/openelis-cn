const copyValue = (value) => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, copyValue(entry)]),
    );
  }
  return value;
};

const hasId = (value) => value != null && String(value).trim() !== "";
const selectedTests = (sample) =>
  Array.isArray(sample?.tests) ? sample.tests : [];

export const hasIncompleteAddedSamples = (samples = []) =>
  samples.some(
    (sample) =>
      !hasId(sample?.sampleTypeId) ||
      selectedTests(sample).length === 0 ||
      selectedTests(sample).some((test) => !hasId(test?.id)),
  );

const escapeAttribute = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const sampleElement = (sample) => {
  const details = sample.sampleXML ?? {};
  const location = details.storageLocation ?? {};
  const attributes = {
    sampleID: sample.sampleTypeId,
    date: details.collectionDate,
    time: details.collectionTime,
    collector: details.collector,
    quantity: details.quantity,
    uom: details.uom,
    tests: selectedTests(sample)
      .map((test) => test.id)
      .join(","),
    testSectionMap: details.testSectionMap ?? "",
    testSampleTypeMap: details.testSampleTypeMap ?? "",
    panels: (sample.panels ?? []).map((panel) => panel.id).join(","),
    rejected: details.rejected ?? sample.sampleRejected ?? false,
    rejectReasonId: details.rejectionReason ?? sample.rejectionReason,
    initialConditionIds: details.initialConditionIds ?? "",
    collectionMethod: details.collectionMethod,
    sampleTemperature: details.sampleTemperature,
    specimenOrigin: details.specimenOrigin,
    storageLocationId: details.storageLocationId ?? location.id,
    storageLocationType: details.storageLocationType ?? location.type,
    storagePositionCoordinate:
      details.storagePositionCoordinate ?? location.positionCoordinate,
    gpsLatitude: details.gpsLatitude,
    gpsLongitude: details.gpsLongitude,
    gpsAccuracy: details.gpsAccuracy,
    gpsCaptureMethod: details.gpsCaptureMethod,
  };
  [
    "sampleNatureId",
    "collectionConditions",
    "receivedDate",
    "receivedTime",
    "numOrderLabels",
    "numSpecimenLabels",
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(details, key))
      attributes[key] = details[key];
  });
  return `<sample ${Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ")}/>`;
};

export const buildSampleEditPayload = (orderFormValues, samples = []) => {
  const payload = copyValue(orderFormValues);
  payload.sampleOrderItems = { ...payload.sampleOrderItems, modified: true };
  [
    "priorityList",
    "programList",
    "referringSiteList",
    "providersList",
    "paymentOptions",
    "testLocationCodeList",
  ].forEach((key) => {
    payload.sampleOrderItems[key] = [];
  });
  ["initialSampleConditionList", "testSectionList"].forEach((key) => {
    payload[key] = [];
  });
  const addedSamples = samples.filter(
    (sample) =>
      selectedTests(sample).length > 0 &&
      selectedTests(sample).every((test) => hasId(test?.id)),
  );
  payload.sampleXML = addedSamples.length
    ? `<samples>${addedSamples.map(sampleElement).join("")}</samples>`
    : "<samples/>";
  return payload;
};
