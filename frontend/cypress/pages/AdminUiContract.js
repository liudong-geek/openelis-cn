import en from "../../src/languages/en.json";
import zh from "../../src/languages/zh.json";
import zhCN from "../../src/languages/zh_CN.json";

export const label = (key) => {
  const values = [...new Set([en[key], zh[key], zhCN[key]])];
  if (values.some((value) => typeof value !== "string")) {
    throw new Error(`Missing current UI label: ${key}`);
  }
  return new RegExp(`^(?:${values.map(Cypress._.escapeRegExp).join("|")})$`);
};

export const body = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;

// Operate the visible Carbon label; do not force its visually hidden input.
export const setCheckbox = (id, checked) => {
  cy.get(`#${id}`)
    .should("not.be.disabled")
    .then(($input) => {
      if ($input.prop("checked") !== checked) {
        cy.get(`label[for="${id}"]`).should("be.visible").click();
      }
    });
  cy.get(`#${id}`).should(checked ? "be.checked" : "not.be.checked");
};

export const openAuthorizedSidebarLink = (workspaceId, href) => {
  cy.get(".cds--side-nav").then(($nav) => {
    if (!$nav.hasClass("cds--side-nav--expanded")) {
      cy.get("[data-cy='menuButton']").should("be.visible").click();
    }
  });
  cy.get(".cds--side-nav").should("have.class", "cds--side-nav--expanded");
  const toggle = `#${workspaceId} > li > button.cds--side-nav__submenu`;
  cy.get(toggle)
    .should("have.length", 1)
    .scrollIntoView()
    .should("be.visible")
    .then(($button) => {
      if ($button.attr("aria-expanded") !== "true") cy.wrap($button).click();
    });
  cy.get(toggle).should("have.attr", "aria-expanded", "true");
  cy.get(`#${workspaceId} a[href="${href}"]`)
    .should("have.length", 1)
    .scrollIntoView()
    .should("be.visible")
    .and("not.have.attr", "aria-disabled", "true")
    .click();
  const [pathname, search = ""] = href.split("?");
  cy.location("pathname").should("eq", pathname);
  cy.location("search").should("eq", search ? `?${search}` : "");
  cy.get("body").then(($body) => {
    if ($body.find("[data-cy='menuButton']").length) {
      if ($body.find(".cds--side-nav--expanded").length) {
        cy.get("[data-cy='menuButton']").should("be.visible").click();
      }
      cy.get(".cds--side-nav").should(
        "not.have.class",
        "cds--side-nav--expanded",
      );
    } else {
      cy.get("#mainHeader").should("have.attr", "data-nav-persistent", "true");
      cy.get(".cds--side-nav").should("have.class", "cds--side-nav--expanded");
    }
  });
};
