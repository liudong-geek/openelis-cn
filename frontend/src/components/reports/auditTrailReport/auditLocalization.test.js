import {
  getAuditActionMessageId,
  getAuditEntityTypeMessageId,
  getAuditFieldMessageId,
} from "./auditLocalization";

describe("operation log localization", () => {
  test.each([
    ["PATIENT", "systemAudit.entityType.PATIENT"],
    ["TEST_SECTION", "systemAudit.entityType.TEST_SECTION"],
    ["analyzer", "systemAudit.entityType.analyzer"],
    ["unknown_table", "systemAudit.entityType.other"],
  ])("maps backend entity code %s to an operator message", (code, expected) => {
    expect(getAuditEntityTypeMessageId(code)).toBe(expected);
  });

  test.each([
    ["I", "systemAudit.action.insert"],
    ["Insert", "systemAudit.action.insert"],
    ["U", "systemAudit.action.update"],
    ["Delete", "systemAudit.action.delete"],
  ])("maps backend action %s to an operator message", (action, expected) => {
    expect(getAuditActionMessageId(action)).toBe(expected);
  });

  test.each([
    ["firstName", "systemAudit.field.firstName"],
    ["testSectionName", "systemAudit.field.testSectionName"],
    ["unknownField", "systemAudit.field.other"],
  ])("maps audited field %s to an operator message", (field, expected) => {
    expect(getAuditFieldMessageId(field)).toBe(expected);
  });
});
