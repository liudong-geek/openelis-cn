import { convertIsoToBackendDate } from "../order/orderDateUtils";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";
import { readPendingSummaryJson } from "../home/pendingResultSummary";

export class ElectronicOrderQueryError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) => typeof value === "string" && /^[1-9]\d{0,9}$/.test(value);
const rolesKey = (value) => {
  if (
    !Array.isArray(value) ||
    !value.every((role) => typeof role === "string" && role.trim())
  )
    throw new ElectronicOrderQueryError("unavailable");
  return [...new Set(value)].sort();
};

// The masked CSRF token changes on reads. It is a credential, not an actor key.
export const electronicOrderSessionKey = (value) => {
  if (!record(value)) throw new ElectronicOrderQueryError("unavailable");
  if (value.authenticated === false)
    throw new ElectronicOrderQueryError("unauthenticated");
  if (
    value.authenticated !== true ||
    !id(value.userId) ||
    typeof value.sessionId !== "string" ||
    !value.sessionId.trim() ||
    (value.loginLabUnit != null && typeof value.loginLabUnit !== "string")
  )
    throw new ElectronicOrderQueryError("unavailable");
  const roles = rolesKey(value.roles);
  if (!roles.includes("Reception"))
    throw new ElectronicOrderQueryError("forbidden");
  const map = value.userLabRolesMap;
  if (map != null && !record(map))
    throw new ElectronicOrderQueryError("unavailable");
  const scope =
    map == null
      ? null
      : Object.keys(map)
          .sort()
          .map((unit) => [unit, rolesKey(map[unit])]);
  return JSON.stringify([
    value.userId,
    value.sessionId,
    roles,
    value.loginLabUnit ?? null,
    scope,
  ]);
};
export const readElectronicOrderSession = async (signal) =>
  electronicOrderSessionKey(await readPendingSummaryJson("/session", signal));

// History keeps query criteria and an opaque token, never server session IDs or rows.
const historyOwners = new Map();
export const electronicOrderHistoryOwner = (actor) => {
  if (!actor) return "";
  if (!historyOwners.has(actor)) {
    const random = new Uint32Array(4);
    window.crypto.getRandomValues(random);
    historyOwners.set(
      actor,
      Array.from(random, (part) => part.toString(16).padStart(8, "0")).join(""),
    );
  }
  return historyOwners.get(actor);
};
export const forgetElectronicOrderHistoryOwner = (actor) =>
  historyOwners.delete(actor);
export const emptyElectronicOrderDraft = () => ({
  searchValue: "",
  startDate: "",
  endDate: "",
  statusFilter: "PENDING",
  useAllInfo: false,
});
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};
export const buildElectronicOrderParams = (
  draft,
  dateLocale,
  page = 1,
  pageSize = 50,
) => {
  if (
    !record(draft) ||
    typeof draft.searchValue !== "string" ||
    draft.searchValue.length > 200 ||
    typeof draft.useAllInfo !== "boolean" ||
    !["startDate", "endDate"].every((key) => typeof draft[key] === "string") ||
    (!["PENDING", "ALL"].includes(draft.statusFilter) &&
      !id(draft.statusFilter)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![10, 20, 50, 100].includes(pageSize)
  )
    throw new ElectronicOrderQueryError("invalid");
  if (
    [draft.startDate, draft.endDate].some(
      (value) => value && !validDate(value),
    ) ||
    (draft.startDate && draft.endDate && draft.startDate > draft.endDate)
  )
    throw new ElectronicOrderQueryError("date");
  if ((draft.startDate || draft.endDate) && !dateLocale)
    throw new ElectronicOrderQueryError("configuration");
  return new URLSearchParams({
    queryVersion: "2",
    searchType: draft.searchValue.trim() ? "IDENTIFIER" : "DATE_STATUS",
    searchValue: draft.searchValue.trim(),
    pendingOnly: String(draft.statusFilter === "PENDING"),
    statusId: ["PENDING", "ALL"].includes(draft.statusFilter)
      ? ""
      : draft.statusFilter,
    startDate: convertIsoToBackendDate(draft.startDate, dateLocale),
    endDate: convertIsoToBackendDate(draft.endDate, dateLocale),
    useAllInfo: String(draft.useAllInfo),
    page: String(page),
    pageSize: String(pageSize),
  });
};
const readJson = async (url, signal) => {
  if (signal.aborted) throw new ElectronicOrderQueryError("unavailable");
  const response = await readOpenElisResponse(url, signal);
  if (response.status === 401)
    throw new ElectronicOrderQueryError("unauthenticated");
  if (response.status === 403) throw new ElectronicOrderQueryError("forbidden");
  if (response.status === 400) throw new ElectronicOrderQueryError("invalid");
  if (
    response.status !== 200 ||
    response.redirected ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new ElectronicOrderQueryError("unavailable");
  try {
    return await response.json();
  } catch {
    throw new ElectronicOrderQueryError("unavailable");
  }
};
const checkOwner = async (signal, expectedOwner) => {
  const owner = await readElectronicOrderSession(signal);
  if (signal.aborted || !expectedOwner || owner !== expectedOwner)
    throw new ElectronicOrderQueryError("scope");
  return owner;
};
const statusCodes = [
  "ENTERED",
  "CANCELLED",
  "REALIZED",
  "NON_CONFORMING",
  "AWAITING_SPECIMEN",
  "UNKNOWN",
];
const stringKeys = [
  "externalOrderId",
  "statusId",
  "status",
  "requestDateDisplay",
  "patientLastName",
  "patientFirstName",
  "patientNationalId",
  "requestingFacility",
  "priority",
  "testName",
  "referringLabNumber",
  "passportNumber",
  "subjectNumber",
  "labNumber",
];
const strings = (value) =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string" && item.trim());
export async function readElectronicOrders(params, signal, expectedOwner) {
  const owner = await checkOwner(signal, expectedOwner);
  const result = await readJson(`/rest/ElectronicOrders?${params}`, signal);
  const page = result?.paging;
  const expected = new URLSearchParams(params);
  const safePage = (value) =>
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
  if (
    !record(result) ||
    result.queryVersion !== "2" ||
    result.currentUserId !== JSON.parse(owner)[0] ||
    typeof result.canReceive !== "boolean" ||
    result.pendingOnly !== (expected.get("pendingOnly") === "true") ||
    !Array.isArray(result.eOrders) ||
    !Array.isArray(result.statusSelectionList) ||
    !strings(result.warningCodes) ||
    !record(page) ||
    !safePage(page.currentPage) ||
    !safePage(page.totalPages) ||
    !Number.isSafeInteger(page.totalResults) ||
    page.totalResults < 0 ||
    page.pageSize !== Number(expected.get("pageSize")) ||
    Number(page.currentPage) !== Number(expected.get("page")) ||
    Number(page.totalPages) !==
      Math.max(1, Math.ceil(page.totalResults / page.pageSize)) ||
    Number(page.currentPage) > Number(page.totalPages) ||
    result.eOrders.length > page.pageSize ||
    result.eOrders.length !==
      Math.min(
        page.pageSize,
        page.totalResults - (Number(page.currentPage) - 1) * page.pageSize,
      ) ||
    result.statusSelectionList.some(
      (status) =>
        !record(status) || !id(status.id) || typeof status.value !== "string",
    ) ||
    new Set(result.statusSelectionList.map((status) => status.id)).size !==
      result.statusSelectionList.length ||
    result.eOrders.some(
      (row) =>
        !record(row) ||
        !id(row.electronicOrderId) ||
        stringKeys.some(
          (key) => row[key] != null && typeof row[key] !== "string",
        ) ||
        !statusCodes.includes(row.statusCode) ||
        typeof row.canReceive !== "boolean" ||
        !strings(row.warningCodes) ||
        (row.actionUnavailableReason != null &&
          typeof row.actionUnavailableReason !== "string") ||
        (row.canReceive &&
          (!result.canReceive ||
            row.statusCode !== "ENTERED" ||
            !row.externalOrderId?.trim() ||
            row.actionUnavailableReason != null)) ||
        (!row.canReceive && !row.actionUnavailableReason),
    ) ||
    new Set(result.eOrders.map((row) => row.electronicOrderId)).size !==
      result.eOrders.length
  )
    throw new ElectronicOrderQueryError("unavailable");
  await checkOwner(signal, owner);
  return {
    rows: result.eOrders.map((row) => ({ ...row, id: row.electronicOrderId })),
    owner,
    paging: {
      currentPage: Number(page.currentPage),
      totalPages: Number(page.totalPages),
      totalResults: page.totalResults,
      pageSize: page.pageSize,
    },
    statuses: result.statusSelectionList,
    warningCodes: result.warningCodes,
    canReceive: result.canReceive,
  };
}

// These existing GETs validate or allocate numbers. Allocation has an unknown outcome
// on transport failure; callers must not silently retry it or infer a saved order.
export async function readEOrderAction(url, signal, expectedOwner) {
  await checkOwner(signal, expectedOwner);
  const result = await readJson(url, signal);
  if (
    !record(result) ||
    typeof result.status !== "boolean" ||
    typeof result.body !== "string"
  )
    throw new ElectronicOrderQueryError("unavailable");
  await checkOwner(signal, expectedOwner);
  return { status: result.status, body: result.body };
}
