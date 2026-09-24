import LoginPage from "./LoginPage";
import PatientEntryPage from "./PatientEntryPage";
import PatientMergePage from "./PatientMergePage";
import OrderEntityPage from "./OrderEntityPage";
import ModifyOrderPage from "./ModifyOrderPage";
import WorkPlan from "./WorkPlan";
import NonConform from "./NonConformPage";
import Result from "./ResultsPage";
import Validation from "./Validation";
import BarcodeConfigPage from "./BarcodeConfigPage";
import BatchOrderEntry from "./BatchOrderEntryPage";
import RoutineReportPage from "./RoutineReportPage";
import StudyReportPage from "./StudyReportPage";
import DashBoardPage from "./DashBoard";
import AdminPage from "./AdminPage";
import HelpPage from "./HelpPage";
import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

// E-01: locate the current translated UI without changing its configured locale.
const labelPattern = (key) => {
  const labels = [
    ...new Set([enMessages[key], zhMessages[key], zhCNMessages[key]]),
  ];
  if (labels.some((label) => typeof label !== "string")) {
    throw new Error(`Missing navigation label: ${key}`);
  }
  return new RegExp(
    labels.map((label) => Cypress._.escapeRegExp(label)).join("|"),
  );
};

class HomePage {
  constructor() {
    this.selectors = {
      menuButton: "[data-cy='menuButton']",
      sampleAddNav: "#menu_sample_add_nav",
      sampleMenu: "span#menu_sample",
      batchEntry: "#menu_sample_batch_entry",
      intakeWorkspace: "#menu_intake_workspace",
      orderDashboardNav: "#menu_order_dashboard_nav",
      patientMenu: "span#menu_patient",
      patientAddEdit: "#menu_patient_add_or_edit_nav",
      patientMerge: "#menu_patient_merge",
      sampleEditNav: "#menu_sample_edit_nav",
      workplanMenu: "span#menu_workplan",
      workplanTestNav: "#menu_workplan_test_nav",
      workplanPanelNav: "#menu_workplan_panel_nav",
      workplanBenchNav: "#menu_workplan_bench_nav",
      workplanPriorityNav: "#menu_workplan_priority_nav",
      nonConformityDropdown: "span#menu_nonconformity_dropdown",
      nonConformingReport: "span#menu_non_conforming_report",
      nonConformingView: "span#menu_non_conforming_view",
      nonConformingActions: "span#menu_non_conforming_corrective_actions",
      resultsMenu: "span#menu_results",
      resultsLogbook: "#menu_results_logbook_nav",
      resultsAccession: "#menu_results_accession_nav",
      resultsPatient: "#menu_results_patient",
      resultsReferred: "#menu_results_referred_nav",
      resultsRange: "#menu_results_range_nav",
      resultsStatus: "#menu_results_status_nav",
      validationMenu: "#menu_resultvalidation",
      routineValidation: "#menu_resultvalidation_routine",
      rangeOrderValidation: "#menu_accession_validation_range",
      accessionValidation: "#menu_accession_validation",
      reportsMenu: "#menu_reports",
      reportsRoutine: "#menu_reports_routine",
      reportsStudy: "[data-cy='sidenav-button-menu_reports_study']",
      pathologyNav: "#menu_pathology_nav",
      immunochemMenu: "#menu_immunochem",
      cytologyMenu: "#menu_cytology",
      administrationMenu: "span#menu_administration",
      administrationNav: "#menu_administration_nav",
      managementWorkspace: "#menu_management_workspace",
      managementEntry: "#menu_management_workspace a[href='/MasterListsPage']",
      helpMenu: "#menu_help",
      minimizeIcon: "#minimizeIcon",
      searchIcon: "#search-Icon",
      searchItem: "#searchItem",
      patientSearch: "#patientSearch",
      notificationIcon: "#notification-Icon",
      userIcon: "#user-Icon",
      userHelp: "#user-Help",
      maximizeIcon: "#maximizeIcon",
      link: "a.cds--link",
    };
  }

  visit() {
    cy.visit("/");
  }

  goToSign() {
    return new LoginPage();
  }

  openNavigationMenu() {
    // E-01: the six-workspace menu can be persistent or manually collapsed.
    cy.get(".cds--side-nav", { timeout: 30000 }).then(($nav) => {
      if (!$nav.hasClass("cds--side-nav--expanded")) {
        cy.get(this.selectors.menuButton).should("be.visible").click();
      }
    });
    cy.get(".cds--side-nav").should("have.class", "cds--side-nav--expanded");
  }

  closeNavigationMenu() {
    cy.get("body").then(($body) => {
      const $btn = $body.find(this.selectors.menuButton);
      if ($btn.length && $body.find(".cds--side-nav--expanded").length) {
        cy.wrap($btn).click();
      }
    });
  }

  expectOverview() {
    cy.location("pathname").should("match", /^\/(Dashboard)?$/);
    cy.get("#dashboard-title", { timeout: 30000 })
      .should("be.visible")
      .invoke("text")
      .should("match", labelPattern("dashboard.command.title"));
    cy.get(".dashboard-task-list").should("be.visible");
  }

  openManagementWorkspace() {
    this.openNavigationMenu();
    const toggle = `${this.selectors.managementWorkspace} button.cds--side-nav__submenu`;
    cy.get(toggle)
      .first()
      .scrollIntoView()
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") {
          cy.wrap($button).click();
        }
      });
    // Expansion remounts Carbon's menu; query the current button again.
    cy.get(toggle).first().should("have.attr", "aria-expanded", "true");
    cy.get(this.selectors.managementEntry)
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should("eq", "/MasterListsPage");
    this.closeNavigationMenu();
  }

  // Order Entry related functions
  goToOrderPage() {
    this.openNavigationMenu();
    cy.get(this.selectors.sampleMenu).should("be.visible").click();
    cy.get(this.selectors.sampleAddNav).should("be.visible").click();
    return new OrderEntityPage();
  }

  goToBatchOrderEntry() {
    this.openNavigationMenu();
    cy.get(this.selectors.sampleMenu).click();
    cy.get(this.selectors.batchEntry).click();
    return new BatchOrderEntry();
  }

  goToBarcode() {
    this.openNavigationMenu();
    cy.get("#menu_sample").click();
    cy.get("[data-cy='menu_sample_print_barcode']").click();
    return new BarcodeConfigPage();
  }

  // Patient Entry related functions
  goToPatientEntry() {
    this.openNavigationMenu();
    const intakeToggle = `${this.selectors.intakeWorkspace} button.cds--side-nav__submenu`;
    cy.get(intakeToggle)
      .first()
      .scrollIntoView()
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") {
          cy.wrap($button).click();
        }
      });
    cy.get(intakeToggle).first().should("have.attr", "aria-expanded", "true");
    cy.get(this.selectors.orderDashboardNav)
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should("eq", "/order");
    cy.get("#order-dashboard-title").should("be.visible");

    cy.intercept("GET", "**/rest/patient-management-list?*").as(
      "patientMasterList",
    );
    cy.contains(
      ".intake-header-actions button",
      labelPattern("intake.workspace.patient"),
    )
      .should("be.visible")
      .click();
    cy.location("pathname").should("eq", "/PatientManagement");
    cy.wait("@patientMasterList").its("response.statusCode").should("eq", 200);
    cy.get("#patient-management-title").should("be.visible");
    return new PatientEntryPage();
  }

  // Patient Merge (Admin function)
  goToPatientMerge() {
    this.openNavigationMenu();
    cy.get(this.selectors.patientMenu).click();
    cy.get(this.selectors.patientMerge).should("be.visible").click();
    return new PatientMergePage();
  }

  // Modify Order related functions
  goToModifyOrderPage() {
    this.openNavigationMenu();
    cy.get(this.selectors.sampleMenu).should("be.visible").click();
    cy.get(this.selectors.sampleEditNav).should("be.visible").click();
    return new ModifyOrderPage();
  }

  // Work Plan related functions
  goToWorkPlanPlanByTest() {
    this.openNavigationMenu();
    cy.get(this.selectors.workplanMenu).should("be.visible").click();
    cy.get(this.selectors.workplanTestNav).should("be.visible").click();
    return new WorkPlan();
  }

  goToWorkPlanPlanByPanel() {
    this.openNavigationMenu();
    cy.get(this.selectors.workplanMenu).click();
    cy.get(this.selectors.workplanPanelNav).click();
    return new WorkPlan();
  }

  goToWorkPlanPlanByUnit() {
    this.openNavigationMenu();
    cy.get(this.selectors.workplanMenu).click();
    cy.get(this.selectors.workplanBenchNav).should("be.visible").click();
    return new WorkPlan();
  }

  goToWorkPlanPlanByPriority() {
    this.openNavigationMenu();
    cy.get(this.selectors.workplanMenu).click();
    cy.get(this.selectors.workplanPriorityNav).should("be.visible").click();
    return new WorkPlan();
  }

  // Non-Conforming related functions
  goToReportNCE() {
    this.openNavigationMenu();
    cy.get(this.selectors.nonConformityDropdown).click();
    cy.get(this.selectors.nonConformingReport).should("be.visible").click();
    return new NonConform();
  }

  goToViewNCE() {
    this.openNavigationMenu();
    cy.get(this.selectors.nonConformityDropdown).click();
    cy.get(this.selectors.nonConformingView).should("be.visible").click();
    return new NonConform();
  }

  goToCorrectiveActions() {
    this.openNavigationMenu();
    cy.get(this.selectors.nonConformityDropdown).click();
    cy.get(this.selectors.nonConformingActions).should("be.visible").click();
    return new NonConform();
  }

  // Results related functions
  goToResultsByUnit() {
    this.openNavigationMenu();
    cy.get(this.selectors.resultsMenu).click();
    cy.get(this.selectors.resultsLogbook).should("be.visible").click();
    return new Result();
  }

  goToResultsByOrder() {
    this.openNavigationMenu();
    cy.get(this.selectors.resultsMenu).click();
    cy.get(this.selectors.resultsAccession).click();
    return new Result();
  }

  goToResultsByPatient() {
    this.openNavigationMenu();
    cy.get(this.selectors.resultsMenu).click();
    cy.get(this.selectors.resultsPatient).click();
    return new Result();
  }

  goToResultsForRefferedOut() {
    this.openNavigationMenu();
    cy.get(this.selectors.resultsMenu).click();
    cy.get(this.selectors.resultsReferred).click();
    return new Result();
  }

  goToResultsByRangeOrder() {
    this.openNavigationMenu();
    cy.get(this.selectors.resultsMenu).click();
    cy.get(this.selectors.resultsRange).click();
    return new Result();
  }

  goToResultsByTestAndStatus() {
    this.openNavigationMenu();
    cy.get(this.selectors.resultsMenu).click();
    cy.get(this.selectors.resultsStatus).click();
    return new Result();
  }

  // Validation related functions
  goToValidationByRoutine() {
    this.openNavigationMenu();
    cy.get(this.selectors.validationMenu).click();
    cy.get(this.selectors.routineValidation).click();
    return new Validation();
  }

  goToValidationByOrder() {
    this.openNavigationMenu();
    cy.get(this.selectors.validationMenu).click();
    cy.get(this.selectors.accessionValidation).click();
    return new Validation();
  }

  goToValidationByRangeOrder() {
    this.openNavigationMenu();
    cy.get(this.selectors.validationMenu).click();
    cy.get(this.selectors.rangeOrderValidation).click();
    return new Validation();
  }

  // Reports related functions
  goToRoutineReports() {
    this.openNavigationMenu();
    cy.get(this.selectors.reportsMenu).click();
    cy.get(this.selectors.reportsRoutine).should("be.visible").click();
    return new RoutineReportPage();
  }

  goToStudyReports() {
    this.openNavigationMenu();
    cy.get(this.selectors.reportsMenu).click();
    cy.get(this.selectors.reportsStudy).should("be.visible").click();
    return new StudyReportPage();
  }

  goToReports() {
    this.openNavigationMenu();
    cy.get(this.selectors.reportsMenu).click();
  }

  // Dashboard related functions
  goToPathologyDashboard() {
    this.openNavigationMenu();
    cy.get(this.selectors.pathologyNav).should("be.visible").click();
    return new DashBoardPage();
  }

  goToImmunoChemistryDashboard() {
    this.openNavigationMenu();
    cy.get(this.selectors.immunochemMenu).click();
    return new DashBoardPage();
  }

  goToCytologyDashboard() {
    this.openNavigationMenu();
    cy.get(this.selectors.cytologyMenu).click();
    return new DashBoardPage();
  }

  // Admin related functions
  goToAdminPageProgram() {
    this.openManagementWorkspace();
    return new AdminPage();
  }

  goToAdminPage() {
    this.openManagementWorkspace();
    return new AdminPage();
  }

  goToHelp() {
    this.openNavigationMenu();
    cy.get(this.selectors.helpMenu).click();
    return new HelpPage();
  }

  // UI interaction functions
  afterAll() {
    // A-02 tasks now navigate to work areas; the six operational metrics still
    // expand in place. Return through the real UI in both cases.
    cy.location("pathname").then((pathname) => {
      if (/^\/(Dashboard)?$/.test(pathname)) {
        cy.get("body").then(($body) => {
          if ($body.find(".dashboard-view").length) {
            cy.get(this.selectors.minimizeIcon).should("be.visible").click();
          }
        });
      } else {
        this.openNavigationMenu();
        cy.get("#menu_home_nav").should("be.visible").click();
      }
    });
    this.expectOverview();
  }

  searchBar() {
    cy.intercept({
      method: "GET",
      pathname: "**/rest/patient-search",
      query: { firstName: "Smith" },
    }).as("homePatientSearch");
    cy.get(this.selectors.searchIcon).should("be.visible").click();
    cy.get(this.selectors.searchItem).should("be.visible").type("Smith");
    cy.get(this.selectors.patientSearch).should("be.visible").click();
    cy.wait("@homePatientSearch").its("response.statusCode").should("eq", 200);
    cy.get(this.selectors.searchIcon).click();
    cy.get(this.selectors.searchItem).should("not.exist");
  }

  clickNotifications() {
    cy.get(this.selectors.notificationIcon).should("be.visible").click();
    cy.contains(
      ".slide-over-root.show .slide-over-title",
      labelPattern("header.icon.notifications"),
    ).should("be.visible");
    cy.get(".slide-over-root.show #close-slide-over")
      .should("be.visible")
      .click();
    cy.get(".slide-over-root.show").should("not.exist");
  }

  clickUserIcon() {
    cy.get(this.selectors.userIcon).should("be.visible").click();
    cy.get(".cds--header-panel--expanded [data-cy='logOut']").should(
      "be.visible",
    );
    cy.get(this.selectors.userIcon).click();
    cy.get(".cds--header-panel--expanded [data-cy='logOut']").should(
      "not.exist",
    );
  }

  clickHelpIcon() {
    cy.get(this.selectors.userHelp).should("be.visible").click();
    cy.contains(
      ".cds--header-panel--expanded button",
      labelPattern("banner.menu.help.usermanual"),
    ).should("be.visible");
    cy.get(this.selectors.userHelp).click();
    cy.get(".cds--header-panel--expanded").should("not.exist");
  }

  taskCard(titleKey) {
    return cy
      .contains(".dashboard-task-item", labelPattern(titleKey))
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true");
  }

  selectMetric(titleKey, metricType) {
    const endpoint =
      metricType === "AVERAGE_TURN_AROUND_TIME"
        ? "turn-around-time-metrics"
        : metricType;
    cy.intercept("GET", `**/rest/home-dashboard/${endpoint}*`).as("homeMetric");
    cy.contains(".dashboard-metric-tile h3", labelPattern(titleKey))
      .closest("[role='button']")
      .scrollIntoView()
      .should("be.visible")
      .click();
    cy.wait("@homeMetric").its("response.statusCode").should("eq", 200);
    cy.contains(".dashboard-tile__title-view", labelPattern(titleKey)).should(
      "be.visible",
    );
    cy.get(this.selectors.minimizeIcon).should("be.visible");
    if (metricType === "AVERAGE_TURN_AROUND_TIME") {
      cy.get(
        ".dashboard-view .home-dashboard-container .dashboard-tile",
      ).should("have.length", 3);
    } else {
      cy.get(".dashboard-view table", { timeout: 30000 }).should("be.visible");
    }
  }

  selectInProgress() {
    // A-02: the old in-progress tile is the authorized pending test-task queue.
    cy.intercept("GET", "**/rest/results-entry/pending").as(
      "homePendingResults",
    );
    this.taskCard("dashboard.task.results.title").click();
    cy.location("pathname").should("eq", "/Results");
    cy.location("search").should("include", "scope=pending");
    cy.wait("@homePendingResults").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.testResult).to.be.an("array");
      const taskCount = new Set(
        response.body.testResult.map((row) => row.analysisId),
      ).size;
      cy.get("#results-title", { timeout: 30000 }).should("be.visible");
      cy.contains(
        ".results-workbench .cds--tag",
        new RegExp(
          `\\b${taskCount.toLocaleString("en")}\\s*(?:项检验任务|test tasks)`,
        ),
        { timeout: 30000 },
      ).should("be.visible");
    });
  }

  selectReadyforValidation() {
    cy.intercept("GET", "**/rest/AccessionValidation?scope=pending").as(
      "homePendingReview",
    );
    this.taskCard("dashboard.review.summary.title").click();
    cy.location("pathname").should("eq", "/validation");
    cy.location("search").should("eq", "?scope=pending");
    cy.wait("@homePendingReview").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.reviewScope).to.eq("pending");
      expect(response.body.summary.scope).to.eq("pending");
      expect(response.body.summary.state).to.eq("ready");
      expect(response.body.summary.analysisCount).to.be.a("number");
      expect(response.body.summary.accessionCount).to.be.a("number");
      cy.contains(
        "#validation-query-summary-title",
        labelPattern("validation.summary.pending"),
        { timeout: 30000 },
      ).should("be.visible");
      cy.contains(
        ".validation-query-summary__counts",
        new RegExp(
          `\\b${response.body.summary.analysisCount.toLocaleString("en")}\\s*(?:项检验任务|test tasks)`,
        ),
      ).should("be.visible");
      cy.contains(
        ".validation-query-summary__counts",
        new RegExp(
          `\\b${response.body.summary.accessionCount.toLocaleString("en")}\\s*(?:个受理号组|accession groups)`,
        ),
      ).should("be.visible");
    });
  }

  selectOrdersCompletedToday() {
    this.selectMetric(
      "dashboard.complete.orders.label",
      "ORDERS_COMPLETED_TODAY",
    );
  }

  selectPartiallyCompletedToday() {
    this.selectMetric(
      "dashboard.partially.completed.label",
      "ORDERS_PARTIALLY_COMPLETED_TODAY",
    );
  }

  selectOrdersEnteredByUsers() {
    this.selectMetric(
      "dashboard.user.orders.label",
      "ORDERS_ENTERED_BY_USER_TODAY",
    );
  }

  selectOrdersRejected() {
    this.selectMetric("dashboard.rejected.orders", "ORDERS_REJECTED_TODAY");
  }

  selectUnPrintedResults() {
    // E-01 preserves this navigation scenario. A-02's automatic unprinted
    // report filter is still a product gap; the current card opens Reports.
    this.taskCard("dashboard.task.reports.title").click();
    cy.location("pathname").should("eq", "/RoutineReports");
    cy.contains("h1", labelPattern("sidenav.label.reports.routine"), {
      timeout: 30000,
    }).should("be.visible");
  }

  selectElectronicOrders() {
    this.taskCard("dashboard.task.incoming.title").click();
    cy.location("pathname").should("eq", "/ElectronicOrders");
    cy.contains("h1, h2, h3", labelPattern("eorder.header"), {
      timeout: 30000,
    }).should("be.visible");
  }

  selectAverageTurnAroundTime() {
    this.selectMetric(
      "dashboard.avg.turn.around.label",
      "AVERAGE_TURN_AROUND_TIME",
    );
  }

  selectDelayedTurnAround() {
    this.selectMetric("dashboard.turn.around.label", "DELAYED_TURN_AROUND");
  }
}

export default HomePage;
