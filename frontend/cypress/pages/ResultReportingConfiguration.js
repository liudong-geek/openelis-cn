import {
  adminLabel,
  adminJsonRead,
  setCarbonToggle,
} from "./CurrentAdminLabels";
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
class ResultReportingConfigurationPage {
  validatePageTitle() {
    cy.contains(
      ".oe-page-header h1",
      adminLabel("resultreporting.browse.title"),
    ).should("be.visible");
    cy.get("#report-configuration-section").should("have.value", "channels");
    adminJsonRead("/rest/ResultReportingConfiguration").then((r) => {
      expect(r.reports.length).to.be.at.least(3);
      this.baseline = r;
      this.expected = structuredClone(r);
      r.reports.forEach((v) => {
        expect(v.enabledId).to.match(/^[1-9]\d*$/);
        expect(v.urlId).to.match(/^[1-9]\d*$/);
      });
    });
  }
  clickEnable(index) {
    cy.then(() => {
      const channel = this.expected.reports[Number(index)];
      channel.enabled = "enable";
      setCarbonToggle(`report-channel-${index}-enabled`, true);
    });
  }
  typeURL(index) {
    const url = "https://192.168.92.101/openelis";
    cy.then(() => {
      this.expected.reports[Number(index)].url = url;
    });
    cy.get(`#url-${index}`)
      .should("be.visible")
      .and("be.enabled")
      .clear()
      .type(url);
  }
  saveEntry() {
    cy.intercept("POST", "**/rest/ResultReportingConfiguration").as(
      "actualReportingConfigurationWrite",
    );
    cy.get(".result-reporting-workspace__actions [data-cy='saveButton']")
      .should("be.enabled")
      .click();
    cy.wait("@actualReportingConfigurationWrite").then(
      ({ request, response }) => {
        expect(response.statusCode).to.eq(200);
        expect(
          parse(request.body),
          "exact edited form; scheduler/auth fields preserved",
        ).to.deep.eq(this.expected);
        adminJsonRead("/rest/ResultReportingConfiguration").then((actual) => {
          expect(actual.reports).to.have.length(this.expected.reports.length);
          for (const target of this.expected.reports) {
            const matches = actual.reports.filter(
              (r) =>
                r.enabledId === target.enabledId && r.urlId === target.urlId,
            );
            expect(matches).to.have.length(1);
            [
              "enabled",
              "url",
              "isScheduled",
              "schedulerId",
              "scheduleHours",
              "scheduleMin",
              "showAuthentication",
              "showBacklog",
              "backlogSize",
            ].forEach((key) =>
              expect(
                matches[0][key],
                `independent stored channel ${key}`,
              ).to.deep.eq(target[key]),
            );
          }
          expect(actual.hourList).to.deep.eq(this.baseline.hourList);
          expect(actual.minList).to.deep.eq(this.baseline.minList);
        });
      },
    );
    cy.get(
      ".result-reporting-workspace__actions [data-cy='saveButton']",
    ).should("be.disabled");
  }
}
export default ResultReportingConfigurationPage;
