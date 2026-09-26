import config from "../../config.json";

export const ROUTINE_REPORT_TASKS = Object.freeze([
  {
    elementId: "menu_reports_patient_status",
    displayKey: "sidenav.label.statusreport",
    actionURL: "/RoutineReport?type=patient&report=patientCILNSP_vreduit",
  },
  {
    elementId: "menu_reports_statistics",
    displayKey: "sidenav.label.statisticsreport",
    actionURL: "/RoutineReport?type=indicator&report=statisticsReport",
  },
  {
    elementId: "menu_reports_test_summary",
    displayKey: "sidenav.label.testsummary",
    actionURL:
      "/RoutineReport?type=indicator&report=indicatorHaitiLNSPAllTests",
  },
  {
    elementId: "menu_reports_hiv_summary",
    displayKey: "sideNav.label.hivtestsummary",
    actionURL: "/RoutineReport?type=indicator&report=indicatorCDILNSPHIV",
  },
  {
    elementId: "menu_reports_referred_out",
    displayKey: "sideNav.label.referredtestreport",
    actionURL: "/RoutineReport?type=patient&report=referredOut",
  },
  {
    elementId: "menu_reports_nonconformity_section",
    displayKey: "sideNav.label.noncomformityreportsbyunit",
    actionURL:
      "/RoutineReport?type=patient&report=haitiNonConformityBySectionReason",
  },
  {
    elementId: "menu_reports_validation_backlog",
    displayKey: "sideNav.label.delayedvalidation",
    actionURL: `${config.serverBaseUrl}/ReportPrint?type=indicator&report=validationBacklog`,
  },
]);

export const DEFAULT_ROUTINE_REPORT_PATH = ROUTINE_REPORT_TASKS[0].actionURL;
