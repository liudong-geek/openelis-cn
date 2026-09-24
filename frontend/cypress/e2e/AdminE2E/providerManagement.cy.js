import LoginPage from "../../pages/LoginPage";

let homePage = null;
let loginPage = null;
let adminPage = null;
let providerManagementPage = null;

// Order.json, DashBoard and StudyReport share the original provider names.
// Capture each new ID/fhirUuid to distinguish earlier fixtures with that name.
const firstProvider = { lastName: "Prime", firstName: "Optimus" };
const secondProvider = { lastName: "Jam", firstName: "Jim" };

before("login", () => {
  loginPage = new LoginPage();
  loginPage.visit();
});

describe("Provider Management", function () {
  it("Navigate to Admin Page", function () {
    homePage = loginPage.goToHomePage();
    adminPage = homePage.goToAdminPageProgram();
  });

  describe("Enter Provider", () => {
    it("Navigate to Provider Management Page", () => {
      cy.intercept("GET", "**/rest/ProviderMenu?paging=1&startingRecNo=1").as(
        "initialProviderList",
      );
      providerManagementPage = adminPage.goToProviderManagementPage();
      providerManagementPage.waitForList("initialProviderList");
    });

    it("Enter First Provider details", function () {
      providerManagementPage.clickAddProviderButton();
      providerManagementPage.enterProviderLastName(firstProvider.lastName);
      providerManagementPage.enterProviderFirstName(firstProvider.firstName);
      providerManagementPage.activeStatus(false);
      providerManagementPage.addProvider(firstProvider, false);
    });

    it("Enter Second Provider details", function () {
      providerManagementPage.clickAddProviderButton();
      providerManagementPage.enterProviderLastName(secondProvider.lastName);
      providerManagementPage.enterProviderFirstName(secondProvider.firstName);
      providerManagementPage.activeStatus(true);
      providerManagementPage.addProvider(secondProvider, true);
    });

    it("Validate added Providers", function () {
      providerManagementPage.searchProvider(firstProvider, false);
      providerManagementPage.confirmProvider(firstProvider, false);
      providerManagementPage.searchProvider(secondProvider, true);
      providerManagementPage.confirmProvider(secondProvider, true);
    });
  });

  describe("Modify the first Provider", () => {
    it("Select and Modify Provider", () => {
      providerManagementPage.searchProvider(firstProvider, false);
      providerManagementPage.checkProvider(firstProvider);
      providerManagementPage.modifyProvider(firstProvider, false);
      providerManagementPage.modifyStatus(true);
      providerManagementPage.updateProvider(firstProvider, true);
    });

    it("Validate Active Status", () => {
      providerManagementPage.searchProvider(firstProvider, true);
      providerManagementPage.confirmProvider(firstProvider, true);
    });
  });

  describe("Deactivate the second Provider", () => {
    it("Select and Deactivate Provider", () => {
      providerManagementPage.searchProvider(secondProvider, true);
      providerManagementPage.checkProvider(secondProvider);
      providerManagementPage.deactivateProvider(secondProvider);
    });

    it("Validate Active Status", () => {
      providerManagementPage.searchProvider(secondProvider, false);
      providerManagementPage.confirmProvider(secondProvider, false);
    });
  });
});
