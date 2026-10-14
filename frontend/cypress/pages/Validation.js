import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

const label = (key) =>
  new RegExp(
    [enMessages[key], zhMessages[key], zhCNMessages[key]]
      .map(Cypress._.escapeRegExp)
      .join("|"),
  );

class Validation {
  checkForHeading() {
    cy.get("#validation-page-title")
      .should("be.visible")
      .invoke("text")
      .should("match", label("sidenav.label.validation"));
  }

  observeReviewQuery() {
    cy.intercept("GET", "**/rest/AccessionValidation?*").as(
      "currentReviewQuery",
    );
  }

  verifyReviewQuery(expected) {
    cy.wait("@currentReviewQuery").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.resultList).to.be.an("array");
      expect(response.body.queryId).to.be.a("string").and.not.be.empty;
      const query = new URL(request.url).searchParams;
      for (const [key, value] of Object.entries(expected))
        expect(query.get(key), key).to.eq(value);
      this.lastRows = response.body.resultList;
      if (this.lastRows.length === 0) {
        cy.get(".validation-empty-state")
          .should("be.visible")
          .invoke("text")
          .should("match", label("validation.queryState.ready.title"));
      }
    });
  }

  selectTestUnit(unitType) {
    // The retained fixture's original professional group remains ID 117.
    expect(unitType, "original Serology-Immunology fixture").to.eq(
      "Serology-Immunology",
    );
    this.observeReviewQuery();
    cy.get("#unitType")
      .should("be.visible")
      .and("be.enabled")
      .should(($select) => {
        const $option = $select.find("option[value='117']");
        expect($option, "one fixed professional group 117").to.have.length(1);
        expect(
          $option.text().trim(),
          "legal display for original group",
        ).to.be.oneOf(["Serology-Immunology", "血清免疫学"]);
      })
      .select("117")
      .should("have.value", "117")
      .find("option:selected")
      .then(($option) => {
        expect($option.val(), "selected original professional group").to.eq(
          "117",
        );
        this.verifyReviewQuery({ unitType: "117" });
      });
  }

  validateTestUnit(unitType) {
    cy.get("[data-testid='sampleInfo']").should("contain.text", unitType);
  }

  enterLabNumberAndSearch(labNo) {
    this.observeReviewQuery();
    cy.get("#accessionNumber").should("be.visible").clear().type(labNo);
    cy.get("[data-testid='Search-btn']")
      .should("be.visible")
      .and("be.enabled")
      .click();
    this.verifyReviewQuery({ accessionNumber: labNo });
  }

  saveResults() {
    // The retired case submitted without a selected review decision. Verify
    // the current guard rather than choosing a clinical outcome implicitly.
    cy.intercept("POST", "**/rest/*Validation*").as("unselectedReviewPosts");
    cy.then(() => {
      expect(this.lastRows, "real queried review rows").to.be.an("array");
      if (this.lastRows.length) {
        cy.get(
          "input[type='checkbox'][name$='.isAccepted'], input[type='checkbox'][name$='.isRejected']",
        ).each(($input) => cy.wrap($input).should("not.be.checked"));
        cy.contains("button", label("validation.review.submit"))
          .scrollIntoView()
          .should("be.visible")
          .and("be.enabled")
          .click();
        cy.contains(
          ".toastDisplay .cds--toast-notification",
          label("validation.review.selectRequired"),
        ).should("be.visible");
      } else {
        cy.get(".validation-empty-state").should("be.visible");
        cy.contains("button", label("validation.review.submit")).should(
          "not.exist",
        );
      }
    });
    cy.get("@unselectedReviewPosts.all").should("have.length", 0);
  }
}

export default Validation;
