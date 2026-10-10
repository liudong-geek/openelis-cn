import LoginPage from "../../pages/LoginPage";

describe("Test Management", function () {
  let adminPage, testManagementPage;
  before(() => {
    const loginPage = new LoginPage();
    loginPage.visit();
    adminPage = loginPage.goToHomePage().goToAdminPage();
  });
  // E-01 draft: current catalog cases replace explicitly retired root/guide/column controls.
  it("Navigate to the current Test Catalog list", () => {
    testManagementPage = adminPage.goToTestManagementPage();
    testManagementPage.validatePageTitle();
  });
  it("Create an inactive Test Catalog item and read it back", () => {
    cy.fixture("ReflexTestsConfig").then((fixture) =>
      testManagementPage.createAndReadBack(fixture.sample),
    );
  });
  it("Keep Test Catalog filters and pagination state", () => {
    testManagementPage.applyAndKeepListState();
  });
  it("Open linked Test Catalog configuration and return to the same list", () => {
    testManagementPage.linkedEditorAndReturn();
  });
});
