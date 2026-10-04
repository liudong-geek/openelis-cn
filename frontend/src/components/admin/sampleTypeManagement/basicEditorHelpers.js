const PAGE_SIZES = [10, 20, 30, 50, 100];
const BASE_PATHS = [
  "/MasterListsPage/SampleTypeManagement",
  "/admin/SampleTypeManagement",
];

export const readSampleTypeListContext = (search = "") => {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  return {
    searchText: (params.get("q") || "").slice(0, 200),
    domainFilter: (params.get("domain") || "").slice(0, 64),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 20,
  };
};

export const sampleTypeListUrl = (base, context) => {
  const path = BASE_PATHS.includes(base) ? base : BASE_PATHS[0];
  const params = new URLSearchParams();
  if (context.searchText) params.set("q", context.searchText.slice(0, 200));
  if (context.domainFilter)
    params.set("domain", context.domainFilter.slice(0, 64));
  if (context.page > 1) params.set("page", String(context.page));
  if (context.pageSize !== 20 && PAGE_SIZES.includes(context.pageSize))
    params.set("pageSize", String(context.pageSize));
  const query = params.toString();
  return path + (query ? `?${query}` : "");
};

export const safeSampleTypeReturnTo = (value, fallback) => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u0020\u007f]/.test(value) ||
    !BASE_PATHS.includes(value.split("?")[0])
  )
    return fallback;
  try {
    const url = new URL(value, "https://local.invalid");
    if (
      url.origin !== "https://local.invalid" ||
      url.hash ||
      !BASE_PATHS.includes(url.pathname)
    )
      return fallback;
    return sampleTypeListUrl(
      url.pathname,
      readSampleTypeListContext(url.search),
    );
  } catch {
    return fallback;
  }
};

// This is the detail DTO contract, not the older list projection. Nullable
// database strings are legitimate, but absent mutable fields are not defaults.
export const isCompleteSampleTypeDetail = (record, expectedId) => {
  if (!record || typeof record !== "object" || Array.isArray(record))
    return false;
  const has = (key) => Object.prototype.hasOwnProperty.call(record, key);
  const nullableString = (key) =>
    has(key) && (record[key] === null || typeof record[key] === "string");
  return (
    typeof record.id === "string" &&
    record.id.trim() !== "" &&
    String(record.id) === String(expectedId) &&
    nullableString("description") &&
    nullableString("abbreviation") &&
    has("domain") &&
    typeof record.domain === "string" &&
    record.domain.trim() !== "" &&
    has("isActive") &&
    typeof record.isActive === "boolean" &&
    has("sortOrder") &&
    Number.isSafeInteger(record.sortOrder) &&
    has("translations") &&
    record.translations !== null &&
    typeof record.translations === "object" &&
    !Array.isArray(record.translations) &&
    Object.values(record.translations).every(
      (value) => value === null || typeof value === "string",
    )
  );
};

// Only the exact fields sent by this editor can verify an uncertain PUT. A
// matching ID or a display-name fallback does not confirm the requested state.
export const sampleTypeUpdateMatchesDetail = (record, payload) =>
  isCompleteSampleTypeDetail(record, payload.id) &&
  (record.abbreviation ?? "") === payload.abbreviation &&
  record.domain === payload.domain &&
  record.isActive === payload.isActive &&
  (!Object.prototype.hasOwnProperty.call(payload, "nameZh") ||
    record.translations.zh === payload.nameZh);

export const mapSampleType = (item) => ({
  ...item,
  id: String(item.id),
  name: item.name || item.description || "",
  description: item.description || "",
  domain: item.domain || "CLINICAL",
  active: item.isActive !== undefined ? item.isActive : true,
  testCount: item.testCount ?? 0,
  abbreviation: item.abbreviation ?? "",
  sortOrder: item.sortOrder ?? 0,
  translations: { ...(item.translations || {}) },
});

export const sampleTypeDraft = (detail) => ({
  ...detail,
  nameZh:
    typeof detail.translations?.zh === "string" ? detail.translations.zh : "",
  identifyingName: detail.description || "",
  nameEn:
    typeof detail.translations?.en === "string" ? detail.translations.en : "",
  nameFr:
    typeof detail.translations?.fr === "string" ? detail.translations.fr : "",
});

export const emptySampleTypeDraft = () => ({
  id: null,
  nameZh: "",
  identifyingName: "",
  nameEn: "",
  nameFr: "",
  abbreviation: "",
  active: false,
  domain: "CLINICAL",
});

export const sampleTypeDraftSnapshot = (draft) =>
  draft
    ? JSON.stringify({
        nameZh: draft.nameZh,
        identifyingName: draft.identifyingName,
        nameEn: draft.nameEn,
        nameFr: draft.nameFr,
        abbreviation: draft.abbreviation,
        domain: draft.domain,
        active: draft.active,
      })
    : "";

export const sampleTypeUpdatePayload = (draft, initial) => {
  const payload = {
    id: draft.id,
    abbreviation: draft.abbreviation.trim(),
    domain: draft.domain,
    isActive: !!draft.active,
  };
  if (draft.nameZh.trim() && draft.nameZh !== initial.nameZh)
    payload.nameZh = draft.nameZh.trim();
  return payload;
};

export const sampleTypeCreatePayload = (draft) => ({
  formName: "sampleTypeCreateForm",
  nameZh: draft.nameZh.trim(),
  identifyingName: draft.identifyingName.trim(),
  sampleTypeEnglishName: draft.nameEn.trim(),
  sampleTypeFrenchName: draft.nameFr.trim(),
  domain: draft.domain,
  active: !!draft.active,
});

export const createdSampleTypeId = (response) => {
  const value = response?.createdSampleTypeId;
  return (typeof value === "string" || typeof value === "number") &&
    /^[1-9]\d*$/.test(String(value))
    ? String(value)
    : null;
};
