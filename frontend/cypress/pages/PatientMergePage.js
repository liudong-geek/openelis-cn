let mergeRequestSequence = 0;

class PatientMergePage {
  // Selectors
  selectors = {
    // Page elements
    pageTitle: "h2",
    progressIndicator: ".patientMergeProgress",
    progressSteps: ".cds--progress-step",
    errorNotification: ".cds--inline-notification--error",
    warningNotification: ".cds--inline-notification--warning",

    // Step 1: Patient Selection - Panel 1 (First Patient)
    patient1PatientId: "#patient1-patientId",
    patient1FirstName: "#patient1-firstName",
    patient1LastName: "#patient1-lastName",
    patient1Male: "#patient1-male",
    patient1Female: "#patient1-female",

    // Step 1: Patient Selection - Panel 2 (Second Patient)
    patient2PatientId: "#patient2-patientId",
    patient2FirstName: "#patient2-firstName",
    patient2LastName: "#patient2-lastName",
    patient2Male: "#patient2-male",
    patient2Female: "#patient2-female",

    // Search controls
    searchButton: "button[type='submit']",
    externalSearchButton: ".cds--btn--tertiary",

    // Search results
    searchResultsTable: ".cds--data-table tbody",
    searchResultsRow: ".cds--data-table tbody tr",
    patientRadioSelect: "input[type='radio']",
    patientResultsContainer: ".patientSearchResults",

    // Patient cards (selected patients)
    patientCard: ".selectedPatientCard",
    patientCardHeader: ".selectedPatientHeader",
    patientCardSection: ".patientCardSection",
    clearPatientButton: ".selectedPatientHeader button",
    patientStatistics: ".patientStatistics",

    // Empty state
    emptySearchResults: ".emptySearchResults",

    // Step 1: Selection container
    patientSelectionContainer: ".patientSelectionContainer",

    // Step 2: Primary Selection
    primarySelectionContainer: ".primarySelectionContainer",
    primaryPatientRadio1: "#patient-1",
    primaryPatientRadio2: "#patient-2",
    patientAccordion: ".patientAccordion",
    demographicsSection: ".demographicsGrid",
    clinicalSummary: ".clinicalSummary",
    identifiersList: ".identifiersList",
    warningBanner: ".warningBanner",

    // Step 3: Confirmation
    confirmationContainer: ".confirmationContainer",
    criticalWarning: ".criticalWarningBanner",
    mergeSummary: ".mergeSummarySection",
    dataConsolidation: ".dataConsolidationSection",
    identifiersPreserve: ".identifiersPreserveSection",
    conflictingInfo: ".conflictingInfoSection",
    mergeReasonTextArea: "#mergeReason",
    confirmCheckbox: "#confirmMerge",

    // Navigation buttons (more specific selectors for wizard buttons)
    backButton:
      ".patientMergeNavigation .navigationLeft button.cds--btn--secondary",
    cancelButton:
      ".patientMergeNavigation .navigationRight button.cds--btn--ghost",
    nextStepButton:
      ".patientMergeNavigation .navigationRight button.cds--btn--primary",
    confirmMergeButton:
      ".patientMergeNavigation .navigationRight button.cds--btn--danger",

    // Loading state
    loadingOverlay: ".cds--loading-overlay",

    // Success notification
    successNotification: ".cds--toast-notification--success",
  };

  visit() {
    cy.visit("/PatientMerge");
    cy.get(this.selectors.progressIndicator).should("be.visible");
    cy.get(this.selectors.patient1PatientId).should("be.visible");
    cy.get(this.selectors.patient2PatientId).should("be.visible");
    return this;
  }

  // ==================== Page Elements ====================

  getPageTitle() {
    return cy.get(this.selectors.pageTitle).first();
  }

  getProgressIndicator() {
    return cy.get(this.selectors.progressIndicator);
  }

  verifyOnStep(stepNumber) {
    cy.get(this.selectors.progressSteps)
      .eq(stepNumber - 1)
      .should("have.class", "cds--progress-step--current");
  }

  // ==================== Step 1: Patient Selection ====================

  // Patient 1 Panel
  enterPatient1NationalId(nationalId) {
    cy.get(this.selectors.patient1PatientId).clear().type(nationalId);
    return this;
  }

  enterPatient1FirstName(firstName) {
    cy.get(this.selectors.patient1FirstName).clear().type(firstName);
    return this;
  }

  enterPatient1LastName(lastName) {
    cy.get(this.selectors.patient1LastName).clear().type(lastName);
    return this;
  }

  selectPatient1Gender(gender) {
    if (gender === "M") {
      cy.get(this.selectors.patient1Male).click({ force: true });
    } else {
      cy.get(this.selectors.patient1Female).click({ force: true });
    }
    return this;
  }

  searchPatient1(expectedPatientId = "") {
    const alias = `mergePatientSearch${++mergeRequestSequence}`;
    cy.intercept("GET", "**/rest/patient-search-results?*", (request) => {
      const requestUrl = new URL(request.url);
      if (
        !expectedPatientId ||
        requestUrl.searchParams.get("nationalID") === expectedPatientId
      ) {
        request.alias = alias;
      }
    });
    cy.get(this.selectors.patient1PatientId)
      .closest(".patientSelectionSection")
      .find(this.selectors.searchButton)
      .should("be.enabled")
      .click();
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "first-patient search status").to.eq(200);
      expect(response?.body?.patientSearchResults).to.be.an("array");
    });
    return this;
  }

  selectPatient1FromResults(identifier) {
    const alias = `mergePatientDetails${++mergeRequestSequence}`;
    cy.intercept("GET", "**/rest/patient/merge/details/*").as(alias);
    cy.get(this.selectors.patient1PatientId)
      .closest(".patientSelectionSection")
      .contains(this.selectors.searchResultsRow, identifier)
      .should("have.length", 1)
      .within(() => {
        cy.get(this.selectors.patientRadioSelect)
          .invoke("attr", "id")
          .then((radioId) => {
            expect(radioId, "first-patient result radio id").to.be.a("string");
            cy.get(`label[for='${radioId}']`).should("be.visible").click();
          });
      });
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "first-patient details status").to.eq(200);
    });
    cy.get(this.selectors.patientSelectionContainer)
      .contains(this.selectors.patientCard, identifier)
      .should("have.length", 1)
      .should("be.visible")
      .and("contain.text", identifier);
    return this;
  }

  verifyPatient1Selected() {
    // Verify patient card is shown and not in empty state
    cy.get(this.selectors.patientSelectionContainer)
      .find(this.selectors.patientCard)
      .first()
      .should("be.visible")
      .and("not.have.class", "empty");
    return this;
  }

  clearPatient1Selection() {
    // Click the clear button on the first patient card
    cy.get(this.selectors.patientSelectionContainer)
      .find(this.selectors.clearPatientButton)
      .first()
      .click();
    return this;
  }

  // Patient 2 Panel
  enterPatient2NationalId(nationalId) {
    cy.get(this.selectors.patient2PatientId).clear().type(nationalId);
    return this;
  }

  enterPatient2FirstName(firstName) {
    cy.get(this.selectors.patient2FirstName).clear().type(firstName);
    return this;
  }

  enterPatient2LastName(lastName) {
    cy.get(this.selectors.patient2LastName).clear().type(lastName);
    return this;
  }

  selectPatient2Gender(gender) {
    if (gender === "M") {
      cy.get(this.selectors.patient2Male).click({ force: true });
    } else {
      cy.get(this.selectors.patient2Female).click({ force: true });
    }
    return this;
  }

  searchPatient2(expectedPatientId = "") {
    const alias = `mergePatientSearch${++mergeRequestSequence}`;
    cy.intercept("GET", "**/rest/patient-search-results?*", (request) => {
      const requestUrl = new URL(request.url);
      if (
        !expectedPatientId ||
        requestUrl.searchParams.get("nationalID") === expectedPatientId
      ) {
        request.alias = alias;
      }
    });
    cy.get(this.selectors.patient2PatientId)
      .closest(".patientSelectionSection")
      .find(this.selectors.searchButton)
      .should("be.enabled")
      .click();
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "second-patient search status").to.eq(200);
      expect(response?.body?.patientSearchResults).to.be.an("array");
    });
    return this;
  }

  selectPatient2FromResults(identifier) {
    const alias = `mergePatientDetails${++mergeRequestSequence}`;
    cy.intercept("GET", "**/rest/patient/merge/details/*").as(alias);
    cy.get(this.selectors.patient2PatientId)
      .closest(".patientSelectionSection")
      .contains(this.selectors.searchResultsRow, identifier)
      .should("have.length", 1)
      .within(() => {
        cy.get(this.selectors.patientRadioSelect)
          .invoke("attr", "id")
          .then((radioId) => {
            expect(radioId, "second-patient result radio id").to.be.a("string");
            cy.get(`label[for='${radioId}']`).should("be.visible").click();
          });
      });
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "second-patient details status").to.eq(200);
    });
    cy.get(this.selectors.patientSelectionContainer)
      .contains(this.selectors.patientCard, identifier)
      .should("have.length", 1)
      .should("be.visible")
      .and("contain.text", identifier);
    return this;
  }

  verifyPatient2Selected() {
    cy.get(".patientSelectionSection")
      .last()
      .find(this.selectors.patientCard)
      .should("be.visible");
    return this;
  }

  clearPatient2Selection() {
    cy.get(".patientSelectionSection")
      .last()
      .find(this.selectors.searchDifferentButton)
      .click();
    return this;
  }

  // Combined search and select helpers
  searchAndSelectPatient1(searchCriteria) {
    if (searchCriteria.nationalId) {
      this.enterPatient1NationalId(searchCriteria.nationalId);
    }
    if (searchCriteria.firstName) {
      this.enterPatient1FirstName(searchCriteria.firstName);
    }
    if (searchCriteria.lastName) {
      this.enterPatient1LastName(searchCriteria.lastName);
    }
    const identifier =
      searchCriteria.nationalId ||
      searchCriteria.firstName ||
      searchCriteria.lastName;
    this.searchPatient1(searchCriteria.nationalId || "");
    this.selectPatient1FromResults(identifier);
    return this;
  }

  searchAndSelectPatient2(searchCriteria) {
    if (searchCriteria.nationalId) {
      this.enterPatient2NationalId(searchCriteria.nationalId);
    }
    if (searchCriteria.firstName) {
      this.enterPatient2FirstName(searchCriteria.firstName);
    }
    if (searchCriteria.lastName) {
      this.enterPatient2LastName(searchCriteria.lastName);
    }
    const identifier =
      searchCriteria.nationalId ||
      searchCriteria.firstName ||
      searchCriteria.lastName;
    this.searchPatient2(searchCriteria.nationalId || "");
    this.selectPatient2FromResults(identifier);
    return this;
  }

  // ==================== Step 2: Primary Selection ====================

  selectPatient1AsPrimary() {
    cy.get("label[for='patient-1']").should("be.visible").click();
    cy.get(this.selectors.primaryPatientRadio1).should("be.checked");
    return this;
  }

  selectPatient2AsPrimary() {
    cy.get("label[for='patient-2']").should("be.visible").click();
    cy.get(this.selectors.primaryPatientRadio2).should("be.checked");
    return this;
  }

  verifyPrimarySelectionWarningVisible() {
    cy.get(this.selectors.warningBanner).should("be.visible");
    return this;
  }

  expandDemographicsAccordion(patientNumber) {
    cy.get(this.selectors.patientAccordion)
      .eq(patientNumber - 1)
      .contains("button", "Demographics")
      .click();
    return this;
  }

  expandClinicalSummaryAccordion(patientNumber) {
    cy.get(this.selectors.patientAccordion)
      .eq(patientNumber - 1)
      .contains("button", "Clinical Summary")
      .click();
    return this;
  }

  expandIdentifiersAccordion(patientNumber) {
    cy.get(this.selectors.patientAccordion)
      .eq(patientNumber - 1)
      .contains("button", "Identifiers")
      .click();
    return this;
  }

  verifyPatientDemographicsVisible(patientNumber) {
    cy.get(this.selectors.demographicsSection)
      .eq(patientNumber - 1)
      .should("be.visible");
    return this;
  }

  verifyClinicalSummaryVisible(patientNumber) {
    cy.get(this.selectors.clinicalSummary)
      .eq(patientNumber - 1)
      .should("be.visible");
    return this;
  }

  // ==================== Step 3: Confirmation ====================

  verifyCriticalWarningVisible() {
    cy.get(this.selectors.criticalWarning).should("be.visible");
    return this;
  }

  verifyMergeSummaryVisible() {
    cy.get(this.selectors.mergeSummary).should("be.visible");
    return this;
  }

  verifyDataConsolidationVisible() {
    cy.get(this.selectors.dataConsolidation).should("be.visible");
    return this;
  }

  verifyConflictingInfoVisible() {
    cy.get(this.selectors.conflictingInfo).should("be.visible");
    return this;
  }

  verifyNoConflictingInfo() {
    cy.get(this.selectors.conflictingInfo).should("not.exist");
    return this;
  }

  enterMergeReason(reason) {
    cy.get(this.selectors.mergeReasonTextArea).clear().type(reason);
    return this;
  }

  checkConfirmationCheckbox() {
    cy.get("label[for='confirmMerge']").should("be.visible").click();
    cy.get(this.selectors.confirmCheckbox).should("be.checked");
    return this;
  }

  uncheckConfirmationCheckbox() {
    cy.get(this.selectors.confirmCheckbox).uncheck({ force: true });
    return this;
  }

  // ==================== Navigation ====================

  clickNextStep() {
    cy.get(this.selectors.progressSteps).then(($steps) => {
      const currentStep = [...$steps].findIndex((step) =>
        step.classList.contains("cds--progress-step--current"),
      );
      expect(currentStep, "current merge step").to.be.at.least(0);
      if (currentStep === 0) {
        const alias = `mergeCompareDetails${++mergeRequestSequence}`;
        cy.intercept("GET", "**/rest/patient/merge/details/*").as(alias);
        cy.get(this.selectors.nextStepButton)
          .filter(":visible")
          .should("have.length", 1)
          .and("not.be.disabled")
          .click();
        cy.wait([`@${alias}`, `@${alias}`]).each(({ response }) => {
          expect(response?.statusCode, "compare details status").to.eq(200);
        });
      } else {
        cy.get(this.selectors.nextStepButton)
          .filter(":visible")
          .should("have.length", 1)
          .and("not.be.disabled")
          .click();
      }
      cy.get(this.selectors.progressSteps)
        .eq(currentStep + 1)
        .should("have.class", "cds--progress-step--current");
    });
    return this;
  }

  clickBack() {
    cy.get(this.selectors.progressSteps).then(($steps) => {
      const currentStep = [...$steps].findIndex((step) =>
        step.classList.contains("cds--progress-step--current"),
      );
      cy.get(this.selectors.backButton)
        .filter(":visible")
        .should("have.length", 1)
        .click();
      cy.get(this.selectors.progressSteps)
        .eq(currentStep - 1)
        .should("have.class", "cds--progress-step--current");
    });
    return this;
  }

  clickCancel() {
    cy.get(this.selectors.cancelButton).filter(":visible").first().click();
    return this;
  }

  clickConfirmMerge() {
    const alias = `executePatientMerge${++mergeRequestSequence}`;
    cy.intercept("POST", "**/rest/patient/merge/execute").as(alias);
    cy.get(this.selectors.confirmMergeButton)
      .filter(":visible")
      .should("have.length", 1)
      .should("not.be.disabled")
      .click();
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "patient merge status").to.eq(200);
      expect(response?.body?.primaryPatientId, "surviving patient id").to.exist;
      expect(response?.body?.mergedPatientId, "merged patient id").to.exist;
      expect(response?.body?.auditId, "patient merge audit id").to.exist;
    });
    return this;
  }

  // ==================== Button State Verification ====================

  verifyNextStepDisabled() {
    cy.get(this.selectors.nextStepButton)
      .filter(":visible")
      .first()
      .should("be.disabled");
    return this;
  }

  verifyNextStepEnabled() {
    cy.get(this.selectors.nextStepButton)
      .filter(":visible")
      .first()
      .should("not.be.disabled");
    return this;
  }

  verifyConfirmMergeDisabled() {
    cy.get(this.selectors.confirmMergeButton)
      .filter(":visible")
      .first()
      .should("be.disabled");
    return this;
  }

  verifyConfirmMergeEnabled() {
    cy.get(this.selectors.confirmMergeButton)
      .filter(":visible")
      .first()
      .should("not.be.disabled");
    return this;
  }

  // ==================== Error and Success Verification ====================

  verifyErrorNotification(expectedText = null) {
    if (expectedText) {
      cy.get(this.selectors.errorNotification).should(
        "contain.text",
        expectedText,
      );
    } else {
      cy.get(this.selectors.errorNotification).should("be.visible");
    }
    return this;
  }

  verifyWarningNotification() {
    cy.get(this.selectors.warningNotification).should("be.visible");
    return this;
  }

  verifySuccessNotification() {
    cy.get(this.selectors.successNotification).should("be.visible");
    return this;
  }

  verifyMergeSuccess() {
    cy.location("pathname").should(
      "match",
      /^\/PatientManagement\/[1-9][0-9]*$/,
    );
    cy.get("#patient-management-title").should("be.visible");
    return this;
  }

  assertPatient1SearchResult(identifier, firstName, lastName) {
    cy.get(this.selectors.patient1PatientId)
      .closest(".patientSelectionSection")
      .contains(this.selectors.searchResultsRow, identifier)
      .should("have.length", 1)
      .and("contain.text", firstName)
      .and("contain.text", lastName);
    return this;
  }

  // ==================== Loading State ====================

  waitForLoading() {
    cy.get(this.selectors.loadingOverlay).should("not.exist");
    return this;
  }

  // ==================== Full Workflow Helpers ====================

  /**
   * Complete Step 1: Select two patients
   */
  completeStep1(patient1Search, patient2Search) {
    this.searchAndSelectPatient1(patient1Search);
    this.verifyPatient1Selected();
    this.searchAndSelectPatient2(patient2Search);
    this.verifyPatient2Selected();
    this.clickNextStep();
    return this;
  }

  /**
   * Complete Step 2: Select primary patient
   */
  completeStep2(primaryPatientNumber = 1) {
    if (primaryPatientNumber === 1) {
      this.selectPatient1AsPrimary();
    } else {
      this.selectPatient2AsPrimary();
    }
    this.clickNextStep();
    return this;
  }

  /**
   * Complete Step 3: Confirm merge
   */
  completeStep3(mergeReason) {
    this.enterMergeReason(mergeReason);
    this.checkConfirmationCheckbox();
    this.clickConfirmMerge();
    return this;
  }

  /**
   * Complete full merge workflow
   */
  completeFullMergeWorkflow(
    patient1Search,
    patient2Search,
    primaryPatientNumber,
    mergeReason,
  ) {
    this.completeStep1(patient1Search, patient2Search);
    this.completeStep2(primaryPatientNumber);
    this.completeStep3(mergeReason);
    return this;
  }
}

export default PatientMergePage;
