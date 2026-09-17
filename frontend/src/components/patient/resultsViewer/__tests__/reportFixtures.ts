import type {
  FrozenReport,
  ReportApplication,
  ReportDocument,
  ReportRelease,
} from "../patient-report-release-api";
export const application: ReportApplication = {
  patientId: "42",
  sampleId: "51",
  accessionNumber: "REQ-20260916-1",
};
export const document: ReportDocument = {
  id: "60",
  patientId: "42",
  sampleId: "51",
  groupKey: "chemistry",
  ruleVersion: "v1",
  reportNumber: "BG-001",
  lastUpdated: "2026-09-16T10:00:00Z",
  analysisIds: ["70"],
};
export const release: ReportRelease = {
  id: 80,
  documentId: "60",
  patientId: "42",
  reportNumber: "BG-001",
  reportVersion: 1,
  status: "DRAFT",
  createdAt: "2026-09-16T10:00:00Z",
  printCount: 0,
};
export const rules = {
  ruleVersion: "v1",
  groups: [{ key: "chemistry", label: "Biochemistry", testIds: ["90"] }],
};
export const scope = {
  schemaVersion: 1 as const,
  documentId: "60",
  patientId: "42",
  sampleId: "51",
  groupKey: "chemistry",
  ruleVersion: "v1",
  analysisIds: ["70"],
};
export const frozen: FrozenReport = {
  releaseId: 80,
  documentId: "60",
  snapshotSha256: "a".repeat(64),
  frozenAt: "2026-09-16T10:01:00Z",
  snapshot: {
    schemaVersion: 1,
    scope,
    reportNumber: "BG-001",
    reportVersion: 1,
    template: {
      version: "1",
      title: "Laboratory report preview",
      laboratoryName: "Lab",
      footerText: "Frozen footer",
    },
    report: {
      columns: [
        { key: "patient", header: "Patient", type: "string" },
        { key: "value", header: "Result", type: "string" },
      ],
      rows: [{ cells: ["Patient One", "7.2 mmol/L"] }],
      message: "Frozen message",
    },
    analyses: [
      {
        analysisId: "70",
        lastUpdated: "2026-09-16T10:00:00Z",
        testId: "90",
        sampleItemId: "61",
        statusId: "3",
        sectionId: "4",
        results: [{ resultId: "100", lastUpdated: "2026-09-16T10:00:00Z" }],
      },
    ],
  },
};
export const session = {
  userSessionDetails: {
    authenticated: true,
    userId: "1",
    sessionId: "report-session",
    csrf: "token",
    roles: ["Reports", "Global Administrator"],
  },
  sessionPhase: "authenticated",
};
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });
