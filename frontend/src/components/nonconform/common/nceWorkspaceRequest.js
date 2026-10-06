import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";
import { readOpenElisResponse } from "../../utils/readOpenElisResponse";
import { savedOrderSessionKey } from "../../order/savedOrderViewRequest";

export class NceRequestError extends Error {
  constructor(kind, outcome = "NOT_APPLIED", code = null) {
    super(kind);
    this.kind = kind;
    this.outcome = outcome;
    this.code = code;
  }
}
export const nceSessionKey = savedOrderSessionKey;
export const nceId = (value) =>
  typeof value === "string" &&
  /^[1-9]\d{0,9}$/.test(value) &&
  Number(value) <= 2147483647;
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const optionalText = (v) =>
  v == null || (typeof v === "string" && v.length <= 200000);
const version = (value) => {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{1,9})$/.exec(
    value,
  );
  if (!m) return false;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number),
    d = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 1000 &&
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (m[7].length === 1 || !m[7].endsWith("0"))
  );
};
const rawNumber = (v) =>
  typeof v === "string" &&
  !!v.trim() &&
  v === v.trim() &&
  v.length <= 25 &&
  !/[\u0000-\u001f\u007f]/.test(v);
const code = (v) => typeof v === "string" && /^[A-Z][A-Z0-9_]{0,100}$/.test(v);
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
export const NCE_PAGE_SIZES = [10, 25, 50, 100];
const operations = ["CREATE", "ACKNOWLEDGE", "ADD_NOTE", "ASSIGN"];
const reject = (kind = "unavailable") => {
  throw new NceRequestError(kind);
};
const unique = (rows, key) =>
  new Set(rows.map((r) => r[key])).size === rows.length;
const validWarnings = (value) =>
  Array.isArray(value) && value.length <= 100 && value.every(code);
const validOptions = (rows) =>
  Array.isArray(rows) &&
  rows.length <= 2000 &&
  rows.every(
    (r) =>
      record(r) &&
      nceId(r.id) &&
      optionalText(r.name) &&
      optionalText(r.displayKey),
  ) &&
  unique(rows, "id");
const categoriesValid = (rows) =>
  validOptions(rows) && rows.every((r) => validOptions(r.types));
const scopeValid = (s) =>
  record(s) &&
  ["roleIds", "sectionIds"].every(
    (k) =>
      Array.isArray(s[k]) &&
      s[k].every(nceId) &&
      new Set(s[k]).size === s[k].length,
  );
const actorValid = (v, owner) =>
  record(v) &&
  v.queryVersion === "2" &&
  v.currentUserId === JSON.parse(owner)[0];
const capability = (value, ability, reason) =>
  typeof value[ability] === "boolean" &&
  (value[ability] ? value[reason] == null : code(value[reason]));
const pagingValid = (v, page, size, count) =>
  record(v) &&
  ["currentPage", "totalPages", "totalResults", "pageSize"].every((k) =>
    Number.isSafeInteger(v[k]),
  ) &&
  v.totalResults >= 0 &&
  v.totalPages === Math.ceil(v.totalResults / size) &&
  v.pageSize === size &&
  v.currentPage ===
    (v.totalResults ? Math.min(page, Math.max(1, v.totalPages)) : 1) &&
  count ===
    Math.min(size, Math.max(0, v.totalResults - (v.currentPage - 1) * size));
export const validLinkedIdentity = (r) =>
  record(r) &&
  nceId(r.sampleId) &&
  rawNumber(r.labNumber) &&
  version(r.sampleLastupdated) &&
  nceId(r.sampleItemId) &&
  version(r.lastupdated) &&
  (r.analysisId == null
    ? r.analysisLastupdated == null
    : nceId(r.analysisId) && version(r.analysisLastupdated));
export const linkedIdentity = (order, specimen, analysis = null) => ({
  sampleId: order.sampleId,
  labNumber: order.labNumber,
  sampleLastupdated: order.lastupdated,
  sampleItemId: specimen.sampleItemId,
  lastupdated: specimen.lastupdated,
  analysisId: analysis?.analysisId ?? null,
  analysisLastupdated: analysis?.lastupdated ?? null,
});
export const linkedKey = (r) =>
  `${r.sampleItemId}:${r.analysisId ?? "specimen"}`;
const attachmentsValid = (rows) =>
  Array.isArray(rows) &&
  rows.length <= 100 &&
  unique(rows, "id") &&
  rows.every(
    (r) =>
      record(r) &&
      nceId(r.id) &&
      optionalText(r.fileName) &&
      optionalText(r.fileType) &&
      Number.isSafeInteger(r.fileSize) &&
      r.fileSize >= 0 &&
      optionalText(r.uploadedDate),
  );
const eventValid = (r) =>
  record(r) &&
  nceId(r.id) &&
  r.eventId === r.id &&
  version(r.lastupdated) &&
  ["canAcknowledge", "canAddNote", "canAssign"].every(
    (k) => typeof r[k] === "boolean",
  ) &&
  (r.actionUnavailableReason == null || code(r.actionUnavailableReason)) &&
  [
    "nceNumber",
    "title",
    "description",
    "status",
    "statusCode",
    "severity",
    "labOrderNumber",
    "dateOfEvent",
    "reportDate",
    "nameOfReporter",
    "immediateAction",
    "suspectedCauses",
    "proposedAction",
    "assignedToName",
  ].every((k) => optionalText(r[k])) &&
  ["nceCategoryId", "nceTypeId", "assignedTo"].every(
    (k) => r[k] == null || nceId(r[k]),
  ) &&
  attachmentsValid(r.attachments) &&
  Array.isArray(r.linkedSpecimens) &&
  r.linkedSpecimens.every(
    (s) =>
      record(s) &&
      nceId(s.sampleId) &&
      rawNumber(s.labNumber) &&
      nceId(s.sampleItemId) &&
      (s.analysisId == null || nceId(s.analysisId)) &&
      optionalText(s.typeName) &&
      optionalText(s.testName),
  ) &&
  Array.isArray(r.history) &&
  r.history.length <= 2000 &&
  r.history.every(
    (h) =>
      record(h) &&
      nceId(h.id) &&
      ["activity", "description", "timestamp", "userName"].every((k) =>
        optionalText(h[k]),
      ),
  ) &&
  Array.isArray(r.notes) &&
  r.notes.length <= 2000 &&
  r.notes.every(
    (n) =>
      record(n) &&
      nceId(n.id) &&
      ["text", "timestamp", "userName"].every((k) => optionalText(n[k])),
  );
const httpKind = (status) =>
  ({
    401: "unauthenticated",
    403: "forbidden",
    404: "notFound",
    409: "changed",
    400: "invalid",
  })[status] || "unavailable";
const readBytes = async (response, signal, limit = 2 * 1024 * 1024) => {
  if (
    signal.aborted ||
    !response.body ||
    Number(response.headers.get("content-length")) > limit
  )
    reject();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (signal.aborted || size > limit) reject();
      chunks.push(part.value);
    }
    if (signal.aborted) reject();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return bytes;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};
const jsonBody = async (response, signal) => {
  if (
    response.redirected ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    reject();
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBytes(response, signal),
      ),
    );
  } catch {
    reject();
  }
};
const readJson = async (endpoint, signal) => {
  const res = await readOpenElisResponse(endpoint, signal);
  if (res.status !== 200 || res.redirected) reject(httpKind(res.status));
  return jsonBody(res, signal);
};
const checkOwner = async (signal, owner) => {
  const session = await readJson("/session", signal);
  if (!owner || nceSessionKey(session) !== owner || signal.aborted)
    reject("scope");
  return session;
};
const guardedRead = async (endpoint, signal, owner, validate) => {
  await checkOwner(signal, owner);
  const value = await readJson(endpoint, signal);
  if (!actorValid(value, owner) || !validate(value)) reject();
  await checkOwner(signal, owner);
  return value;
};
const params = (fields) =>
  new URLSearchParams({ queryVersion: "2", ...fields });
export const readNceMetadata = (signal, owner) =>
  guardedRead(
    "/rest/nce/registration/meta?queryVersion=2",
    signal,
    owner,
    (v) =>
      scopeValid(v.effectiveScope) &&
      capability(v, "canCreate", "createUnavailableReason") &&
      record(v.reporter) &&
      ["firstName", "lastName", "loginName"].every((k) =>
        optionalText(v.reporter[k]),
      ) &&
      validOptions(v.reportingUnits) &&
      categoriesValid(v.categories) &&
      validWarnings(v.warningCodes),
  );
export const readNceWorkspace = (query, page, size, signal, owner) => {
  if (
    !["keyword", "status", "categoryId", "severity"].every(
      (k) => typeof query[k] === "string",
    ) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !NCE_PAGE_SIZES.includes(size)
  )
    reject("invalid");
  return guardedRead(
    `/rest/nce/workspace?${params({ ...query, page: String(page), pageSize: String(size) })}`,
    signal,
    owner,
    (v) =>
      scopeValid(v.effectiveScope) &&
      record(v.query) &&
      Object.keys(query).every((k) => v.query[k] === query[k]) &&
      v.query.page === page &&
      v.query.pageSize === size &&
      capability(v, "canCreate", "createUnavailableReason") &&
      categoriesValid(v.categories) &&
      validWarnings(v.warningCodes) &&
      Array.isArray(v.nceList) &&
      v.nceList.every(eventValid) &&
      unique(v.nceList, "id") &&
      pagingValid(v.paging, page, size, v.nceList.length),
  );
};
export const readNceOrders = (query, page, size, signal, owner) => {
  if (
    !["labNumber", "STNumber", "firstName", "lastName"].includes(
      query.searchType,
    ) ||
    typeof query.value !== "string" ||
    !query.value.trim() ||
    query.value.length > 200 ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !NCE_PAGE_SIZES.includes(size)
  )
    reject("invalid");
  return guardedRead(
    `/rest/nce/registration/orders?${params({ ...query, page: String(page), pageSize: String(size) })}`,
    signal,
    owner,
    (v) =>
      scopeValid(v.effectiveScope) &&
      record(v.query) &&
      v.query.searchType === query.searchType &&
      v.query.value === query.value &&
      v.query.page === page &&
      v.query.pageSize === size &&
      validWarnings(v.warningCodes) &&
      Array.isArray(v.orders) &&
      unique(v.orders, "sampleId") &&
      pagingValid(v.paging, page, size, v.orders.length) &&
      v.orders.every(
        (o) =>
          record(o) &&
          nceId(o.sampleId) &&
          rawNumber(o.labNumber) &&
          version(o.lastupdated) &&
          (o.patient == null ||
            (record(o.patient) &&
              nceId(o.patient.patientId) &&
              optionalText(o.patient.firstName) &&
              optionalText(o.patient.lastName))) &&
          Array.isArray(o.specimens) &&
          unique(o.specimens, "sampleItemId") &&
          o.specimens.every(
            (s) =>
              record(s) &&
              nceId(s.sampleItemId) &&
              version(s.lastupdated) &&
              optionalText(s.externalId) &&
              optionalText(s.typeName) &&
              Array.isArray(s.analyses) &&
              unique(s.analyses, "analysisId") &&
              s.analyses.every(
                (a) =>
                  record(a) &&
                  nceId(a.analysisId) &&
                  nceId(a.testId) &&
                  version(a.lastupdated) &&
                  optionalText(a.testName),
              ),
          ),
      ),
  );
};
export const readNceUsers = (search, signal, owner) =>
  guardedRead(
    `/rest/nce/registration/users?${params({ search })}`,
    signal,
    owner,
    (v) =>
      Array.isArray(v.users) &&
      v.users.length <= 25 &&
      unique(v.users, "id") &&
      v.users.every(
        (r) =>
          record(r) &&
          nceId(r.id) &&
          ["firstName", "lastName", "loginName"].every((k) =>
            optionalText(r[k]),
          ),
      ),
  );
const receiptValid = (v, requestId, operation, eventId) =>
  v.requestId === requestId &&
  v.outcome === "APPLIED" &&
  v.operation === operation &&
  /^[a-f0-9]{64}$/.test(v.requestHash || "") &&
  nceId(v.eventId) &&
  (!eventId || v.eventId === eventId) &&
  typeof v.nceNumber === "string" &&
  !!v.nceNumber.trim() &&
  version(v.lastupdated) &&
  optionalText(v.statusCode) &&
  (operation !== "CREATE" || v.statusCode === "Pending") &&
  attachmentsValid(v.attachments) &&
  Array.isArray(v.linkedSpecimens) &&
  v.linkedSpecimens.every(validLinkedIdentity) &&
  new Set(v.linkedSpecimens.map(linkedKey)).size === v.linkedSpecimens.length &&
  receiptMatchesSnapshot(v);
export const readNceReceipt = (
  requestId,
  operation,
  eventId,
  signal,
  owner,
) => {
  if (
    !uuid(requestId) ||
    !operations.includes(operation) ||
    (eventId && !nceId(eventId))
  )
    reject("invalid");
  return guardedRead(
    `/rest/nce/registration/receipt?${params({ requestId, operation })}`,
    signal,
    owner,
    (v) =>
      v.requestId === requestId &&
      v.operation === operation &&
      (v.outcome === "NOT_FOUND" ||
        receiptValid(v, requestId, operation, eventId)),
  );
};
export const newNceRequestId = () => globalThis.crypto.randomUUID();
const pendingKey = "openelis.nce.pending.v2";
const fixedSnapshots = new Map();
const savedPending = () => {
  try {
    const data = JSON.parse(sessionStorage.getItem(pendingKey) || "{}");
    return record(data) ? data : {};
  } catch {
    return {};
  }
};
export const pendingNceOperation = (owner) => {
  try {
    const actor = JSON.parse(owner)[0],
      p = savedPending()[actor];
    return p?.actor === actor &&
      uuid(p.requestId) &&
      operations.includes(p.operation) &&
      (p.eventId == null || nceId(p.eventId))
      ? p
      : null;
  } catch {
    return null;
  }
};
export const rememberNceOperation = (owner, pending) => {
  const actor = JSON.parse(owner)[0],
    previous = pendingNceOperation(owner);
  if (previous && previous.requestId !== pending.requestId)
    throw new NceRequestError("pending");
  sessionStorage.setItem(
    pendingKey,
    JSON.stringify({
      ...savedPending(),
      [actor]: {
        actor,
        requestId: pending.requestId,
        operation: pending.operation,
        eventId: pending.eventId ?? null,
      },
    }),
  );
};
export const clearNceOperation = (owner, requestId) => {
  if (pendingNceOperation(owner)?.requestId === requestId) {
    const data = savedPending();
    delete data[JSON.parse(owner)[0]];
    sessionStorage.setItem(pendingKey, JSON.stringify(data));
  }
  fixedSnapshots.delete(requestId);
};
const identityKeys = [
  "sampleId",
  "labNumber",
  "sampleLastupdated",
  "sampleItemId",
  "lastupdated",
  "analysisId",
  "analysisLastupdated",
];
const receiptMatchesSnapshot = (value) => {
  const expected = fixedSnapshots.get(value.requestId);
  if (!expected) return true;
  if (
    value.operation !== expected.operation ||
    (expected.eventId && value.eventId !== expected.eventId)
  )
    return false;
  if (value.operation !== "CREATE")
    return (
      value.lastupdated !== expected.oldVersion &&
      (value.operation !== "ACKNOWLEDGE" ||
        value.statusCode === "Under Investigation")
    );
  if (
    value.linkedSpecimens.length !== expected.links.length ||
    value.attachments.length !== expected.files.length
  )
    return false;
  const actualLinks = new Map(
    value.linkedSpecimens.map((r) => [linkedKey(r), r]),
  );
  if (
    !expected.links.every((r) =>
      identityKeys.every((k) => actualLinks.get(linkedKey(r))?.[k] === r[k]),
    )
  )
    return false;
  const actualFiles = value.attachments
    .map((r) =>
      JSON.stringify([r.fileName, r.fileType?.toLowerCase(), r.fileSize]),
    )
    .sort();
  return (
    JSON.stringify(actualFiles) ===
    JSON.stringify(
      expected.files
        .map((r) => JSON.stringify([r.name, r.type.toLowerCase(), r.size]))
        .sort(),
    )
  );
};
export const submitNceOperation = async (
  command,
  files,
  operation,
  eventId,
  signal,
  owner,
) => {
  if (
    !uuid(command?.requestId) ||
    command.currentUserId !== JSON.parse(owner)[0] ||
    !operations.includes(operation) ||
    (operation !== "CREATE" &&
      (!nceId(eventId) ||
        !version(command.lastupdated) ||
        command.type !== operation))
  )
    reject("invalid");
  const session = await checkOwner(signal, owner);
  if (typeof session.csrf !== "string" || !session.csrf.trim())
    reject("unauthenticated");
  if (
    operation === "CREATE" &&
    (!Array.isArray(command.linkedSpecimens) ||
      !command.linkedSpecimens.every(validLinkedIdentity) ||
      new Set(command.linkedSpecimens.map(linkedKey)).size !==
        command.linkedSpecimens.length ||
      !["MINOR", "MAJOR", "CRITICAL"].includes(command.severity) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(command.dateOfEvent))
  )
    reject("invalid");
  let body,
    headers = {
      Accept: "application/json",
      "Accept-Language": getRequestLocale(),
      "X-CSRF-Token": session.csrf,
    };
  if (files.length) {
    body = new FormData();
    body.append("nceData", JSON.stringify(command));
    for (const file of files) {
      if (!(file instanceof File)) reject("invalid");
      body.append("files", file, file.name);
    }
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(command);
  }
  fixedSnapshots.set(command.requestId, {
    operation,
    eventId,
    oldVersion: command.lastupdated,
    links: command.linkedSpecimens?.map((r) => ({ ...r })) || [],
    files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  });
  rememberNceOperation(owner, {
    requestId: command.requestId,
    operation,
    eventId,
  });
  try {
    const response = await fetch(
      config.serverBaseUrl +
        (operation === "CREATE"
          ? "/rest/nce/registration?queryVersion=2"
          : `/rest/nce/events/${eventId}/actions?queryVersion=2`),
      {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
        signal,
        headers,
        body,
      },
    );
    const value = await jsonBody(response, signal);
    if (![200, 201].includes(response.status)) {
      const known =
        actorValid(value, owner) &&
        value.requestId === command.requestId &&
        code(value.code) &&
        value.outcome === "NOT_APPLIED";
      if (known) {
        clearNceOperation(owner, command.requestId);
        const failure = new NceRequestError(
          httpKind(response.status),
          "NOT_APPLIED",
          value.code,
        );
        failure.confirmed = true;
        throw failure;
      }
      throw new NceRequestError(
        httpKind(response.status),
        "UNKNOWN",
        record(value) &&
          value.queryVersion === "2" &&
          value.requestId === command.requestId &&
          code(value.code)
          ? value.code
          : null,
      );
    }
    if (
      !actorValid(value, owner) ||
      !receiptValid(value, command.requestId, operation, eventId)
    )
      throw new NceRequestError("unavailable", "UNKNOWN");
    await checkOwner(signal, owner);
    clearNceOperation(owner, command.requestId);
    return value;
  } catch (error) {
    if (error instanceof NceRequestError && error.confirmed === true)
      throw error;
    throw new NceRequestError(
      error.kind || "unavailable",
      "UNKNOWN",
      error.code,
    );
  }
};
export const readNceAttachment = async (attachment, eventId, signal, owner) => {
  if (!nceId(attachment.id) || !nceId(eventId)) reject("invalid");
  await checkOwner(signal, owner);
  const response = await readOpenElisResponse(
    `/rest/nce/registration/attachments/${attachment.id}?${params({ eventId })}`,
    signal,
  );
  if (response.status !== 200 || response.redirected)
    reject(httpKind(response.status));
  const mime = (response.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const allowed = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "application/octet-stream",
    "text/plain",
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!allowed.includes(mime)) reject();
  const bytes = await readBytes(response, signal, 10 * 1024 * 1024);
  await checkOwner(signal, owner);
  return new Blob([bytes], { type: mime });
};
