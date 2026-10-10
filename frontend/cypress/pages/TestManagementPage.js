import config from "../../src/config.json";
import { body, label } from "./AdminUiContract";

class TestManagementPage {
  validatePageTitle() {
    cy.get(".testCatalogList h2")
      .first()
      .should("be.visible")
      .invoke("text")
      .should("match", label("label.testCatalog.list"));
    cy.get("#test-search").should("be.visible").and("not.be.disabled");
  }

  createAndReadBack(sampleName) {
    const unique = Date.now();
    this.name = `E2E catalog ${unique}`;
    this.code = `E2E-CATALOG-${unique}`;
    cy.intercept("GET", "**/rest/test-catalog/sample-types").as(
      "catalogCreateSamples",
    );
    cy.intercept("GET", "**/rest/test-catalog/lab-units").as(
      "catalogCreateUnits",
    );
    cy.get("[data-testid='new-test-button']")
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.wait("@catalogCreateSamples").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      const matches = body(response.body).filter(
        (row) => row.name === sampleName,
      );
      expect(
        matches,
        "original Serum reference, unchanged fixture",
      ).to.have.length(1);
      this.sampleId = String(matches[0].id);
    });
    cy.wait("@catalogCreateUnits").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(body(response.body)).to.be.an("array");
    });
    cy.get(".test-catalog-create-modal.is-visible")
      .should("have.length", 1)
      .within(() => {
        cy.get("#basic-info-name").should("be.visible").type(this.name);
        cy.get("#basic-info-reporting-name").type(this.name);
        cy.get("#basic-info-code").clear().type(this.code);
        cy.get("#basic-info-sample-types-input").should("be.visible").click();
        cy.contains(
          "[role='option']",
          new RegExp(`^${Cypress._.escapeRegExp(sampleName)}$`),
        )
          .should("be.visible")
          .click();
        cy.get("#basic-info-create-amr").should("not.be.checked");
        cy.get("#basic-info-create-orderable").should("not.be.checked");
        cy.get("#create-domain-CLINICAL").should("be.checked");
      });
    // Close the real list box before the save button; retain the chosen sample.
    cy.get(".test-catalog-create-modal.is-visible #basic-info-name").click();
    cy.intercept("POST", "**/rest/test-catalog/tests").as("catalogCreateWrite");
    cy.intercept("GET", "**/rest/test-catalog/tests?*").as(
      "catalogAfterCreate",
    );
    cy.get(".test-catalog-create-modal.is-visible .cds--modal-footer").within(
      () => {
        cy.contains("button", label("label.button.save"))
          .should("be.visible")
          .and("not.be.disabled")
          .click();
      },
    );
    cy.wait("@catalogCreateWrite").then(({ request, response }) => {
      expect(response.statusCode).to.eq(201);
      const payload = body(request.body);
      expect(payload).to.deep.eq({
        name: this.name,
        reportingName: this.name,
        code: this.code,
        labUnitId: "",
        sampleTypeIds: [this.sampleId],
        domain: "CLINICAL",
        amr: false,
        orderable: false,
        description: "",
      });
      this.id = String(body(response.body).testId);
      expect(this.id).to.match(/^[1-9]\d*$/);
      cy.request(
        `${config.serverBaseUrl}/rest/test-catalog/tests/${this.id}/basic-info`,
      ).then((read) => {
        expect(read.status).to.eq(200);
        expect(String(read.body.testId)).to.eq(this.id);
        expect(read.body.name).to.eq(this.name);
        expect(read.body.code).to.eq(this.code);
        expect(read.body.sampleTypeIds.map(String)).to.deep.eq([this.sampleId]);
        expect(read.body.domain).to.eq("CLINICAL");
        expect(read.body.active).to.eq(false);
        expect(read.body.orderable).to.eq(false);
        expect(read.body.antimicrobialResistance).to.eq(false);
      });
    });
    cy.get(".test-catalog-create-modal.is-visible").should("not.exist");
    cy.wait("@catalogAfterCreate").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(body(response.body).rows).to.be.an("array");
    });
  }

  applyAndKeepListState() {
    cy.intercept(
      { method: "GET", pathname: "**/rest/test-catalog/tests" },
      (request) => {
        const params = new URL(request.url).searchParams;
        if (
          params.get("search") === this.name &&
          params.get("status") === "inactive" &&
          params.get("pageSize") === "10"
        ) {
          request.alias = "catalogCurrentFilteredPage";
        }
      },
    );
    cy.get("#test-search")
      .clear()
      .type(this.name)
      .should("have.value", this.name);
    cy.get(".testCatalogList__filterTrigger").should("be.visible").click();
    cy.get("#filter-status").find("button").should("be.visible").click();
    cy.contains(
      "#filter-status [role='option']",
      label("label.testCatalog.list.filter.inactive"),
    )
      .should("be.visible")
      .click();
    cy.get(".testCatalogList__pagination .cds--pagination__left select")
      .should("be.visible")
      .select("10");
    cy.wait("@catalogCurrentFilteredPage").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      const params = new URL(request.url).searchParams;
      expect(params.get("search")).to.eq(this.name);
      expect(params.get("status")).to.eq("inactive");
      expect(params.get("page")).to.eq("1");
      expect(params.get("pageSize")).to.eq("10");
      const rows = body(response.body).rows;
      expect(rows).to.have.length(1);
      expect(String(rows[0].testId)).to.eq(this.id);
      expect(rows[0].active).to.eq(false);
    });
    cy.contains(".testCatalogList tbody tr", this.name)
      .should("have.length", 1)
      .and("be.visible");
    cy.location().then(({ pathname, search }) => {
      expect(pathname).to.eq("/MasterListsPage/TestCatalogList");
      this.returnTo = pathname + search;
      const params = new URLSearchParams(search);
      expect(params.get("search")).to.eq(this.name);
      expect(params.get("status")).to.eq("inactive");
      expect(params.get("page")).to.eq("1");
      expect(params.get("pageSize")).to.eq("10");
    });
  }

  linkedEditorAndReturn() {
    cy.intercept("GET", `**/rest/test-catalog/tests/${this.id}`).as(
      "catalogEditorEnvelope",
    );
    cy.intercept("GET", `**/rest/test-catalog/tests/${this.id}/basic-info`).as(
      "catalogEditorBasic",
    );
    cy.contains(".testCatalogList tbody tr", this.name)
      .should("have.length", 1)
      .within(() => {
        cy.contains("button", label("common.action.relatedConfiguration"))
          .should("be.visible")
          .and("not.be.disabled")
          .click();
      });
    cy.location("pathname").should(
      "eq",
      `/MasterListsPage/TestCatalogEditor/${this.id}/basic-info`,
    );
    cy.location("search").then((search) =>
      expect(new URLSearchParams(search).get("returnTo")).to.eq(this.returnTo),
    );
    cy.wait("@catalogEditorEnvelope").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(body(response.body).name).to.eq(this.name);
    });
    cy.wait("@catalogEditorBasic").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(body(response.body).code).to.eq(this.code);
    });
    cy.get("#basic-info-name").should("have.value", this.name);
    cy.get("#basic-info-code").should("have.value", this.code);
    cy.intercept("GET", "**/rest/test-catalog/tests?*").as(
      "catalogReturnedPage",
    );
    cy.get(`.cds--breadcrumb a[href="${this.returnTo}"]`)
      .should("have.length", 1)
      .should("be.visible")
      .click();
    cy.wait("@catalogReturnedPage").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(new URL(request.url).searchParams.get("search")).to.eq(this.name);
      expect(
        body(response.body).rows.map((row) => String(row.testId)),
      ).to.deep.eq([this.id]);
    });
    cy.location().then(({ pathname, search }) =>
      expect(pathname + search).to.eq(this.returnTo),
    );
    cy.get("#test-search").should("have.value", this.name);
    cy.get(".testCatalogList__pagination .cds--pagination__left select").should(
      "have.value",
      "10",
    );
    cy.contains(".testCatalogList tbody tr", this.name).should("be.visible");
  }
}

export default TestManagementPage;
