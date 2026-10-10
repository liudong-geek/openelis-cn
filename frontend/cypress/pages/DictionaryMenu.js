import { adminLabel, adminJsonRead } from "./CurrentAdminLabels";
const MODAL = ".dictionary-management-page .cds--modal.is-visible";
const PAGE = ".dictionary-management-page";
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);
class DictionaryMenuPage {
  constructor() {
    this.sequence = 0;
    this.posts = [];
  }
  verifyPageTitle() {
    cy.contains(`${PAGE} h1`, adminLabel("dictionary.label.modify")).should(
      "be.visible",
    );
  }
  validateModal() {
    cy.get(MODAL).should("have.length", 1).and("be.visible");
    cy.get(`${MODAL} #dictEntry`).should("be.visible");
  }
  clickAddButton() {
    this.posts = [];
    cy.intercept("POST", "**/rest/Dictionary*", (r) => this.posts.push(r));
    cy.get(`${PAGE} [data-cy='addButton']`).should("be.enabled").click();
    this.validateModal();
  }
  dictNumberDisabled() {
    cy.get(`${MODAL} #dictNumber`).should("be.disabled");
  }
  dictCategory(value) {
    adminJsonRead("/rest/dictionary-categories").then((list) => {
      const found = list.filter((r) => r.description === value);
      expect(found, `original category ${value}`).to.have.length(1);
      this.categoryId = String(found[0].id);
    });
    cy.get(`${MODAL} #description button`).should("be.visible").click();
    cy.contains(
      `${MODAL} #description [role='option']`,
      new RegExp(`^${Cypress._.escapeRegExp(value)}$`),
    )
      .should("be.visible")
      .click();
  }
  dictEntry(value) {
    this.entry = value;
    cy.get(`${MODAL} #dictEntry`).clear().type(value);
  }
  localAbbreviation(value) {
    this.abbreviation = value;
    cy.get(`${MODAL} #localAbbrev`).clear().type(value);
  }
  isActive(value) {
    this.active = value;
    cy.get(`${MODAL} #isActive button`).click();
    cy.contains(`${MODAL} #isActive [role='option']`, new RegExp(`^${value}$`))
      .should("be.visible")
      .click();
    cy.get(`${MODAL} #isActive .cds--list-box__label`).should(
      "have.text",
      value,
    );
  }
  notActive(value) {
    this.isActive(value);
  }
  findEntry(value) {
    return adminJsonRead("/rest/SearchDictionaryMenu", {
      search: "Y",
      startingRecNo: 1,
      searchString: value,
    }).then((list) => {
      const rows = list.menuList.filter((r) => r.dictEntry === value);
      expect(rows, `exact dictionary identity ${value}`).to.have.length(1);
      this.selectedId = String(rows[0].id);
      return rows[0];
    });
  }
  verifyReadback(sent) {
    return this.findEntry(sent.dictEntry).then((row) =>
      adminJsonRead("/rest/Dictionary", { ID: row.id, startingRecNo: 1 }).then(
        (actual) => {
          ["dictEntry", "localAbbreviation", "isActive"].forEach((k) =>
            expect(actual[k], `fresh dictionary ${k}`).to.eq(sent[k]),
          );
          expect(
            String(actual.dictionaryCategory.id),
            "original category retained",
          ).to.eq(String(sent.selectedDictionaryCategoryId));
          expect(actual.loincCode || null, "LOINC preserved").to.eq(
            sent.loincCode || null,
          );
          return actual;
        },
      ),
    );
  }
  submit(key) {
    const alias = `dictionarySave${++this.sequence}`;
    cy.intercept("POST", "**/rest/Dictionary*").as(alias);
    cy.contains(`${MODAL} .cds--modal-footer button`, adminLabel(key))
      .should("be.enabled")
      .click();
    cy.wait(`@${alias}`).then(({ request, response }) => {
      expect(response.statusCode).to.be.oneOf([200, 201]);
      const sent = parse(request.body);
      expect(sent.dictEntry).to.eq(this.entry);
      expect(sent.isActive).to.eq(this.active);
      expect(sent.localAbbreviation).to.eq(this.abbreviation);
      this.verifyReadback(sent);
    });
    cy.get(MODAL).should("not.exist");
  }
  addButton() {
    this.submit("label.button.add");
  }
  clickUpdateButton() {
    this.submit("label.button.update");
  }
  clickCancelButton() {
    cy.contains(
      `${MODAL} .cds--modal-footer button`,
      adminLabel("label.button.cancel"),
    )
      .should("be.enabled")
      .click();
    cy.get(MODAL).should("not.exist");
    adminJsonRead("/rest/SearchDictionaryMenu", {
      search: "Y",
      startingRecNo: 1,
      searchString: this.entry,
    }).then((r) => {
      expect(
        r.menuList.filter((v) => v.dictEntry === this.entry),
        "cancel creates no dictionary entry",
      ).to.have.length(0);
      expect(this.posts, "cancel makes no write").to.have.length(0);
    });
  }
  searchByDictionaryEntry(value) {
    this.entry = value;
    const alias = `dictionarySearch${++this.sequence}`;
    cy.intercept({
      method: "GET",
      pathname: "**/rest/SearchDictionaryMenu",
      query: { searchString: value },
    }).as(alias);
    cy.get("#dictionary-entry-search").clear().type(value);
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      const rows = response.body.menuList.filter((r) => r.dictEntry === value);
      expect(rows).to.have.length(1);
      this.selectedId = String(rows[0].id);
    });
    cy.contains(`${PAGE} tbody tr`, value).should("have.length", 1);
  }
  clearSearch() {
    cy.get("#dictionary-entry-search").clear();
  }
  checkFirstDict() {
    cy.then(() =>
      cy
        .get(`[data-cy='cell-dictEntry-${this.selectedId}']`)
        .should("have.text", this.entry)
        .closest("tr")
        .find("label.cds--checkbox-label")
        .should("be.visible")
        .click(),
    );
  }
  clickModifyButton() {
    const alias = `dictionaryEditor${++this.sequence}`;
    cy.intercept("GET", "**/rest/Dictionary?*").as(alias);
    cy.get(`${PAGE} [data-cy='modifyButton']`).should("be.enabled").click();
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      const r = response.body;
      expect(String(r.id)).to.eq(this.selectedId);
      this.entry = r.dictEntry;
      this.abbreviation = r.localAbbreviation;
      this.categoryId = String(r.dictionaryCategory.id);
    });
    this.validateModal();
  }
  validateColumnContent(column, row, value) {
    cy.then(() => {
      expect(row === "first" || String(row) === this.selectedId).to.eq(true);
      cy.get(`[data-cy='cell-${column}-${this.selectedId}']`).should(
        "have.text",
        value,
      );
    });
    this.findEntry(this.entry).then((r) =>
      expect(r[column], "independent searched value").to.eq(value),
    );
  }
  clickDeactivateButton() {
    const alias = `dictionaryDeactivate${++this.sequence}`;
    cy.intercept("POST", "**/rest/DeleteDictionary?*").as(alias);
    cy.get(`${PAGE} [data-cy='deactivateButton']`).should("be.enabled").click();
    cy.wait(`@${alias}`).then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(new URL(request.url).searchParams.get("ID")).to.eq(
        this.selectedId,
      );
      adminJsonRead("/rest/Dictionary", {
        ID: this.selectedId,
        startingRecNo: 1,
      }).then((r) => {
        expect(r.isActive).to.eq("N");
        expect(r.dictEntry).to.eq(this.entry);
      });
    });
  }
}
export default DictionaryMenuPage;
