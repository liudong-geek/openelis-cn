import LoginPage from "../pages/LoginPage";
import AdminPage from "../pages/AdminPage";

let homePage = null;
let loginPage = null;
let batchOrder = null;
let adminPage = new AdminPage();
let savedBatchPatient = null;

const navigateToBatchOrderEntryPage = () => {
  homePage = loginPage.goToHomePage();
  batchOrder = homePage.goToBatchOrderEntry();
};

before(() => {
  cy.fixture("BatchOrder").as("batchOrderData");
});

before("login", () => {
  loginPage = new LoginPage();
  loginPage.visit();
});

describe("Batch Order Entry On Demand and Serum form type", function () {
  before("navigate to Batch Order Entry Page", function () {
    navigateToBatchOrderEntryPage();
  });

  it("User visits Batch Order Entry Setup Page", function () {
    batchOrder.visitSetupPage();
    batchOrder.checkNextButtonDisabled();
  });

  it("User selects Routine Form and Serum Sample", function () {
    const data = this.batchOrderData;
    batchOrder.selectForm(data.formTypeRoutine);
    batchOrder.selectSampleType(data.serumSample);
  });

  it("User checks Panels and Tests", function () {
    batchOrder.checkBilanPanel();
    batchOrder.checkSerologiePanel();
    //tests picked at random
    batchOrder.checkDenguePCR();
    batchOrder.checkHIVViralLoad();
    batchOrder.checkCreatinine();
  });

  it("Should Select Methods, Site Name and Move to Next Page", function () {
    const data = this.batchOrderData;
    batchOrder.selectMethod(data.methodOnDemand);
    batchOrder.checkFacilityCheckbox();
    batchOrder.checkPatientCheckbox();
    batchOrder.enterSiteName(data.siteName);
    batchOrder.checkNextButtonEnabled();
  });

  it("User adds New Patient", function () {
    batchOrder.clickNewPatientButton();
    const data = this.batchOrderData;
    batchOrder.uniqueHealthIDNum(data.healthID);
    batchOrder.nationalID(data.nationalID);
    batchOrder.firstName(data.firstName);
    batchOrder.lastName(data.lastName);
    batchOrder.typePatientYears(data.years);
    batchOrder.typePatientMonths(data.months);
    batchOrder.typePatientDays(data.days);
    batchOrder.selectGender(); //female in this case
  });
  it("Generate BarCode", function () {
    const data = this.batchOrderData;
    batchOrder.typeLabNumber(data.labNumber);
    batchOrder.clickGenerateAndSaveBarcode();
    batchOrder.checkNextLabel().should("be.visible");
    batchOrder.assertSavedOrder().then((saved) => {
      savedBatchPatient = saved.patient;
    });
  });

  it("User clicks the finish button", function () {
    batchOrder.clickFinishButton();
  });
});
describe("Current China LIS routine preprinted batch workflow", function () {
  before("navigate to Batch Order Entry Page", function () {
    navigateToBatchOrderEntryPage();
  });
  it("opens the current routine setup for a preprinted batch and blocks an incomplete start", function () {
    batchOrder.visitSetupPage();
    batchOrder.checkNextButtonDisabled();
    batchOrder.selectForm(this.batchOrderData.formTypeRoutine);
  });
  it("selects the real serum tube and configured routine tests for the batch", function () {
    batchOrder.selectSampleType(this.batchOrderData.serumSample);
    batchOrder.checkBilanPanel();
    batchOrder.checkSerologiePanel();
    batchOrder.checkDenguePCR();
    batchOrder.checkHIVViralLoad();
    batchOrder.checkCreatinine();
  });
  it("selects preprinted labels and the real sending site and configured department", function () {
    batchOrder.selectMethod(this.batchOrderData.methodPrePrinted);
    batchOrder.checkFacilityCheckbox();
    batchOrder.checkPatientCheckbox();
    batchOrder.enterSiteName(this.batchOrderData.siteName);
    batchOrder.selectConfiguredDepartment();
    batchOrder.checkNextButtonEnabled();
  });
  it("selects the exact saved patient from the real local search", function () {
    batchOrder.selectExactSavedPatient(savedBatchPatient);
  });
  it("opens the actual batch-entry summary with unchanged tube tests site and department", function () {
    batchOrder.visitBatchOrderEntryPage();
  });
  it("saves a real preprinted batch order and reads the exact accession back", function () {
    batchOrder.typeLabNumber(this.batchOrderData.labNumber);
    batchOrder.saveOrder();
    batchOrder.assertSavedOrder();
  });
  it("finishes the batch then verifies a fresh setup can be canceled without clinical submission", function () {
    batchOrder.clickFinishButton();
    batchOrder.cancelFreshSetupWithoutSave();
  });
});
