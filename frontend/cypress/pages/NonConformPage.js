import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";
import originalFixture from "../fixtures/NonConform.json";

let rememberedReceipt = null;
const resolveOriginalNceNumber = (value) => {
  if (String(value) !== String(originalFixture.NceNumber)) return value;
  expect(
    rememberedReceipt,
    "original NCE placeholder requires a saved receipt",
  ).to.be.an("object");
  expect(rememberedReceipt.outcome).to.eq("APPLIED");
  expect(rememberedReceipt.operation).to.eq("CREATE");
  expect(rememberedReceipt.requestId).to.be.a("string").and.not.be.empty;
  expect(rememberedReceipt.nceNumber).to.be.a("string").and.not.be.empty;
  return rememberedReceipt.nceNumber;
};
const label = (key) =>
  new RegExp(
    [enMessages[key], zhMessages[key], zhCNMessages[key]]
      .map(Cypress._.escapeRegExp)
      .join("|"),
  );
const searchTypes = {
  "Last Name": "lastName",
  "First Name": "firstName",
  "Patient Identification Code": "STNumber",
  "Lab Number": "labNumber",
  "NCE Number": "nceNumber",
};

class NonConform {
  constructor(mode = "report") {
    this.mode = mode;
    this.registration = mode === "report";
    this.selectors = {
      //centralized selectors
      title: "h2",
      searchType: "#type",
      searchField: "[data-cy='fieldName']",
      searchButton: "[data-testid='nce-search-button']",
      searchResult: "[data-testid='nce-search-result']",
      nceNumberResult: "[data-testid='nce-number-result']",
      sampleCheckbox: "[data-testid='nce-sample-checkbox']",
      goToFormButton: "[data-testid='nce-goto-form-button']",
      startDate: "input#startDate",
      reportingUnits: "#reportingUnits",
      description: "#text-area-1",
      suspectedCause: "#text-area-2",
      correctiveActionText: "#text-area-3",
      descriptionAndComments: "#text-area-10",
      nceCategory: "#nceCategory",
      nceType: "#nceType",
      consequences: "#consequences",
      recurrence: "#recurrence",
      labComponent: "#labComponent",
      discussionDate: "#tdiscussionDate",
      proposedCorrectiveAction: "#text-area-corrective",
      dateCompleted: "#dateCompleted",
      actionTypeCheckbox: "#correctiveAction",
      resolutionYes: "span:contains('Yes')",
      dateCompleted0: ".cds--date-picker-input__wrapper > #dateCompleted-0",
      submitButton: "[data-testid='nce-submit-button']",
      radioTable: "table",
      radioButton: 'input[type="radio"][name="radio-group"]',
    };
  }

  getReportNonConformTitle() {
    return cy
      .contains(
        ".nce-registration-modal .cds--modal-header__heading",
        label("nce.form.title"),
      )
      .should("be.visible");
  }

  getViewNonConformTitle() {
    return cy
      .contains(
        "h2",
        label(
          this.mode === "capa"
            ? "nonconform.corrective.title"
            : "nonconform.view.report",
        ),
      )
      .should("be.visible");
  }

  selectSearchType(type) {
    expect(searchTypes[type], "preserved patient/NCE search category").to.be.a(
      "string",
    );
    this.searchType = type;
    if (this.registration) {
      cy.get("body").then(($body) => {
        if (!$body.find(".nce-registration-modal.is-visible").length) {
          cy.contains(
            ".nce-dashboard-header button",
            label("nce.button.reportNce"),
          )
            .should("be.visible")
            .and("be.enabled")
            .click();
        }
      });
      cy.get(".nce-registration-modal #search-type")
        .scrollIntoView()
        .should("be.visible")
        .select(searchTypes[type]);
    } else cy.get("#type").should("be.visible").select(searchTypes[type]);
  }

  enterSearchField(value) {
    const target =
      this.searchType === "NCE Number"
        ? resolveOriginalNceNumber(value)
        : value;
    this.searchValue = target;
    cy.get(this.registration ? "#search-value" : this.selectors.searchField)
      .clear()
      .type(target);
  }

  clickSearchButton() {
    if (this.registration) {
      cy.intercept("GET", "**/rest/nce/registration/orders?*").as("nceOrders");
      cy.contains(".nce-order-search button", label("label.button.search"))
        .scrollIntoView()
        .should("be.visible")
        .and("be.enabled")
        .click();
      cy.wait("@nceOrders").then(({ request, response }) => {
        expect(response.statusCode).to.eq(200);
        expect(response.body.orders).to.be.an("array");
        expect(new URL(request.url).searchParams.get("value")).to.eq(
          this.searchValue,
        );
        this.orders = response.body.orders;
      });
    } else {
      const endpoint =
        this.mode === "capa"
          ? "nonconformingcorrectiveaction"
          : "viewNonConformEvents";
      cy.intercept("GET", `**/rest/${endpoint}?*`).as("nceLegacySearch");
      cy.get(this.selectors.searchButton)
        .should("be.visible")
        .and("be.enabled")
        .click();
      cy.wait("@nceLegacySearch").then(({ request, response }) => {
        expect(response.statusCode).to.eq(200);
        expect(response.body.nceEventsSearchResults).to.be.an("array").and.not
          .be.empty;
        expect(
          new URL(request.url).searchParams.get(searchTypes[this.searchType]),
        ).to.eq(this.searchValue);
        if (response.body.nceEventsSearchResults.length > 1) {
          cy.fixture("NonConform").then((fixture) => {
            const rememberedNumber = resolveOriginalNceNumber(
              fixture.NceNumber,
            );
            const selected = response.body.nceEventsSearchResults.find(
              (row) => String(row.nceNumber) !== String(rememberedNumber),
            );
            expect(selected, "separate real event for lab-number workflow").to
              .exist;
            this.activeNceNumber = String(selected.nceNumber);
            cy.contains("tbody tr", this.activeNceNumber).within(() => {
              cy.get("input[name='radio-group']")
                .invoke("attr", "id")
                .then((id) => {
                  cy.get(`label[for='${id}']`).should("be.visible").click();
                });
            });
          });
        }
      });
    }
  }

  validateSearchResult(expectedValue) {
    this.labNumber = expectedValue;
    cy.contains(".nce-order-result h4", expectedValue).should("be.visible");
    cy.then(() =>
      expect(
        this.orders.some((row) => row.labNumber === expectedValue),
        "same server order identity",
      ).to.eq(true),
    );
  }

  validateLabNoSearchResult(labNo) {
    cy.get(this.selectors.searchResult).invoke("text").should("eq", labNo);
  }

  validateNCESearchResult(NCENo) {
    const expected = resolveOriginalNceNumber(NCENo);
    cy.get(this.selectors.nceNumberResult)
      .invoke("text")
      .should("eq", expected);
  }

  clickCheckbox() {
    cy.fixture("Patient").then((patient) => {
      const labNumber = this.labNumber || patient.labNo;
      cy.contains(".nce-order-result h4", labNumber)
        .parent()
        .within(() => {
          cy.get("input[id^='nce-specimen-']").each(($input) => {
            expect($input.prop("disabled"), "real specimen selectable").to.eq(
              false,
            );
            cy.get(`label[for='${$input.attr("id")}']`)
              .scrollIntoView()
              .should("be.visible")
              .click();
            cy.wrap($input).should("be.checked");
          });
        });
    });
  }

  clickGoToNceFormButton() {
    cy.contains(
      ".nce-registration-modal button",
      label("nce.button.linkSelected"),
    )
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get(".nce-linked-samples li").should("have.length.greaterThan", 0);
  }

  enterStartDate(date) {
    this.fillFixtureDate("#date-of-event", date);
    cy.fixture("NonConform").then((fixture) => {
      cy.get("#nce-category option").then(($options) => {
        const names = [
          fixture.nceCategory,
          ...Object.entries(enMessages)
            .filter(
              ([key, value]) =>
                key.startsWith("nce.category.") &&
                value === fixture.nceCategory,
            )
            .flatMap(([key]) => [zhMessages[key], zhCNMessages[key]]),
        ].filter(Boolean);
        const option = [...$options].find((item) =>
          names.includes(item.textContent),
        );
        expect(option, "fixture category in real configured metadata").to.exist;
        cy.get("#nce-category").select(option.value);
      });
      // Explicit synthetic scenario classification; never a hospital default.
      cy.get("label[for='nce-severity-MINOR']")
        .scrollIntoView()
        .should("be.visible")
        .click();
      cy.get("#nce-severity-MINOR").should("be.checked");
    });
  }

  selectReportingUnit(unit) {
    expect(unit, "original Serology-Immunology fixture").to.eq(
      "Serology-Immunology",
    );
    cy.get("#reporting-unit")
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled")
      .should(($select) => {
        const $option = $select.find("option[value='117']");
        expect($option, "one original professional group 117").to.have.length(
          1,
        );
        expect(
          $option.text().trim(),
          "legal original group display",
        ).to.be.oneOf(["Serology-Immunology", "血清免疫学"]);
      })
      .select("117")
      .should("have.value", "117");
  }

  enterDescription(description) {
    cy.get(this.registration ? "#nce-description" : this.selectors.description)
      .scrollIntoView()
      .should("be.visible")
      .clear()
      .type(description);
  }

  enterSuspectedCause(suspectedCause) {
    cy.get(
      this.registration
        ? "#nce-suspectedCauses"
        : this.selectors.suspectedCause,
    )
      .scrollIntoView()
      .should("be.visible")
      .clear()
      .type(suspectedCause);
  }

  enterCorrectiveAction(correctiveAction) {
    cy.get(
      this.registration
        ? "#nce-proposedAction"
        : this.selectors.correctiveActionText,
    )
      .scrollIntoView()
      .should("be.visible")
      .clear()
      .type(correctiveAction);
  }

  enterNceCategory(nceCategory) {
    cy.get(this.selectors.nceCategory).select(nceCategory);
  }

  enterNceType(nceType) {
    cy.get(this.selectors.nceType).select(nceType);
  }

  enterConsequences(consequences) {
    cy.get(this.selectors.consequences).select(consequences);
  }

  enterRecurrence(recurrence) {
    cy.get(this.selectors.recurrence).select(recurrence);
  }

  enterLabComponent(labComponent) {
    cy.get(this.selectors.labComponent).select(labComponent);
  }

  enterDescriptionAndComments(testText) {
    cy.get(this.selectors.descriptionAndComments).type(testText);
    cy.get(this.selectors.correctiveActionText).type(testText);
    cy.get(this.selectors.suspectedCause).type(testText);
  }

  enterDiscussionDate(date) {
    this.fillFixtureDate(this.selectors.discussionDate, date);
  }

  enterProposedCorrectiveAction(action) {
    cy.get(this.selectors.proposedCorrectiveAction)
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled")
      .clear()
      .type(action);
  }

  enterDateCompleted(date) {
    this.fillFixtureDate(this.selectors.dateCompleted, date);
  }

  selectActionType() {
    cy.get("label[for='correctiveAction']")
      .first()
      .scrollIntoView()
      .should("be.visible")
      .click();
    cy.get("#correctiveAction").first().should("be.checked");
  }

  checkResolution() {
    cy.contains("label.cds--radio-button__label", label("yes.option"))
      .scrollIntoView()
      .should("be.visible")
      .click();
  }

  enterDateCompleted0(date) {
    this.fillFixtureDate(this.selectors.dateCompleted0, date);
  }

  submitForm() {
    if (!this.registration) {
      cy.intercept("POST", "**/rest/viewNonConformEvents").as(
        "nceLegacyReviewSave",
      );
      cy.get(this.selectors.submitButton)
        .scrollIntoView()
        .should("be.visible")
        .and("be.enabled")
        .click();
      cy.wait("@nceLegacyReviewSave").then(({ request, response }) => {
        expect(response.statusCode).to.eq(200);
        expect(response.body.success, "actual review persistence").to.eq(true);
        const command =
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body;
        expect(command.id, "same event identity").to.exist;
      });
      return;
    }
    const rememberNumber = this.rememberNextNumber === true;
    this.rememberNextNumber = false;
    cy.intercept("POST", "**/rest/nce/registration?queryVersion=2").as(
      "nceRegistrationSave",
    );
    cy.contains(".nce-form-actions button", label("nce.button.submit"))
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@nceRegistrationSave").then(({ request, response }) => {
      expect(response.statusCode).to.be.oneOf([200, 201]);
      const command =
        typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      expect(command.severity).to.eq("MINOR");
      expect(
        String(command.reportingUnit),
        "original professional group",
      ).to.eq("117");
      expect(command.linkedSpecimens).to.have.length.greaterThan(0);
      expect(response.body.outcome).to.eq("APPLIED");
      expect(response.body.operation).to.eq("CREATE");
      expect(response.body.requestId).to.eq(command.requestId);
      expect(response.body.nceNumber).to.be.a("string").and.not.be.empty;
      this.savedNumber = response.body.nceNumber;
      if (rememberNumber) {
        expect(
          response.body.requestId,
          "same marked registration receipt",
        ).to.be.a("string").and.not.be.empty;
        rememberedReceipt = Object.freeze({
          outcome: response.body.outcome,
          operation: response.body.operation,
          requestId: response.body.requestId,
          nceNumber: response.body.nceNumber,
        });
      }
    });
    cy.get(".nce-registration-modal.is-visible").should("not.exist");
    cy.then(() =>
      cy.contains(".nce-list-item", this.savedNumber).should("be.visible"),
    );
  }

  clickSubmitButton() {
    cy.intercept("POST", "**/rest/NCECorrectiveAction").as("nceCapaSave");
    cy.get(this.selectors.submitButton)
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@nceCapaSave").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(
        response.body.success,
        "actual corrective action persistence",
      ).to.eq(true);
      const command =
        typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      expect(command.id, "same event identity").to.exist;
      expect(command.actionLog).to.be.an("array").and.not.be.empty;
    });
  }

  checkRadioButton() {
    cy.get(this.selectors.radioTable).should("be.visible");
    cy.get(this.selectors.radioButton).should("exist");
    return cy
      .get("tbody tr")
      .first()
      .within(() => {
        cy.get(this.selectors.radioButton)
          .should("exist")
          .click({ force: true });
      });
  }

  fillFixtureDate(selector, fixtureDate) {
    const [day, month, year] = fixtureDate.split("/");
    cy.get(selector)
      .scrollIntoView()
      .should("be.visible")
      .then(($input) => {
        const placeholder = $input.attr("placeholder") || "";
        const value = /^(?:Y|y|\u5e74)/.test(placeholder)
          ? `${year}/${month}/${day}`
          : fixtureDate;
        cy.wrap($input).clear().type(value).blur().should("have.value", value);
      });
  }

  getAndSaveNceNumber() {
    // The number is allocated at commit; remember only the actual receipt.
    rememberedReceipt = null;
    this.rememberNextNumber = true;
    cy.get("#nce-number").should("have.attr", "readonly");
  }
}

export default NonConform;
