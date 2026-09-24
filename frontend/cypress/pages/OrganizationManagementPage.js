const TEST_ORG_NAME = "TEST-ORG-E2E";
const TEST_LAB_NAME = "TEST-LAB-E2E";
const TEST_ORG_PREFIX = "E2E-ORG";

class OrganizationManagementPage {
  constructor() {
    this.selectors = {
      addButton: ".organization-management-page",
      saveButton: "#saveButton",
      orgName: "#org-name",
      orgPrefix: "#org-prefix",
      isActive: "#org-active",
      parentOrgName: "#parentOrgName",
      orgSearchBar: "#org-name-search-bar",
      referringClinic: "#organization-type-5",
      referralLab: "#organization-type-6",
      orgTableRow: ".organization-management-page table tbody",
    };
  }

  clickAddOrganization() {
    cy.intercept("GET", "**/rest/Organization?ID=0&startingRecNo=1").as(
      "newOrganizationForm",
    );
    cy.intercept("GET", "**/rest/displayList/ACTIVE_ORG_LIST").as(
      "organizationParents",
    );
    cy.get(this.selectors.addButton)
      .contains("button", "新建机构或科室")
      .first()
      .should("be.visible")
      .click();
    cy.wait("@newOrganizationForm")
      .its("response.statusCode")
      .should("eq", 200);
    cy.wait("@organizationParents")
      .its("response.statusCode")
      .should("eq", 200);
    cy.contains("h1", "新增机构或科室").should("be.visible");
  }

  addOrgName(orgName = TEST_ORG_NAME) {
    cy.get(this.selectors.orgName)
      .should("be.visible")
      .clear()
      .type(orgName)
      .should("have.value", orgName);
  }

  addInstituteName(instituteName = TEST_LAB_NAME) {
    cy.get(this.selectors.orgName)
      .should("be.visible")
      .clear()
      .type(instituteName)
      .should("have.value", instituteName);
  }

  activateOrganization() {
    cy.get(this.selectors.isActive).select("Y").should("have.value", "Y");
  }

  addPrefix(prefix = TEST_ORG_PREFIX) {
    cy.get(this.selectors.orgPrefix)
      .should("be.visible")
      .clear()
      .type(prefix)
      .should("have.value", prefix);
  }

  addInstitutePrefix() {
    cy.get(this.selectors.orgPrefix).should("be.visible").clear();
  }

  checkReferringClinic() {
    cy.get(this.selectors.referringClinic)
      .check({ force: true })
      .should("be.checked");
  }

  checkReferalLab() {
    cy.get(this.selectors.referralLab)
      .check({ force: true })
      .should("be.checked");
  }

  addParentOrg(parentOrgName = TEST_ORG_NAME) {
    cy.get(this.selectors.parentOrgName)
      .should("be.visible")
      .clear()
      .type(parentOrgName)
      .should("have.value", parentOrgName);
    cy.intercept("GET", "**/rest/organization/*").as(
      "selectedOrganizationParent",
    );
    cy.contains('[data-cy="auto-suggestion"]', parentOrgName)
      .should("be.visible")
      .click();
    cy.wait("@selectedOrganizationParent").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.organizationName).to.eq(parentOrgName);
      expect(String(response.body.id)).to.match(/^[1-9][0-9]*$/);
    });
  }

  saveOrganization() {
    cy.get(this.selectors.saveButton)
      .should("be.visible")
      .and("not.be.disabled")
      .click();
  }

  searchOrganzation(orgName = TEST_ORG_NAME) {
    cy.intercept({
      method: "GET",
      pathname: "/api/OpenELIS-Global/rest/SearchOrganizationMenu",
      query: { searchString: orgName },
    }).as("searchOrganization");
    cy.get(this.selectors.orgSearchBar)
      .should("be.visible")
      .clear()
      .type(orgName);
    cy.wait("@searchOrganization").its("response.statusCode").should("eq", 200);
  }

  searchInstitute(instituteName = TEST_LAB_NAME) {
    this.searchOrganzation(instituteName);
  }

  confirmOrganization(orgName = TEST_ORG_NAME) {
    cy.get(this.selectors.orgTableRow).contains(orgName).should("be.visible");
  }

  confirmInstitute(instituteName = TEST_LAB_NAME, parentOrgName) {
    cy.get(this.selectors.orgTableRow)
      .contains(instituteName)
      .should("be.visible")
      .closest("tr")
      .should("contain.text", parentOrgName);
  }
}

export default OrganizationManagementPage;
