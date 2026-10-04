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

describe("basic configuration snapshot identity and fields", () => {
  test.each([
    ["LOCALIZATION", "sampleType", "900", "25", "TYPE_OF_SAMPLE"],
    ["TYPE_OF_SAMPLE", "sampleType", "25", "25", "TYPE_OF_SAMPLE"],
    ["TEST", "testCatalog", "373", "373", "TEST"],
    ["TEST", "testCatalog", 373, 373, "TEST"],
  ])(
    "maps only matching %s/%s business contexts",
    (entityType, configurationType, entityId, businessId, expectedType) => {
      expect(
        getAuditBusinessContext({
          entityType,
          configurationType,
          entityId,
          businessId,
        }),
      ).toEqual({ entityType: expectedType, entityId: String(businessId) });
    },
  );

  test.each([
    ["TEST", "sampleType", "373", "25"],
    ["TYPE_OF_SAMPLE", "testCatalog", "25", "373"],
    ["LOCALIZATION", "testCatalog", "900", "373"],
    ["TYPE_OF_SAMPLE", "sampleType", "26", "25"],
    ["TEST", "testCatalog", "374", "373"],
    ["PATIENT", "sampleType", "25", "25"],
    ["UNKNOWN_TABLE", "testCatalog", "373", "373"],
    ["LOCALIZATION", "constructor", "900", "25"],
    ["LOCALIZATION", "__proto__", "900", "25"],
    ["LOCALIZATION", "sampleType", "not-an-id", "25"],
  ])(
    "retains source identity for incompatible %s/%s",
    (entityType, configurationType, entityId, businessId) => {
      expect(
        getAuditBusinessContext({
          entityType,
          configurationType,
          entityId,
          businessId,
        }),
      ).toEqual({ entityType, entityId });
    },
  );

  test.each([
    0,
    -1,
    1.2,
    Number.MAX_SAFE_INTEGER + 1,
    "0",
    "-1",
    "01",
    "1e2",
    " 25",
    "25 ",
    "",
    null,
    undefined,
    true,
    [25],
    {},
  ])(
    "rejects invalid business ID %j without relabeling history",
    (businessId) => {
      expect(
        getAuditBusinessContext({
          entityType: "LOCALIZATION",
          configurationType: "sampleType",
          entityId: "900",
          businessId,
        }),
      ).toEqual({ entityType: "LOCALIZATION", entityId: "900" });
    },
  );

  test.each([
    ["code", "code"],
    ["description", "description"],
    ["domain", "domain"],
    ["labUnitId", "labUnitId"],
    ["sampleTypeIds", "sampleTypeIds"],
    ["antimicrobialResistance", "antimicrobialResistance"],
    ["active", "active"],
    ["orderable", "orderable"],
    ["abbreviation", "localAbbreviation"],
    ["whonetCode", "whonetCode"],
    ["disposalInstructions", "disposalInstructions"],
    ["isActive", "active"],
    ["sortOrder", "sortOrder"],
  ])(
    "labels persisted field %s without a generic fallback",
    (field, canonical) => {
      expect(getAuditFieldMessageId(field)).toBe(
        `systemAudit.field.${canonical}`,
      );
    },
  );
  test.each([
    "configurationType",
    "businessId",
    "unknownField",
    "constructor",
    "__proto__",
  ])("does not invent a known label for %s", (field) => {
    expect(getAuditFieldMessageId(field)).toBe("systemAudit.field.other");
  });
});
