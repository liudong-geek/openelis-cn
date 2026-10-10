import {
  currentLabel,
  assertCurrentHeading,
  typeCurrentDate,
} from "./CurrentChinaLabels";

const ROUTINE_TASKS = {
  patient: "/RoutineReport?type=patient&report=patientCILNSP_vreduit",
  aggregate: "/RoutineReport?type=indicator&report=statisticsReport",
  referred: "/RoutineReport?type=patient&report=referredOut",
};
const AGGREGATES = {
  statisticsReport: "sidenav.label.statisticsreport",
  indicatorHaitiLNSPAllTests: "sidenav.label.testsummary",
  indicatorCDILNSPHIV: "sideNav.label.hivtestsummary",
  haitiNonConformityBySectionReason: "sideNav.label.noncomformityreportsbyunit",
};

class CurrentChinaReportsPage {
  openRoutineTask(task) {
    const path = ROUTINE_TASKS[task];
    expect(path, "current report task").to.be.a("string");
    cy.get(".cds--side-nav").then(($nav) => {
      if (!$nav.hasClass("cds--side-nav--expanded")) {
        cy.get("[data-cy=menuButton]").should("be.visible").click();
      }
    });
    const toggle =
      "#menu_review_report_workspace button.cds--side-nav__submenu";
    cy.get(toggle)
      .first()
      .scrollIntoView()
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") cy.wrap($button).click();
      });
    cy.get(toggle).first().should("have.attr", "aria-expanded", "true");
    cy.get(`#menu_review_report_workspace a[href='${path}']`)
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should("eq", "/RoutineReport");
    cy.location("search").should("eq", path.slice(path.indexOf("?")));
    return this;
  }

  selectAggregate(report, type = "indicator") {
    this.openRoutineTask("aggregate");
    cy.get("#aggregate-report-type").should("be.visible").click();
    cy.contains("[role=option]", currentLabel(AGGREGATES[report]))
      .should("be.visible")
      .click();
    cy.location("search").should("eq", `?type=${type}&report=${report}`);
  }

  openStudyCatalog() {
    // The China menu hides this legacy catalogue; its Reports-protected route remains real.
    cy.visit("/StudyReports");
    cy.location("pathname").should("eq", "/StudyReports");
    cy.get(".oe-report-catalog").should("be.visible");
    return this;
  }

  selectStudyReport(report) {
    this.openStudyCatalog();
    const path = `/StudyReport?type=patient&report=${report}`;
    cy.get(`.oe-report-catalog a[href='${path}']`)
      .should("have.length", 1)
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should("eq", "/StudyReport");
    cy.location("search").should("eq", `?type=patient&report=${report}`);
  }

  assertPatientModes(headingKey) {
    assertCurrentHeading(headingKey);
    cy.get("label[for=report-filter-patient]").should("be.visible").click();
    cy.get("#report-filter-patient").should("be.checked");
    cy.get(".cds--accordion__heading").should("have.length", 1).click();
    cy.get("#patientId").should("be.visible");
    cy.get("#local_search").should("be.visible");
    cy.get("label[for=report-filter-lab-number]").should("be.visible").click();
    cy.get("#report-filter-lab-number").should("be.checked");
    cy.get(".cds--accordion__heading").should("have.length", 1).click();
    cy.get("#from").should("be.visible");
    cy.get("#to").should("be.visible");
    cy.get("label[for=report-filter-site-date]").should("be.visible").click();
    cy.get("#report-filter-site-date").should("be.checked");
    cy.get(".cds--accordion__heading").should("have.length", 1).click();
    cy.get("#siteName").should("be.visible");
    cy.get("#requesterDepartmentId").should("be.visible");
    cy.get("[data-cy=dateTypeDropdown]").should("be.visible");
    cy.get("#startDate").should("be.visible");
    cy.get("#endDate").should("be.visible");
    cy.get("[data-cy=printableVersion]").should("be.visible");
  }

  statisticsForm() {
    this.selectAggregate("statisticsReport");
    assertCurrentHeading("openreports.stat.aggregate");
    cy.get(".statistics-report__group").should("have.length", 3);
    cy.get("#select-all-lab-units").should("be.checked");
    cy.get("input[id^=statistics-lab-unit-]").should(($inputs) =>
      expect($inputs.length).to.be.above(1),
    );
    cy.get("#year-picker").should("be.visible");
  }

  assertStatisticsAllTracksIndividual() {
    const individual = "input[id^=statistics-lab-unit-]";
    cy.get(individual)
      .first()
      .invoke("attr", "id")
      .then((id) => {
        cy.get(`label[for='${id}']`).should("be.visible").click();
        cy.get(`#${id}`).should("not.be.checked");
        cy.get("#select-all-lab-units").should("not.be.checked");
        cy.get("label[for=select-all-lab-units]").should("be.visible").click();
        cy.get("#select-all-lab-units").should("be.checked");
        cy.get(individual).each(($input) =>
          cy.wrap($input).should("be.checked"),
        );
      });
  }

  assertStatisticsPriorityAll() {
    const individual = "input[id^=statistics-priority-]";
    cy.get(individual).should(($inputs) =>
      expect($inputs.length).to.be.above(1),
    );
    cy.get("label[for=select-all-priorities]").should("be.visible").click();
    cy.get("#select-all-priorities").should("not.be.checked");
    cy.get(individual).each(($input) =>
      cy.wrap($input).should("not.be.checked"),
    );
    cy.get("label[for=select-all-priorities]").should("be.visible").click();
    cy.get("#select-all-priorities").should("be.checked");
    cy.get(individual).each(($input) => cy.wrap($input).should("be.checked"));
  }

  assertStatisticsPreviewBeforePrint() {
    cy.get("[data-cy=printableVersion]")
      .should("be.visible")
      .and("be.disabled");
    cy.intercept("GET", "**/rest/reports/statistics/workload?*").as(
      "actualStatisticsPreview",
    );
    cy.get("[data-cy=statisticsPreview]")
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@actualStatisticsPreview").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.headers["content-type"]).to.match(/application\/json/i);
      expect(response.body.rows).to.be.an("array");
      expect(response.body.totals).to.have.property("tests");
      expect(response.body.totals).to.have.property("samples");
      expect(response.body.totals.tests).to.be.a("number").and.at.least(0);
      expect(response.body.totals.samples).to.be.a("number").and.at.least(0);
      if (response.body.rows.length) {
        cy.get(".statistics-report__table-wrap tbody tr").should(
          "have.length",
          response.body.rows.length,
        );
        response.body.rows.forEach((row) =>
          cy
            .contains(
              ".statistics-report__table-wrap th[scope=row]",
              row.testName,
            )
            .should("be.visible"),
        );
      } else {
        cy.get(".statistics-report__empty").should("be.visible");
      }
    });
    cy.get("[data-cy=printableVersion]").should("be.visible").and("be.enabled");
  }

  assertDateRange(headingKey) {
    assertCurrentHeading(headingKey);
    cy.get("#startDate").should("be.visible").clear().blur();
    cy.get("body").type("{esc}");
    cy.get("#endDate").should("be.visible").clear().blur();
    cy.get("body").type("{esc}");
    cy.get("[data-cy=printableVersion]").should("be.disabled");
    typeCurrentDate("#startDate", "2023-02-01");
    cy.get("[data-cy=printableVersion]").should("be.disabled");
    typeCurrentDate("#endDate", "2023-02-02");
    cy.get("[data-cy=printableVersion]").should("be.visible").and("be.enabled");
  }

  assertLabNumberRequired(headingKey) {
    assertCurrentHeading(headingKey);
    cy.get("#from").should("be.visible").and("have.value", "");
    cy.get("#to").should("be.visible").and("have.value", "");
    cy.window().then((win) => cy.stub(win, "open").as("blankLabReportWindow"));
    cy.get("[data-cy=printableVersion]")
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.contains(
      ".cds--form-requirement",
      currentLabel("reports.query.validation.labNumber"),
    ).should("be.visible");
    cy.get("@blankLabReportWindow").should("not.have.been.called");
  }

  assertRestrictedReport(report, type) {
    // Canonical renderer enforces the existing security-review restriction.
    // Alternate legacy renderers must not be used to restore retired printing.
    cy.visit(`/Report?type=${type}&report=${report}`);
    cy.location("pathname").should("eq", "/Report");
    cy.location("search").should("eq", `?type=${type}&report=${report}`);
    cy.window().then((win) =>
      cy.stub(win, "open").as("restrictedReportWindow"),
    );
    assertCurrentHeading("reports.securityReview.title");
    cy.contains(
      ".cds--inline-notification__subtitle",
      currentLabel("reports.securityReview.description"),
    ).should("be.visible");
    cy.get(".orderLegendBody form").should("not.exist");
    cy.get("[data-cy=printableVersion], [data-cy=statisticsPreview]").should(
      "not.exist",
    );
    cy.get("@restrictedReportWindow").should("not.have.been.called");
  }

  assertReferredReport() {
    this.openRoutineTask("referred");
    assertCurrentHeading("externalReferredOutTests.title");
    typeCurrentDate("#startDate", "2023-02-01");
    typeCurrentDate("#endDate", "2023-02-02");
    cy.get("[data-cy=printableVersion]").should("be.visible");
  }

  assertIntermediateService() {
    this.selectStudyReport("patientIndeterminateByLocation");
    assertCurrentHeading("project.IndeterminateStudy.name");
    cy.get("#siteName").should("be.visible").type("CAME");
    cy.contains(".suggestion-active", "CAMES MAN").should("be.visible").click();
    typeCurrentDate("#startDate", "2023-02-01");
    typeCurrentDate("#endDate", "2023-02-02");
    cy.get("[data-cy=printableVersion]").should("be.visible").and("be.enabled");
  }

  assertOrderAudit() {
    // The old Study catalogue linked to an empty Routine renderer; use the
    // actual GlobalAdmin/AuditTrail-protected order audit route.
    cy.visit("/AuditTrailReport?type=order");
    cy.location("pathname").should("eq", "/AuditTrailReport");
    cy.location("search").should("eq", "?type=order");
    assertCurrentHeading("reports.auditTrail");
    cy.get("#labNo").should("be.visible");
  }
}

export default CurrentChinaReportsPage;
