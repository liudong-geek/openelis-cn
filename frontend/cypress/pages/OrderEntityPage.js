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
    this.patientPage = new PatientEntryPage();
    return this.patientPage;
  }

  clickNextButton() {
    cy.get("body").then(($body) => {
      const enteringSamples =
        $body.find("#additionalQuestionsSelect").length > 0;
      const enteringOrderDetails = $body.find("select#sampleId_0").length > 0;
      const tests = $body.find("input[id^='test_0_']:checked");
      if (tests.length) {
        this.expected.testIds = [...tests].map((input) =>
          input.id.slice("test_0_".length),
        );
      }
      // Cypress resets intercepts between tests; observe each reference-data
      // request in the same step transition that mounts its consumer.
      if (enteringSamples) {
        cy.intercept("GET", "**/rest/user-sample-types").as(
          "compatibilitySampleTypes",
        );
      }
      if (enteringOrderDetails) {
        cy.intercept("GET", "**/rest/SamplePatientEntry").as(
          "compatibilityEntryForm",
        );
      }
      cy.contains("button", labelPattern("next.action.button"))
        .should("be.visible")
        .scrollIntoView()
        .should("not.be.disabled")
        .click();
      if (enteringSamples) {
        cy.wait("@compatibilitySampleTypes")
          .its("response.statusCode")
          .should("eq", 200);
      }
      if (enteringOrderDetails) {
        cy.wait("@compatibilityEntryForm").then(({ response }) => {
          expect(response?.statusCode).to.eq(200);
          expect(response.body.sampleOrderItems.referringSiteList).to.be.an(
            "array",
          );
          this.availableSites =
            response.body.sampleOrderItems.referringSiteList;
        });
      }
    });
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
    cy.get("select#sampleId_0 option")
      .should(($options) => {
        const selected = [...$options].filter((option) =>
          pattern.test(option.text.trim()),
        );
        expect(selected, "unchanged fixture specimen type").to.have.length(1);
      })
      .then(($options) => {
        const selected = [...$options].filter((option) =>
          pattern.test(option.text.trim()),
        );
        this.expected.sampleTypeId = selected[0].value;
        expect(this.expected.sampleTypeId).to.match(/^[1-9]\d*$/);
        cy.intercept(
          "GET",
          `**/rest/sample-type-tests?sampleType=${this.expected.sampleTypeId}`,
        ).as("compatibilitySampleTests");
        cy.getElement("select#sampleId_0")
          .select(this.expected.sampleTypeId)
          .should("have.value", this.expected.sampleTypeId);
        cy.wait("@compatibilitySampleTests").then(({ response }) => {
          expect(response.statusCode).to.eq(200);
          const data =
            typeof response.body === "string"
              ? JSON.parse(response.body)
              : response.body;
          expect(data, "real specimen test configuration").to.be.an("object");
          expect(String(data.sampleTypeId)).to.eq(this.expected.sampleTypeId);
          expect(
            data.panels,
            "available panels from the real response",
          ).to.be.an("array");
          this.availablePanels = data.panels;
        });
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
    // Localization keeps the original fixture entities (panel 1 and panel 4).
    const fixturePanels = [
      { id: "1", names: ["Bilan Biochimique", "生化检验组合"] },
      { id: "4", names: ["Serologie VIH", "HIV血清学"] },
    ];
    cy.then(() => {
      expect(
        this.availablePanels,
        "unchanged fixture panels from the real sample-type response",
      ).to.be.an("array");
      fixturePanels.forEach((fixture) => {
        const matching = this.availablePanels.filter((panel) =>
          fixture.names.includes(panel.name),
        );
        expect(
          matching,
          `unique localized fixture panel ${fixture.id}`,
        ).to.have.length(1);
        const panel = matching[0];
        expect(String(panel.id), "original fixture panel identity").to.eq(
          fixture.id,
        );
        const name = new RegExp(`^${Cypress._.escapeRegExp(panel.name)}$`);
        cy.contains("label", name)
          .should("be.visible")
          .then(($label) => {
            const id = $label.attr("for");
            expect(id).to.match(/^panel_0_[1-9]\d*$/);
            expect(id, "label targets the original fixture panel").to.eq(
              `panel_0_${fixture.id}`,
            );
            cy.wrap($label).click();
            cy.get(`#${id}`).should("be.checked");
            this.expected.panelIds.push(id.slice("panel_0_".length));
          });
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
    cy.then(() => {
      expect(this.availableSites).to.be.an("array");
      const matches = this.availableSites.filter(
        (site) =>
          site.value === siteName ||
          (typeof site.value === "string" &&
            site.value.endsWith(` - ${siteName}`)),
      );
      expect(matches, "unique configured referring site").to.have.length(1);
      this.expected.siteId = String(matches[0].id);
      this.expected.siteLabel = matches[0].value;
      expect(this.expected.siteId).to.match(/^[1-9]\d*$/);
    });
    cy.get("input#siteName").clear().type(siteName);
    cy.then(() => {
      cy.contains(".suggestion-active", this.expected.siteLabel)
        .should("have.text", this.expected.siteLabel)
        .should("be.visible")
        .click();
      cy.get("input#siteName").should("have.value", this.expected.siteLabel);
    });
  }

  enterRequesterLastAndFirstName(fullName, firstName, lastName) {
    cy.intercept({
      method: "GET",
      pathname: `${API_BASE}/rest/practitioner`,
      query: { providerId: /^[1-9]\d*$/ },
    }).as("compatibilityPractitioner");
    cy.get("#requesterId").clear().type(fullName);
    cy.contains(".suggestion-active", fullName).click();
    cy.wait("@compatibilityPractitioner").then(({ request, response }) => {
      expect(response?.statusCode, "real selected doctor lookup").to.eq(200);
      expect(response.headers["content-type"]).to.match(/application\/json/i);
      const doctor = response.body;
      expect(doctor).to.be.an("object").and.not.be.an("array");
      expect(doctor.person).to.be.an("object");
      const selectedPersonId = new URL(request.url).searchParams.get(
        "providerId",
      );
      expect(String(doctor.person.id), "same selected doctor person").to.eq(
        selectedPersonId,
      );
      expect(String(doctor.id), "configured doctor identity").to.match(
        /^[1-9]\d*$/,
      );
      expect(doctor.person.firstName).to.eq(firstName);
      expect(doctor.person.lastName).to.eq(lastName);
      this.expected.providerId = String(doctor.id);
      this.expected.providerPersonId = selectedPersonId;
    });
    // Observe the completed autofill before exercising the original edits.
    cy.get("input#requesterFirstName").should("have.value", firstName);
    cy.get("input#requesterLastName").should("have.value", lastName);
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
      // A configured site is sent by ID; its canonical name is verified below.
      expect(sent.referringSiteName).to.eq("");
      expect(sent.providerFirstName).to.eq(order.requester.firstName);
      expect(sent.providerLastName).to.eq(order.requester.lastName);
      expect(String(sent.referringSiteId)).to.eq(this.expected.siteId);
      expect(String(sent.providerId)).to.eq(this.expected.providerId);
      expect(String(sent.providerPersonId)).to.eq(
        this.expected.providerPersonId,
      );
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
        }).then(({ status, body: accession }) => {
          // Capture both existing read responses before validating the captured
          // result, so a failure cannot hide the independent referral lookup.
          return jsonRead("/rest/ReferredOutTests", {
            searchType: "LAB_NUMBER",
            labNumber: sent.labNo,
          }).then(({ status: referralStatus, body: referral }) => {
            return cy
              .writeFile("cypress/results/compatibility-order-readback.json", {
                runtimeDatabaseId: Cypress.env("OWNED_DATABASE_ID"),
                origin: Cypress.config("baseUrl"),
                selectedPatientId: this.patientPage.selectedPatientId,
                requestPatientId: String(body.patientProperties.patientPK),
                saveStatus: response.statusCode,
                labNumber: sent.labNo,
                requestReferralItems: body.referralItems,
                saved,
                accessionStatus: status,
                accession,
                referralStatus,
                referral,
              })
              .then(() => {
                expect(String(body.patientProperties.patientPK)).to.eq(
                  this.patientPage.selectedPatientId,
                );
                expect(saved.patient.patientId).to.eq(
                  this.patientPage.selectedPatientId,
                );
                expect(status).to.eq(200);
                expect(accession.accessionNumber).to.eq(sent.labNo);
                expect(accession.searchFinished).to.eq(true);
                const resultRows = accession.testResult.filter(
                  (row) => row.testId === "1",
                );
                expect(resultRows).not.to.be.empty;
                resultRows.forEach((row) => {
                  expect(row.referredOut).to.eq(true);
                  expect(String(row.referralId)).to.match(/^[1-9]\d*$/);
                  expect(row.referralReasonId).to.eq(this.expected.reasonId);
                });

                expect(referralStatus).to.eq(200);
                expect(referral.searchFinished).to.eq(true);
                const referralRows = referral.referralDisplayItems.filter(
                  (row) => referredAnalysisIds.includes(row.analysisId),
                );
                expect(
                  referralRows.map((row) => row.analysisId),
                ).to.have.members(referredAnalysisIds);
                referralRows.forEach((row) => {
                  expect(row.accessionNumber).to.eq(sent.labNo);
                  expect(row.referenceLabDisplay).to.eq("CEDRES");
                  expect(row.patientFirstName).to.eq(patient.firstName);
                  expect(row.patientLastName).to.eq(patient.lastName);
                });
              });
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
