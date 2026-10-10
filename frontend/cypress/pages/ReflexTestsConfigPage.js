import config from "../../src/config.json";
import { body, label } from "./AdminUiContract";

const modal = ".rules-editor-modal.is-visible";
const endpoints = {
  reflex: { list: "reflexrules", detail: "reflexrule", save: "reflexrule" },
  calculation: {
    list: "test-calculations",
    detail: "test-calculation",
    save: "test-calculation",
  },
};

class ReflexTestsConfigPage {
  constructor(type) {
    if (!endpoints[type])
      throw new Error("An explicit current rule type is required");
    this.type = type;
  }

  openNew() {
    cy.get("#rules-type")
      .should("be.visible")
      .select(this.type)
      .should("have.value", this.type);
    cy.contains(".rules-workspace button", label(`rules.create.${this.type}`))
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.get(`${modal} #rule-editor-name`)
      .should("be.visible")
      .and("not.be.disabled");
    return this;
  }

  verifyPageLoads(value) {
    const fixtureTypes = {
      "Calculated Value Tests Management": "calculation",
      "Reflex Tests Management": "reflex",
    };
    expect(fixtureTypes[value]).to.eq(this.type);
    cy.get(modal).should("have.length", 1).and("be.visible");
    cy.get(`${modal} .cds--modal-header__label`)
      .invoke("text")
      .should("match", label(`rules.type.${this.type}`));
  }

  expandRuleBody() {
    // The current editor is expanded by design. Assert its actual form sections.
    const selector =
      this.type === "reflex" ? "#condition-0-sample" : "#operation-0-type";
    cy.get(`${modal} ${selector}`).should("be.visible").and("not.be.disabled");
    cy.get(`${modal} .rules-workspace__item`).should("have.length.at.least", 1);
  }

  validateToggleStatus(value) {
    expect(value).to.eq("On");
    cy.contains(`${modal} .cds--tag`, label("rules.state.active")).should(
      "be.visible",
    );
  }

  enterName(value) {
    this.name = value;
    cy.get(`${modal} #rule-editor-name`)
      .clear()
      .type(value)
      .should("have.value", value);
  }
  enterRuleName(value) {
    this.enterName(value);
  }
  enterCalcName(value) {
    this.enterName(value);
  }
  validateRuleName(value) {
    cy.get(`${modal} #rule-editor-name`).should("have.value", value);
  }
  validateCalcName(value) {
    this.validateRuleName(value);
  }

  select(selector, value) {
    cy.get(`${modal} ${selector}`)
      .should("be.visible")
      .and("not.be.disabled")
      .select(value);
    cy.get(`${modal} ${selector} option:selected`).should("have.text", value);
  }
  selectSample(value) {
    this.select("#condition-0-sample", value);
  }
  searchTest(value) {
    this.select("#condition-0-test", value);
  }
  selectSecondSample(value) {
    this.select("#action-0-sample", value);
  }
  searchReflexTest(value) {
    this.select("#action-0-test", value);
  }
  selectThirdSample(value) {
    this.select("#calculation-output-sample", value);
  }
  enterFinalResult(value) {
    this.select("#calculation-output-test", value);
  }
  selectFourthSample(value) {
    this.select("#operation-0-sample", value);
  }
  searchNumTest(value) {
    this.select("#operation-0-test", value);
  }

  selectOverAllOptions(value) {
    expect(value).to.eq("All");
    cy.get(`${modal} #rule-editor-overall`)
      .select("ALL")
      .should("have.value", "ALL");
  }
  selectRelation(value) {
    expect(value).to.eq("Is greater than");
    cy.get(`${modal} #condition-0-relation`)
      .select("GREATER_THAN")
      .should("have.value", "GREATER_THAN");
  }
  enterNumericValue(value) {
    cy.get(`${modal} #condition-0-value`)
      .clear()
      .type(value)
      .should("have.value", value);
  }
  addInternatNote(value) {
    cy.get(`${modal} #action-0-internal`)
      .clear()
      .type(value)
      .should("have.value", value);
  }
  addExternatNote(value) {
    cy.get(`${modal} #action-0-external`)
      .clear()
      .type(value)
      .should("have.value", value);
  }
  addFinalExternatNote(value) {
    cy.get(`${modal} #calculation-note`)
      .clear()
      .type(value)
      .should("have.value", value);
  }

  operation(index) {
    return cy
      .get(`${modal} #operation-${index}-type`)
      .closest("section.rules-workspace__item");
  }
  insertAfter(index, type) {
    this.operation(index).within(() => {
      cy.contains("button", label("rules.operation.insert"))
        .should("be.visible")
        .and("not.be.disabled")
        .click();
    });
    cy.get(`${modal} #operation-${index + 1}-type`)
      .select(type)
      .should("have.value", type);
  }
  verifyRemoveOperationButton() {
    this.operation(0).within(() => {
      cy.contains("button", label("rules.item.remove"))
        .should("be.visible")
        .and("be.disabled");
    });
  }
  clickMathFunctionButton() {
    this.insertAfter(0, "MATH_FUNCTION");
  }
  mathFunction(value) {
    expect(value).to.eq("Plus");
    cy.get(`${modal} #operation-1-value`).select("+").should("have.value", "+");
  }
  clickPatientAttributeButton() {
    this.insertAfter(1, "PATIENT_ATTRIBUTE");
  }
  selectPatientAttribute(value) {
    expect(value).to.eq("Patient Age(Years)");
    cy.get(`${modal} #operation-2-value`)
      .select("AGE")
      .should("have.value", "AGE");
  }
  selectMathFunction(value) {
    expect(value).to.eq("Mathematical Function");
    this.insertAfter(2, "MATH_FUNCTION");
  }
  secMathFunction(value) {
    expect(value).to.eq("Does Not Equal");
    cy.get(`${modal} #operation-3-value`)
      .select("!=")
      .should("have.value", "!=");
  }
  clickIntegerButton() {
    this.insertAfter(3, "INTEGER");
  }
  enterInteger(value) {
    cy.get(`${modal} #operation-4-value`)
      .clear()
      .type(value)
      .should("have.value", value);
  }

  assertDefinition(record) {
    expect(record.active).to.eq(true);
    expect(record[this.type === "reflex" ? "ruleName" : "name"]).to.eq(
      this.name,
    );
    if (this.type === "calculation") {
      expect(
        record.operations.map(({ type, value, sampleId, order }) => ({
          type,
          value: String(value),
          sampleId: sampleId == null ? null : String(sampleId),
          order,
        })),
      ).to.deep.eq(
        this.saved.operations.map(({ type, value, sampleId, order }) => ({
          type,
          value: String(value),
          sampleId: sampleId == null ? null : String(sampleId),
          order,
        })),
      );
      expect(record.operations.map(({ type }) => type)).to.deep.eq([
        "TEST_RESULT",
        "MATH_FUNCTION",
        "PATIENT_ATTRIBUTE",
        "MATH_FUNCTION",
        "INTEGER",
      ]);
      expect(
        record.operations.slice(1).map(({ value }) => String(value)),
      ).to.deep.eq(["+", "AGE", "!=", "0"]);
      for (const key of ["sampleId", "testId", "note", "result"])
        expect(String(record[key] ?? ""), key).to.eq(
          String(this.saved[key] ?? ""),
        );
    } else {
      expect(record.overall).to.eq("ALL");
      expect(record.conditions).to.have.length(1);
      expect(record.actions).to.have.length(1);
      for (const key of ["sampleId", "testId", "testName", "relation", "value"])
        expect(String(record.conditions[0][key]), key).to.eq(
          String(this.saved.conditions[0][key]),
        );
      expect(record.conditions[0].relation).to.eq("GREATER_THAN");
      expect(String(record.conditions[0].value)).to.eq("0");
      for (const key of [
        "sampleId",
        "reflexTestId",
        "reflexTestName",
        "internalNote",
        "externalNote",
        "addNotification",
      ])
        expect(String(record.actions[0][key]), key).to.eq(
          String(this.saved.actions[0][key]),
        );
    }
  }

  submitButton() {
    const endpoint = endpoints[this.type];
    cy.intercept("POST", `**/rest/${endpoint.save}`).as("ruleWrite");
    cy.intercept("GET", `**/rest/${endpoint.list}`).as("rulesAfterWrite");
    cy.get(`${modal} .cds--modal-footer`).within(() => {
      cy.contains("button", label("label.button.save"))
        .should("be.visible")
        .and("not.be.disabled")
        .click();
    });
    cy.wait("@ruleWrite").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      this.saved = body(request.body);
      this.id = body(response.body).id;
      expect(String(this.id)).to.match(/^[1-9]\d*$/);
      cy.request(
        `${config.serverBaseUrl}/rest/${endpoint.detail}/${this.id}`,
      ).then((read) => {
        expect(read.status).to.eq(200);
        this.assertDefinition(read.body);
      });
    });
    cy.get(modal).should("not.exist");
    cy.wait("@rulesAfterWrite").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(body(response.body)).to.be.an("array");
    });
  }

  reloadAndWait() {
    const endpoint = endpoints[this.type];
    cy.request(
      `${config.serverBaseUrl}/rest/${endpoint.detail}/${this.id}`,
    ).then((read) => {
      expect(read.status).to.eq(200);
      this.assertDefinition(read.body);
    });
    cy.get("#rules-search").clear().type(this.name);
    cy.contains(".rules-workspace tbody tr", this.name)
      .should("have.length", 1)
      .within(() => {
        cy.contains("button", label("button.edit"))
          .should("be.visible")
          .and("not.be.disabled")
          .click();
      });
    cy.get(`${modal} #rule-editor-name`)
      .should("be.visible")
      .and("not.be.disabled");
  }
}

export default ReflexTestsConfigPage;
