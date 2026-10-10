import LoginPage from "../../pages/LoginPage";

let homePage, adminPage, barcodePage;
const presetName = `E2E label preset ${Date.now()}`;

before(() => {
  const loginPage = new LoginPage();
  loginPage.visit();
  homePage = loginPage.goToHomePage();
  adminPage = homePage.goToAdminPage();
});

// E-01 draft: the first seven old global-layout cases are explicitly retired
// and mapped to current label presets. The real print chain remains separate.
describe("Barcode configuration", function () {
  it("User Navigates to Label Presets", function () {
    barcodePage = adminPage.goToBarcodeConfigPage();
    barcodePage.openNewPreset(presetName);
  });
  it("User adjusts the label preset default order and sample quantities", function () {
    barcodePage.defaults();
  });
  it("User selects the label preset template and maximum quantities", function () {
    barcodePage.templateAndMaximums();
  });
  it("User disables order scope and verifies disabled quantity fields", function () {
    barcodePage.disableOrderScope();
  });
  it("User adjusts the label preset dimensions and preview", function () {
    barcodePage.dimensions();
  });
  it("User enables order and sample label scopes", function () {
    barcodePage.restoreScopes();
  });
  it("Save and read back the named label preset and additional-field defaults", function () {
    barcodePage.saveAndReadPreset();
  });
  it("Navigate to Barcode Page", function () {
    barcodePage.openPrintFromMenu();
  });
  it("Add Site Name and Sample", function () {
    cy.fixture("Order").then((order) =>
      barcodePage.enterSiteName(order.siteName),
    );
    barcodePage.selectSampleTypeOption("Serum");
  });
  it("Check Panels and Pre-Print Labels", function () {
    barcodePage.selectOriginalPanels();
    barcodePage.clickPrePrintButton();
  });
  it("Add Accession Number and Submit", function () {
    cy.fixture("Patient").then((patient) =>
      barcodePage.searchExistingAccession(patient.labNo),
    );
  });
});
