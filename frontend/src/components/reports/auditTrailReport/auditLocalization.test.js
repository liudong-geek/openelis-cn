import {
  getAuditActionMessageId,
  getAuditBusinessContext,
  getAuditEntityTypeMessageId,
  getAuditFieldMessageId,
} from "./auditLocalization";

describe("operation log localization", () => {
  test.each([
    ["PATIENT", "systemAudit.entityType.PATIENT"],
    ["TEST_SECTION", "systemAudit.entityType.TEST_SECTION"],
    ["LOCALIZATION", "systemAudit.entityType.LOCALIZATION"],
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
    ["zh", "systemAudit.field.zh"],
    ["en", "systemAudit.field.en"],
    ["fr", "systemAudit.field.fr"],
    ["unknownField", "systemAudit.field.other"],
  ])("maps audited field %s to an operator message", (field, expected) => {
    expect(getAuditFieldMessageId(field)).toBe(expected);
  });
});

describe("configuration-name audit identity", () => {
  test.each([
    ["panel", "PANEL"],
    ["testSection", "TEST_SECTION"],
  ])(
    "uses %s business ID rather than translation ID",
    (configurationType, entityType) => {
      expect(
        getAuditBusinessContext({
          entityType: "LOCALIZATION",
          entityId: "132",
          configurationType,
          businessId: "1",
        }),
      ).toEqual({ entityType, entityId: "1" });
    },
  );
  test.each([
    {
      entityType: "LOCALIZATION",
      entityId: "132",
      configurationType: "other",
      businessId: "1",
    },
    {
      entityType: "LOCALIZATION",
      entityId: "132",
      configurationType: "panel",
      businessId: "bad-id",
    },
    {
      entityType: "PATIENT",
      entityId: "132",
      configurationType: "panel",
      businessId: "1",
    },
  ])("keeps other history identity unchanged", (event) => {
    expect(getAuditBusinessContext(event)).toEqual({
      entityType: event.entityType,
      entityId: event.entityId,
    });
  });
});
