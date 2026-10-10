import { adminLabel, adminJsonRead } from "./CurrentAdminLabels";
class BatchTestReassignmentandCancelationPage {
  constructor() {
    this.sequence = 0;
    this.posts = [];
  }
  validatePageTitle() {
    cy.contains(
      ".batch-reassignment h1",
      adminLabel("configuration.batch.test.reassignment"),
    ).should("be.visible");
    cy.intercept("POST", "**/rest/BatchTestReassignment", (r) =>
      this.posts.push(r),
    );
  }
  selectSampleType() {
    adminJsonRead("/rest/BatchTestReassignment").then((r) => {
      const matches = r.sampleList.filter((v) =>
        adminLabel("sample.type.serum").test(v.value),
      );
      expect(matches, "original Serum specimen identity").to.have.length(1);
      this.sampleId = String(matches[0].id);
      const alias = `batchSerumTests${++this.sequence}`;
      cy.intercept({
        method: "GET",
        pathname: "**/rest/AllTestsForSampleTypeProvider",
        query: { sampleTypeId: this.sampleId },
      }).as(alias);
      cy.get("#batch-sample-type").select(this.sampleId);
      cy.wait(`@${alias}`).then(({ response }) => {
        expect(response.statusCode).to.eq(200);
        this.tests = response.body.tests;
        const amylase = this.tests.filter((t) => t.name === "Amylase");
        expect(amylase, "original Amylase identity").to.have.length(1);
        this.testId = String(amylase[0].id);
      });
    });
  }
  checkBoxes(name) {
    expect(["currentTest", "replaceWith"]).to.include(name);
    if (name === "currentTest")
      cy.get("#batch-current-test").should("be.visible");
    else {
      cy.contains(
        ".batch-reassignment__mode button strong",
        adminLabel("batch.reassignment.replace"),
      )
        .should("be.visible")
        .click();
    }
  }
  selectTest(number) {
    if (number === "1") {
      cy.then(() => {
        const alias = `batchAmylasePending${++this.sequence}`;
        cy.intercept({
          method: "GET",
          pathname: "**/rest/getPendingAnalysisForTestProvider",
          query: { testId: this.testId },
        }).as(alias);
        cy.get("#batch-current-test").select(this.testId);
        cy.wait(`@${alias}`).then(({ response }) => {
          expect(response.statusCode).to.eq(200);
          this.pendingBefore = response.body;
        });
      });
    } else {
      expect(number).to.eq("0");
      this.assertIdenticalReplacementExcluded();
    }
  }
  assertIdenticalReplacementExcluded() {
    cy.then(() => {
      cy.get("#batch-current-test").should("have.value", this.testId);
      cy.get("#batch-replacement-tests button.cds--list-box__field")
        .should("be.visible")
        .click();
      cy.get("#batch-replacement-tests")
        .should("be.visible")
        .within(() => {
          cy.root().should(($root) => {
            const texts = [...$root[0].querySelectorAll("[role='option']")].map(
              (x) => x.textContent.trim(),
            );
            expect(
              texts,
              "same Amylase cannot be offered as a replacement",
            ).not.to.include("Amylase");
          });
        });
      cy.get("body").type("{esc}");
      cy.contains(
        ".batch-reassignment__footer button",
        adminLabel("batch.reassignment.review"),
      ).should("be.disabled");
    });
  }
  pendingReadUnchanged() {
    return adminJsonRead("/rest/getPendingAnalysisForTestProvider", {
      testId: this.testId,
    }).then((r) => {
      expect(
        r,
        "same pending analyses before/after invalid replacement",
      ).to.deep.eq(this.pendingBefore);
      expect(this.posts, "no bulk clinical write").to.have.length(0);
    });
  }
  clickCancel() {
    this.pendingReadUnchanged();
    cy.contains(
      ".batch-reassignment .oe-page-header button",
      adminLabel("batch.reassignment.reset"),
    )
      .should("be.enabled")
      .click();
    cy.get("#batch-sample-type").should("have.value", "");
    cy.get("#batch-current-test").should("be.disabled");
    cy.then(() => expect(this.posts).to.have.length(0));
  }
  clickOk() {
    // The original same-ID replacement is explicitly rejected by the current clinical guard.
    cy.contains(
      ".batch-reassignment__footer button",
      adminLabel("batch.reassignment.review"),
    ).should("be.disabled");
    cy.get(".batch-reassignment .cds--modal.is-visible").should("not.exist");
    this.pendingReadUnchanged();
  }
}
export default BatchTestReassignmentandCancelationPage;
