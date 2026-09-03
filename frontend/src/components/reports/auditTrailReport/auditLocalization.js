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
]);

export const getAuditEntityTypeMessageId = (entityType) =>
  ENTITY_TYPE_MESSAGE_IDS.has(entityType)
    ? `systemAudit.entityType.${entityType}`
    : "systemAudit.entityType.other";

export const getAuditFieldMessageId = (field) =>
  FIELD_MESSAGE_IDS.has(field)
    ? `systemAudit.field.${field}`
    : "systemAudit.field.other";

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
