const SAMPLE_STATUSES = {
  Entered: ["sample.management.sampleStatus.Entered", "blue"],
  SampleRejected: ["sample.management.sampleStatus.SampleRejected", "red"],
  Canceled: ["sample.management.sampleStatus.Canceled", "red"],
  Disposed: ["sample.management.sampleStatus.Disposed", "gray"],
};
const ANALYSIS_STATUSES = {
  NotStarted: ["sample.management.analysisStatus.NotStarted", "blue"],
  TechnicalAcceptance: [
    "sample.management.analysisStatus.TechnicalAcceptance",
    "cyan",
  ],
  SampleRejected: ["sample.management.analysisStatus.SampleRejected", "red"],
  Canceled: ["sample.management.analysisStatus.Canceled", "red"],
  TechnicalRejected: [
    "sample.management.analysisStatus.TechnicalRejected",
    "red",
  ],
  BiologistRejected: [
    "sample.management.analysisStatus.BiologistRejected",
    "red",
  ],
  NonConforming_depricated: [
    "sample.management.analysisStatus.NonConforming_depricated",
    "gray",
  ],
  Finalized: ["sample.management.analysisStatus.Finalized", "green"],
};

export const statusPresentation = (code, category) => {
  const statuses = category === "sample" ? SAMPLE_STATUSES : ANALYSIS_STATUSES;
  return typeof code === "string" &&
    Object.prototype.hasOwnProperty.call(statuses, code)
    ? statuses[code]
    : ["sample.management.status.unconfirmed", "gray"];
};

export const validSampleId = (value) =>
  typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value);

export const canCancelTest = (sample, test, canCancelTests) =>
  canCancelTests === true &&
  validSampleId(sample?.id) &&
  validSampleId(test?.analysisId) &&
  validSampleId(test?.testId) &&
  sample?.statusCode === "Entered" &&
  test?.canCancelByStatus === true &&
  (test.statusCode === "NotStarted" ||
    test.statusCode === "TechnicalAcceptance");

export const cancellationMatches = (body, sampleId, original) =>
  validSampleId(sampleId) &&
  validSampleId(original?.analysisId) &&
  validSampleId(original?.testId) &&
  body?.success === true &&
  body.analysisId === original.analysisId &&
  body.sampleItemId === sampleId &&
  body.test?.analysisId === original.analysisId &&
  body.test.testId === original.testId &&
  typeof body.test.testName === "string" &&
  body.test.statusCode === "Canceled" &&
  body.test.canCancelByStatus === false;
