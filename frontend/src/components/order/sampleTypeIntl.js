const SAMPLE_TYPE_MESSAGE_IDS = {
  urine: "sample.type.urine",
  urines: "sample.type.urine",
  "histopathology specimen": "sample.type.histopathology",
  serum: "sample.type.serum",
  "immunohistochemistry specimen": "sample.type.immunohistochemistry",
  plasma: "sample.type.plasma",
  "tissue antemortem": "sample.type.tissueAntemortem",
  "whole blood": "sample.type.wholeBlood",
  dbs: "sample.type.dbs",
  "dried blood spot": "sample.type.dbs",
  "dried blood spot (dbs)": "sample.type.dbs",
  "tissue post mortem": "sample.type.tissuePostMortem",
  "respiratory swab": "sample.type.respiratorySwab",
  sputum: "sample.type.sputum",
  fluid: "sample.type.fluid",
};

export const localizeSampleType = (intl, sampleTypeName) => {
  if (!sampleTypeName) return "";
  const normalized = String(sampleTypeName).trim().toLowerCase();
  const messageId = SAMPLE_TYPE_MESSAGE_IDS[normalized];
  if (!messageId) return sampleTypeName;
  return intl.formatMessage({ id: messageId, defaultMessage: sampleTypeName });
};

export default localizeSampleType;
