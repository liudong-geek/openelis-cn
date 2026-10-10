import LoginPage from "../pages/LoginPage";
import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";
const messages = [enMessages, zhMessages, zhCNMessages];
const text = (key) =>
  new RegExp(
    `^(?:${[...new Set(messages.map((locale) => locale[key]))].map(Cypress._.escapeRegExp).join("|")})$`,
  );

describe("OGC-284 barcode workflow rollout", () => {
  before(() => {
    const loginPage = new LoginPage();
    loginPage.visit();
    loginPage.goToHomePage();
  });

  it("shows shared labels UI on Generic Sample Order", () => {
    // Existing Reception-protected compatibility bookmark; this does not
    // assert labels capability on the separate current /order/enter screen.
    cy.visit("/GenericSample/Order");
    cy.location("pathname").should("eq", "/GenericSample/Order");
    cy.contains("h2, h3, h4", text("barcode.labels.section.title"), {
      timeout: 15000,
    }).should("be.visible");
    cy.get("[data-testid='labels-section-root']")
      .should("be.visible")
      .within(() => {
        cy.contains(text("barcode.labels.order.row"), {
          timeout: 15000,
        }).should("be.visible");
        const labels = [
          ...new Set(
            messages.map((locale) => locale["barcode.labels.running.total"]),
          ),
        ];
        cy.contains(
          new RegExp(
            `^(?:${labels.map(Cypress._.escapeRegExp).join("|")}): \\d+$`,
          ),
          { timeout: 15000 },
        ).should("be.visible");
      });
  });

  it("loads Print Barcode reprint entry point", () => {
    cy.visit("/PrintBarcode");
    cy.location("pathname").should("eq", "/PrintBarcode");
    cy.contains(".barcode-workspace h1", text("barcode.print.title")).should(
      "be.visible",
    );
    cy.contains("[role='tab']", text("workspace.order.reprint")).should(
      "have.attr",
      "aria-selected",
      "true",
    );
  });
});
