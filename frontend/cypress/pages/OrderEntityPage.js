import PatientEntryPage from "./PatientEntryPage";
import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

const API_BASE = "/api/OpenELIS-Global";
const jsonRead = (path, qs) =>
  cy
    .request({
      url: `${API_BASE}${path}`,
      qs,
      followRedirect: false,
      headers: { Accept: "application/json" },
    })
    .then((response) => {
      expect(response.status, "real JSON API status").to.eq(200);
      expect(
        response.headers["content-type"],
        "API must not be the SPA HTML fallback",
      ).to.match(/application\/json/i);
      expect(response.body).to.be.an("object").and.not.be.an("array");
      return response;
    });

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
const fixtureISO = (value) => {
  expect(value, "unchanged fixture date in day/month/year order").to.match(
    /^\d{2}\/\d{2}\/\d{4}$/,
  );
  const [day, month, year] = value.split("/");
  const iso = `${year}-${month}-${day}`;
  expect(new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10)).to.eq(iso);
  return iso;
};
const dateISO = (value, pattern) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  expect(value, "saved date display").to.match(/^\d{1,4}\/\d{1,2}\/\d{1,4}$/);
  const parts = String(value).split("/");
  const [year, month, day] =
    pattern === "ymd"
      ? parts
      : pattern === "dmy"
        ? [parts[2], parts[1], parts[0]]
        : [parts[2], parts[0], parts[1]];
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

// Explicit legacy Reception bookmark coverage. This helper does not establish
// referral-plan support in the decoupled /order/enter workflow.
class OrderEntityPage {
  sampleTypeOptionDropDown = "";
  expected = {};

  visit() {
    cy.visit("/SamplePatientEntry");
    cy.location("pathname").should("eq", "/SamplePatientEntry");
  }

  getPatientPage() {
    return new PatientEntryPage();
  }

  clickNextButton() {
    cy.get("body").then(($body) => {
      const tests = $body.find("input[id^='test_0_']:checked");
      if (tests.length) {
        this.expected.testIds = [...tests].map((input) =>
          input.id.slice("test_0_".length),
        );
      }
    });
    cy.contains("button", labelPattern("next.action.button"))
      .should("be.visible")
      .scrollIntoView()
      .should("not.be.disabled")
      .click();
  }

  selectCytology() {
    cy.get("#additionalQuestionsSelect option").then(($options) => {
      const selected = [...$options].filter((option) =>
        labelPattern("cytology.label.title").test(option.text.trim()),
      );
      expect(selected, "same Cytology program").to.have.length(1);
      this.expected.programId = selected[0].value;
      expect(this.expected.programId).to.match(/^[1-9]\d*$/);
      cy.get("#additionalQuestionsSelect")
        .select(this.expected.programId)
        .should("have.value", this.expected.programId);
    });
  }

  selectSampleTypeOption(sampleType) {
    const pattern =
      sampleType === "Serum"
        ? labelPattern("sample.type.serum")
        : new RegExp(`^${Cypress._.escapeRegExp(sampleType)}$`);
    cy.get("select#sampleId_0 option").then(($options) => {
      const selected = [...$options].filter((option) =>
        pattern.test(option.text.trim()),
      );
      expect(selected, "unchanged fixture specimen type").to.have.length(1);
      this.expected.sampleTypeId = selected[0].value;
      expect(this.expected.sampleTypeId).to.match(/^[1-9]\d*$/);
      cy.getElement("select#sampleId_0")
        .select(this.expected.sampleTypeId)
        .should("have.value", this.expected.sampleTypeId);
    });
  }

  enterFixtureDate(selector, value, field) {
    const iso = fixtureISO(value);
    cy.get(selector)
      .should("be.visible")
      .invoke("attr", "placeholder")
      .then((placeholder) => {
        const patterns = ["ymd", "dmy", "mdy"].filter((pattern) =>
          messages.some(
            (locale) =>
              locale[`datepicker.placeholder.${pattern}`] === placeholder,
          ),
        );
        expect(
          patterns,
          "date order from actual configured input",
        ).to.have.length(1);
        const pattern = patterns[0];
        const [year, month, day] = iso.split("-");
        const display = (
          pattern === "ymd"
            ? [year, month, day]
            : pattern === "dmy"
              ? [day, month, year]
              : [month, day, year]
        ).join("/");
        this.expected[field] = { iso, display, pattern };
        cy.get(selector)
          .clear()
          .type(display)
          .blur()
          .should("have.value", display);
        cy.get("body").type("{esc}");
      });
  }

  collectionDate(value) {
    this.enterFixtureDate("input#collectionDate_0", value, "collectionDate");
  }

  requestDate(value) {
    this.enterFixtureDate("input#order_requestDate", value, "requestDate");
  }

  receivedDate(value) {
    this.enterFixtureDate("input#order_receivedDate", value, "receivedDate");
  }

  checkPanelCheckBoxField() {
    this.expected.panelIds = [];
    ["Bilan Biochimique", "Serologie VIH"].forEach((name) => {
      cy.contains("label", name)
        .should("be.visible")
        .then(($label) => {
          const id = $label.attr("for");
          expect(id).to.match(/^panel_0_[1-9]\d*$/);
          cy.wrap($label).click();
          cy.get(`#${id}`).should("be.checked");
          this.expected.panelIds.push(id.slice("panel_0_".length));
        });
    });
  }

  referTest() {
    cy.contains("label", labelPattern("label.refertest.referencelab"))
      .should("be.visible")
      .click();
    cy.get("#useReferral_0").should("be.checked");
  }

  selectInstitute() {
    cy.get("#referredInstituteId_0_1")
      .select("CEDRES")
      .invoke("val")
      .then((id) => {
        this.expected.instituteId = String(id);
        expect(this.expected.instituteId).to.match(/^[1-9]\d*$/);
      });
  }

  selectReferralReason() {
    // This is the original master-data choice, not a translated UI label.
    cy.get("#referralReasonId_0_1")
      .select("Test not performed")
      .invoke("val")
      .then((id) => {
        this.expected.reasonId = String(id);
        expect(this.expected.reasonId).to.match(/^[1-9]\d*$/);
      });
  }

  generateLabOrderNumber() {
    cy.get("[data-cy='generate-labNumber']").click();
  }

  validateAcessionNumber(order) {
    cy.intercept("GET", "**/rest/SampleEntryAccessionNumberValidation**").as(
      "accessionNoValidation",
    );
    cy.get("#labNo").type(order, { delay: 300 });
    cy.wait("@accessionNoValidation").then(
      ({ response }) => expect(response.body.status).to.be.false,
    );
  }

  enterSiteName(siteName) {
    cy.get("input#siteName").clear().type(siteName);
    cy.contains(".suggestion-active", siteName).should("be.visible").click();
  }

  enterRequesterLastAndFirstName(fullName, firstName, lastName) {
    cy.get("#requesterId").clear().type(fullName);
    cy.contains(".suggestion-active", fullName).click();
    cy.get("input#requesterFirstName")
      .clear()
      .type(firstName)
      .should("have.value", firstName);
    cy.get("input#requesterLastName")
      .clear()
      .type(lastName)
      .should("have.value", lastName);
  }

  rememberSiteAndRequester() {
    cy.contains(
      "label",
      labelPattern("order.remember.site.and.requester.label"),
    )
      .should("be.visible")
      .click();
    cy.get("#rememberSiteAndRequester").should("be.checked");
  }

  clickSubmitOrderButton() {
    // Observation only: no stub, reply, mutation, status/error waiver or new timeout.
    cy.intercept("POST", "**/rest/SamplePatientEntry").as(
      "compatibilityOrderSave",
    );
    cy.contains("button", labelPattern("label.button.submit"))
      .should("be.visible")
      .should("not.be.disabled")
      .click();
  }

  assertSavedOrder(order, patient) {
    return cy.wait("@compatibilityOrderSave").then(({ request, response }) => {
      expect(response?.statusCode, "real compatibility save status").to.eq(200);
      expect(
        response.headers["content-type"],
        "real JSON save response",
      ).to.match(/application\/json/i);
      expect(response.body).to.be.an("object").and.not.be.an("array");
      expect(response.body.error, "real save has no returned error").to.be
        .undefined;
      const body =
        typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      expect(body.orderEntryOnly).not.to.eq(true);
      expect(body.collectionOnly).not.to.eq(true);
      expect(body.useReferral).to.eq(true);
      expect(body.rememberSiteAndRequester).to.eq(true);
      expect(body.patientProperties.firstName).to.eq(patient.firstName);
      expect(body.patientProperties.lastName).to.eq(patient.lastName);
      expect(String(body.patientProperties.patientPK)).to.match(/^[1-9]\d*$/);
      const sent = body.sampleOrderItems;
      expect(sent.labNo).to.be.a("string").and.not.be.empty;
      expect(sent.programId).to.eq(this.expected.programId);
      expect(sent.requestDate).to.eq(this.expected.requestDate.display);
      expect(sent.receivedDateForDisplay).to.eq(
        this.expected.receivedDate.display,
      );
      expect(this.expected.requestDate.iso).to.eq(
        fixtureISO(order.samples[0].receivedDate),
      );
      expect(this.expected.receivedDate.iso).to.eq(
        fixtureISO(order.samples[0].receivedDate),
      );
      expect(sent.referringSiteName).to.eq(order.siteName);
      expect(sent.providerFirstName).to.eq(order.requester.firstName);
      expect(sent.providerLastName).to.eq(order.requester.lastName);
      expect(String(sent.referringSiteId)).to.match(/^[1-9]\d*$/);
      expect(String(sent.providerId)).to.match(/^[1-9]\d*$/);
      expect(response.body.sampleOrderItems.labNo).to.eq(sent.labNo);

      const xml = new DOMParser().parseFromString(
        body.sampleXML,
        "application/xml",
      );
      expect(
        xml.querySelector("parsererror"),
        "well-formed physical sample payload",
      ).to.eq(null);
      const samples = [...xml.querySelectorAll("samples > sample")];
      expect(samples).to.have.length(order.samples.length);
      expect(samples[0].getAttribute("sampleID")).to.eq(
        this.expected.sampleTypeId,
      );
      expect(samples[0].getAttribute("date")).to.eq(
        this.expected.collectionDate.display,
      );
      expect(this.expected.collectionDate.iso).to.eq(
        fixtureISO(order.samples[0].collectionDate),
      );
      expect(this.expected.testIds).to.be.an("array").and.not.be.empty;
      expect(csv(samples[0].getAttribute("tests"))).to.have.members(
        this.expected.testIds,
      );
      expect(csv(samples[0].getAttribute("panels"))).to.have.members(
        this.expected.panelIds,
      );

      expect(body.referralItems).to.be.an("array").and.not.be.empty;
      const referrals = body.referralItems.flatMap((item) => {
        const ids = csv(item.referredTestId);
        const institutes = csv(item.referredInstituteId);
        const reasons = csv(item.referralReasonId);
        expect(institutes).to.have.length(ids.length);
        expect(reasons).to.have.length(ids.length);
        return ids.map((testId, index) => ({
          testId,
          instituteId: institutes[index],
          reasonId: reasons[index],
        }));
      });
      expect(referrals.filter((item) => item.testId === "1")).to.deep.eq([
        {
          testId: "1",
          instituteId: this.expected.instituteId,
          reasonId: this.expected.reasonId,
        },
      ]);

      return jsonRead("/rest/order/saved", {
        queryVersion: "2",
        labNumber: sent.labNo,
      }).then(({ status, body: saved }) => {
        expect(status).to.eq(200);
        expect(saved.queryVersion).to.eq("2");
        expect(saved.labNumber).to.eq(sent.labNo);
        expect(String(saved.orderId)).to.match(/^[1-9]\d*$/);
        expect(saved.patient.patientId).to.eq(
          String(body.patientProperties.patientPK),
        );
        expect(saved.patient.firstName).to.eq(patient.firstName);
        expect(saved.patient.lastName).to.eq(patient.lastName);
        expect(saved.samples).to.have.length(order.samples.length);
        expect(saved.samples[0].sampleTypeId).to.eq(this.expected.sampleTypeId);
        expect(
          dateISO(
            saved.samples[0].collectionDate,
            this.expected.collectionDate.pattern,
          ),
        ).to.eq(this.expected.collectionDate.iso);
        expect(
          dateISO(
            saved.sampleOrderItems.requestDate,
            this.expected.requestDate.pattern,
          ),
        ).to.eq(this.expected.requestDate.iso);
        expect(
          dateISO(
            saved.sampleOrderItems.receivedDateForDisplay,
            this.expected.receivedDate.pattern,
          ),
        ).to.eq(this.expected.receivedDate.iso);
        expect(saved.sampleOrderItems.referringSiteId).to.eq(
          sent.referringSiteId,
        );
        expect(saved.sampleOrderItems.referringSiteName).to.eq(order.siteName);
        expect(saved.sampleOrderItems.providerId).to.eq(sent.providerId);
        expect(saved.sampleOrderItems.providerFirstName).to.eq(
          order.requester.firstName,
        );
        expect(saved.sampleOrderItems.providerLastName).to.eq(
          order.requester.lastName,
        );
        const analyses = saved.samples.flatMap((sample) => sample.analyses);
        expect([
          ...new Set(analyses.map((analysis) => analysis.testId)),
        ]).to.have.members(this.expected.testIds);
        expect([
          ...new Set(
            analyses.map((analysis) => analysis.panelId).filter(Boolean),
          ),
        ]).to.include.members(this.expected.panelIds);
        const referredAnalysisIds = analyses
          .filter((analysis) => analysis.testId === "1")
          .map((analysis) => analysis.analysisId);
        expect(referredAnalysisIds).not.to.be.empty;

        jsonRead("/rest/order/search", { labNumber: sent.labNo }).then(
          ({ status, body: read }) => {
            expect(status).to.eq(200);
            expect(read.sampleOrderItems.programId).to.eq(
              this.expected.programId,
            );
          },
        );
        jsonRead("/rest/accession-results", {
          accessionNumber: sent.labNo,
        }).then(({ status, body: read }) => {
          expect(status).to.eq(200);
          expect(read.accessionNumber).to.eq(sent.labNo);
          expect(read.searchFinished).to.eq(true);
          const rows = read.testResult.filter((row) => row.testId === "1");
          expect(rows).not.to.be.empty;
          rows.forEach((row) => {
            expect(row.referredOut).to.eq(true);
            expect(String(row.referralId)).to.match(/^[1-9]\d*$/);
            expect(row.referralReasonId).to.eq(this.expected.reasonId);
          });
        });
        jsonRead("/rest/ReferredOutTests", {
          searchType: "LAB_NUMBER",
          labNumber: sent.labNo,
        }).then(({ status, body: read }) => {
          expect(status).to.eq(200);
          expect(read.searchFinished).to.eq(true);
          const rows = read.referralDisplayItems.filter((row) =>
            referredAnalysisIds.includes(row.analysisId),
          );
          expect(rows.map((row) => row.analysisId)).to.have.members(
            referredAnalysisIds,
          );
          rows.forEach((row) => {
            expect(row.accessionNumber).to.eq(sent.labNo);
            expect(row.referenceLabDisplay).to.eq("CEDRES");
            expect(row.patientFirstName).to.eq(patient.firstName);
            expect(row.patientLastName).to.eq(patient.lastName);
          });
        });
        cy.contains(
          ".placeAnotherOrderBtn",
          labelPattern("request.samesite.order"),
        ).should("be.visible");
      });
    });
  }
}

export default OrderEntityPage;
