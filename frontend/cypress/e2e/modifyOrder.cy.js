import LoginPage from "../pages/LoginPage";
import PatientEntryPage from "../pages/PatientEntryPage";
import ModifyOrderPage from "../pages/ModifyOrderPage";

// Explicit current contract migration, 19 -> 19. The retired FindOrder search
// gate and optional generation of a replacement accession are not equivalent to
// current saved-order editing. Historical source and case mapping are retained.
const loginPage = new LoginPage();
const patientPage = new PatientEntryPage();
const modifyOrderPage = new ModifyOrderPage();
let homePage;
let fixturePatient;
let createdPatient;

before("login", () => {
  loginPage.visit();
  cy.fixture("Patient").then((patient) => {
    fixturePatient = patient;
    const unique = `${Date.now()}${Cypress._.random(100000, 999999)}`;
    createdPatient = {
      ...patient,
      subjectNumber: `MOD-${unique}`,
      nationalId: `CN-E2E-MOD-${unique}`,
    };
  });
});

const fillCreatedPatient = () =>
  patientPage
    .getDateOfBirthForCurrentLocale(2001, 5, 12)
    .then((dateOfBirth) => {
      createdPatient.dateOfBirth = dateOfBirth;
      patientPage.enterPatientInfo(
        createdPatient.firstName,
        createdPatient.lastName,
        createdPatient.subjectNumber,
        createdPatient.nationalId,
        dateOfBirth,
      );
      patientPage.assertEnteredPatientInfo(createdPatient);
    });
const resetPatientSearch = () => {
  homePage = loginPage.goToHomePage();
  homePage.goToPatientEntry();
  patientPage.openAdvancedSearch();
};
const sameSeedPatient = () => ({
  targetPatientId: String(modifyOrderPage.baseline.patient.patientId),
  expectedResult: {
    patientID: String(modifyOrderPage.baseline.patient.patientId),
    firstName: fixturePatient.firstName,
    lastName: fixturePatient.lastName,
    nationalId: fixturePatient.nationalId,
    gender: "M",
  },
  rowValues: [
    fixturePatient.firstName,
    fixturePatient.lastName,
    fixturePatient.nationalId,
  ],
});

describe("Current patient modal before existing-order modification — unique synthetic identity", () => {
  it("opens patient management from the current intake workspace", () => {
    homePage = loginPage.goToHomePage();
    homePage.goToPatientEntry();
    patientPage.assertPatientManagementBoundary();
  });
  it("opens the visible new-patient modal without leaving the list", () => {
    patientPage.clickNewPatientTab();
    patientPage.getSubmitButton().should("be.visible");
  });
  it("enters the original John Smith demographic facts with independent unique identifiers", () => {
    fillCreatedPatient();
  });
  it("clears every demographic input and selected gender in the modal", () => {
    patientPage.clearPatientInfo();
    patientPage.assertPatientInfoCleared();
  });
  it("reenters the same independent patient facts before saving", () => {
    fillCreatedPatient();
  });
  it("saves once and reads back the created patient through the current list", () => {
    patientPage.savePatientAndVerifyDetails(createdPatient);
    // The unrelated patient just created is never used to select the seeded order.
  });
});

describe("Current patient criteria then saved-order editing — replaces retired FindOrder search", () => {
  it("opens the current saved application list and binds the original fixed patient and accession", () => {
    homePage = loginPage.goToHomePage();
    homePage.goToModifyOrderPage();
    modifyOrderPage.assertCurrentList();
    modifyOrderPage.bindFixtureOrder(fixturePatient);
  });
  it("queries first and last name in current patient search and retains the same seeded patient", () => {
    resetPatientSearch();
    patientPage.runAdvancedSearch(
      {
        firstName: fixturePatient.firstName,
        lastName: fixturePatient.lastName,
      },
      sameSeedPatient(),
    );
    patientPage.getFirstName().should("have.value", fixturePatient.firstName);
    patientPage
      .getLastName()
      .should("have.value", fixturePatient.lastName)
      .and("not.have.value", fixturePatient.inValidName);
    cy.get(
      `[data-cy='patient-result-row-${modifyOrderPage.baseline.patient.patientId}']`,
    ).should("not.contain", fixturePatient.inValidName);
  });
  it("queries the original male gender and binds the same seeded patient", () => {
    resetPatientSearch();
    patientPage.runAdvancedSearch(
      { gender: "M" },
      { ...sameSeedPatient(), rowMessageKeys: ["patient.male"] },
    );
    cy.get("#search-radio-1").should("be.checked");
  });
  it("queries the original national identifier and binds the same seeded patient", () => {
    resetPatientSearch();
    patientPage.runAdvancedSearch(
      { patientId: fixturePatient.nationalId },
      sameSeedPatient(),
    );
    cy.get("#patientId").should("have.value", fixturePatient.nationalId);
  });
  it("opens that patient's exact saved accession from the current application row", () => {
    homePage = loginPage.goToHomePage();
    homePage.goToModifyOrderPage();
    modifyOrderPage.openSavedOrder(fixturePatient.labNo);
  });
  it("shows all persisted tests without an obsolete program-selection gate", () => {
    modifyOrderPage.checkExistingTestsWorkspace();
  });
  it("assigns a real available test to its original persisted specimen identity", () => {
    modifyOrderPage.assignAvailableTest();
  });
  it("keeps the accession while saving the assignment once and reading it back", () => {
    modifyOrderPage.clickNextButton();
    cy.fixture("Order").then((order) =>
      modifyOrderPage.setOriginalSiteAndRequester(order),
    );
    modifyOrderPage.rememberSiteAndRequester();
    modifyOrderPage.clickSubmitAndReadBack();
  });
});

describe("Current accession-based saved-order editing — preserves the existing application", () => {
  it("reopens the saved application list after the first durable modification", () => {
    homePage = loginPage.goToHomePage();
    homePage.goToModifyOrderPage();
    modifyOrderPage.assertCurrentList();
    modifyOrderPage.bindFixtureOrder(fixturePatient);
  });
  it("queries the original accession and opens its exact current edit action", () => {
    modifyOrderPage.openSavedOrder(fixturePatient.labNo);
  });
  it("retains the original patient, specimen and persisted-test identities", () => {
    modifyOrderPage.checkExistingTestsWorkspace();
  });
  it("adds the original Serum and both clinical panels without changing existing tubes", () => {
    cy.fixture("Order").then((order) =>
      modifyOrderPage.addSerumWithOriginalPanels(order),
    );
    modifyOrderPage.clickNextButton();
  });
  it("saves original CAMES MAN and Optimus Prime with the added specimen and reads all changes back", () => {
    cy.fixture("Order").then((order) =>
      modifyOrderPage.setOriginalSiteAndRequester(order),
    );
    modifyOrderPage.rememberSiteAndRequester();
    modifyOrderPage.clickSubmitAndReadBack();
  });
});
