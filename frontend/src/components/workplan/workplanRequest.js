import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";

export class WorkplanRequestError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const id = (value) => typeof value === "string" && /^[1-9]\d{0,9}$/.test(value);
const positive = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
const rolesKey = (value) => {
  if (
    !Array.isArray(value) ||
    value.some((role) => typeof role !== "string" || !role.trim())
  )
    throw new WorkplanRequestError("unavailable");
  return [...new Set(value)].sort();
};
// CSRF masks rotate on reads; only authenticated actor and real grants define ownership.
export const workplanSessionKey = (value) => {
  if (value?.authenticated === false)
    throw new WorkplanRequestError("unauthenticated");
  if (
    !record(value) ||
    value.authenticated !== true ||
    !id(value.userId) ||
    typeof value.sessionId !== "string" ||
    !value.sessionId.trim() ||
    (value.loginLabUnit != null && typeof value.loginLabUnit !== "string")
  )
    throw new WorkplanRequestError("unavailable");
  const roles = rolesKey(value.roles);
  if (!roles.includes("Results")) throw new WorkplanRequestError("forbidden");
  if (value.userLabRolesMap != null && !record(value.userLabRolesMap))
    throw new WorkplanRequestError("unavailable");
  const scope =
    value.userLabRolesMap == null
      ? null
      : Object.keys(value.userLabRolesMap)
          .sort()
          .map((unit) => [unit, rolesKey(value.userLabRolesMap[unit])]);
  return JSON.stringify([
    value.userId,
    value.sessionId,
    roles,
    value.loginLabUnit ?? null,
    scope,
  ]);
};
export const buildWorkplanParams = (query, page, pageSize) => {
  if (
    !record(query) ||
    !["test", "panel", "unit", "priority"].includes(query.type) ||
    (query.type === "priority"
      ? !["ROUTINE", "ASAP", "STAT", "TIMED", "FUTURE_STAT"].includes(
          query.filterId,
        )
      : !id(query.filterId)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![10, 20, 50, 100].includes(pageSize)
  )
    throw new WorkplanRequestError("invalid");
  return new URLSearchParams({
    queryVersion: "2",
    type: query.type,
    filterId: query.filterId,
    page: String(page),
    pageSize: String(pageSize),
  });
};
const checkHttp = (response) => {
  if (response.status === 401)
    throw new WorkplanRequestError("unauthenticated");
  if (response.status === 403) throw new WorkplanRequestError("forbidden");
  if (response.status === 409) throw new WorkplanRequestError("changed");
  if (response.status === 400) throw new WorkplanRequestError("invalid");
  if (response.status !== 200 || response.redirected)
    throw new WorkplanRequestError("unavailable");
};
const readBytes = async (response, signal, limit) => {
  if (
    signal.aborted ||
    !response.body ||
    Number(response.headers.get("content-length")) > limit
  )
    throw new WorkplanRequestError("unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > limit)
        throw new WorkplanRequestError("unavailable");
      chunks.push(chunk.value);
    }
    if (signal.aborted) throw new WorkplanRequestError("unavailable");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};
const readJson = async (url, signal) => {
  if (signal.aborted) throw new WorkplanRequestError("unavailable");
  const response = await readOpenElisResponse(url, signal);
  checkHttp(response);
  if (
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new WorkplanRequestError("unavailable");
  const bytes = await readBytes(response, signal, 2 * 1024 * 1024);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new WorkplanRequestError("unavailable");
  }
};
const checkOwner = async (signal, expectedOwner) => {
  const value = await readJson("/session", signal);
  if (
    !expectedOwner ||
    signal.aborted ||
    workplanSessionKey(value) !== expectedOwner
  )
    throw new WorkplanRequestError("scope");
  return value;
};
const validIdentity = (row) =>
  record(row) &&
  ["analysisId", "sampleId", "sampleItemId", "testId", "statusId"].every(
    (key) => id(row[key]),
  ) &&
  typeof row.accessionNumber === "string" &&
  !!row.accessionNumber.trim() &&
  row.accessionNumber.length <= 128 &&
  typeof row.lastupdated === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
    row.lastupdated,
  ) &&
  Number.isFinite(Date.parse(row.lastupdated));
// A known incomplete server row remains visible; it never provides printable identity.
const validReadIdentity = (row) =>
  validIdentity(row) ||
  (record(row) &&
    row.canPrint === false &&
    row.printUnavailableReason === "INCOMPLETE_ANALYSIS_IDENTITY" &&
    id(row.analysisId) &&
    id(row.testId) &&
    ["sampleId", "sampleItemId", "statusId"].every(
      (key) => row[key] == null || id(row[key]),
    ) &&
    (row.accessionNumber == null ||
      row.accessionNumber === "" ||
      (typeof row.accessionNumber === "string" &&
        row.accessionNumber.trim() &&
        row.accessionNumber.length <= 128)) &&
    (row.lastupdated == null ||
      (typeof row.lastupdated === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
          row.lastupdated,
        ) &&
        Number.isFinite(Date.parse(row.lastupdated)))));
export async function readWorkplan(query, page, pageSize, signal, owner) {
  const params = buildWorkplanParams(query, page, pageSize);
  await checkOwner(signal, owner);
  const result = await readJson(`/rest/Workplan?${params}`, signal);
  const paging = result?.paging;
  const echoed = result?.query;
  const scope = result?.effectiveScope;
  if (
    !record(result) ||
    result.queryVersion !== "2" ||
    result.currentUserId !== JSON.parse(owner)[0] ||
    typeof result.canPrint !== "boolean" ||
    !/^[a-f0-9]{64}$/.test(result.pageSnapshot || "") ||
    !record(echoed) ||
    echoed.type !== query.type ||
    echoed.filterId !== query.filterId ||
    Number(echoed.page) !== page ||
    Number(echoed.pageSize) !== pageSize ||
    !record(scope) ||
    scope.role !== "Results" ||
    !Array.isArray(scope.testIds) ||
    !scope.testIds.every(id) ||
    new Set(scope.testIds).size !== scope.testIds.length ||
    !record(paging) ||
    !positive(paging.currentPage) ||
    !positive(paging.totalPages) ||
    !Number.isSafeInteger(paging.totalResults) ||
    paging.totalResults < 0 ||
    paging.pageSize !== pageSize ||
    Number(paging.currentPage) !== page ||
    Number(paging.totalPages) !==
      Math.max(1, Math.ceil(paging.totalResults / pageSize)) ||
    page > Number(paging.totalPages) ||
    !Array.isArray(result.workplanTests) ||
    result.workplanTests.length !==
      Math.min(pageSize, paging.totalResults - (page - 1) * pageSize) ||
    result.workplanTests.some(
      (row) =>
        !validReadIdentity(row) ||
        row.rowKind !== "ANALYSIS" ||
        row.groupKey !== row.sampleId ||
        !scope.testIds.includes(row.testId) ||
        typeof row.canPrint !== "boolean" ||
        (row.canPrint && !result.canPrint) ||
        (row.canPrint
          ? row.printUnavailableReason != null
          : typeof row.printUnavailableReason !== "string" ||
            !row.printUnavailableReason.trim()) ||
        [
          "testName",
          "receivedDate",
          "patientInfo",
          "patientName",
          "nextVisitDate",
          "groupLabel",
          "groupNumber",
          "testSectionId",
        ].some((key) => row[key] != null && typeof row[key] !== "string"),
    ) ||
    new Set(result.workplanTests.map((row) => row.analysisId)).size !==
      result.workplanTests.length
  )
    throw new WorkplanRequestError("unavailable");
  await checkOwner(signal, owner);
  return {
    rows: result.workplanTests,
    query: { ...query, page, pageSize, pageSnapshot: result.pageSnapshot },
    owner,
    effectiveScope: scope,
    paging: {
      currentPage: page,
      totalPages: Number(paging.totalPages),
      totalResults: paging.totalResults,
      pageSize,
    },
  };
}
export async function readWorkplanOptions(endpoint, signal, owner) {
  await checkOwner(signal, owner);
  const result = await readJson(endpoint, signal);
  if (
    !Array.isArray(result) ||
    result.some(
      (item) =>
        !record(item) ||
        typeof item.value !== "string" ||
        !item.value.trim() ||
        typeof item.id !== "string" ||
        !item.id.trim(),
    ) ||
    new Set(result.map((item) => item.id)).size !== result.length
  )
    throw new WorkplanRequestError("unavailable");
  await checkOwner(signal, owner);
  return result;
}
export async function requestWorkplanPDF(payload, signal, owner) {
  buildWorkplanParams(payload, payload?.page, payload?.pageSize);
  if (
    !/^[a-f0-9]{64}$/.test(payload.pageSnapshot || "") ||
    !Array.isArray(payload.analyses) ||
    !payload.analyses.length ||
    payload.analyses.length > payload.pageSize ||
    !payload.analyses.every(validIdentity) ||
    new Set(payload.analyses.map((row) => row.analysisId)).size !==
      payload.analyses.length
  )
    throw new WorkplanRequestError("invalid");
  const session = await checkOwner(signal, owner);
  if (typeof session.csrf !== "string" || !session.csrf.trim())
    throw new WorkplanRequestError("unauthenticated");
  const response = await fetch(
    config.serverBaseUrl + "/rest/PrintWorkplanReport?queryVersion=2",
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
        "Accept-Language": getRequestLocale(),
        "X-CSRF-Token": session.csrf,
      },
      body: JSON.stringify(payload),
    },
  );
  checkHttp(response);
  if (
    !/^application\/pdf(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new WorkplanRequestError("unavailable");
  const bytes = await readBytes(response, signal, 10 * 1024 * 1024);
  if (
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-" ||
    !/%%EOF\s*$/.test(new TextDecoder().decode(bytes.slice(-1024)))
  )
    throw new WorkplanRequestError("unavailable");
  await checkOwner(signal, owner);
  return new Blob([bytes], { type: "application/pdf" });
}
