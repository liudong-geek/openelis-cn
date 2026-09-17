import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";
import type { SessionStamp } from "../../resultPage/unified/resultEntryState";

export type ReleaseStatus = "DRAFT" | "ISSUED" | "SUPERSEDED" | "VOIDED";
export interface ReportApplication {
  patientId: string;
  sampleId: string;
  accessionNumber: string;
}
export interface ReportGroup {
  key: string;
  label: string;
  testIds: string[];
}
export interface GroupRules {
  ruleVersion: string;
  groups: ReportGroup[];
}
export interface ReportDocument {
  id: string;
  patientId: string;
  sampleId: string;
  groupKey: string;
  ruleVersion: string;
  reportNumber: string;
  lastUpdated: string | number;
  analysisIds: string[];
}
export interface ReportRelease {
  id: number;
  patientId: string;
  documentId: string;
  reportNumber: string;
  reportVersion: number;
  status: ReleaseStatus;
  createdAt: string | number;
  issuedByName?: string;
  issuedAt?: string | number;
  supersedesReleaseId?: number;
  amendmentReason?: string;
  voidedAt?: string | number;
  voidReason?: string;
  pdfSha256?: string;
  accessionNumbers?: string;
  printCount?: number;
  lastPrintedAt?: string | number;
}
export interface ReportScope {
  schemaVersion: 1;
  documentId: string;
  patientId: string;
  sampleId: string;
  groupKey: string;
  ruleVersion: string;
  analysisIds: string[];
}
export interface ReleaseDetail {
  release: ReportRelease;
  scope: ReportScope;
  canReviewOriginal: boolean;
  canPrintCurrent: boolean;
}
export interface FrozenReport {
  releaseId: number;
  documentId: string;
  snapshotSha256: string;
  frozenAt: string | number;
  snapshot: {
    schemaVersion: 1;
    scope: ReportScope;
    reportNumber: string;
    reportVersion: number;
    amendmentReason?: string;
    template: {
      version: string;
      title: string;
      laboratoryName: string;
      footerText: string;
    };
    report: {
      columns: { key: string; header: string; type: string }[];
      rows: {
        cells: (string | number | boolean | null)[];
        dataMap?: Record<string, unknown>;
      }[];
      message?: string;
    };
    analyses: {
      analysisId: string;
      lastUpdated: string;
      testId: string;
      sampleItemId: string;
      statusId: string;
      sectionId: string;
      results: {
        resultId: string;
        lastUpdated: string;
        [key: string]: unknown;
      }[];
    }[];
  };
}
export interface ReportRequest {
  stamp: SessionStamp;
  current: () => boolean;
  signal?: AbortSignal;
}
export class ReportApiError extends Error {
  constructor(
    public kind: "session" | "rejected" | "unknown" | "read" | "contract",
    public status = 0,
  ) {
    super(`report.release.error.${kind}`);
  }
}
const object = (v: unknown): v is Record<string, any> =>
  Boolean(v && typeof v === "object" && !Array.isArray(v));
export const reportId = (v: unknown): v is string =>
  typeof v === "string" && /^[1-9][0-9]*$/.test(v);
const text = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const integer = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) > 0;
const version = (v: unknown) =>
  typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(v);
export const reportHash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const time = (v: unknown) =>
  (typeof v === "number" && Number.isFinite(v)) ||
  (text(v) && !Number.isNaN(Date.parse(v)));
const evidenceTime = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(v) &&
  time(v);
const ids = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every(reportId) &&
  new Set(v).size === v.length;
const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));
const requireValue = (valid: unknown) => {
  if (!valid) throw new ReportApiError("contract");
};
export function readApplications(
  value: unknown,
  patientId: string,
): ReportApplication[] {
  requireValue(Array.isArray(value));
  const rows = value as ReportApplication[];
  requireValue(
    rows.every(
      (r) =>
        object(r) &&
        r.patientId === patientId &&
        reportId(r.sampleId) &&
        text(r.accessionNumber),
    ) && new Set(rows.map((r) => r.sampleId)).size === rows.length,
  );
  return rows;
}
export function readRules(value: unknown): GroupRules {
  requireValue(
    object(value) &&
      version(value.ruleVersion) &&
      Array.isArray(value.groups) &&
      value.groups.length > 0 &&
      value.groups.length <= 100,
  );
  const rules = value as GroupRules;
  requireValue(
    rules.groups.every(
      (g) =>
        object(g) &&
        typeof g.key === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(g.key) &&
        text(g.label) &&
        g.label.length <= 200 &&
        ids(g.testIds) &&
        g.testIds.length <= 2000,
    ) && new Set(rules.groups.map((g) => g.key)).size === rules.groups.length,
  );
  return rules;
}
export function readDocument(
  value: unknown,
  application: ReportApplication,
): ReportDocument {
  requireValue(
    object(value) &&
      reportId(value.id) &&
      value.patientId === application.patientId &&
      value.sampleId === application.sampleId &&
      text(value.groupKey) &&
      version(value.ruleVersion) &&
      text(value.reportNumber) &&
      time(value.lastUpdated) &&
      ids(value.analysisIds),
  );
  return value as ReportDocument;
}
export function readDocuments(
  value: unknown,
  application: ReportApplication,
): ReportDocument[] {
  requireValue(Array.isArray(value));
  const rows = (value as unknown[]).map((v) => readDocument(v, application));
  requireValue(new Set(rows.map((r) => r.id)).size === rows.length);
  return rows;
}
export function readRelease(
  value: unknown,
  doc: ReportDocument,
): ReportRelease {
  requireValue(
    object(value) &&
      integer(value.id) &&
      value.patientId === doc.patientId &&
      value.documentId === doc.id &&
      value.reportNumber === doc.reportNumber &&
      integer(value.reportVersion) &&
      ["DRAFT", "ISSUED", "SUPERSEDED", "VOIDED"].includes(value.status) &&
      time(value.createdAt) &&
      (value.printCount == null ||
        (Number.isSafeInteger(value.printCount) && value.printCount >= 0)),
  );
  return value as ReportRelease;
}
export function readReleases(
  value: unknown,
  doc: ReportDocument,
): ReportRelease[] {
  requireValue(Array.isArray(value));
  const rows = (value as unknown[]).map((v) => readRelease(v, doc));
  requireValue(
    new Set(rows.map((r) => r.id)).size === rows.length &&
      new Set(rows.map((r) => r.reportVersion)).size === rows.length &&
      rows.filter((r) => r.status === "DRAFT").length <= 1 &&
      rows.filter((r) => r.status === "ISSUED").length <= 1,
  );
  return rows.sort((a, b) => b.reportVersion - a.reportVersion);
}
function readScope(value: unknown, doc: ReportDocument): ReportScope {
  requireValue(
    object(value) &&
      value.schemaVersion === 1 &&
      value.documentId === doc.id &&
      value.patientId === doc.patientId &&
      value.sampleId === doc.sampleId &&
      value.groupKey === doc.groupKey &&
      value.ruleVersion === doc.ruleVersion &&
      ids(value.analysisIds) &&
      sameIds(value.analysisIds, doc.analysisIds),
  );
  return value as ReportScope;
}
export function readDetail(
  value: unknown,
  doc: ReportDocument,
  releaseId: number,
): ReleaseDetail {
  requireValue(object(value));
  const detail = value as ReleaseDetail;
  const release = readRelease(detail.release, doc);
  readScope(detail.scope, doc);
  requireValue(
    release.id === releaseId &&
      typeof detail.canReviewOriginal === "boolean" &&
      typeof detail.canPrintCurrent === "boolean" &&
      (!detail.canReviewOriginal ||
        (release.status !== "DRAFT" && reportHash(release.pdfSha256))) &&
      (!detail.canPrintCurrent ||
        (detail.canReviewOriginal && release.status === "ISSUED")),
  );
  return detail;
}
export function readFrozen(
  value: unknown,
  doc: ReportDocument,
  release: ReportRelease,
): FrozenReport {
  requireValue(
    object(value) &&
      value.documentId === doc.id &&
      value.releaseId === release.id &&
      reportHash(value.snapshotSha256) &&
      time(value.frozenAt) &&
      object(value.snapshot),
  );
  const frozen = value as FrozenReport;
  const s = frozen.snapshot;
  readScope(s.scope, doc);
  requireValue(
    s.schemaVersion === 1 &&
      s.reportNumber === release.reportNumber &&
      s.reportVersion === release.reportVersion &&
      (s.amendmentReason || "") === (release.amendmentReason || "") &&
      object(s.template) &&
      text(s.template.version) &&
      [
        s.template.title,
        s.template.laboratoryName,
        s.template.footerText,
      ].every((v) => typeof v === "string") &&
      object(s.report) &&
      Array.isArray(s.report.columns) &&
      s.report.columns.length > 0 &&
      Array.isArray(s.report.rows),
  );
  requireValue(
    s.report.columns.every(
      (c) => object(c) && text(c.key) && text(c.header) && text(c.type),
    ) &&
      new Set(s.report.columns.map((c) => c.key)).size ===
        s.report.columns.length &&
      s.report.rows.every(
        (r) =>
          object(r) &&
          Array.isArray(r.cells) &&
          r.cells.length === s.report.columns.length &&
          r.cells.every(
            (v) =>
              v === null ||
              typeof v === "string" ||
              typeof v === "boolean" ||
              (typeof v === "number" && Number.isFinite(v)),
          ),
      ) &&
      (s.report.message == null || typeof s.report.message === "string"),
  );
  requireValue(
    Array.isArray(s.analyses) &&
      ids(s.analyses.map((a) => a?.analysisId)) &&
      sameIds(
        s.analyses.map((a) => a.analysisId),
        doc.analysisIds,
      ),
  );
  const resultIds: string[] = [];
  requireValue(
    s.analyses.every(
      (a) =>
        object(a) &&
        evidenceTime(a.lastUpdated) &&
        reportId(a.testId) &&
        reportId(a.sampleItemId) &&
        reportId(a.statusId) &&
        reportId(a.sectionId) &&
        Array.isArray(a.results) &&
        a.results.every((r) => {
          if (
            !object(r) ||
            !reportId(r.resultId) ||
            !evidenceTime(r.lastUpdated)
          )
            return false;
          resultIds.push(r.resultId);
          return true;
        }),
    ) && new Set(resultIds).size === resultIds.length,
  );
  return frozen;
}
export function assertReportRequest(request: ReportRequest) {
  if (
    !request.current() ||
    localStorage.getItem("CSRF") !== request.stamp.csrf ||
    request.signal?.aborted
  )
    throw new ReportApiError("session");
}
async function request<T>(
  path: string,
  context: ReportRequest,
  parse: (value: unknown) => T,
  method = "GET",
  body?: unknown,
): Promise<T> {
  assertReportRequest(context);
  const write = method !== "GET";
  try {
    const response = await fetch(config.serverBaseUrl + path, {
      method,
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: context.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
        ...(write
          ? {
              "Content-Type": "application/json",
              "X-CSRF-Token": context.stamp.csrf,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new ReportApiError(
        [400, 401, 403, 404, 409, 422].includes(response.status)
          ? "rejected"
          : write
            ? "unknown"
            : "read",
        response.status,
      );
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw new ReportApiError(write ? "unknown" : "contract");
    const value = await response.json();
    assertReportRequest(context);
    return parse(value);
  } catch (error) {
    if (
      error instanceof ReportApiError &&
      (!write || error.kind === "rejected")
    )
      throw error;
    throw new ReportApiError(
      write ? "unknown" : error instanceof ReportApiError ? error.kind : "read",
    );
  }
}
const base = "/rest/reports";
const documentPath = (doc: ReportDocument) => `${base}/documents/${doc.id}`;
const releasePath = (doc: ReportDocument, releaseId: number) =>
  `${documentPath(doc)}/releases/${releaseId}`;
export const getReportApplications = (patientId: string, c: ReportRequest) =>
  request(
    `${base}/applications?${new URLSearchParams({ patientId })}`,
    c,
    (v) => readApplications(v, patientId),
  );
export const getReportRules = (c: ReportRequest) =>
  request(`${base}/group-rules`, c, readRules);
export const saveReportRules = (
  rules: Omit<GroupRules, "ruleVersion"> & { ruleVersion: string | null },
  c: ReportRequest,
) => {
  readRules({ ...rules, ruleVersion: rules.ruleVersion || "initial" });
  return request(`${base}/group-rules`, c, readRules, "PUT", {
    expectedRuleVersion: rules.ruleVersion,
    groups: rules.groups,
  });
};
export const getReportTests = (c: ReportRequest) =>
  request("/rest/test-list", c, (v) => {
    requireValue(
      Array.isArray(v) &&
        v.every((t) => object(t) && reportId(t.id) && text(t.value)) &&
        new Set(v.map((t) => t.id)).size === v.length,
    );
    return v as { id: string; value: string }[];
  });
export const getReportDocuments = (app: ReportApplication, c: ReportRequest) =>
  request(
    `${base}/documents?${new URLSearchParams({ sampleId: app.sampleId })}`,
    c,
    (v) => readDocuments(v, app),
  );
export const getReportDocument = (
  docId: string,
  app: ReportApplication,
  c: ReportRequest,
) =>
  request(`${base}/documents/${docId}`, c, (v) => {
    const doc = readDocument(v, app);
    requireValue(doc.id === docId);
    return doc;
  });
export const prepareReportDocument = (
  app: ReportApplication,
  groupKey: string,
  c: ReportRequest,
) =>
  request(
    `${base}/documents`,
    c,
    (v) => {
      const doc = readDocument(v, app);
      requireValue(doc.groupKey === groupKey);
      return doc;
    },
    "POST",
    { sampleId: app.sampleId, groupKey },
  );
export const getReportReleases = (doc: ReportDocument, c: ReportRequest) =>
  request(`${documentPath(doc)}/releases`, c, (v) => readReleases(v, doc));
export const getReportRelease = (
  doc: ReportDocument,
  id: number,
  c: ReportRequest,
) => request(releasePath(doc, id), c, (v) => readDetail(v, doc, id));
export const createReportDraft = (
  doc: ReportDocument,
  amendmentReason: string,
  c: ReportRequest,
) =>
  request(
    `${documentPath(doc)}/releases`,
    c,
    (v) => {
      const r = readRelease(v, doc);
      requireValue(r.status === "DRAFT");
      return r;
    },
    "POST",
    { amendmentReason: amendmentReason.trim() || null },
  );
export const getReportSnapshot = (
  doc: ReportDocument,
  r: ReportRelease,
  c: ReportRequest,
) =>
  request(`${releasePath(doc, r.id)}/snapshot`, c, (v) =>
    readFrozen(v, doc, r),
  );
export const freezeReport = (
  doc: ReportDocument,
  r: ReportRelease,
  c: ReportRequest,
) =>
  request(
    `${releasePath(doc, r.id)}/freeze`,
    c,
    (v) => readFrozen(v, doc, r),
    "POST",
    {},
  );
export const issueReport = (
  doc: ReportDocument,
  r: ReportRelease,
  snapshotSha256: string,
  password: string,
  c: ReportRequest,
) => {
  requireValue(
    reportHash(snapshotSha256) && !!password && r.status === "DRAFT",
  );
  return request(
    `${releasePath(doc, r.id)}/issue`,
    c,
    (v) => {
      const value = readRelease(v, doc);
      requireValue(
        value.id === r.id &&
          value.reportVersion === r.reportVersion &&
          value.status === "ISSUED" &&
          reportHash(value.pdfSha256),
      );
      return value;
    },
    "POST",
    { snapshotSha256, password },
  );
};
export const voidReport = (
  doc: ReportDocument,
  r: ReportRelease,
  password: string,
  reason: string,
  c: ReportRequest,
) => {
  requireValue(
    reportHash(r.pdfSha256) &&
      !!password &&
      !!reason.trim() &&
      r.status === "ISSUED",
  );
  return request(
    `${releasePath(doc, r.id)}/void`,
    c,
    (v) => {
      const value = readRelease(v, doc);
      requireValue(
        value.id === r.id &&
          value.reportVersion === r.reportVersion &&
          value.status === "VOIDED" &&
          value.pdfSha256 === r.pdfSha256,
      );
      return value;
    },
    "POST",
    { expectedPdfSha256: r.pdfSha256, password, reason: reason.trim() },
  );
};
export async function getReportPdf(
  doc: ReportDocument,
  r: ReportRelease,
  kind: "original" | "preview" | "print",
  c: ReportRequest,
): Promise<Blob> {
  assertReportRequest(c);
  const write = kind === "print";
  try {
    const response = await fetch(
      config.serverBaseUrl +
        releasePath(doc, r.id) +
        (kind === "original"
          ? ".pdf"
          : kind === "preview"
            ? "/preview.pdf"
            : "/print"),
      {
        method: write ? "POST" : "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
        signal: c.signal,
        headers: {
          Accept: "application/pdf",
          "Accept-Language": getRequestLocale(),
          ...(write ? { "X-CSRF-Token": c.stamp.csrf } : {}),
        },
      },
    );
    if (!response.ok)
      throw new ReportApiError(
        [400, 401, 403, 404, 409, 422].includes(response.status)
          ? "rejected"
          : write
            ? "unknown"
            : "read",
        response.status,
      );
    if (!response.headers.get("Content-Type")?.startsWith("application/pdf"))
      throw new ReportApiError(write ? "unknown" : "contract");
    const blob = await response.blob();
    assertReportRequest(c);
    requireValue(blob.size > 0);
    return blob;
  } catch (error) {
    if (
      error instanceof ReportApiError &&
      (!write || error.kind === "rejected")
    )
      throw error;
    throw new ReportApiError(write ? "unknown" : "read");
  }
}
