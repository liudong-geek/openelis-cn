import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";
const messages = [enMessages, zhMessages, zhCNMessages];
const labelPattern = (key) => {
  const values = [...new Set(messages.map((locale) => locale[key]))];
  expect(
    values.every((value) => typeof value === "string"),
    key,
  ).to.eq(true);
  return new RegExp(`^(?:${values.map(Cypress._.escapeRegExp).join("|")})$`);
};
const csv = (value) =>
  String(value || "")
    .split(",")
    .filter(Boolean);
const jsonBody = (request) =>
  typeof request.body === "string" ? JSON.parse(request.body) : request.body;
const expectJSON = (response) => {
  expect(response?.statusCode ?? response?.status).to.eq(200);
  expect(
    response.headers["content-type"],
    "real API JSON, never HTML fallback",
  ).to.match(/application\/json/i);
  expect(response.body).to.be.an("object").and.not.be.an("array");
};
const dateISO = (value, pattern) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const parts = String(value).split("/");
  expect(parts).to.have.length(3);
  const [year, month, day] =
    pattern === "ymd"
      ? parts
      : pattern === "dmy"
        ? [parts[2], parts[1], parts[0]]
        : [parts[2], parts[0], parts[1]];
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  expect(new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10)).to.eq(iso);
  return iso;
};

// Current Routine is a fixed application type. The seven historical EID cases
// are explicitly mapped in the spec, not claimed as passing EID coverage.
class BatchOrderEntry {
  expected = { panelIds: [], testIds: [] };
  saves = [];
  expectedPatient = {};
  watchClinicalSaves() {
    cy.intercept("POST", "**/rest/SamplePatientEntryBatch", (request) => {
      this.saves.push(jsonBody(request));
    }).as("batchClinicalSave");
  }
  visitSetupPage() {
    cy.location("pathname").should("eq", "/SampleBatchEntrySetup");
    cy.contains(
      ".batch-order-setup h1, .batch-order-setup h2",
      labelPattern("order.entry.setup"),
    ).should("be.visible");
    this.watchClinicalSaves();
    cy.get("#batch-order-current-date")
      .invoke("attr", "placeholder")
      .then((placeholder) => {
        const patterns = ["ymd", "dmy", "mdy"].filter((pattern) =>
          messages.some(
            (locale) =>
              locale[`datepicker.placeholder.${pattern}`] === placeholder,
          ),
        );
        expect(patterns, "actual configured date order").to.have.length(1);
        this.expected.datePattern = patterns[0];
      });
  }
  checkNextButtonDisabled() {
    cy.get("[data-testid='next-button-BatchOrderEntry']").should("be.disabled");
  }
  selectForm(formTypeRoutine) {
    expect(formTypeRoutine).to.eq("Routine");
    cy.contains(
      ".batch-application-type strong",
      labelPattern("order.form.routine"),
    ).should("be.visible");
  }
  selectSampleType(serumSample) {
    expect(serumSample, "original Serum fixture").to.eq("Serum");
    cy.intercept("GET", "**/rest/sample-type-tests?*").as("batchTypeTests");
    cy.get("#selectSampleType")
      .should("be.visible")
      .and("be.enabled")
      .should(($select) => {
        const $option = $select.find("option[value='2']");
        expect($option, "one original Serum type 2").to.have.length(1);
        expect(
          $option.text().trim(),
          "legal original Serum display",
        ).to.be.oneOf(["Serum", "血清"]);
      })
      .then(() => {
        this.expected.sampleTypeId = "2";
        cy.get("#selectSampleType").select("2").should("have.value", "2");
      });
    cy.wait("@batchTypeTests").then(({ request, response }) => {
      expectJSON(response);
      expect(String(request.query.sampleType)).to.eq(
        this.expected.sampleTypeId,
      );
      this.available = response.body;
    });
  }
  checkNamedCheckbox(kind, name) {
    const fixture = {
      "panel:Bilan Biochimique": {
        id: "1",
        names: ["Bilan Biochimique", "生化检验组合"],
      },
      "panel:Serologie VIH": {
        id: "4",
        names: ["Serologie VIH", "HIV血清学"],
      },
      "test:Creatinine": { id: "4", names: ["Creatinine", "肌酐"] },
      "test:DENGUE PCR": { names: ["DENGUE PCR"] },
      "test:HIV VIRAL LOAD": { names: ["HIV VIRAL LOAD"] },
    }[`${kind}:${name}`];
    expect(fixture, "original batch fixture selection").to.be.an("object");
    cy.contains(
      `label[for^='${kind}_']`,
      new RegExp(
        `^(?:${fixture.names.map(Cypress._.escapeRegExp).join("|")})$`,
      ),
    )
      .should("be.visible")
      .then(($label) => {
        const available = this.available[kind === "panel" ? "panels" : "tests"];
        const matching = available.filter((item) =>
          fixture.id
            ? String(item.id) === fixture.id
            : fixture.names.includes(item.name),
        );
        expect(matching, "one original object for Serum 2").to.have.length(1);
        expect(matching[0].name, "legal original display name").to.be.oneOf(
          fixture.names,
        );
        const expectedId = String(matching[0].id);
        const id = $label.attr("for");
        const value = id.slice(kind.length + 1);
        expect(value).to.match(/^[1-9]\d*$/);
        expect(value, "selected original object identity").to.eq(expectedId);
        expect(id).to.eq(`${kind}_${expectedId}`);
        if (kind === "panel") this.expected.panelIds.push(value);
        cy.get(`#${id}`).then(($input) => {
          if (!$input.prop("checked")) cy.wrap($label).click();
        });
        cy.get(`#${id}`).should("be.checked");
      });
    cy.get("input[id^='test_']:checked").then(($inputs) => {
      this.expected.testIds = [...$inputs].map((input) => input.id.slice(5));
    });
  }
  checkBilanPanel() {
    this.checkNamedCheckbox("panel", "Bilan Biochimique");
  }
  checkSerologiePanel() {
    this.checkNamedCheckbox("panel", "Serologie VIH");
  }
  checkDenguePCR() {
    this.checkNamedCheckbox("test", "DENGUE PCR");
  }
  checkHIVViralLoad() {
    this.checkNamedCheckbox("test", "HIV VIRAL LOAD");
  }
  checkCreatinine() {
    this.checkNamedCheckbox("test", "Creatinine");
  }
  selectMethod(method) {
    expect(["On Demand", "Pre-Printed"]).to.include(method);
    this.expected.method = method;
    cy.get("#method-dropdown").select(method).should("have.value", method);
  }
  checkFlag(id) {
    cy.get(`label[for='${id}']`).should("be.visible").click();
    cy.get(`#${id}`).should("be.checked");
  }
  checkFacilityCheckbox() {
    this.checkFlag("facility-checkbox");
  }
  checkPatientCheckbox() {
    this.checkFlag("patient-checkbox");
  }
  enterSiteName(siteName) {
    expect(siteName, "historical clinical site search term").to.eq("CAMES");
    // CAMES is the search input, not the persisted organization name. The
    // existing synthetic foundation institution is CAMES MAN, short code 279.
    cy.request({
      url: "/api/OpenELIS-Global/rest/SamplePatientEntry",
      followRedirect: false,
      headers: { Accept: "application/json" },
    }).then((read) => {
      expectJSON(read);
      const sites = read.body.sampleOrderItems.referringSiteList;
      expect(sites).to.be.an("array");
      const matching = sites.filter((site) => site.value === "279 - CAMES MAN");
      expect(
        matching,
        "one actual foundation institution, no first arbitrary suggestion",
      ).to.have.length(1);
      this.expected.siteId = String(matching[0].id);
      this.expected.siteName = "CAMES MAN";
      this.expected.siteDisplayName = matching[0].value;
      expect(this.expected.siteId).to.match(/^[1-9]\d*$/);
      cy.intercept("GET", "**/rest/departments-for-site?*").as(
        "batchDepartments",
      );
      cy.get("#siteName")
        .should("be.visible")
        .clear()
        .type(siteName, { delay: 0 });
      cy.contains(
        "[data-cy='auto-suggestion']",
        new RegExp(
          `^${Cypress._.escapeRegExp(this.expected.siteDisplayName)}$`,
        ),
        { timeout: 15000 },
      )
        .should("be.visible")
        .click();
      cy.wait("@batchDepartments").then(({ request, response }) => {
        expect(response?.statusCode).to.eq(200);
        expect(response.headers["content-type"]).to.match(/application\/json/i);
        expect(response.body).to.be.an("array");
        expect(String(request.query.refferingSiteId)).to.eq(
          this.expected.siteId,
        );
        this.departments = response.body;
      });
      cy.get("#siteName").should("have.value", this.expected.siteDisplayName);
    });
  }

  selectConfiguredDepartment() {
    cy.then(() => {
      expect(
        this.departments,
        "a real configured department is required; do not invent CAMES configuration",
      ).to.be.an("array").and.not.be.empty;
      const department = this.departments[0];
      this.expected.departmentId = String(department.id);
      this.expected.departmentName = department.value;
      expect(this.expected.departmentId).to.match(/^[1-9]\d*$/);
      cy.get("#requesterDepartmentId")
        .should("be.enabled")
        .select(this.expected.departmentId)
        .should("have.value", this.expected.departmentId);
    });
  }
  assertSamplePayload(body) {
    const xml = new DOMParser().parseFromString(
      body.sampleXML,
      "application/xml",
    );
    expect(xml.querySelector("parsererror")).to.eq(null);
    const samples = [...xml.querySelectorAll("samples > sample")];
    expect(samples).to.have.length(1);
    const sample = samples[0];
    expect(sample.getAttribute("sampleID")).to.eq(this.expected.sampleTypeId);
    expect(csv(sample.getAttribute("tests"))).to.have.members(
      this.expected.testIds,
    );
    expect(
      csv(sample.getAttribute("panels")),
      "selected panels must survive individual-test selection",
    ).to.have.members(this.expected.panelIds);
    expect(sample.getAttribute("date")).to.eq(body.currentDate);
    expect(sample.getAttribute("time")).to.eq(body.currentTime);
    expect(Number(sample.getAttribute("numOrderLabels"))).to.eq(1);
    expect(Number(sample.getAttribute("numSpecimenLabels"))).to.eq(1);
    return sample;
  }
  checkNextButtonEnabled() {
    cy.intercept("POST", "**/rest/SampleBatchEntry").as("batchSetupSave");
    cy.get("[data-testid='next-button-BatchOrderEntry']")
      .should("be.enabled")
      .wait(500)
      .click();
    cy.wait("@batchSetupSave").then(({ request, response }) => {
      expectJSON(response);
      const body = jsonBody(request);
      expect(body.method).to.eq(this.expected.method);
      expect(body.facilityIDCheck).to.eq(true);
      expect(body.PatientInfoCheck).to.eq(true);
      expect(String(body.sampleOrderItems.referringSiteId)).to.eq(
        this.expected.siteId,
      );
      expect(body.sampleOrderItems.referringSiteName).to.eq(
        this.expected.siteDisplayName,
      );
      expect(
        String(body.sampleOrderItems.referringSiteDepartmentId || ""),
      ).to.eq(this.expected.departmentId || "");
      if (this.expected.departmentId)
        expect(body.sampleOrderItems.referringSiteDepartmentName).to.eq(
          this.expected.departmentName,
        );
      this.assertSamplePayload(body);
      this.setup = body;
    });
    this.visitBatchOrderEntryPage();
  }
  field(selector, value, key) {
    this.expectedPatient[key] = String(value);
    cy.get(selector).should("be.visible").clear().type(String(value));
  }
  uniqueHealthIDNum(v) {
    this.field("#subjectNumber", v, "subjectNumber");
  }
  nationalID(v) {
    this.field("#nationalId", v, "nationalId");
  }
  firstName(v) {
    this.field("#firstName", v, "firstName");
  }
  lastName(v) {
    this.field("#lastName", v, "lastName");
  }
  typePatientYears(v) {
    cy.get("#years").clear().type(v);
  }
  typePatientMonths(v) {
    cy.get("#months").clear().type(v);
  }
  typePatientDays(v) {
    cy.get("#days").clear().type(v);
  }
  selectGender() {
    this.expectedPatient.gender = "F";
    cy.contains("label", labelPattern("patient.female"))
      .should("be.visible")
      .click();
    cy.get("#date-picker-default-id")
      .invoke("val")
      .then((display) => {
        this.expectedPatient.birthDateISO = dateISO(
          display,
          this.expected.datePattern,
        );
      });
  }
  clickNewPatientButton() {
    cy.get("[data-cy='newPatientTabButton']", { timeout: 15000 })
      .should("be.visible")
      .click();
  }
  clickSearchPatientButton() {
    cy.get("[data-cy='searchPatientTabButton']", { timeout: 15000 })
      .should("be.visible")
      .click();
  }
  selectExactSavedPatient(savedPatient) {
    cy.then(() => {
      expect(savedPatient?.patientId).to.match(/^[1-9]\d*$/);
      this.expectedPatient = {
        ...savedPatient,
        birthDateISO: savedPatient.birthDate,
      };
    });
    this.clickSearchPatientButton();
    cy.get("#firstName")
      .should("be.visible")
      .clear()
      .type(savedPatient.firstName);
    cy.get("#lastName").clear().type(savedPatient.lastName);
    cy.intercept("GET", "**/rest/patient-search-results?*").as(
      "batchPatientSearch",
    );
    cy.get("#local_search").should("be.enabled").click();
    cy.wait("@batchPatientSearch").then(({ response }) => {
      expectJSON(response);
      const exact = response.body.patientSearchResults.filter(
        (row) => String(row.patientID) === savedPatient.patientId,
      );
      expect(exact, "same patient saved in the on-demand batch").to.have.length(
        1,
      );
    });
    cy.intercept(
      "GET",
      `**/rest/patient-details?patientID=${savedPatient.patientId}`,
    ).as("batchPatientDetails");
    cy.get(`[data-cy='patient-result-row-${savedPatient.patientId}']`, {
      timeout: 10000,
    })
      .find("label.cds--radio-button__label")
      .should("be.visible")
      .click();
    cy.wait("@batchPatientDetails").then(({ response }) => {
      expectJSON(response);
      expect(String(response.body.patientPK)).to.eq(savedPatient.patientId);
      expect(response.body.nationalId).to.eq(savedPatient.nationalId);
    });
    cy.get("[data-cy='patientSelectionReady']").should("be.visible");
  }
  visitBatchOrderEntryPage() {
    cy.contains("h1,h2", labelPattern("order.entry.setup.batch")).should(
      "be.visible",
    );
  }
  typeLabNumber(labNumber) {
    expect(labNumber, "original legacy preprinted fixture").to.eq("123456");
    expect(this.expected.method, "unchanged manual preprinted workflow").to.eq(
      "Pre-Printed",
    );
    return cy
      .request({
        url: "/api/OpenELIS-Global/rest/labnumbermanagement",
        followRedirect: false,
        headers: { Accept: "application/json" },
      })
      .then((configuration) => {
        expectJSON(configuration);
        expect(configuration.body.labNumberType).to.eq("SITEYEARNUM");
        return cy.request({
          url: "/api/OpenELIS-Global/rest/SampleEntryGenerateScanProvider",
          followRedirect: false,
          headers: { Accept: "application/json" },
        });
      })
      .then((generated) => {
        expectJSON(generated);
        expect(generated.body.status).to.eq(true);
        const accession = generated.body.body;
        expect(accession, "server-prepared unique preprinted label").to.be.a(
          "string",
        ).and.not.be.empty;
        expect(accession).not.to.eq(labNumber);
        return cy
          .request({
            url: "/api/OpenELIS-Global/rest/SampleEntryAccessionNumberValidation",
            qs: {
              accessionNumber: accession,
              field: "labNo",
              isRequired: "true",
            },
            followRedirect: false,
            headers: { Accept: "application/json" },
          })
          .then((validation) => {
            expectJSON(validation);
            expect(
              validation.body.status,
              "same active format and unused label",
            ).to.eq(true);
            return cy.request({
              url: "/api/OpenELIS-Global/rest/order/saved",
              qs: { queryVersion: "2", labNumber: accession },
              failOnStatusCode: false,
              followRedirect: false,
              headers: { Accept: "application/json" },
            });
          })
          .then((absent) => {
            expect(absent.status).to.eq(404);
            expect(absent.headers["content-type"]).to.match(
              /application\/json/i,
            );
            expect(absent.body.code).to.eq("SAVED_ORDER_NOT_FOUND");
            cy.get("#labNo, #display_labNo")
              .filter(":visible")
              .should("have.length", 1)
              .clear()
              .type(accession);
            return cy
              .get("#labNo")
              .invoke("val")
              .then((value) => {
                this.expected.typedAccession = value;
                expect(value).to.eq(accession);
              });
          });
      });
  }
  clickGenerateAndSaveBarcode() {
    this.watchClinicalSaves();
    cy.intercept("GET", "**/rest/SampleEntryGenerateScanProvider").as(
      "batchGeneratedAccession",
    );
    cy.get("[data-testid='generate-barcode-link-BatchOrderEntry']")
      .should("be.visible")
      .click();
    cy.wait("@batchGeneratedAccession").then(({ response }) => {
      expectJSON(response);
      expect(response.body.status).to.eq(true);
      expect(response.body.body).to.be.a("string").and.not.be.empty;
      this.expected.accession = response.body.body;
    });
  }
  checkNextLabel() {
    return cy
      .get("[data-testid='next-button-BatchOrderEntry']")
      .should("be.enabled");
  }
  saveOrder() {
    this.watchClinicalSaves();
    cy.then(() => {
      this.expected.accession = this.expected.typedAccession;
    });
    cy.get("[data-testid='generate-barcode-btn-BatchOrderEntry']")
      .should("be.enabled")
      .click();
  }
  assertSavedOrder() {
    return cy.wait("@batchClinicalSave").then(({ request, response }) => {
      expectJSON(response);
      expect(response.body.error).to.be.undefined;
      const body = jsonBody(request);
      expect(
        body.sampleOrderItems.labNo,
        "only save the actual generated or scanned accession",
      ).to.eq(this.expected.accession);
      expect(body.method).to.eq(this.expected.method);
      expect(body.sampleOrderItems.referringSiteId).to.eq(this.expected.siteId);
      expect(body.sampleOrderItems.referringSiteName).to.eq(
        this.expected.siteDisplayName,
      );
      expect(
        String(body.sampleOrderItems.referringSiteDepartmentId || ""),
      ).to.eq(this.expected.departmentId || "");
      expect(body.sampleOrderItems.receivedDateForDisplay).to.eq(
        this.setup.sampleOrderItems.receivedDateForDisplay,
      );
      this.assertSamplePayload(body);
      const sentPatient = body.patientProperties;
      ["firstName", "lastName", "nationalId", "gender"].forEach((key) =>
        expect(sentPatient[key], key).to.eq(this.expectedPatient[key]),
      );
      if (this.expectedPatient.patientId)
        expect(String(sentPatient.patientPK)).to.eq(
          this.expectedPatient.patientId,
        );
      else
        expect(sentPatient.subjectNumber).to.eq(
          this.expectedPatient.subjectNumber,
        );
      expect(
        dateISO(sentPatient.birthDateForDisplay, this.expected.datePattern),
      ).to.eq(this.expectedPatient.birthDateISO);
      return cy
        .request({
          url: "/api/OpenELIS-Global/rest/order/saved",
          qs: { queryVersion: "2", labNumber: this.expected.accession },
          followRedirect: false,
          headers: { Accept: "application/json" },
        })
        .then((read) => {
          expectJSON(read);
          const saved = read.body;
          expect(saved.queryVersion).to.eq("2");
          expect(saved.labNumber).to.eq(this.expected.accession);
          expect(String(saved.orderId)).to.match(/^[1-9]\d*$/);
          expect(saved.samples).to.have.length(1);
          expect(saved.samples[0].sampleTypeId).to.eq(
            this.expected.sampleTypeId,
          );
          expect(
            dateISO(saved.samples[0].collectionDate, this.expected.datePattern),
          ).to.eq(dateISO(body.currentDate, this.expected.datePattern));
          expect(saved.sampleOrderItems.referringSiteId).to.eq(
            this.expected.siteId,
          );
          expect(saved.sampleOrderItems.referringSiteName).to.eq(
            this.expected.siteName,
          );
          expect(
            String(saved.sampleOrderItems.referringSiteDepartmentId || ""),
          ).to.eq(this.expected.departmentId || "");
          if (this.expected.departmentId)
            expect(saved.sampleOrderItems.referringSiteDepartmentName).to.eq(
              this.expected.departmentName,
            );
          expect(
            dateISO(
              saved.sampleOrderItems.receivedDateForDisplay,
              this.expected.datePattern,
            ),
          ).to.eq(
            dateISO(
              body.sampleOrderItems.receivedDateForDisplay,
              this.expected.datePattern,
            ),
          );
          const analyses = saved.samples.flatMap((sample) => sample.analyses);
          expect([
            ...new Set(analyses.map((row) => row.testId)),
          ]).to.have.members(this.expected.testIds);
          expect([
            ...new Set(analyses.map((row) => row.panelId).filter(Boolean)),
          ]).to.include.members(this.expected.panelIds);
          expect(saved.patient.patientId).to.match(/^[1-9]\d*$/);
          ["firstName", "lastName", "nationalId", "gender"].forEach((key) =>
            expect(saved.patient[key], key).to.eq(this.expectedPatient[key]),
          );
          expect(saved.patient.birthDate).to.eq(
            this.expectedPatient.birthDateISO,
          );
          if (this.expectedPatient.patientId)
            expect(saved.patient.patientId).to.eq(
              this.expectedPatient.patientId,
            );
          expect(
            this.saves,
            "exactly one clinical POST per label",
          ).to.have.length(1);
          expect(this.saves[0].sampleOrderItems.labNo).to.eq(saved.labNumber);
          return cy
            .get(".post-save-dialog__accession-tag")
            .should("contain.text", saved.labNumber)
            .then(() => saved);
        });
    });
  }
  clickFinishButton() {
    cy.get("[data-cy='finishButton']").should("be.visible").click();
    this.visitSetupPage();
    this.checkNextButtonDisabled();
  }
  cancelFreshSetupWithoutSave() {
    let attempted = 0;
    cy.intercept("POST", "**/rest/SamplePatientEntryBatch", () => {
      attempted += 1;
    });
    cy.get("[data-testid='cancel-button-BatchOrderEntry']")
      .should("be.visible")
      .click();
    cy.location("pathname").should("eq", "/");
    cy.get(".home-dashboard-container").should("be.visible");
    cy.then(() =>
      expect(attempted, "cancel must not submit a clinical order").to.eq(0),
    );
  }
}
export default BatchOrderEntry;
