import { adminLabel, adminJsonRead } from "./CurrentAdminLabels";
const MODAL = ".cds--modal.is-visible:has(.config-editor)";
const CATEGORY = {
  "NonConformity Configuration": "NonConformityConfigurationMenu",
  "WorkPlan Configuration": "WorkplanConfigurationMenu",
  "Site Information": "SiteInformationMenu",
  "Result Entry Configuration": "ResultConfigurationMenu",
  "Patient Entry Configuration": "PatientConfigurationMenu",
  "Order Entry Configuration": "SampleEntryConfigMenu",
  "Printed Report Configuration": "PrintedReportsConfigurationMenu",
  "Validation Configuration": "ValidationConfigurationMenu",
  "MenuStatement Configuration": "MenuStatementConfigMenu",
};
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
class GeneralConfigurationsPage {
  constructor() {
    this.sequence = 0;
    this.selectionType = "boolean";
  }
  validatePageTitle(title) {
    if (title === "Edit Record") {
      cy.contains(
        `${MODAL} .cds--modal-header__heading`,
        adminLabel("config.workspace.edit.heading"),
      ).should("be.visible");
      cy.get(`${MODAL} .config-editor__summary strong`).should("be.visible");
      return;
    }
    this.menuType = CATEGORY[title];
    expect(this.menuType, `exact current category ${title}`).to.be.a("string");
    cy.get("#workflow-parameter-category").should("have.value", this.menuType);
    cy.get(".config-workspace h2").should("be.visible");
  }
  selectItem(type = this.selectionType) {
    this.selectionType = type;
    adminJsonRead(`/rest/${this.menuType}`).then((menu) => {
      expect(menu.menuList).to.be.an("array");
      const matching = menu.menuList.filter((r) =>
        type === "boolean"
          ? r.valueType === "boolean"
          : ["text", "freeText"].includes(r.valueType || "text") &&
            r.tag !== "localization",
      );
      expect(
        matching,
        `real ${type} parameter in original category`,
      ).not.to.have.length(0);
      if (this.parameterId) {
        const retained = matching.filter(
          (r) => String(r.id) === this.parameterId,
        );
        expect(retained).to.have.length(1);
        this.parameter = retained[0];
      } else {
        this.parameter = matching[0];
        this.parameterId = String(this.parameter.id);
      }
      expect(this.parameterId).to.match(/^[1-9]\d*$/);
    });
  }
  clickModifyButton() {
    cy.then(() => {
      const alias = `configurationEditor${++this.sequence}`;
      const path = this.menuType.replace(/Menu$/, "");
      this.editorPath = `/rest/${path}`;
      cy.intercept({
        method: "GET",
        pathname: `**${this.editorPath}`,
        query: { ID: this.parameterId },
      }).as(alias);
      cy.get(`.config-workspace tbody tr button`)
        .filter((_, button) =>
          Boolean(
            button
              .closest("tr")
              .querySelector(`span[title='${this.parameter.name}']`),
          ),
        )
        .should("have.length", 1)
        .should("be.visible")
        .click();
      cy.wait(`@${alias}`).then(({ response }) => {
        expect(response.statusCode).to.eq(200);
        this.beforeRaw = response.body;
        this.before = {
          ...response.body,
          paramName: String(response.body.paramName || ""),
          description: String(response.body.description || ""),
          value: String(response.body.value || ""),
          dictionaryValues: Array.isArray(response.body.dictionaryValues)
            ? response.body.dictionaryValues.map(String)
            : [],
        };
        expect(this.before.valueType).to.eq(this.parameter.valueType);
      });
    });
    cy.get(MODAL).should("be.visible");
  }
  checkValue(value) {
    const expectedValue = value.toLowerCase();
    cy.then(() => {
      this.expectedValue = expectedValue;
      return cy
        .get(`${MODAL} #config-boolean-${this.parameterId}`)
        .should("be.visible")
        .select(expectedValue);
    });
  }
  typeValue(value) {
    const expectedValue = value;
    cy.then(() => {
      this.expectedValue = expectedValue;
      return cy
        .get(`${MODAL} #config-text-${this.parameterId}`)
        .should("be.visible")
        .clear()
        .type(expectedValue);
    });
  }
  saveChanges() {
    cy.then(() => {
      const alias = `configurationWrite${++this.sequence}`;
      cy.intercept({
        method: "POST",
        pathname: `**${this.editorPath}`,
        query: { ID: this.parameterId },
      }).as(alias);
      cy.get(`${MODAL} [data-cy='save-Button']`).should("be.enabled").click();
      cy.wait(`@${alias}`).then(({ request, response }) => {
        expect(response.statusCode).to.eq(200);
        const sent = parse(request.body);
        expect(sent.value).to.eq(this.expectedValue);
        expect(
          { ...sent, value: this.before.value },
          "every unedited configuration field retained",
        ).to.deep.eq(this.before);
        adminJsonRead(this.editorPath, { ID: this.parameterId }).then(
          (actual) => {
            expect(actual.value, "independent stored parameter value").to.eq(
              this.expectedValue,
            );
            ["paramName", "description", "valueType", "tag"].forEach((key) =>
              expect(actual[key], `preserved ${key}`).to.deep.eq(
                this.before[key],
              ),
            );
          },
        );
      });
    });
    cy.get(MODAL).should("not.exist");
  }
  exitChanges() {
    cy.contains(
      `${MODAL} .config-editor__actions button`,
      adminLabel("label.button.cancel"),
    )
      .should("be.visible")
      .click();
    cy.get(MODAL).should("not.exist");
  }
  validateStatus(value) {
    cy.then(() => {
      adminJsonRead(`/rest/${this.menuType}`).then((menu) => {
        const rows = menu.menuList.filter(
          (r) => String(r.id) === this.parameterId,
        );
        expect(rows).to.have.length(1);
        expect(String(rows[0].value)).to.eq(value);
      });
      const row = cy
        .get(`.config-workspace tbody tr`)
        .filter((_, tr) =>
          Boolean(tr.querySelector(`span[title='${this.parameter.name}']`)),
        )
        .should("have.length", 1);
      if (this.parameter.valueType === "boolean")
        row
          .find("td")
          .eq(2)
          .invoke("text")
          .should("match", adminLabel(`config.workspace.boolean.${value}`));
      else row.find("td").eq(2).should("have.text", value);
    });
  }
}
export default GeneralConfigurationsPage;
