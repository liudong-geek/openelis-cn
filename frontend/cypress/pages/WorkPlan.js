import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

const labels = (key) =>
  new RegExp(
    `^(?:${[...new Set([enMessages[key], zhMessages[key], zhCNMessages[key]])]
      .map(Cypress._.escapeRegExp)
      .join("|")})$`,
  );
const modes = {
  "Workplan By Test": ["test", "workplan.test.types", "workplan-test-filter"],
  "Workplan By Panel": [
    "panel",
    "workplan.panel.types",
    "workplan-panel-filter",
  ],
  "Workplan By Unit": [
    "unit",
    "workplan.unit.types",
    "workplan-section-filter",
  ],
  "Workplan By Priority": [
    "priority",
    "workplan.priority.list",
    "workplan-priority-filter",
  ],
};

class WorkPlan {
  constructor() {}

  visit() {
    cy.visit("/WorkplanByTest");
  }
  getWorkPlanFilterTitle(tiles) {
    const mode = modes[tiles];
    expect(mode, "original workplan query category").to.be.an("array");
    this.mode = mode;
    cy.get("#workplan-query-category").should("be.visible");
    cy.get(".oe-workplan-filter h2")
      .should("be.visible")
      .invoke("text")
      .should(
        "match",
        new RegExp(
          labels(mode[1]).source.replace(/^\^/, "").replace(/\$$/, ""),
        ),
      );
    cy.get(`#${mode[2]}`).should("be.visible").and("be.enabled");
  }

  selectDropdownOption(option) {
    const [type, , inputId] = this.mode;
    if (type === "unit")
      expect(option, "original professional-group fixture").to.eq(
        "Serology-Immunology",
      );
    if (type === "panel")
      expect(option, "original panel fixture").to.eq("Bilan Biochimique");
    const expected =
      type === "unit"
        ? /^(?:Serology-Immunology|血清免疫学)$/
        : type === "panel"
          ? /^(?:Bilan Biochimique|生化检验组合)$/
          : type === "priority" && option === "Routine"
            ? labels("order.priority.option.ROUTINE")
            : new RegExp(`^${Cypress._.escapeRegExp(option)}$`);
    cy.intercept("GET", "**/rest/Workplan?*").as("workplanQuery");
    cy.get(`#${inputId}`)
      .should("be.visible")
      .and("be.enabled")
      .click()
      .invoke("attr", "aria-controls")
      .then((listId) => {
        expect(listId, "real ComboBox option list").to.be.a("string").and.not.be
          .empty;
        const list = cy.get(`#${listId}`);
        const choice =
          type === "unit" || type === "panel"
            ? list
                .find("[role='option']")
                .filter((_, item) => expected.test(item.textContent.trim()))
                .should("have.length", 1)
            : list.contains("[role='option']", expected);
        choice.scrollIntoView().should("be.visible").click();
      });
    cy.wait("@workplanQuery").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.queryVersion).to.eq("2");
      expect(response.body.query.type).to.eq(type);
      if (type === "unit" || type === "panel") {
        const originalFilterId = type === "unit" ? "117" : "1";
        expect(
          new URL(request.url).searchParams.get("filterId"),
          "queried original filter identity",
        ).to.eq(originalFilterId);
        expect(
          response.body.query.filterId,
          "server-confirmed original filter identity",
        ).to.eq(originalFilterId);
      }
      expect(response.body.workplanTests).to.be.an("array");
    });
  }

  getPrintWorkPlanButton() {
    cy.contains(
      ".oe-workplan-print-controls button",
      labels("workplan.print.currentPage"),
    ).should("be.visible");
  }

  getWorkPlanResultsTable() {
    return cy.get('[data-cy="workplanResultsTable"]');
  }
}
export default WorkPlan;
