import { selectOriginalLab } from "./CurrentAdminLabels";
import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
const API_BASE = "/api/OpenELIS-Global";
const parseQuestionnaire = (value) =>
  value == null
    ? { resourceType: "Questionnaire", item: [] }
    : typeof value === "string"
      ? JSON.parse(value)
      : value;
const questionnaireContent = (value) => {
  const {
    meta: _technicalVersion,
    id: _resourceIdentity,
    ...content
  } = parseQuestionnaire(value);
  // The FHIR encoder omits empty item lists; retain all nonempty question content.
  if (Array.isArray(content.item) && content.item.length === 0)
    delete content.item;
  return content;
};

class ProgramEntryPage {
  constructor() {
    this.sequence = 0;
  }
  selectors = {
    program: "#program-selector",
    testSection: "#test_section",
    questionare: "#additionalOrderEntryQuestions",
    submitButton: ".program-workspace__form button[type='submit']",
  };

  verifyPageLoads() {
    cy.get(".program-workspace h1")
      .should("be.visible")
      .invoke("text")
      .should((text) => {
        expect([
          enMessages["program.management.title"],
          zhMessages["program.management.title"],
        ]).to.include(text);
      });
  }

  selectProgram(value) {
    const alias = `selectedProgram${++this.sequence}`;
    cy.intercept("GET", "**/rest/program/*").as(alias);
    cy.get(this.selectors.program).find("button").should("be.enabled").click();
    cy.contains(
      "#program-selector [role='option']",
      new RegExp(`^${Cypress._.escapeRegExp(value)}$`),
    )
      .scrollIntoView()
      .should("be.visible")
      .click();
    cy.get("#program-selector .cds--list-box__label").should(
      "have.text",
      value,
    );
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "actual selected program loads").to.eq(200);
      expect(response.body?.program?.programName).to.eq(value);
      expect(String(response.body.program.id)).not.to.eq("");
      this.initial = response.body;
    });
    cy.get(this.selectors.submitButton).should("be.disabled");
  }

  selectTest(value) {
    selectOriginalLab(this.selectors.testSection, value);
  }

  typeQuestionare(value) {
    cy.get(this.selectors.questionare).type(value);
  }

  submitProgram() {
    const observation = {
      requests: [],
      alias: `programPost${++this.sequence}`,
    };
    cy.intercept("POST", "**/rest/program", (request) => {
      observation.requests.push(request);
    }).as(observation.alias);
    cy.get(this.selectors.testSection)
      .invoke("val")
      .then((selected) => {
        const programId = String(this.initial.program.id);
        const changed =
          String(selected || "") !== String(this.initial.testSectionId || "");
        if (!changed) {
          cy.get(this.selectors.submitButton)
            .should("be.visible")
            .and("be.disabled");
          cy.request(`${API_BASE}/rest/program/${programId}`).then(
            ({ status, body }) => {
              expect(status).to.eq(200);
              expect(
                body,
                "unchanged selection cannot write program/questionnaire/version",
              ).to.deep.eq(this.initial);
              expect(
                observation.requests,
                "zero no-change program POSTs",
              ).to.have.length(0);
            },
          );
          return;
        }
        // Only the test-section selection requested by the original case may make this dirty.
        cy.get(this.selectors.submitButton)
          .should("be.visible")
          .and("be.enabled")
          .click();
        cy.wait(`@${observation.alias}`).then(({ request, response }) => {
          expect(response?.statusCode, "real program save").to.eq(200);
          const submitted =
            typeof request.body === "string"
              ? JSON.parse(request.body)
              : request.body;
          expect(String(submitted.program.id)).to.eq(programId);
          expect(String(submitted.testSectionId)).to.eq(String(selected));
          expect(submitted.program.programName).to.eq(
            this.initial.program.programName,
          );
          expect(submitted.program.code).to.eq(this.initial.program.code);
          expect(submitted.additionalOrderEntryQuestions).to.deep.eq(
            parseQuestionnaire(this.initial.additionalOrderEntryQuestions),
          );
          cy.request(`${API_BASE}/rest/program/${programId}`).then(
            ({ status, body }) => {
              expect(status, "independent saved program GET").to.eq(200);
              expect(String(body.program.id)).to.eq(programId);
              expect(String(body.testSectionId)).to.eq(String(selected));
              expect(body.program.programName).to.eq(
                this.initial.program.programName,
              );
              expect(body.program.code).to.eq(this.initial.program.code);
              expect(
                questionnaireContent(body.additionalOrderEntryQuestions),
              ).to.deep.eq(
                questionnaireContent(submitted.additionalOrderEntryQuestions),
              );
              expect(
                parseQuestionnaire(body.additionalOrderEntryQuestions).id,
              ).to.eq(String(body.program.questionnaireUUID));
              if (this.initial.program.questionnaireUUID) {
                expect(body.program.questionnaireUUID).to.eq(
                  this.initial.program.questionnaireUUID,
                );
              }
              expect(
                observation.requests,
                "one genuine requested save",
              ).to.have.length(1);
            },
          );
        });
        cy.get(this.selectors.submitButton).should("be.disabled");
      });
  }
}

export default ProgramEntryPage;
