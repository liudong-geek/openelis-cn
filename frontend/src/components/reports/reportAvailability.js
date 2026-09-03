export const SECURITY_REVIEW_REPORTS = new Set([
  "sampleRejectionReport",
  "activityReportByTest",
  "activityReportByPanel",
  "activityReportByTestSection",
  "haitiNonConformityByDate",
  "CISampleRoutineExport",
  "patientCollection",
  "patientAssociated",
  "indicatorSectionPerformance",
  "retroCINonConformityByDate",
  "retroCINonConformityByLabno",
  "retroCInonConformityNotification",
  "retroCIFollowupRequiredByLocation",
  "CIStudyExport",
  "Trends",
  "ExportWHONETReportByDate",
  "TBOrderExport",
  "TBOrderReport",
]);

export const isSecurityRestrictedReport = (report) =>
  SECURITY_REVIEW_REPORTS.has(report);
