import config from "../../src/config.json";
import { body, label, setCheckbox } from "./AdminUiContract";

class LabNumberManagementPage {
  verifyPageLoaded() {
    cy.get(".lab-number-workspace h1")
      .should("be.visible")
      .invoke("text")
      .should("match", label("configure.labNumber.title"));
    cy.get("#lab_number_type").should("be.visible").and("not.be.disabled");
  }

  prepareLegacyWrite() {
    // A reviewed setup transition makes the original Legacy save a real dirty write.
    // Both transitions use current UI confirmation and independent server readback.
    cy.request(`${config.serverBaseUrl}/rest/labnumbermanagement`).then(
      (read) => {
        expect(read.status).to.eq(200);
        const original = read.body;
        cy.get("#lab_number_type").should("have.value", original.labNumberType);
        if (original.labNumberType === "SITEYEARNUM") {
          this.selectLabNumber("Alpha Numeric");
          this.clickSubmitButton();
          cy.request(`${config.serverBaseUrl}/rest/labnumbermanagement`).then(
            (prepared) => {
              expect(prepared.status).to.eq(200);
              expect(prepared.body).to.deep.eq({
                ...original,
                labNumberType: "ALPHANUM",
              });
            },
          );
        } else {
          expect(original.labNumberType).to.eq("ALPHANUM");
        }
      },
    );
  }

  selectLabNumber(value) {
    const values = { Legacy: "SITEYEARNUM", "Alpha Numeric": "ALPHANUM" };
    expect(values[value], "original fixture lab-number format").to.be.a(
      "string",
    );
    this.expectedType = values[value];
    cy.get("#lab_number_type")
      .should("be.visible")
      .select(this.expectedType)
      .should("have.value", this.expectedType);
  }

  checkPrefixCheckBox() {
    setCheckbox("usePrefix", true);
  }

  typePrefix(prefix) {
    this.checkPrefixCheckBox();
    cy.get("#alphanumPrefix")
      .should("be.visible")
      .and("not.be.disabled")
      .clear()
      .type(prefix)
      .should("have.value", prefix);
  }

  clickSubmitButton() {
    // An already saved value has no dirty change and MUST fail this save case.
    // A fixture precondition must be reviewed; never turn a disabled save into a pass.
    cy.get("[data-testid='submit-button']")
      .should("be.visible")
      .and("not.be.disabled");
    cy.intercept("POST", "**/rest/labnumbermanagement").as("labNumberWrite");
    cy.get("[data-testid='submit-button']").click();
    cy.get(".cds--modal.is-visible")
      .should("have.length", 1)
      .within(() => {
        cy.get(".cds--modal-header__heading")
          .invoke("text")
          .should("match", label("labNumber.confirm.title"));
        cy.contains("button", label("labNumber.confirm.save"))
          .should("be.visible")
          .and("not.be.disabled")
          .click();
      });
    cy.wait("@labNumberWrite").then(({ request, response }) => {
      expect(response.statusCode).to.be.within(200, 299);
      const expected = body(request.body);
      expect(expected.labNumberType).to.eq(this.expectedType);
      const saved = body(response.body);
      for (const key of Object.keys(expected))
        expect(saved[key], key).to.deep.eq(expected[key]);
      cy.request(`${config.serverBaseUrl}/rest/labnumbermanagement`).then(
        (read) => {
          expect(read.status).to.eq(200);
          for (const key of Object.keys(expected))
            expect(read.body[key], key).to.deep.eq(expected[key]);
        },
      );
    });
    cy.get("#lab_number_type").should("have.value", this.expectedType);
    cy.get("[data-testid='submit-button']").should("be.disabled");
  }
}

export default LabNumberManagementPage;
