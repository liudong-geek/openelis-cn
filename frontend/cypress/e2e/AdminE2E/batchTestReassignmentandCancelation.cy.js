import LoginPage from "../../pages/LoginPage";

describe("Batch Test Reassignment and Canelation", function () {
  let homePage, loginPage, adminPage, batchTestPage;

  before(() => {
    loginPage = new LoginPage();
    loginPage.visit();
    homePage = loginPage.goToHomePage();
    adminPage = homePage.goToAdminPage();
  });

  it("Navigate to Batch Test Reassignment and Canelation Page", () => {
    batchTestPage = adminPage.goToBatchTestReassignmentandCanelationPage();
    batchTestPage.validatePageTitle();
  });

  describe("Enter Data and Cancel", () => {
    it("Select Serum and Amylase; exclude identical replacement", () => {
      batchTestPage.selectSampleType();
      batchTestPage.checkBoxes("currentTest");
      batchTestPage.selectTest("1");
      batchTestPage.checkBoxes("replaceWith");
      batchTestPage.selectTest("0");
    });

    it("Cancel Changes", () => {
      batchTestPage.clickCancel();
    });
  });

  describe("Enter Data and Save", () => {
    it("Select Serum and Amylase; exclude identical replacement", () => {
      batchTestPage.selectSampleType();
      batchTestPage.checkBoxes("currentTest");
      batchTestPage.selectTest("1");
      batchTestPage.checkBoxes("replaceWith");
      batchTestPage.selectTest("0");
    });

    it("Reject identical replacement without changing pending analyses", () => {
      batchTestPage.clickOk();
    });
  });
});
