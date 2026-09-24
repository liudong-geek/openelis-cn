import LoginPage from "../pages/LoginPage";

const runNumber = `${Date.now()}${Cypress._.random(1000, 9999)}`;
const alphaSuffix = runNumber
  .slice(-8)
  .split("")
  .map((digit) => "abcdefghij"[Number(digit)])
  .join("");
const patient = {
  firstName: `Eli${alphaSuffix}`,
  lastName: `Cyp${alphaSuffix}`,
  subjectNumber: runNumber.slice(-12),
  nationalId: `CN-E2E-${runNumber}`,
  dateOfBirth: "",
  gender: "M",
  unmatchedLabNumber: `E2E${runNumber}`,
};

let homePage;
let loginPage;
let patientPage;
let savedPatientId;

const enterCurrentPatient = () => {
  patientPage.enterPatientInfo(
    patient.firstName,
    patient.lastName,
    patient.subjectNumber,
    patient.nationalId,
    patient.dateOfBirth,
  );
  patientPage.assertEnteredPatientInfo(patient);
};

const reopenAdvancedPatientSearch = () => {
  patientPage = homePage.goToPatientEntry();
  patientPage.openAdvancedSearch();
};

before("open the authenticated application", () => {
  loginPage = new LoginPage();
  loginPage.visit();
});

describe("Patient records through the China LIS workflow", function () {
  it("enters patient records from Orders and specimens through the intake workbench", () => {
    homePage = loginPage.goToHomePage();
    patientPage = homePage.goToPatientEntry();
  });

  it("shows the default list and reads real quick-search matches beyond 100", () => {
    patientPage.assertPatientManagementBoundary();
    patientPage.verifyDefaultListAndQuickPagingBoundary();
  });

  it("opens local advanced search without exposing external patient search", () => {
    patientPage.openAdvancedSearch();
    cy.get("#local_search").should("be.visible");
    cy.get("#external_search").should("not.exist");
  });

  it("opens the current new-patient route from the patient header", () => {
    patientPage.clickNewPatientTab();
    patientPage.getSubmitButton().should("be.visible");
  });

  it("fills every required patient identity field with a run-unique patient", () => {
    patientPage.getDateOfBirthForCurrentLocale().then((dateOfBirth) => {
      patient.dateOfBirth = dateOfBirth;
      enterCurrentPatient();
    });
  });

  it("clears the populated new-patient form without saving", () => {
    let clearTriggeredSave = false;
    cy.intercept("POST", "**/rest/PatientManagement", () => {
      clearTriggeredSave = true;
    });

    patientPage.clearPatientInfo();
    patientPage.assertPatientInfoCleared();
    cy.then(() => {
      expect(clearTriggeredSave, "clear does not submit a patient").to.eq(
        false,
      );
    });
  });

  it("refills the same run-unique patient after clearing", () => {
    enterCurrentPatient();
  });

  it("saves the real patient, captures its returned id, and reads its detail back", () => {
    patientPage.savePatientAndVerifyDetails(patient).then((patientId) => {
      savedPatientId = patientId;
      expect(savedPatientId, "captured patient id").to.match(/^[1-9][0-9]*$/);
    });
  });

  it("finds the saved patient by gender with an exact local advanced request", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { gender: patient.gender },
      {
        targetPatientId: savedPatientId,
        expectedResult: { gender: patient.gender },
        rowValues: [patient.firstName, patient.lastName],
        rowMessageKeys: ["patient.male"],
      },
    );
  });

  it("finds the saved patient by last name only", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { lastName: patient.lastName },
      {
        targetPatientId: savedPatientId,
        expectedResult: {
          lastName: patient.lastName,
          firstName: patient.firstName,
        },
        rowValues: [patient.lastName, patient.firstName],
      },
    );
  });

  it("finds the saved patient by first name only", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { firstName: patient.firstName },
      {
        targetPatientId: savedPatientId,
        expectedResult: {
          firstName: patient.firstName,
          lastName: patient.lastName,
        },
        rowValues: [patient.firstName, patient.lastName],
      },
    );
  });

  it("finds the saved patient by the combined last-name and first-name fields", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { lastName: patient.lastName, firstName: patient.firstName },
      {
        targetPatientId: savedPatientId,
        expectedResult: {
          lastName: patient.lastName,
          firstName: patient.firstName,
        },
        rowValues: [patient.lastName, patient.firstName],
      },
    );
  });

  it("finds the saved patient by configured-locale date of birth", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { dateOfBirth: patient.dateOfBirth },
      {
        targetPatientId: savedPatientId,
        expectedResult: { dob: patient.dateOfBirth },
        rowValues: [patient.dateOfBirth, patient.firstName, patient.lastName],
      },
    );
  });

  it("returns a real empty result for a run-unique unmatched lab number", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { labNumber: patient.unmatchedLabNumber },
      {
        expectEmpty: true,
      },
    );
  });

  it("finds the saved patient through all patient-identifier parameters", () => {
    reopenAdvancedPatientSearch();
    patientPage.runAdvancedSearch(
      { patientId: patient.nationalId },
      {
        targetPatientId: savedPatientId,
        expectedResult: {
          patientID: savedPatientId,
          nationalId: patient.nationalId,
        },
        rowValues: [patient.nationalId, patient.firstName, patient.lastName],
      },
    );
  });
});
