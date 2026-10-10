import LoginPage from "../pages/LoginPage";

let homePage = null;
let dashboard = null;

describe("Dashboard Tests", function () {
  before("Navigate to homepage", () => {
    const loginPage = new LoginPage();
    loginPage.visit();
    homePage = loginPage.goToHomePage();
  });

  describe("Pathology Dashboard", function () {
    before("Navigate to protected specialty dashboard", function () {
      dashboard = homePage.goToPathologyDashboard();
    });

    it("User adds a new Pathology order", function () {
      dashboard.addOriginalOrder(homePage);
    });

    it("User navigates back to Pathology Dashboard to confirm added order", function () {
      dashboard = homePage.goToPathologyDashboard();
    });

    it("Change The Status of Order and saves it", function () {
      dashboard.completeThroughActualAssignmentAndRelease();
    });

    it("Validate the Status of Order", function () {
      dashboard = homePage.goToPathologyDashboard();
      dashboard.assertCreatedCaseCompletedInDashboard();
    });
  });

  describe("ImmunoChemistry Dashboard", function () {
    before("Navigate to protected specialty dashboard", function () {
      dashboard = homePage.goToImmunoChemistryDashboard();
    });

    it("User adds a new ImmunoChemistry order", function () {
      dashboard.addOriginalOrder(homePage);
    });

    it("Validate Success by Confirming Print Barcode button", function () {
      dashboard.assertOriginalPrintBarcodeButton();
    });

    it("User navigates back to ImmunoChemistry Dashboard to confirm added order", function () {
      dashboard = homePage.goToImmunoChemistryDashboard();
    });

    it("Change The Status of Order and saves it", function () {
      dashboard.completeThroughActualAssignmentAndRelease();
    });

    it("Validate the Status of Order", function () {
      dashboard = homePage.goToImmunoChemistryDashboard();
      dashboard.assertCreatedCaseCompletedInDashboard();
    });
  });

  describe("Cytology Dashboard", function () {
    before("Navigate to protected specialty dashboard", function () {
      dashboard = homePage.goToCytologyDashboard();
    });

    it("User adds a new Cytology order", function () {
      dashboard.addOriginalOrder(homePage);
    });

    it("Validate Success by Confirming Print Barcode button", function () {
      dashboard.assertOriginalPrintBarcodeButton();
    });

    it("User navigates back to Cytology Dashboard to confirm added order", function () {
      dashboard = homePage.goToCytologyDashboard();
    });

    it("Change The Status of Order and saves it", function () {
      dashboard.completeThroughActualAssignmentAndRelease();
    });

    it("Validate the Status of Order", function () {
      dashboard = homePage.goToCytologyDashboard();
      dashboard.assertCreatedCaseCompletedInDashboard();
    });
  });
});
