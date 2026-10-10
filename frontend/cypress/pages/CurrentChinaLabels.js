import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";
import frMessages from "../../src/languages/fr.json";

export const currentMessages = [
  enMessages,
  zhMessages,
  zhCNMessages,
  frMessages,
];

export const currentLabel = (key) => {
  const labels = [
    ...new Set(currentMessages.map((messages) => messages[key])),
  ].filter((label) => typeof label === "string" && label.length > 0);
  expect(labels, `configured translations for ${key}`).not.to.be.empty;
  return new RegExp(`^(?:${labels.map(Cypress._.escapeRegExp).join("|")})$`);
};

export const assertCurrentHeading = (key) =>
  cy.contains("h1,h2,h3", currentLabel(key)).should("be.visible");

export const typeCurrentDate = (selector, isoDate) => {
  expect(isoDate).to.match(/^\d{4}-\d{2}-\d{2}$/);
  cy.get(selector)
    .should("be.visible")
    .invoke("attr", "placeholder")
    .then((placeholder) => {
      const orders = ["ymd", "dmy", "mdy"].filter((order) =>
        currentMessages.some(
          (messages) =>
            messages[`datepicker.placeholder.${order}`] === placeholder,
        ),
      );
      expect(
        orders,
        "date order from the actual configured input",
      ).to.have.length(1);
      const [year, month, day] = isoDate.split("-");
      const display = (
        orders[0] === "ymd"
          ? [year, month, day]
          : orders[0] === "dmy"
            ? [day, month, year]
            : [month, day, year]
      ).join("/");
      cy.get(selector)
        .clear()
        .type(display)
        .blur()
        .should("have.value", display);
      cy.get("body").type("{esc}");
    });
};
