import {
  safeSampleTypeReturnTo,
  readSampleTypeListContext,
  sampleTypeDraft,
  sampleTypeUpdatePayload,
  createdSampleTypeId,
  isCompleteSampleTypeDetail,
  sampleTypeUpdateMatchesDetail,
} from "./basicEditorHelpers";

const fallback = "/MasterListsPage/SampleTypeManagement";
describe("restricted sample-type list return context", () => {
  test.each([
    "https://example.com/",
    "//example.com/",
    "/other",
    "/MasterListsPage/SampleTypeManagement/5/basic-info",
    "/other/../MasterListsPage/SampleTypeManagement",
    "/MasterListsPage/%53ampleTypeManagement",
    "/MasterListsPage/SampleTypeManagement#section",
    "/MasterListsPage/\\SampleTypeManagement",
    "/MasterListsPage/SampleTypeMan\nagement",
    "/MasterListsPage/SampleTypeManagement?x=raw value",
  ])("rejects non-literal list target %s", (value) => {
    expect(safeSampleTypeReturnTo(value, fallback)).toBe(fallback);
  });
  test("round-trips Chinese search and valid pagination while dropping unapproved parameters", () => {
    const result = safeSampleTypeReturnTo(
      "/admin/SampleTypeManagement?q=%E8%A1%80%E6%B8%85&domain=CLINICAL&page=3&pageSize=10&role=ADMIN&redirect=https%3A%2F%2Fexternal.example",
      fallback,
    );
    expect(result).toBe(
      "/admin/SampleTypeManagement?q=%E8%A1%80%E6%B8%85&domain=CLINICAL&page=3&pageSize=10",
    );
    expect(readSampleTypeListContext("?page=-2&pageSize=99")).toEqual({
      searchText: "",
      domainFilter: "",
      page: 1,
      pageSize: 20,
    });
  });
  test("preserves complete metadata in the draft and sends only intended basic changes", () => {
    const detail = Object.freeze({
      id: "5",
      name: "fallback",
      description: "internal",
      abbreviation: "SR",
      sortOrder: 7,
      whonetCode: "SER",
      disposalInstructions: "keep",
      active: true,
      domain: "CLINICAL",
      translations: Object.freeze({ en: "Serum", fr: "Sérum", ar: "other" }),
    });
    const draft = sampleTypeDraft(detail);
    expect(draft.nameZh).toBe("");
    expect(draft.sortOrder).toBe(7);
    expect(draft.disposalInstructions).toBe("keep");
    expect(draft.translations).toBe(detail.translations);
    expect(
      sampleTypeUpdatePayload(
        { ...draft, abbreviation: "S2", nameZh: "血清" },
        draft,
      ),
    ).toEqual({
      id: "5",
      abbreviation: "S2",
      nameZh: "血清",
      domain: "CLINICAL",
      isActive: true,
    });
    expect(detail.abbreviation).toBe("SR");
  });
  test.each([
    undefined,
    null,
    {},
    { createdSampleTypeId: "" },
    { createdSampleTypeId: "unknown" },
    { createdSampleTypeId: 0 },
    { createdSampleTypeId: { id: "5" } },
  ])(
    "does not mistake an unknown creation result for a business ID",
    (response) => {
      expect(createdSampleTypeId(response)).toBeNull();
    },
  );
});

describe("complete sample-type detail and uncertain update verification", () => {
  const full = {
    id: "5",
    description: "Serum-internal",
    abbreviation: "SR",
    domain: "CLINICAL",
    isActive: false,
    sortOrder: 0,
    translations: { en: "Serum", fr: "Sérum", ar: null },
  };
  test("accepts actual nullable DTO strings and missing Chinese without inventing metadata", () => {
    expect(isCompleteSampleTypeDetail(full, "5")).toBe(true);
    expect(
      isCompleteSampleTypeDetail(
        { ...full, description: null, abbreviation: null, translations: {} },
        "5",
      ),
    ).toBe(true);
    expect(full.translations).not.toHaveProperty("zh");
  });
  test.each([
    "description",
    "abbreviation",
    "domain",
    "isActive",
    "sortOrder",
    "translations",
  ])("rejects a detail projection missing %s", (field) => {
    const projection = { ...full };
    delete projection[field];
    expect(isCompleteSampleTypeDetail(projection, "5")).toBe(false);
  });
  test("rejects malformed field types and identity instead of mapping defaults", () => {
    for (const invalid of [
      { id: "" },
      { id: "6" },
      { id: 5 },
      { description: {} },
      { abbreviation: [] },
      { domain: null },
      { isActive: "N" },
      { sortOrder: 1.5 },
      { translations: [] },
      { translations: null },
      { translations: { zh: {} } },
    ])
      expect(isCompleteSampleTypeDetail({ ...full, ...invalid }, "5")).toBe(
        false,
      );
  });
  test("verifies every sent field and canonical zh, preserving an omitted zh contract", () => {
    const payload = {
      id: "5",
      abbreviation: "SR",
      domain: "CLINICAL",
      isActive: false,
    };
    expect(sampleTypeUpdateMatchesDetail(full, payload)).toBe(true);
    for (const change of [
      { abbreviation: "S2" },
      { domain: "ENVIRONMENTAL" },
      { isActive: true },
      { nameZh: "血清" },
    ])
      expect(
        sampleTypeUpdateMatchesDetail(full, { ...payload, ...change }),
      ).toBe(false);
    expect(
      sampleTypeUpdateMatchesDetail(
        { ...full, translations: { ...full.translations, zh: "血清" } },
        { ...payload, nameZh: "血清" },
      ),
    ).toBe(true);
  });
});
