const ENTITY_TYPE_MESSAGE_IDS = new Set([
  "TEST",
  "PANEL",
  "METHOD",
  "TEST_SECTION",
  "TYPE_OF_SAMPLE",
  "RESULT_LIMITS",
  "SYSTEM_USER",
  "SYSTEM_ROLE",
  "SYSTEM_USER_ROLE",
  "DICTIONARY",
  "DICTIONARY_CATEGORY",
  "analyzer",
  "site_information",
  "QA_EVENT",
  "ANALYSIS_QAEVENT",
  "ANALYSIS_QAEVENT_ACTION",
  "QA_OBSERVATION",
  "PATIENT",
  "PERSON",
  "LOCALIZATION",
]);

const FIELD_MESSAGE_IDS = new Set([
  "nationalId",
  "externalId",
  "gender",
  "firstName",
  "lastName",
  "email",
  "primaryPhone",
  "description",
  "loinc",
  "panelName",
  "testSectionName",
  "localAbbreviation",
  "dictEntry",
  "name",
  "value",
  "birthDateForDisplay",
  "code",
  "domain",
  "labUnitId",
  "sampleTypeIds",
  "antimicrobialResistance",
  "active",
  "orderable",
  "whonetCode",
  "disposalInstructions",
  "sortOrder",
  "en",
  "fr",
  "zh",
]);

export const getAuditEntityTypeMessageId = (entityType) =>
  ENTITY_TYPE_MESSAGE_IDS.has(entityType)
    ? `systemAudit.entityType.${entityType}`
    : "systemAudit.entityType.other";

const FIELD_ALIASES = new Map([
  ["abbreviation", "localAbbreviation"],
  ["isActive", "active"],
]);

export const getAuditFieldMessageId = (field) => {
  const canonicalField = FIELD_ALIASES.get(field) || field;
  return FIELD_MESSAGE_IDS.has(canonicalField)
    ? `systemAudit.field.${canonicalField}`
    : "systemAudit.field.other";
};

export const getAuditActionMessageId = (action) => {
  const normalized = String(action || "")
    .trim()
    .toLowerCase();
  if (normalized === "i" || normalized === "insert") {
    return "systemAudit.action.insert";
  }
  if (normalized === "u" || normalized === "update") {
    return "systemAudit.action.update";
  }
  if (normalized === "d" || normalized === "delete") {
    return "systemAudit.action.delete";
  }
  return "systemAudit.action.other";
};

const CONFIGURATION_ENTITIES = new Map([
  ["panel", "PANEL"],
  ["testSection", "TEST_SECTION"],
  ["sampleType", "TYPE_OF_SAMPLE"],
  ["testCatalog", "TEST"],
]);

const positiveId = (value) => {
  if (typeof value === "number")
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : null;
};

/** Only named snapshots with matching source entities may display business IDs. */
export const getAuditBusinessContext = (event) => {
  const original = { entityType: event.entityType, entityId: event.entityId };
  const businessType = CONFIGURATION_ENTITIES.get(event.configurationType);
  const businessId = positiveId(event.businessId);
  const referenceId = positiveId(event.entityId);
  if (!businessType || !businessId || !referenceId) return original;

  const namedTranslation =
    event.entityType === "LOCALIZATION" &&
    ["panel", "testSection", "sampleType"].includes(event.configurationType);
  const namedObject =
    ((event.entityType === "TYPE_OF_SAMPLE" &&
      event.configurationType === "sampleType") ||
      (event.entityType === "TEST" &&
        event.configurationType === "testCatalog")) &&
    referenceId === businessId;
  return namedTranslation || namedObject
    ? { entityType: businessType, entityId: businessId }
    : original;
};
