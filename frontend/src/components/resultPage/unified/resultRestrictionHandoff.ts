export interface RestrictionIdentity {
  analysisId: string;
  sampleItemId: string;
  testId: string;
  labNumber: string;
  analysisLastupdated: string;
}
export const restrictionId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9]\d{0,9}$/.test(value) &&
  Number(value) <= 2147483647;
export const restrictionLabNumber = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,30}$/.test(value);
export const restrictionVersion = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(?:0|[1-9]\d{0,18})$/.test(value) &&
  BigInt(value) <= 9223372036854775807n;
export function restrictionIdentity(row: unknown): RestrictionIdentity | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const labNumber = r.labNumber ?? r.accessionNumber;
  return restrictionId(r.analysisId) &&
    restrictionId(r.sampleItemId) &&
    restrictionId(r.testId) &&
    restrictionLabNumber(labNumber) &&
    restrictionVersion(r.analysisLastupdated)
    ? {
        analysisId: r.analysisId,
        sampleItemId: r.sampleItemId,
        testId: r.testId,
        labNumber,
        analysisLastupdated: r.analysisLastupdated,
      }
    : null;
}
const criteria = [
  "accessionNumber",
  "testSectionId",
  "collectionDate",
  "status",
  "scope",
];
export function resultReturnPath(
  search: string,
  page: number,
  pageSize: number,
): string {
  const input = new URLSearchParams(search),
    output = new URLSearchParams();
  for (const key of criteria) {
    const value = input.get(key);
    if (
      value &&
      input.getAll(key).length === 1 &&
      value.length <= 255 &&
      !/[\x00-\x1f\x7f]/.test(value)
    )
      output.set(key, value);
  }
  output.set("page", String(Number.isSafeInteger(page) && page > 0 ? page : 1));
  output.set(
    "pageSize",
    String([25, 50, 100].includes(pageSize) ? pageSize : 25),
  );
  return "/Results?" + output.toString();
}
export function resultReturnPaging(search: string) {
  const params = new URLSearchParams(search);
  const page = params.get("page"),
    size = Number(params.get("pageSize"));
  return {
    page:
      page && /^[1-9]\d{0,5}$/.test(page) && params.getAll("page").length === 1
        ? Number(page)
        : 1,
    pageSize:
      [25, 50, 100].includes(size) && params.getAll("pageSize").length === 1
        ? size
        : 25,
  };
}
function safeReturnPath(path: string): boolean {
  if (!path.startsWith("/Results?") || path.includes("#")) return false;
  const params = new URLSearchParams(path.slice(9));
  if (
    [...params.keys()].some(
      (key) =>
        ![...criteria, "page", "pageSize"].includes(key) ||
        params.getAll(key).length !== 1,
    )
  )
    return false;
  const paging = resultReturnPaging(params.toString());
  return (
    resultReturnPath(params.toString(), paging.page, paging.pageSize) === path
  );
}
export function intakeHandoffPath(
  identity: RestrictionIdentity,
  returnPath: string,
): string {
  const params = new URLSearchParams({ ...identity, returnTo: returnPath });
  return "/order/result-intake?" + params.toString();
}
export function parseIntakeHandoff(
  search: string,
): { identity: RestrictionIdentity; returnPath: string } | null {
  const params = new URLSearchParams(search),
    keys = [
      "analysisId",
      "sampleItemId",
      "testId",
      "labNumber",
      "analysisLastupdated",
      "returnTo",
    ];
  if (
    [...params.keys()].some((key) => !keys.includes(key)) ||
    keys.some((key) => params.getAll(key).length !== 1)
  )
    return null;
  const identity = restrictionIdentity(Object.fromEntries(params));
  const returnPath = params.get("returnTo");
  return identity && returnPath && safeReturnPath(returnPath)
    ? { identity, returnPath }
    : null;
}
