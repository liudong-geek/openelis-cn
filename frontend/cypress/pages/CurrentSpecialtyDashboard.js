import config from "../../src/config.json";
import { currentLabel, assertCurrentHeading } from "./CurrentChinaLabels";

const DEFINITIONS = {
  pathology: {
    path: "/PathologyDashboard",
    casePath: "/PathologyCaseView",
    api: "pathology",
    sampleKey: "pathologySampleId",
    heading: "pathology.label.title",
    unit: "Pathology",
    specialistRole: "Pathologist",
    specialistAction: "assignPathologist",
    ready: "READY_PATHOLOGIST",
    program: "Histopathology",
    specimenKey: "sample.type.histopathology",
    orderable: "Histopathology examination",
    orderableKind: "panel",
  },
  immunohistochemistry: {
    path: "/ImmunohistochemistryDashboard",
    casePath: "/ImmunohistochemistryCaseView",
    api: "immunohistochemistry",
    sampleKey: "immunohistochemistrySampleId",
    heading: "immunohistochemistry.label.title",
    unit: "Immunohistochemistry",
    specialistRole: "Pathologist",
    specialistAction: "assignPathologist",
    ready: "READY_PATHOLOGIST",
    program: "Immunohistochemistry",
    specimenKey: "sample.type.immunohistochemistry",
    orderable: "Anti-CD7",
    orderableKind: "test",
  },
  cytology: {
    path: "/CytologyDashboard",
    casePath: "/CytologyCaseView",
    api: "cytology",
    sampleKey: "cytologySampleId",
    heading: "cytology.label.title",
    unit: "Cytology",
    specialistRole: "Cytopathologist",
    specialistAction: "assignCytoPathologist",
    ready: "READY_FOR_CYTOPATHOLOGIST",
    program: "Cytology",
    specimenKey: "sample.type.fluid",
    orderable: "COVID-19 PCR",
    orderableKind: "panel",
  },
};
const STATES = {};
const jsonRead = (path, qs) =>
  cy
    .request({
      url: `${config.serverBaseUrl}${path}`,
      qs,
      followRedirect: false,
      headers: { Accept: "application/json" },
    })
    .then((response) => {
      expect(response.status, "protected real read status").to.eq(200);
      expect(
        response.headers["content-type"],
        "JSON rather than a SPA fallback",
      ).to.match(/application\/json/i);
      return response.body;
    });
const bodyObject = (body) =>
  typeof body === "string" ? JSON.parse(body) : body;
const csv = (value) =>
  String(value || "")
    .split(",")
    .filter(Boolean);

class CurrentSpecialtyDashboard {
  constructor(kind) {
    expect(DEFINITIONS[kind], "known protected specialty workflow").to.be.an(
      "object",
    );
    this.definition = DEFINITIONS[kind];
    this.state = STATES[kind] || (STATES[kind] = {});
  }

  visit() {
    const d = this.definition;
    jsonRead("/session").then((session) => {
      expect(session.authenticated).to.eq(true);
      expect(String(session.userId)).to.match(/^[1-9]\d*$/);
      // Current case workflow needs actual technician and specialist authority.
      // GlobalAdmin alone does not grant these product permissions.
      expect(
        session.roles,
        "technician and specialty release roles",
      ).to.include.members(["Results", d.specialistRole]);
      const labRoles =
        session.userLabRolesMap?.AllLabUnits ||
        session.userLabRolesMap?.[d.unit] ||
        [];
      expect(labRoles, `real ${d.unit} result scope`).to.include("Results");
      this.state.userId = String(session.userId);
    });
    cy.intercept("GET", `**/rest/${d.api}/dashboard?*`).as(
      "actualSpecialtyDashboard",
    );
    cy.visit(d.path);
    cy.location("pathname").should("eq", d.path);
    assertCurrentHeading(d.heading);
    cy.wait("@actualSpecialtyDashboard")
      .its("response.statusCode")
      .should("eq", 200);
    cy.get("#statusFilter").should("be.visible");
    if (this.state.labNumber && !this.state.completed) this.findExactOrder();
    return this;
  }

  findExactOrder() {
    const d = this.definition;
    const labNumber = this.state.labNumber;
    expect(labNumber, "the order created by this original scenario").to.be.a(
      "string",
    ).and.not.be.empty;
    cy.intercept({
      method: "GET",
      pathname: `**/rest/${d.api}/dashboard`,
      query: { searchTerm: labNumber },
    }).as("exactCreatedSpecialtyOrder");
    cy.get(".gridBoundary input.cds--search-input")
      .should("be.visible")
      .clear()
      .type(labNumber);
    cy.wait("@exactCreatedSpecialtyOrder").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.headers["content-type"]).to.match(/application\/json/i);
      expect(response.body).to.be.an("array");
      const matches = response.body.filter(
        (entry) => entry.labNumber === labNumber,
      );
      expect(matches, "one actual newly saved specialty case").to.have.length(
        1,
      );
      const id = String(matches[0][d.sampleKey]);
      expect(id).to.match(/^[1-9]\d*$/);
      if (this.state.caseId) expect(id).to.eq(this.state.caseId);
      this.state.caseId = id;
      this.state.dashboardStatus = matches[0].status;
    });
    this.row().should("have.length", 1).and("be.visible");
  }

  row() {
    const exact = new RegExp(
      `^${Cypress._.escapeRegExp(this.state.labNumber)}$`,
    );
    return cy.contains(".gridBoundary table tbody td", exact).parents("tr");
  }

  addOriginalOrder(homePage) {
    const d = this.definition;
    // Explicit legacy Reception-protected bookmark; shared method belongs to
    // the separately reviewed Order8 candidate, not a restored China menu.
    homePage.visit();
    homePage.expectOverview();
    homePage.goToCompatibilityOrderEntry();
    cy.intercept({
      method: "GET",
      pathname: "**/rest/patient-search-results",
      query: { firstName: "John" },
    }).as("actualSpecialtyPatientSearch");
    cy.get("#firstName").should("be.visible").type("John");
    cy.get("#local_search").should("be.visible").click();
    cy.wait("@actualSpecialtyPatientSearch").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.patientSearchResults).to.be.an("array").and.not.be
        .empty;
      const patient = response.body.patientSearchResults.find(
        (entry) =>
          entry.firstName === "John" && entry.dataSourceName === "OpenElis",
      );
      expect(patient, "unchanged local John patient fixture").to.be.an(
        "object",
      );
      this.state.patientId = String(patient.patientID);
      cy.get(
        `[data-cy='patient-result-row-${patient.patientID}'] label[for='${patient.patientID}']`,
      )
        .should("be.visible")
        .click();
    });
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    cy.get("#additionalQuestionsSelect option").then(($options) => {
      const labels = currentLabel(d.heading);
      const literal = [...$options].filter(
        (option) => option.text.trim() === d.program,
      );
      const matching = literal.length
        ? literal
        : [...$options].filter((option) => labels.test(option.text.trim()));
      expect(matching, "same specialty program").to.have.length(1);
      this.state.programId = matching[0].value;
      cy.get("#additionalQuestionsSelect")
        .select(matching[0].value)
        .should("have.value", matching[0].value);
    });
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    cy.get("#sampleId_0 option").then(($options) => {
      const matching = [...$options].filter((option) =>
        currentLabel(d.specimenKey).test(option.text.trim()),
      );
      expect(matching, "same physical specimen type").to.have.length(1);
      this.state.sampleTypeId = matching[0].value;
      cy.get("#sampleId_0")
        .select(matching[0].value)
        .should("have.value", matching[0].value);
    });
    cy.contains("label.cds--checkbox-label", d.orderable)
      .should("be.visible")
      .then(($label) => {
        const id = $label.attr("for");
        expect(id).to.match(new RegExp(`^${d.orderableKind}_0_[1-9]\\d*$`));
        this.state.orderableId = id.slice(`${d.orderableKind}_0_`.length);
        cy.wrap($label).click();
        cy.get(`#${id}`).should("be.checked");
      });
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    cy.get("[data-cy=generate-labNumber]").should("be.visible").click();
    cy.get("#labNo")
      .should("not.have.value", "")
      .invoke("val")
      .then((value) => {
        this.state.labNumber = String(value);
      });
    cy.get("#siteName").should("be.visible").type("CAMES MAN");
    cy.contains(".suggestion-active", "CAMES MAN").should("be.visible").click();
    cy.get("#requesterId").should("be.visible").type("Optimus");
    cy.contains(".suggestion-active", "Optimus").should("be.visible").click();
    cy.intercept("POST", "**/rest/SamplePatientEntry").as(
      "actualSavedSpecialtyOrder",
    );
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    cy.wait("@actualSavedSpecialtyOrder").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.headers["content-type"]).to.match(/application\/json/i);
      const sent = bodyObject(request.body);
      expect(response.body.error).to.be.undefined;
      expect(response.body.sampleOrderItems.labNo).to.eq(this.state.labNumber);
      expect(String(sent.patientProperties.patientPK)).to.eq(
        this.state.patientId,
      );
      expect(sent.sampleOrderItems.programId).to.eq(this.state.programId);
      const xml = new DOMParser().parseFromString(
        sent.sampleXML,
        "application/xml",
      );
      expect(xml.querySelector("parsererror")).to.eq(null);
      const samples = [...xml.querySelectorAll("samples > sample")];
      expect(samples).to.have.length(1);
      expect(samples[0].getAttribute("sampleID")).to.eq(
        this.state.sampleTypeId,
      );
      expect(
        csv(
          samples[0].getAttribute(
            d.orderableKind === "panel" ? "panels" : "tests",
          ),
        ),
      ).to.include(this.state.orderableId);
      return jsonRead("/rest/order/saved", {
        queryVersion: "2",
        labNumber: this.state.labNumber,
      }).then((saved) => {
        expect(saved.queryVersion).to.eq("2");
        expect(saved.labNumber).to.eq(this.state.labNumber);
        expect(String(saved.patient.patientId)).to.eq(this.state.patientId);
        expect(saved.samples).to.have.length(1);
        expect(saved.samples[0].sampleTypeId).to.eq(this.state.sampleTypeId);
        const analyses = saved.samples[0].analyses;
        expect(analyses).to.be.an("array").and.not.be.empty;
        const persistedIds = analyses.map((analysis) =>
          String(
            d.orderableKind === "panel" ? analysis.panelId : analysis.testId,
          ),
        );
        expect(persistedIds).to.include(this.state.orderableId);
      });
    });
    cy.contains("h4", currentLabel("save.success")).should("be.visible");
    cy.get(".post-save-dialog__accession-tag").should(
      "have.text",
      this.state.labNumber,
    );
  }

  assertOriginalPrintBarcodeButton() {
    cy.get(".post-save-dialog__accession-tag").should(
      "have.text",
      this.state.labNumber,
    );
    cy.contains(
      ".post-save-dialog__action-cell button",
      currentLabel("barcode.print.button"),
    )
      .should("be.visible")
      .and("be.enabled");
  }

  openExactCase() {
    const d = this.definition;
    expect(this.state.caseId).to.match(/^[1-9]\d*$/);
    cy.intercept("GET", `**/rest/${d.api}/caseView/${this.state.caseId}`).as(
      "actualExactSpecialtyCase",
    );
    this.row().should("be.visible").click();
    cy.location("pathname").should("eq", `${d.casePath}/${this.state.caseId}`);
    cy.wait("@actualExactSpecialtyCase").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.labNumber).to.eq(this.state.labNumber);
    });
  }

  saveCase(status, release) {
    const d = this.definition;
    const id = this.state.caseId;
    cy.intercept("POST", `**/rest/${d.api}/caseView/${id}`).as(
      "actualSaveSpecialtyCase",
    );
    cy.get("#pathology_save2").should("be.visible").and("be.enabled").click();
    cy.wait("@actualSaveSpecialtyCase").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      const sent = bodyObject(request.body);
      expect(sent.status).to.eq(status);
      expect(sent.release).to.eq(release);
      expect(String(sent.assignedTechnicianId)).to.eq(this.state.userId);
      if (release) {
        expect(
          String(
            sent[
              d.api === "cytology"
                ? "assignedCytoPathologistId"
                : "assignedPathologistId"
            ],
          ),
        ).to.eq(this.state.userId);
      }
      return jsonRead(`/rest/${d.api}/caseView/${id}`).then((saved) => {
        expect(saved.labNumber).to.eq(this.state.labNumber);
        expect(saved.status).to.eq(release ? "COMPLETED" : status);
        expect(String(saved.assignedTechnicianId)).to.eq(this.state.userId);
        if (release)
          expect(String(saved.assignedPathologistId)).to.eq(this.state.userId);
        this.state.completed = release;
      });
    });
  }

  completeThroughActualAssignmentAndRelease() {
    const d = this.definition;
    this.findExactOrder();
    cy.intercept(
      "POST",
      `**/rest/${d.api}/assignTechnician?${d.sampleKey}=${this.state.caseId}`,
    ).as("actualTechnicianClaim");
    this.row()
      .find("td")
      .eq(4)
      .contains("button", currentLabel("label.button.start"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@actualTechnicianClaim")
      .its("response.statusCode")
      .should("eq", 200);
    this.visit();
    this.openExactCase();
    cy.get("#assignedTechnician")
      .should("be.disabled")
      .and("have.value", this.state.userId);
    cy.get("#assignedPathologist").should("be.disabled");
    cy.get("#status option[value=COMPLETED]").should("not.exist");
    cy.get("#status")
      .should("be.enabled")
      .select(d.ready)
      .should("have.value", d.ready);
    this.saveCase(d.ready, false);
    this.visit();
    cy.intercept(
      "POST",
      `**/rest/${d.api}/${d.specialistAction}?${d.sampleKey}=${this.state.caseId}`,
    ).as("actualSpecialistClaim");
    this.row()
      .find("td")
      .eq(5)
      .contains("button", currentLabel("label.button.start"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@actualSpecialistClaim")
      .its("response.statusCode")
      .should("eq", 200);
    this.visit();
    this.openExactCase();
    cy.get("#assignedTechnician")
      .should("be.disabled")
      .and("have.value", this.state.userId);
    cy.get("#assignedPathologist")
      .should("be.disabled")
      .and("have.value", this.state.userId);
    cy.get("label[for=release]").should("be.visible").click();
    cy.get("#release").should("be.checked");
    this.saveCase(d.ready, true);
  }

  assertCreatedCaseCompletedInDashboard() {
    const d = this.definition;
    cy.intercept({
      method: "GET",
      pathname: `**/rest/${d.api}/dashboard`,
      query: { searchTerm: this.state.labNumber, statuses: "COMPLETED" },
    }).as("actualCompletedCaseFilter");
    cy.get("#statusFilter")
      .should("be.visible")
      .select("COMPLETED")
      .should("have.value", "COMPLETED");
    cy.get(".gridBoundary input.cds--search-input")
      .should("be.visible")
      .clear()
      .type(this.state.labNumber);
    cy.wait("@actualCompletedCaseFilter").then(({ request, response }) => {
      expect(new URL(request.url).searchParams.get("statuses")).to.eq(
        "COMPLETED",
      );
      expect(response.statusCode).to.eq(200);
      const matches = response.body.filter(
        (entry) => entry.labNumber === this.state.labNumber,
      );
      expect(matches).to.have.length(1);
      expect(String(matches[0][d.sampleKey])).to.eq(this.state.caseId);
      expect(matches[0].status).to.eq("COMPLETED");
    });
    this.row().should("have.length", 1).and("be.visible");
  }
}

export default CurrentSpecialtyDashboard;
