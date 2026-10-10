import en from "../../src/languages/en.json";
import zh from "../../src/languages/zh.json";
import zhCN from "../../src/languages/zh_CN.json";
const API_BASE = "/api/OpenELIS-Global";
export const adminLabel = (key) => {
  const values = [...new Set([en[key], zh[key], zhCN[key]])];
  expect(
    values.every((v) => typeof v === "string" && v.length > 0),
    `actual translated label ${key}`,
  ).to.eq(true);
  return new RegExp(`^(?:${values.map(Cypress._.escapeRegExp).join("|")})$`);
};
export const adminJsonRead = (path, qs) =>
  cy
    .request({
      url: `${API_BASE}${path}`,
      qs,
      followRedirect: false,
      headers: { Accept: "application/json" },
    })
    .then(({ status, headers, body }) => {
      expect(status, `protected real GET ${path}`).to.eq(200);
      expect(headers["content-type"], "no SPA/login fallback").to.match(
        /application\/json/i,
      );
      return body;
    });
export const selectOriginalLab = (selector, originalName) => {
  if (originalName === "All Lab Units") {
    cy.get(selector).should("be.visible").select("AllLabUnits");
    cy.get(selector).should("have.value", "AllLabUnits");
    return;
  }
  // Untranslated server names retain the original professional-unit identity;
  // the localized dropdown is selected by that same ID, never by any available unit.
  adminJsonRead("/rest/displayList/TEST_SECTION_BY_NAME").then((list) => {
    expect(list).to.be.an("array");
    const matches = list.filter(
      (item) =>
        item.value === originalName ||
        (originalName === "Virology" && item.value === "Virologie"),
    );
    expect(
      matches,
      `one original real laboratory unit ${originalName}`,
    ).to.have.length(1);
    const id = String(matches[0].id);
    expect(id).to.match(/^[1-9]\d*$/);
    cy.get(selector).find(`option[value='${id}']`).should("have.length", 1);
    cy.get(selector).should("be.visible").and("be.enabled").select(id);
    cy.get(selector).should("have.value", id);
  });
};
export const setVisibleCheckbox = (id, checked) => {
  cy.get(`[id='${id}']`)
    .should("have.length", 1)
    .then(($input) => {
      if (Boolean($input.prop("checked")) !== checked)
        cy.get(`label[for='${id}']`)
          .scrollIntoView()
          .should("be.visible")
          .click();
    });
  cy.get(`[id='${id}']`).should(checked ? "be.checked" : "not.be.checked");
};
export const setCarbonToggle = (id, checked) => {
  cy.get(`[id='${id}']`)
    .should("have.attr", "role", "switch")
    .then(($button) => {
      if ($button.attr("aria-checked") !== String(checked))
        cy.wrap($button).should("be.visible").click();
    });
  cy.get(`[id='${id}']`).should("have.attr", "aria-checked", String(checked));
};
