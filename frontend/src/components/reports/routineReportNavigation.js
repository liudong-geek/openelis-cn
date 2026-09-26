export const AGGREGATE_REPORT_OPTIONS = Object.freeze([
  {
    report: "statisticsReport",
    type: "indicator",
    displayKey: "sidenav.label.statisticsreport",
  },
  {
    report: "indicatorHaitiLNSPAllTests",
    type: "indicator",
    displayKey: "sidenav.label.testsummary",
  },
  {
    report: "indicatorCDILNSPHIV",
    type: "indicator",
    displayKey: "sideNav.label.hivtestsummary",
  },
  {
    report: "haitiNonConformityBySectionReason",
    type: "patient",
    displayKey: "sideNav.label.noncomformityreportsbyunit",
  },
  {
    report: "validationBacklog",
    type: "indicator",
    displayKey: "sideNav.label.delayedvalidation",
  },
]);

export const isAggregateReport = (report) =>
  AGGREGATE_REPORT_OPTIONS.some((option) => option.report === report);

export const ROUTINE_REPORT_TASKS = Object.freeze([
  {
    elementId: "menu_reports_patient_status",
    displayKey: "sidenav.label.statusreport",
    actionURL: "/RoutineReport?type=patient&report=patientCILNSP_vreduit",
  },
  {
    elementId: "menu_reports_aggregate",
    displayKey: "sidenav.title.aggregatereport",
    actionURL: "/RoutineReport?type=indicator&report=statisticsReport",
  },
  {
    elementId: "menu_reports_referred_out",
    displayKey: "sideNav.label.referredtestreport",
    actionURL: "/RoutineReport?type=patient&report=referredOut",
  },
]);

export const DEFAULT_ROUTINE_REPORT_PATH = ROUTINE_REPORT_TASKS[0].actionURL;
