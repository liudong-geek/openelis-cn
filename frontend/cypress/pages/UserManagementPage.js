import {
  adminLabel,
  adminJsonRead,
  selectOriginalLab,
  setVisibleCheckbox,
} from "./CurrentAdminLabels";
const MODAL = ".oe-admin-modal.is-visible:has(.user-editor-page)";
const PAGE = ".user-management-page";
const parse = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
const permissionScope = (map) =>
  Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((id) => [id, map[id].map(String).sort()]),
  );
const calendarDate = (value) => {
  const s = String(value);
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return iso.slice(1).map(Number);
  const display = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  expect(display, "actual account expiry calendar format").not.to.eq(null);
  return [Number(display[3]), Number(display[1]), Number(display[2])];
};
class UserManagementPage {
  constructor() {
    this.sequence = 0;
    this.lastSearch = "";
  }
  verifyPageTitle() {
    cy.contains(
      `${PAGE} h1`,
      adminLabel("unifiedSystemUser.browser.title"),
    ).should("be.visible");
    cy.get("#user-name-search-bar").should("be.visible").and("be.enabled");
  }
  validatePageTitle() {
    cy.get(MODAL).should("have.length", 1).and("be.visible");
    cy.contains(
      `${MODAL} .cds--modal-header__heading`,
      adminLabel("unifiedSystemUser.add.user"),
    ).should("be.visible");
  }
  clickAddButton() {
    const alias = `actualUserEditor${++this.sequence}`;
    cy.intercept({
      method: "GET",
      pathname: "**/rest/UnifiedSystemUser",
      query: { ID: "0" },
    }).as(alias);
    cy.contains(
      `${PAGE} .oe-page-header button`,
      adminLabel("unifiedSystemUser.browser.button.add"),
    )
      .should("be.visible")
      .click();
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.editorInitial = response.body;
    });
    cy.get(`${MODAL} #login-name`).should("be.visible");
  }
  typeLoginName(v) {
    this.loginName = v;
    cy.get(`${MODAL} #login-name`).should("be.visible").clear().type(v);
  }
  typeLoginPassword(v) {
    cy.get(`${MODAL} #login-password`).should("be.visible").clear().type(v);
  }
  repeatPassword(v) {
    cy.get(`${MODAL} #login-repeat-password`).clear().type(v);
  }
  enterFirstName(v) {
    cy.get(`${MODAL} #first-name`).clear().type(v);
  }
  enterLastName(v) {
    cy.get(`${MODAL} #last-name`).clear().type(v);
  }
  passwordExpiryDate(v) {
    // Original fixture m/d/Y denotes the same future calendar date in a Chinese input.
    const [m, d, y] = v.split("/");
    expect(y).to.match(/^\d{4}$/);
    cy.get(`${MODAL} #password-expire-date`)
      .should("be.visible")
      .and("be.enabled")
      .clear()
      .type(`${y}/${m.padStart(2, "0")}/${d.padStart(2, "0")}`)
      .blur();
    cy.get("body").type("{esc}");
    cy.get(`${MODAL} #password-expire-date`).should("not.have.value", "");
  }
  enterUserTimeout(v) {
    cy.get(`${MODAL} #login-timeout`).clear().type(v);
  }
  setAccount(id, v) {
    cy.get(`${MODAL} #${id}`).select(v);
    cy.get(`${MODAL} #${id}`).should("have.value", v);
  }
  checkAccountLocked() {
    this.setAccount("account-locked", "Y");
  }
  checkAccountNotLocked() {
    this.setAccount("account-locked", "N");
  }
  checkAccountDisabled() {
    this.setAccount("account-disabled", "Y");
  }
  checkAccountEnabled() {
    this.setAccount("account-disabled", "N");
  }
  checkActive() {
    this.setAccount("account-active", "Y");
  }
  checkNotActive() {
    this.setAccount("account-active", "N");
  }
  addNewPermission() {
    cy.get(`${MODAL} [data-cy='addNewPermission']`)
      .should("be.enabled")
      .click();
    cy.get(`${MODAL} .admin-form-workspace__permission-card`)
      .its("length")
      .should("be.greaterThan", 0);
  }
  removePermission() {
    cy.get(`${MODAL} [data-cy='removePermission']`)
      .last()
      .should("be.visible")
      .click();
  }
  selectTestSection(v) {
    selectOriginalLab(
      `${MODAL} .admin-form-workspace__permission-card select[id^='select-']:last`,
      v,
    );
  }
  allSelectedLabPermissions() {
    cy.get(
      `${MODAL} .admin-form-workspace__permission-card select[id^='select-']`,
    )
      .last()
      .invoke("val")
      .then((id) => setVisibleCheckbox(`all-permissions-${id}`, true));
  }
  allPermissions() {
    this.allSelectedLabPermissions();
  }
  allBioPermissions() {
    this.allSelectedLabPermissions();
  }
  allHemaPermissions() {
    this.allSelectedLabPermissions();
  }
  allSeroPermissions() {
    this.allSelectedLabPermissions();
  }
  allImmunoPermissions() {
    this.allSelectedLabPermissions();
  }
  allMolecularPermissions() {
    this.allSelectedLabPermissions();
  }
  allCytoPermissions() {
    this.allSelectedLabPermissions();
  }
  allSerologyPermissions() {
    this.allSelectedLabPermissions();
  }
  allViroPermissions() {
    this.allSelectedLabPermissions();
  }
  allPathoPermissions() {
    this.allSelectedLabPermissions();
  }
  allImmunoHistoPermissions() {
    this.allSelectedLabPermissions();
  }
  globalRole(name) {
    cy.then(() => {
      const roles = this.editorInitial.globalRoles.filter(
        (r) => r.roleName === name,
      );
      expect(roles, `real available global role ${name}`).to.have.length(1);
      const id = roles[0].elementID;
      cy.get(`${MODAL} label[for='${id}']`)
        .scrollIntoView()
        .should("be.visible")
        .click();
    });
  }
  analyzerImport() {
    this.globalRole("Analyser Import");
  }
  auditTrail() {
    this.globalRole("Audit Trail");
  }
  cytopathologist() {
    this.globalRole("Cytopathologist");
  }
  globalAdministrator() {
    this.globalRole("Global Administrator");
  }
  pathologist() {
    this.globalRole("Pathologist");
  }
  userAccountAdmin() {
    this.globalRole("User Account Administrator");
  }
  laboratoryRole(name) {
    cy.then(() => {
      const roles = this.editorInitial.labUnitRoles.filter(
        (r) => r.roleName === name,
      );
      expect(roles).to.have.length(1);
      cy.get(`${MODAL} .admin-form-workspace__permission-card select`)
        .last()
        .invoke("val")
        .then((id) => {
          cy.get(`label[for='${roles[0].elementID}-${id}']`)
            .scrollIntoView()
            .should("be.visible")
            .click();
        });
    });
  }
  reception() {
    this.laboratoryRole("Reception");
  }
  reports() {
    this.laboratoryRole("Reports");
  }
  results() {
    this.laboratoryRole("Results");
  }
  watchUserSave() {
    const alias = `actualUserSave${++this.sequence}`;
    cy.intercept("POST", "**/rest/UnifiedSystemUser").as(alias);
    return alias;
  }
  savedUserReadback(sent) {
    return adminJsonRead("/rest/SearchUnifiedSystemUserMenu", {
      search: "Y",
      searchString: sent.userLoginName,
      startingRecNo: 1,
      filter: "",
      roleFilter: "",
    }).then((list) => {
      const rows = list.menuList.filter(
        (r) => r.loginName === sent.userLoginName,
      );
      expect(rows, "exact saved login identity").to.have.length(1);
      this.savedUserId = rows[0].combinedUserID;
      expect(String(rows[0].systemUserId)).to.match(/^[1-9]\d*$/);
      return adminJsonRead("/rest/UnifiedSystemUser", {
        ID: this.savedUserId,
        startingRecNo: 1,
        roleFilter: "",
      }).then((actual) => {
        [
          "userLoginName",
          "userFirstName",
          "userLastName",
          "accountActive",
          "accountLocked",
          "accountDisabled",
          "timeout",
        ].forEach((key) =>
          expect(String(actual[key]), `independent saved ${key}`).to.eq(
            String(sent[key]),
          ),
        );
        expect(
          calendarDate(actual.expirationDate),
          "persisted future expiry date",
        ).to.deep.eq(calendarDate(sent.expirationDate));
        if (sent.systemUserIdToCopy && sent.systemUserIdToCopy !== "0") {
          expect(
            String(sent.systemUserIdToCopy),
            "original copied user identity",
          ).to.eq(String(this.copySource.systemUserId));
          expect(
            actual.selectedRoles.map(String).sort(),
            "real copied global permissions",
          ).to.deep.eq(this.copySource.selectedRoles.map(String).sort());
          expect(
            permissionScope(actual.selectedTestSectionLabUnits),
            "real copied professional-unit scope",
          ).to.deep.eq(
            permissionScope(this.copySource.selectedTestSectionLabUnits),
          );
        } else {
          expect(actual.selectedRoles.map(String).sort()).to.deep.eq(
            sent.selectedRoles.map(String).sort(),
          );
          expect(
            permissionScope(actual.selectedTestSectionLabUnits),
          ).to.deep.eq(permissionScope(sent.selectedTestSectionLabUnits));
        }
        return actual;
      });
    });
  }
  consumeSave(alias) {
    cy.wait(`@${alias}`).then(({ request, response }) => {
      expect(response.statusCode, "real account save").to.eq(200);
      expect(response.body).to.be.ok;
      expect(Boolean(response.body.error)).to.eq(false);
      const sent = parse(request.body);
      this.loginName = sent.userLoginName;
      this.lastSaved = sent;
      this.savedUserReadback(sent);
    });
    cy.get(MODAL).should("not.exist");
  }
  saveChanges() {
    const alias = this.watchUserSave();
    cy.get(`${MODAL} [data-cy='saveButton']`)
      .should("be.visible")
      .and("be.enabled")
      .click();
    this.consumeSave(alias);
  }
  exitChanges() {
    const posts = [];
    cy.intercept("POST", "**/rest/UnifiedSystemUser", (r) => posts.push(r));
    cy.contains(
      `${MODAL} .admin-form-workspace__actions button`,
      adminLabel("label.button.cancel"),
    )
      .should("be.enabled")
      .click();
    cy.get(MODAL).should("not.exist");
    adminJsonRead("/rest/SearchUnifiedSystemUserMenu", {
      search: "Y",
      searchString: this.loginName,
      startingRecNo: 1,
      filter: "",
      roleFilter: "",
    }).then((r) => {
      expect(
        r.menuList.filter((u) => u.loginName === this.loginName),
        "cancel creates no account",
      ).to.have.length(0);
      expect(posts).to.have.length(0);
    });
  }
  searchUser(value) {
    const alias = `actualUserSearch${++this.sequence}`;
    this.lastSearch = value;
    cy.intercept({
      method: "GET",
      pathname: "**/rest/SearchUnifiedSystemUserMenu",
      query: { searchString: value },
    }).as(alias);
    cy.get("#user-name-search-bar")
      .should("be.visible")
      .and("be.enabled")
      .clear()
      .type(value);
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.lastList = response.body;
    });
  }
  clearSearchBar() {
    cy.get("#user-name-search-bar").clear();
    this.lastSearch = "";
  }
  searchByFilters(v) {
    const alias = `actualUserRoleSearch${++this.sequence}`;
    cy.intercept("GET", "**/rest/SearchUnifiedSystemUserMenu?*").as(alias);
    selectOriginalLab("#filters", v);
    cy.wait(`@${alias}`).then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      const roleId = new URL(request.url).searchParams.get("roleFilter");
      expect(roleId).to.match(/^[1-9]\d*$/);
      expect(response.body.menuList.some((r) => r.firstName === "Willy")).to.eq(
        true,
      );
      this.lastList = response.body;
    });
  }
  validateColumnContent(oldColumn, value) {
    const field = { 2: "firstName", 3: "lastName", 4: "loginName" }[oldColumn];
    expect(field).to.be.a("string");
    cy.then(() => {
      expect(
        this.lastList.menuList.some((r) => String(r[field]).includes(value)),
        `real original ${field} search result`,
      ).to.eq(true);
    });
    const currentColumn = oldColumn === "4" ? 3 : 2;
    cy.get(`${PAGE} tbody td:nth-child(${currentColumn})`).should(
      "contain.text",
      value,
    );
  }
  setFilter(id, checked) {
    const alias = `actualUserFilter${++this.sequence}`;
    cy.intercept("GET", "**/rest/SearchUnifiedSystemUserMenu?*").as(alias);
    cy.get(`#${id}`).then(($input) => {
      if (Boolean($input.prop("checked")) !== checked) {
        cy.get(`label[for='${id}']`).should("be.visible").click();
        cy.wait(`@${alias}`).then(({ response }) => {
          expect(response.statusCode).to.eq(200);
          this.lastList = response.body;
        });
      } else {
        adminJsonRead("/rest/SearchUnifiedSystemUserMenu", {
          search: this.lastSearch ? "Y" : "N",
          searchString: this.lastSearch,
          startingRecNo: 1,
          filter: [
            ...(Cypress.$("#only-active").prop("checked") ? ["isActive"] : []),
            ...(Cypress.$("#only-administrator").prop("checked")
              ? ["isAdmin"]
              : []),
          ].join(","),
          roleFilter: Cypress.$("#filters").val() || "",
        }).then((r) => {
          this.lastList = r;
        });
      }
    });
    cy.get(`#${id}`).should(checked ? "be.checked" : "not.be.checked");
  }
  activeUser() {
    cy.get("#only-active").then(($i) =>
      this.setFilter("only-active", !$i.prop("checked")),
    );
  }
  adminUser() {
    cy.get("#only-administrator").then(($i) =>
      this.setFilter("only-administrator", !$i.prop("checked")),
    );
  }
  uncheckActiveUser() {
    this.setFilter("only-active", false);
  }
  uncheckAdminUser() {
    this.setFilter("only-administrator", false);
  }
  inactiveUser(value) {
    cy.get(PAGE).should("not.contain.text", value);
  }
  nonAdminUser(value) {
    cy.get(PAGE).should("not.contain.text", value);
  }
  checkUser(_column, value) {
    this.selectedName = value;
    cy.contains(`${PAGE} tbody tr`, value)
      .should("have.length", 1)
      .within(() =>
        cy.get("label.cds--checkbox-label").should("be.visible").click(),
      );
  }
  modifyUser() {
    const alias = `actualExistingUser${++this.sequence}`;
    cy.intercept("GET", "**/rest/UnifiedSystemUser?*").as(alias);
    cy.contains(`${PAGE} tbody tr`, this.selectedName).within(() =>
      cy
        .contains("button", adminLabel("externalconnections.action.edit"))
        .should("be.visible")
        .click(),
    );
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.editorInitial = response.body;
      this.loginName = response.body.userLoginName;
    });
    cy.get(`${MODAL} #login-name`).should("be.visible");
  }
  copyPermisionsFromUser(value) {
    adminJsonRead("/rest/SearchUnifiedSystemUserMenu", {
      search: "Y",
      searchString: value,
      startingRecNo: 1,
      filter: "",
      roleFilter: "",
    }).then((r) => {
      const users = r.menuList.filter((u) => u.lastName === value);
      expect(users).to.have.length(1);
      adminJsonRead("/rest/UnifiedSystemUser", {
        ID: users[0].combinedUserID,
        startingRecNo: 1,
        roleFilter: "",
      }).then((u) => {
        this.copySource = u;
      });
    });
    cy.get(`${MODAL} #copy-permissions`).should("be.visible").type(value);
    cy.contains(`${MODAL} [data-cy='auto-suggestion']`, value)
      .should("be.visible")
      .click();
  }
  applyChanges() {
    const alias = this.watchUserSave();
    cy.get(`${MODAL} [data-cy='apply-button']`)
      .should("be.visible")
      .and("be.enabled")
      .click();
    this.consumeSave(alias);
  }
  verifyCopiedPermissionsPersisted() {
    cy.then(() => {
      expect(this.lastSaved.systemUserIdToCopy).not.to.eq("0");
      this.savedUserReadback(this.lastSaved);
    });
  }
  deactivateUser() {
    const alias = `actualUserDeactivate${++this.sequence}`;
    cy.intercept("POST", "**/rest/DeleteUnifiedSystemUser?*").as(alias);
    cy.contains(
      `${PAGE} button`,
      adminLabel("externalconnections.action.deactivate"),
    )
      .should("be.enabled")
      .click();
    cy.contains(
      ".oe-admin-modal.is-visible .cds--modal-footer button",
      adminLabel("externalconnections.action.deactivate"),
    )
      .should("be.visible")
      .click();
    cy.wait(`@${alias}`).then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      const ids = parse(request.body).selectedIDs;
      expect(ids).to.have.length(1);
      adminJsonRead("/rest/UnifiedSystemUser", {
        ID: ids[0],
        startingRecNo: 1,
        roleFilter: "",
      }).then((u) =>
        expect(u.accountActive, "independent account deactivation").to.eq("N"),
      );
    });
  }
  enterLoginName(v) {
    cy.get("#loginName").clear().type(v);
  }
  enterPassword(v) {
    cy.get("#password").clear().type(v);
  }
  loginButton() {
    cy.get("[data-cy='loginButton']").click();
  }
}
export default UserManagementPage;
