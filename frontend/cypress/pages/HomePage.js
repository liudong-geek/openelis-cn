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
import CurrentChinaReportsPage from "./CurrentChinaReportsPage";
import CurrentSpecialtyDashboard from "./CurrentSpecialtyDashboard";
import CurrentChinaHelpPage from "./CurrentChinaHelpPage";
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
      managementWorkspace: "#menu_configuration_workspace",
      managementEntry:
        "#menu_configuration_workspace a[href='/MasterListsPage/DictionaryMenu']",
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
    cy.location("pathname").should("eq", "/MasterListsPage/DictionaryMenu");
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
    const intakeToggle = `${this.selectors.intakeWorkspace} button.cds--side-nav__submenu`;
    cy.get(intakeToggle)
      .first()
      .scrollIntoView()
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") cy.wrap($button).click();
      });
    cy.get(intakeToggle).first().should("have.attr", "aria-expanded", "true");
    cy.get("#menu_sample_batch_entry_nav")
      .scrollIntoView()
      .should("be.visible")
      .and("have.attr", "href", "/SampleBatchEntrySetup")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should("eq", "/SampleBatchEntrySetup");
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
    this.goToPatientEntry();
    cy.get(".oe-page-header__actions button.cds--overflow-menu")
      .should("have.length", 1)
      .and("be.visible")
      .and("be.enabled")
      .should(($button) => {
        expect($button.attr("aria-haspopup")).to.eq("true");
        const icons = $button.find("svg[aria-label]");
        expect(icons).to.have.length(1);
        expect(icons.attr("aria-label")).to.match(
          labelPattern("patient.management.moreActions"),
        );
      })
      .click();
    cy.contains(
      ".patient-management-actions__options button",
      labelPattern("banner.menu.patient.merge"),
    )
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.location("pathname").should("eq", "/PatientMerge");
    cy.get(".patientMergeProgress").should("be.visible");
    cy.get("#patient1-patientId").should("be.visible");
    cy.get("#patient2-patientId").should("be.visible");
    return new PatientMergePage();
  }

  // Modify Order related functions
  goToModifyOrderPage() {
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
    return new ModifyOrderPage();
  }

  // Work Plan related functions
  goToWorkPlanPlanByTest() {
    return this.openWorkplanCategory("test");
  }

  goToWorkPlanPlanByPanel() {
    return this.openWorkplanCategory("panel");
  }

  goToWorkPlanPlanByUnit() {
    return this.openWorkplanCategory("unit");
  }

  goToWorkPlanPlanByPriority() {
    return this.openWorkplanCategory("priority");
  }

  // Non-Conforming related functions
  goToReportNCE() {
    this.openWorkspaceTask(
      "#menu_quality_workspace",
      /^\/NceDashboard(?:\?|$)/,
    );
    cy.contains(
      ".nce-dashboard-header button",
      labelPattern("nce.button.reportNce"),
    )
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get(".nce-registration-modal.is-visible").should("be.visible");
    return new NonConform("report");
  }

  goToViewNCE() {
    // Protected historical review bookmark, not a current sidebar task.
    this.openWorkspaceTask(
      "#menu_quality_workspace",
      /^\/NceDashboard(?:\?|$)/,
    );
    cy.visit("/ViewNonConformingEvent");
    cy.location("pathname").should("eq", "/ViewNonConformingEvent");
    return new NonConform("view");
  }

  goToCorrectiveActions() {
    // Protected historical CAPA bookmark retains the existing clinical flow.
    this.openWorkspaceTask(
      "#menu_quality_workspace",
      /^\/NceDashboard(?:\?|$)/,
    );
    cy.visit("/NCECorrectiveAction");
    cy.location("pathname").should("eq", "/NCECorrectiveAction");
    return new NonConform("capa");
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
    return this.openReviewCategory("routine");
  }

  goToValidationByOrder() {
    return this.openReviewCategory("order");
  }

  goToValidationByRangeOrder() {
    return this.openReviewCategory("range");
  }

  // Reports related functions
  goToRoutineReports() {
    const reportPage = new CurrentChinaReportsPage();
    reportPage.openRoutineTask("patient");
    this.closeNavigationMenu();
    return reportPage;
  }

  goToStudyReports() {
    const reportPage = new CurrentChinaReportsPage();
    reportPage.openStudyCatalog();
    return reportPage;
  }

  goToReports() {
    return this.goToRoutineReports();
  }

  // Dashboard related functions
  goToPathologyDashboard() {
    // Optional specialty menus are hidden in China; this protected route
    // still verifies the user's real business role and laboratory scope.
    return new CurrentSpecialtyDashboard("pathology").visit();
  }

  goToImmunoChemistryDashboard() {
    // Optional specialty menus are hidden in China; this protected route
    // still verifies the user's real business role and laboratory scope.
    return new CurrentSpecialtyDashboard("immunohistochemistry").visit();
  }

  goToCytologyDashboard() {
    // Optional specialty menus are hidden in China; this protected route
    // still verifies the user's real business role and laboratory scope.
    return new CurrentSpecialtyDashboard("cytology").visit();
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
    cy.get(this.selectors.userHelp).should("be.visible").click();
    cy.get(".cds--header-panel--expanded").should("be.visible");
    return new CurrentChinaHelpPage();
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
      pathname: "/api/OpenELIS-Global/rest/patient-search-results",
      query: { quickQuery: "Smith", suppressExternalSearch: "true" },
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
    cy.location("pathname").should("eq", "/RoutineReport");
    cy.location("search").should(
      "eq",
      "?type=patient&report=patientCILNSP_vreduit",
    );
    cy.contains("h3", labelPattern("openreports.patientTestStatus"), {
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

  openWorkspaceTask(workspaceId, hrefPattern) {
    this.openNavigationMenu();
    const toggle = `${workspaceId} button.cds--side-nav__submenu`;
    cy.get(toggle)
      .first()
      .scrollIntoView()
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") cy.wrap($button).click();
      });
    cy.get(toggle).first().should("have.attr", "aria-expanded", "true");
    cy.get(`${workspaceId} a`)
      .filter((_, element) =>
        hrefPattern.test(element.getAttribute("href") || ""),
      )
      .should("have.length", 1)
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    this.closeNavigationMenu();
  }

  openWorkplanCategory(type) {
    const modes = {
      test: ["WorkPlanByTest", "banner.menu.workplan.test"],
      panel: ["WorkPlanByPanel", "banner.menu.workplan.panel"],
      unit: ["WorkPlanByTestSection", "banner.menu.workplan.bench"],
      priority: ["WorkPlanByPriority", "banner.menu.workplan.priority"],
    };
    const optionPaths = {
      test: "/rest/displayList/ALL_TESTS",
      panel: "/rest/displayList/PANELS",
      unit: "/rest/user-test-sections/Results",
      priority: "/rest/displayList/ORDER_PRIORITY",
    };
    cy.intercept("GET", `**${optionPaths[type]}`).as("workplanOptions");
    this.openWorkspaceTask(
      "#menu_testing_workspace",
      /^\/WorkPlanByTest(?:\?|$)/,
    );
    cy.get("#workplan-query-category").should("be.visible");
    if (type !== "test") {
      cy.get("#workplan-query-category").click();
      cy.contains("[role='option']", labelPattern(modes[type][1]))
        .scrollIntoView()
        .should("be.visible")
        .click();
    }
    cy.location("pathname").should("eq", `/${modes[type][0]}`);
    cy.location("search").should("include", `type=${type}`);
    cy.wait("@workplanOptions").then(({ response }) => {
      expect(response.statusCode, "workplan options loaded").to.eq(200);
      expect(response.headers["content-type"]).to.include("application/json");
      expect(response.body).to.be.an("array").and.not.be.empty;
    });
    return new WorkPlan();
  }

  openReviewCategory(type) {
    const labels = { routine: "section", order: "order", range: "range" };
    this.openWorkspaceTask(
      "#menu_review_report_workspace",
      /^\/(validation|ResultValidation)(?:\?|$)/,
    );
    cy.get("#validation-page-title").should("be.visible");
    cy.contains(
      ".validation-search-modes button",
      labelPattern(`validation.search.mode.${labels[type]}`),
    )
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.location("pathname").should("eq", "/validation");
    cy.location("search").should("include", `type=${type}`);
    return new Validation();
  }

  goToCompatibilityOrderEntry() {
    this.expectOverview();
    cy.visit("/SamplePatientEntry");
    cy.location("pathname").should("eq", "/SamplePatientEntry");
    cy.get("#local_search").should("be.visible");
    return new OrderEntityPage();
  }
}

export default HomePage;
