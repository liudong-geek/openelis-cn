import LoginPage from "../pages/LoginPage";
import { assertCurrentHeading } from "../pages/CurrentChinaLabels";

let homePage = null;
let loginPage = null;
let reportPage = null;

before("login", () => {
  loginPage = new LoginPage();
  loginPage.visit();
});

describe("Routine Reports", function () {
  it("User Visits Routine Reports", function () {
    homePage = loginPage.goToHomePage();
    reportPage = homePage.goToRoutineReports();
    assertCurrentHeading("openreports.patientTestStatus");
  });

  it("User Visits Patient Status Report and checks for Respective Forms", function () {
    reportPage.assertPatientModes("openreports.patientTestStatus");
  });

  it("Should Visit Statistics Reports", function () {
    reportPage.statisticsForm();
  });

  it('Within Statistic Should uncheck the "All" checkbox if any individual checkbox is unchecked', function () {
    reportPage.assertStatisticsAllTracksIndividual();
  });

  it('Should check/uncheck "All" checkbox for priority', function () {
    reportPage.assertStatisticsPriorityAll();
  });

  it("should check for print button", function () {
    reportPage.assertStatisticsPreviewBeforePrint();
  });

  it("Visits Summary of all tests", function () {
    reportPage.selectAggregate("indicatorHaitiLNSPAllTests");
    reportPage.assertDateRange("openreports.all.test.summary.title");
  });

  it("Visits HIV Test Summary and validates", function () {
    reportPage.selectAggregate("indicatorCDILNSPHIV");
    reportPage.assertDateRange("sideNav.label.hivtestsummary");
  });

  it("Visits Rejection Report and validates : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("sampleRejectionReport", "indicator");
  });

  it("Visits Activity Report By Test Type : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("activityReportByTest", "indicator");
  });

  it("Visits Activity Report By Panel Type : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("activityReportByPanel", "indicator");
  });

  it("Visits Activity Report By Unit : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport(
      "activityReportByTestSection",
      "indicator",
    );
  });

  it("Visits Referred Out Test Report", function () {
    reportPage.assertReferredReport();
  });

  it("Visits Non Conformity Report By Date : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("haitiNonConformityByDate", "patient");
  });

  it("Visits Non Conformity Report By Unit and Reason", function () {
    reportPage.selectAggregate("haitiNonConformityBySectionReason", "patient");
    reportPage.assertDateRange("openreports.mgt.nonconformity.section");
  });

  it("Visits Export Routine CSV : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("CISampleRoutineExport", "routine");
  });
});

describe("Study Reports", function () {
  it("User Visits Study Reports", function () {
    homePage = loginPage.goToHomePage();
    reportPage = homePage.goToStudyReports();
  });

  it("should visit ARV Initial Version 1 and verify the button state", function () {
    reportPage.selectStudyReport("patientARVInitial1");
    reportPage.assertLabNumberRequired("header.label.ARV");
  });

  it("should visit ARV Initial Version 2 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientARVInitial2");
    reportPage.assertLabNumberRequired("header.label.ARV");
  });

  it("should visit ARV Follow-Up Version 1 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientARVFollowup1");
    reportPage.assertLabNumberRequired("header.label.followup");
  });

  it("should visit ARV Follow-Up Version 2 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientARVFollowup2");
    reportPage.assertLabNumberRequired("header.label.followup");
  });

  it("should visit ARV Follow-Up Version 3 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientARV1");
    reportPage.assertLabNumberRequired("header.label.intialFollowup");
  });

  it("should visit EID Version 1 and verify the accordion items and button state", function () {
    reportPage.selectStudyReport("patientEID1");
    reportPage.assertPatientModes("header.label.EID");
  });

  it("should visit EID Version 2 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientEID2");
    reportPage.assertLabNumberRequired("header.label.EID");
  });

  it("should visit VL Version and verify the accordion items and button state", function () {
    reportPage.selectStudyReport("patientVL1");
    reportPage.assertPatientModes("banner.menu.resultvalidation.viralload");
  });

  it("should visit Intermediate Version 1 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientIndeterminate1");
    reportPage.assertLabNumberRequired("project.IndeterminateStudy.name");
  });

  it("should visit Intermediate Version 2 and verify the header and button state", function () {
    reportPage.selectStudyReport("patientIndeterminate2");
    reportPage.assertLabNumberRequired("project.IndeterminateStudy.name");
  });

  it("should visit Intermediate By Service and verify the input fields and button state", function () {
    reportPage.assertIntermediateService();
  });

  it("should visit Special Request and verify the header and button state", function () {
    reportPage.selectStudyReport("patientSpecialReport");
    reportPage.assertLabNumberRequired("header.label.specialRequest");
  });

  it("should visit Collected ARV Patient Report and verify the header and button state : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("patientCollection", "patient");
  });

  it("should visit Associated Patient Report and verify the header and button state : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("patientAssociated", "patient");
  });

  it("should visit Non-Conformity Report By Date and verify the header and button state : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("retroCINonConformityByDate", "patient");
  });

  it("should visit Non-Conformity Report By Unit and Reason and verify the header and button state", function () {
    reportPage.selectStudyReport("retroCInonConformityBySectionReason");
    reportPage.assertDateRange("reports.nonConformity.bySectionReason.title");
  });

  it("should visit Non-Conformity Report By Lab No and verify the header and button state : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("retroCINonConformityByLabno", "patient");
  });

  it("should visit Non-Conformity Report By Notification and verify the button state : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport(
      "retroCInonConformityNotification",
      "patient",
    );
  });

  it("should visit Non-Conformity Report Follow-Up Required and verify the header and button state : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport(
      "retroCIFollowupRequiredByLocation",
      "patient",
    );
  });

  it("should visit General Report In Export By Date and select options : current security restriction explains why printing is unavailable", function () {
    reportPage.assertRestrictedReport("CIStudyExport", "patient");
  });

  it("User Visits Audit Trail Report And Validates", function () {
    reportPage.assertOrderAudit();
  });
});
