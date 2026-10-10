import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

const API_BASE = "/api/OpenELIS-Global";
const messages = [enMessages, zhMessages, zhCNMessages];
const labelPattern = (key) => {
  const labels = [...new Set(messages.map((locale) => locale[key]))];
  expect(
    labels.every((label) => typeof label === "string"),
    key,
  ).to.eq(true);
  return new RegExp(`^(?:${labels.map(Cypress._.escapeRegExp).join("|")})$`);
};
const csv = (value) =>
  String(value || "")
    .split(",")
    .filter(Boolean);
const bodyJSON = (request) =>
  typeof request.body === "string" ? JSON.parse(request.body) : request.body;
const realJSON = (response) => {
  expect(response.status ?? response.statusCode, "real JSON API status").to.eq(
    200,
  );
  expect(
    response.headers["content-type"],
    "never an HTML route fallback",
  ).to.match(/application\/json/i);
  expect(response.body).to.be.an("object").and.not.be.an("array");
  return response.body;
};
const analysisIdentities = (order) =>
  order.samples.flatMap((sample) =>
    sample.analyses.map((analysis) => String(analysis.analysisId)),
  );

// The retired FindOrder intermediate patient search is not restored. Current
// patient criteria and the saved application list are verified as separate steps.
class ModifyOrderPage {
  baseline = null;
  editor = null;
  expectedAddition = null;
  expectedNewSample = null;
  expectedMetadata = null;
  saves = [];

  visit() {
    cy.visit("/order");
    this.assertCurrentList();
  }

  assertCurrentList() {
    cy.location("pathname").should("eq", "/order");
    cy.get("#order-dashboard-title").should("be.visible");
    cy.get("#intake-order-search").should("be.visible");
    cy.get("#labNumber").should("not.exist");
    cy.get("[data-cy='searchPatientButton']").should("not.exist");
  }

  readSaved(labNumber) {
    return cy
      .request({
        url: `${API_BASE}/rest/order/saved`,
        qs: { queryVersion: "2", labNumber },
        followRedirect: false,
        headers: { Accept: "application/json" },
      })
      .then((response) => {
        const order = realJSON(response);
        expect(order.queryVersion).to.eq("2");
        expect(order.labNumber).to.eq(labNumber);
        expect(String(order.orderId)).to.match(/^[1-9]\d*$/);
        expect(order.samples).to.be.an("array");
        expect(order.patient).to.be.an("object");
        return order;
      });
  }

  bindFixtureOrder(patient) {
    return this.readSaved(patient.labNo).then((order) => {
      expect(order.patient.firstName).to.eq(patient.firstName);
      expect(order.patient.lastName).to.eq(patient.lastName);
      expect(order.patient.nationalId).to.eq(patient.nationalId);
      expect(order.patient.externalId).to.eq(patient.subjectNumber);
      expect(order.patient.gender).to.eq("M");
      expect(order.patient.birthDate).to.eq("2001-05-12");
      expect(String(order.patient.patientId)).to.match(/^[1-9]\d*$/);
      expect(order.canModify, "actual authorized existing order").to.eq(true);
      this.baseline = order;
      return order;
    });
  }

  openSavedOrder(labNumber) {
    const alias = `currentOrderSearch${Date.now()}`;
    cy.intercept("GET", "**/rest/order/dashboard?*", (request) => {
      if (new URL(request.url).searchParams.get("search") === labNumber)
        request.alias = alias;
    });
    cy.get("#intake-order-search")
      .clear()
      .type(labNumber)
      .should("have.value", labNumber);
    return cy.wait(`@${alias}`).then(({ response }) => {
      const page = realJSON(response);
      const matches = page.orders.filter(
        (order) => order.labNumber === labNumber,
      );
      expect(matches, "same saved accession in current list").to.have.length(1);
      expect(matches[0].patientName).to.contain(this.baseline.patient.lastName);
      cy.intercept("GET", "**/rest/SampleEdit?*", (request) => {
        if (
          new URL(request.url).searchParams.get("accessionNumber") === labNumber
        )
          request.alias = "currentSampleEdit";
      });
      cy.contains(".order-dashboard-table tbody tr", labNumber)
        .should("be.visible")
        .within(() => {
          cy.contains("button", labelPattern("workspace.order.edit"))
            .should("be.visible")
            .and("be.enabled")
            .click();
        });
      return cy.wait("@currentSampleEdit").then(({ request, response }) => {
        expect(new URL(request.url).searchParams.get("type")).to.eq(
          "readwrite",
        );
        const form = realJSON(response);
        expect(form.noSampleFound).not.to.eq(true);
        expect(form.isEditable).to.eq(true);
        expect(form.sampleOrderItems.labNo).to.eq(labNumber);
        expect(form.accessionNumber).to.eq(labNumber);
        expect(String(form.patientId)).to.eq(
          String(this.baseline.patient.patientId),
        );
        expect(form.existingTests).to.be.an("array");
        expect(form.possibleTests).to.be.an("array");
        this.editor = form;
        this.expectedAddition = null;
        this.expectedNewSample = null;
        this.expectedMetadata = null;
        this.saves = [];
        cy.intercept("POST", "**/rest/SampleEdit", (save) => {
          this.saves.push(bodyJSON(save));
        }).as("currentSampleEditSave");
        cy.location("pathname").should("eq", "/ModifyOrder");
        cy.location("search").should(
          "contain",
          `accessionNumber=${encodeURIComponent(labNumber)}`,
        );
        this.checkExistingTestsWorkspace();
      });
    });
  }

  checkExistingTestsWorkspace() {
    cy.get(".modify-order-workspace").should("be.visible");
    cy.get("#additionalQuestionsSelect").should("not.exist");
    cy.get(".modify-order-workspace table").should("have.length", 2);
    cy.get(".modify-order-summary")
      .should("contain", this.baseline.labNumber)
      .and("contain", this.baseline.patient.nationalId)
      .and("contain", this.baseline.patient.lastName);
    const original = new Set(analysisIdentities(this.baseline));
    const actual = this.editor.existingTests.map((test) =>
      String(test.analysisId),
    );
    expect(
      new Set(actual),
      "all actual persisted analyses remain visible",
    ).to.deep.equal(original);
  }

  assignAvailableTest() {
    const possible = this.editor.possibleTests;
    expect(possible, "a real addable test is a fixture prerequisite").not.to.be
      .empty;
    const target = possible[0];
    expect(String(target.sampleItemId)).to.match(/^[1-9]\d*$/);
    expect(String(target.testId)).to.match(/^[1-9]\d*$/);
    const sample = this.baseline.samples.find(
      (entry) => String(entry.sampleItemId) === String(target.sampleItemId),
    );
    expect(sample, "addition belongs to this persisted tube").to.exist;
    expect(
      sample.analyses.some(
        (entry) => String(entry.testId) === String(target.testId),
      ),
      "test is not already assigned",
    ).to.eq(false);
    this.expectedAddition = {
      sampleItemId: String(target.sampleItemId),
      testId: String(target.testId),
      testName: target.testName,
    };
    cy.get(".modify-order-workspace table")
      .eq(1)
      .find("tbody tr")
      .first()
      .should("contain", target.testName)
      .find("input[name='add']")
      .should("not.be.disabled")
      .then(($input) => {
        cy.get(`label[for='${$input.attr("id")}']`)
          .should("be.visible")
          .click();
        cy.wrap($input).should("be.checked");
      });
  }

  clickNextButton() {
    cy.get("[data-cy='next-button']")
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get("[data-cy='submit-order']").should("be.visible");
    // The current editor allows optional renumbering. This acceptance keeps the
    // existing accession: the new-number field stays empty and generation is not used.
    cy.get("#labNo").should("have.value", "");
    cy.get(".modify-order-summary").should("contain", this.baseline.labNumber);
  }

  rememberSiteAndRequester() {
    cy.get("#rememberSiteAndRequester").then(($input) => {
      if (!$input.prop("checked"))
        cy.get("label[for='rememberSiteAndRequester']")
          .should("be.visible")
          .click();
    });
    cy.get("#rememberSiteAndRequester").should("be.checked");
  }

  addSerumWithOriginalPanels(order) {
    expect(order.samples[0].sampleType).to.eq("Serum");
    cy.contains(
      ".modify-order-workspace button",
      labelPattern("sample.add.action"),
    )
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get("fieldset.sampleType").should("have.length", 1);
    cy.intercept("GET", "**/rest/sample-type-tests?sampleType=2").as(
      "currentSerumChoices",
    );
    cy.get("#sampleId_0 option[value='2']").should("exist");
    cy.get("#sampleId_0").select("2").should("have.value", "2");
    return cy.wait("@currentSerumChoices").then(({ response }) => {
      const choices = realJSON(response);
      const panelNames = ["Bilan Biochimique", "Serologie VIH"];
      const panels = panelNames.map((name) => {
        const matches = choices.panels.filter((panel) => panel.name === name);
        expect(matches, `original clinical panel ${name}`).to.have.length(1);
        return matches[0];
      });
      this.expectedNewSample = {
        sampleTypeId: "2",
        panels: panels.map((panel) => String(panel.id)),
        tests: [...new Set(panels.flatMap((panel) => csv(panel.testIds)))],
      };
      expect(this.expectedNewSample.tests).not.to.be.empty;
      panels.forEach((panel) => {
        cy.get(`label[for='panel_0_${panel.id}']`).should("be.visible").click();
        cy.get(`#panel_0_${panel.id}`).should("be.checked");
      });
      cy.get("input[id^='test_0_']:checked").then(($inputs) => {
        expect(
          [...$inputs].map((input) => input.id.slice("test_0_".length)).sort(),
        ).to.deep.equal([...this.expectedNewSample.tests].sort());
      });
    });
  }

  setOriginalSiteAndRequester(order) {
    return cy
      .request({
        url: `${API_BASE}/rest/SamplePatientEntry`,
        followRedirect: false,
        headers: { Accept: "application/json" },
      })
      .then((response) => {
        const defaults = realJSON(response).sampleOrderItems;
        const siteMatches = defaults.referringSiteList.filter(
          (site) =>
            site.value === order.siteName ||
            site.value.endsWith(` - ${order.siteName}`),
        );
        expect(
          siteMatches,
          "same original referring institution",
        ).to.have.length(1);
        const providerMatches = defaults.providersList.filter(
          (provider) => provider.value === order.requester.fullName,
        );
        expect(providerMatches, "same original requester").to.have.length(1);
        this.expectedMetadata = {
          referringSiteId: String(siteMatches[0].id),
          referringSiteName: order.siteName,
          providerId: String(providerMatches[0].id),
          providerFirstName: order.requester.firstName,
          providerLastName: order.requester.lastName,
        };
        cy.get("#siteName").clear().type(order.siteName);
        cy.contains(
          ".suggestions li",
          new RegExp(`^${Cypress._.escapeRegExp(siteMatches[0].value)}$`),
        )
          .should("be.visible")
          .click();
        cy.get("#requesterId").clear().type(order.requester.fullName);
        cy.contains(
          ".suggestions li",
          new RegExp(`^${Cypress._.escapeRegExp(order.requester.fullName)}$`),
        )
          .should("be.visible")
          .click();
        cy.get("#requesterFirstName")
          .clear()
          .type(order.requester.firstName)
          .should("have.value", order.requester.firstName);
        cy.get("#requesterLastName")
          .clear()
          .type(order.requester.lastName)
          .should("have.value", order.requester.lastName);
      });
  }

  clickSubmitAndReadBack() {
    const baseline = this.baseline;
    cy.get("[data-cy='submit-order']")
      .should("be.visible")
      .and("be.enabled")
      .click();
    return cy.wait("@currentSampleEditSave").then(({ request, response }) => {
      expect(
        response?.statusCode,
        "SampleEdit success is actual HTTP200 with empty body",
      ).to.eq(200);
      expect(this.saves, "one actual edit POST").to.have.length(1);
      const payload = bodyJSON(request);
      expect(payload.accessionNumber).to.eq(baseline.labNumber);
      expect(payload.sampleOrderItems.labNo).to.eq(baseline.labNumber);
      expect(
        payload.newAccessionNumber || "",
        "this edit retains the same accession",
      ).to.eq("");
      expect(String(payload.patientId)).to.eq(
        String(baseline.patient.patientId),
      );
      expect(payload.rememberSiteAndRequester).to.eq(true);
      const xml = new DOMParser().parseFromString(
        payload.sampleXML,
        "application/xml",
      );
      expect(xml.querySelector("parsererror")).to.eq(null);
      const added = [...xml.querySelectorAll("samples > sample")];
      if (this.expectedAddition) {
        const matches = payload.possibleTests.filter(
          (test) => test.add === true,
        );
        expect(matches).to.have.length(1);
        expect(String(matches[0].sampleItemId)).to.eq(
          this.expectedAddition.sampleItemId,
        );
        expect(String(matches[0].testId)).to.eq(this.expectedAddition.testId);
        expect(added).to.have.length(0);
      }
      if (this.expectedNewSample) {
        expect(added).to.have.length(1);
        expect(added[0].getAttribute("sampleID")).to.eq(
          this.expectedNewSample.sampleTypeId,
        );
        expect(csv(added[0].getAttribute("tests")).sort()).to.deep.equal(
          [...this.expectedNewSample.tests].sort(),
        );
        expect(csv(added[0].getAttribute("panels")).sort()).to.deep.equal(
          [...this.expectedNewSample.panels].sort(),
        );
      }
      if (this.expectedMetadata) {
        for (const key of [
          "referringSiteId",
          "providerId",
          "providerFirstName",
          "providerLastName",
        ])
          expect(String(payload.sampleOrderItems[key])).to.eq(
            this.expectedMetadata[key],
          );
      }
      cy.contains(
        ".modify-order-success h2",
        labelPattern("modify.order.saved"),
      ).should("be.visible");
      return this.readSaved(baseline.labNumber).then((after) => {
        expect(after.orderId).to.eq(baseline.orderId);
        expect(after.patient).to.deep.equal(baseline.patient);
        const original = analysisIdentities(baseline);
        const remaining = new Set(analysisIdentities(after));
        original.forEach((id) =>
          expect(remaining.has(id), `original analysis ${id} retained`).to.eq(
            true,
          ),
        );
        if (this.expectedAddition) {
          expect(after.samples).to.have.length(baseline.samples.length);
          const tube = after.samples.find(
            (sample) =>
              String(sample.sampleItemId) ===
              this.expectedAddition.sampleItemId,
          );
          expect(
            tube.analyses.filter(
              (analysis) =>
                String(analysis.testId) === this.expectedAddition.testId,
            ),
            "assigned test persisted on the same tube",
          ).to.have.length(1);
        }
        if (this.expectedNewSample) {
          expect(after.samples).to.have.length(baseline.samples.length + 1);
          const oldIds = new Set(
            baseline.samples.map((sample) => String(sample.sampleItemId)),
          );
          const newTubes = after.samples.filter(
            (sample) => !oldIds.has(String(sample.sampleItemId)),
          );
          expect(newTubes).to.have.length(1);
          const tube = newTubes[0];
          expect(String(tube.sampleTypeId)).to.eq(
            this.expectedNewSample.sampleTypeId,
          );
          expect(
            tube.analyses.map((analysis) => String(analysis.testId)).sort(),
          ).to.deep.equal([...this.expectedNewSample.tests].sort());
          expect(
            [
              ...new Set(
                tube.analyses
                  .map((analysis) => String(analysis.panelId))
                  .filter((id) => id !== "null"),
              ),
            ].sort(),
          ).to.deep.equal([...this.expectedNewSample.panels].sort());
        }
        if (this.expectedMetadata) {
          for (const [key, value] of Object.entries(this.expectedMetadata))
            expect(
              String(after.sampleOrderItems[key]),
              `persisted ${key}`,
            ).to.eq(value);
        }
        this.baseline = after;
      });
    });
  }
}
export default ModifyOrderPage;
