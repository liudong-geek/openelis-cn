import config from "../../../config.json";
import {
  getFromOpenElisServerV2,
  postToOpenElisServerForPDF,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";

export type PatientReportReleaseStatus =
  | "DRAFT"
  | "ISSUED"
  | "SUPERSEDED"
  | "VOIDED";

export interface PatientReportReleaseSummary {
  id: number;
  patientId: string;
  reportNumber: string;
  reportVersion: number;
  status: PatientReportReleaseStatus;
  createdAt: string;
  issuedByName?: string;
  issuedAt?: string;
  supersedesReleaseId?: number;
  amendmentReason?: string;
  voidedAt?: string;
  voidReason?: string;
  pdfSha256?: string;
  accessionNumbers?: string;
  printCount?: number;
  lastPrintedAt?: string;
}

interface ApiErrorShape {
  error?: string;
  message?: string;
  status?: number;
  statusCode?: number;
}

const postJson = <T>(endpoint: string, payload: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    postToOpenElisServerJsonResponse<T & ApiErrorShape>(
      endpoint,
      JSON.stringify(payload),
      (response) => {
        if (!response) {
          reject(new Error("服务无响应，请重试"));
          return;
        }
        if (
          response.error ||
          (response.status || response.statusCode || 0) >= 400
        ) {
          reject(new Error(response.message || "报告操作失败"));
          return;
        }
        resolve(response);
      },
    );
  });

export const getPatientReportReleases = (patientId: string) =>
  getFromOpenElisServerV2<PatientReportReleaseSummary[]>(
    `/rest/reports/patient-results/releases?${new URLSearchParams({ patientId }).toString()}`,
  );

export const createPatientReportDraft = (
  patientId: string,
  amendmentReason?: string,
) =>
  postJson<PatientReportReleaseSummary>(
    "/rest/reports/patient-results/releases/drafts",
    { patientId, amendmentReason: amendmentReason || null },
  );

export const issuePatientReport = (releaseId: number, signatureId: number) =>
  postJson<PatientReportReleaseSummary>(
    `/rest/reports/patient-results/releases/${releaseId}/issue?signatureId=${signatureId}`,
    {},
  );

export const voidPatientReport = (releaseId: number, signatureId: number) =>
  postJson<PatientReportReleaseSummary>(
    `/rest/reports/patient-results/releases/${releaseId}/void?signatureId=${signatureId}`,
    {},
  );

export const patientReportPdfUrl = (releaseId: number) =>
  `${config.serverBaseUrl}/rest/reports/patient-results/releases/${releaseId}.pdf`;

export const printPatientReport = (releaseId: number) =>
  new Promise<Blob>((resolve, reject) => {
    postToOpenElisServerForPDF(
      `/rest/reports/patient-results/releases/${releaseId}/print`,
      "{}",
      (success, blob) => {
        if (success && blob) {
          resolve(blob);
          return;
        }
        reject(new Error("打印失败，请重试"));
      },
    );
  });
