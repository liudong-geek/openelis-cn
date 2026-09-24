import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

let patientSearchSequence = 0;
let patientPageSequence = 0;

const advancedRequestParams = (criteria) => ({
  lastName: String(criteria.lastName || ""),
  firstName: String(criteria.firstName || ""),
  STNumber: String(criteria.patientId || ""),
  subjectNumber: String(criteria.patientId || ""),
  nationalID: String(criteria.patientId || ""),
  labNumber: String(criteria.labNumber || ""),
  guid: String(criteria.guid || ""),
  dateOfBirth: String(criteria.dateOfBirth || ""),
  gender: String(criteria.gender || ""),
});

const messagePattern = (key) => {
  const labels = [
    ...new Set([enMessages[key], zhMessages[key], zhCNMessages[key]]),
  ].filter((label) => typeof label === "string");

  if (labels.length === 0) {
    throw new Error(`Missing patient UI label: ${key}`);
  }

  return new RegExp(
    labels.map((label) => Cypress._.escapeRegExp(label)).join("|"),
  );
};

class PatientEntryPage {
  subjectNumber = "input#subjectNumber";
  nationalId = "input#nationalId";
  firstNameSelector = "input#firstName";
  lastNameSelector = "input#lastName";
  personContactLastName = "input#patientContact\\.person\\.lastName";
  personContactFirstName = "input#patientContact\\.person\\.firstName";
  personContactPrimaryPhone = "input#patientContact\\.person\\.primaryPhone";
  personContactEmail = "input#patientContact\\.person\\.email";
  patientIdSelector = "input#patientId";
  labNoSelector = "#labNumber";
  city = "input#city";
  primaryPhone = "input#primaryPhone";
  dateOfBirth = "input#date-picker-default-id";
  savePatientBtn = "#submit";
  enterPreviousLabNo = "input#labNumber";
  enterAccessionNo = "input#accessionNumber";
  startLabNo = "#startLabNo";
  endLabNoSelector = "#endLabNo";

  visit() {
    // Kept for legacy callers. The patient-management acceptance spec enters
    // through the six-workspace menu and the intake workbench instead.
    cy.visit("/PatientManagement");
  }

  getPatientEntryPageTitle() {
    return cy.get("#patient-management-title");
  }

  assertPatientManagementBoundary() {
    this.getPatientEntryPageTitle()
      .should("be.visible")
      .invoke("text")
      .should("match", messagePattern("patient.management.title"));
    cy.get("#patientMasterListQuery").should("be.visible");
    cy.contains("button", messagePattern("advanced.search")).should(
      "be.visible",
    );
    cy.get("#patientId").should("not.exist");
    cy.get("#external_search").should("not.exist");
  }

  verifyDefaultListAndQuickPagingBoundary(query = "E2EPagingBoundary") {
    cy.get(".patient-master-list__table tbody tr")
      .its("length")
      .should("be.greaterThan", 0);

    const initialAlias = `patientQuickSearch${++patientSearchSequence}`;
    cy.intercept("GET", "**/rest/patient-search-results?*", (request) => {
      const requestUrl = new URL(request.url);
      if (
        requestUrl.searchParams.get("quickQuery") === query &&
        !requestUrl.searchParams.has("page")
      ) {
        request.alias = initialAlias;
      }
    });
    cy.get("#patientMasterListQuery")
      .should("be.visible")
      .clear()
      .type(query)
      .should("have.value", query);
    cy.contains(
      ".patient-master-list__search button",
      messagePattern("label.button.search"),
    )
      .should("be.enabled")
      .click();

    return cy.wait(`@${initialAlias}`).then(({ request, response }) => {
      const requestUrl = new URL(request.url);
      expect(requestUrl.searchParams.get("quickQuery")).to.eq(query);
      expect(requestUrl.searchParams.get("suppressExternalSearch")).to.eq(
        "true",
      );
      expect(requestUrl.searchParams.has("queryId")).to.eq(false);
      expect(response?.statusCode, "initial quick-search status").to.eq(200);

      const firstPage = response?.body?.patientSearchResults;
      const queryId = String(response?.body?.queryId || "");
      expect(firstPage, "quick-search first page").to.be.an("array");
      expect(firstPage, "first 99 quick-search matches").to.have.length(99);
      expect(
        Number(response?.body?.totalItems),
        "quick-search total beyond 100",
      ).to.eq(101);
      expect(Number(response?.body?.paging?.currentPage)).to.eq(1);
      expect(Number(response?.body?.paging?.totalPages)).to.eq(2);
      expect(queryId, "server-issued quick-search query id").to.match(
        /^[0-9a-f-]{36}$/i,
      );

      const firstPageIds = new Set(
        firstPage.map((result) => String(result.patientID)),
      );
      const pageAlias = `patientQuickPage${++patientPageSequence}`;
      cy.intercept("GET", "**/rest/patient-search-results?*", (pageRequest) => {
        const pageRequestUrl = new URL(pageRequest.url);
        if (
          pageRequestUrl.searchParams.get("queryId") === queryId &&
          pageRequestUrl.searchParams.get("page") === "2"
        ) {
          pageRequest.alias = pageAlias;
        }
      });
      const nextPagePattern = messagePattern("pagination.forward");
      cy.get(".patient-master-list .patient-api-pagination__controls button")
        .then(($buttons) => {
          const nextButton = [...$buttons].find((button) =>
            nextPagePattern.test(
              String(
                button.getAttribute("aria-label") || button.textContent || "",
              ),
            ),
          );
          expect(nextButton, "quick-search next-page button").to.exist;
          return cy.wrap(nextButton);
        })
        .should("be.visible")
        .and("not.be.disabled")
        .click();

      return cy.wait(`@${pageAlias}`).then(({ request, response }) => {
        const pageRequestUrl = new URL(request.url);
        expect(pageRequestUrl.searchParams.get("quickQuery")).to.eq(query);
        expect(pageRequestUrl.searchParams.get("suppressExternalSearch")).to.eq(
          "true",
        );
        expect(pageRequestUrl.searchParams.get("queryId")).to.eq(queryId);
        expect(pageRequestUrl.searchParams.get("page")).to.eq("2");
        expect(response?.statusCode, "quick-search second-page status").to.eq(
          200,
        );
        expect(response?.body?.queryId).to.eq(queryId);
        expect(Number(response?.body?.paging?.currentPage)).to.eq(2);
        expect(Number(response?.body?.paging?.totalPages)).to.eq(2);
        expect(Number(response?.body?.totalItems)).to.eq(101);

        const secondPage = response?.body?.patientSearchResults;
        expect(secondPage, "quick-search matches beyond 100").to.be.an("array");
        expect(secondPage, "99 + 2 paging boundary").to.have.length(2);
        const secondPageIds = secondPage.map((result) =>
          String(result.patientID),
        );
        secondPageIds.forEach((patientId) => {
          expect(firstPageIds.has(patientId)).to.eq(false);
        });
        cy.get(".patient-master-list__table tbody tr")
          .should("have.length", 2)
          .then(($rows) => {
            const renderedIds = [...$rows].map((row) =>
              String(row.querySelector("td")?.textContent || "").trim(),
            );
            expect(renderedIds).to.deep.equal(secondPageIds);
          });

        const listAlias = `patientDefaultList${++patientPageSequence}`;
        cy.intercept(
          "GET",
          "**/rest/patient-management-list?*",
          (listRequest) => {
            const listUrl = new URL(listRequest.url);
            if (
              listUrl.searchParams.get("page") === "1" &&
              listUrl.searchParams.get("pageSize") === "20"
            ) {
              listRequest.alias = listAlias;
            }
          },
        );
        cy.contains(
          ".patient-master-list__search button",
          messagePattern("patient.management.list.showAll"),
        )
          .should("be.enabled")
          .click();

        return cy.wait(`@${listAlias}`).then(({ response }) => {
          expect(response?.statusCode, "default patient-list status").to.eq(
            200,
          );
          expect(
            response?.body?.patients,
            "default patient-list rows",
          ).to.be.an("array");
          expect(Number(response?.body?.page)).to.eq(1);
          expect(Number(response?.body?.pageSize)).to.eq(20);
          cy.get("#patientMasterListQuery").should("have.value", "");
          cy.get(".patient-master-list__table tbody tr")
            .its("length")
            .should("be.greaterThan", 0);
        });
      });
    });
  }

  openAdvancedSearch() {
    cy.get("body").then(($body) => {
      if (!$body.find("#patientManagementQuickQuery").length) {
        cy.contains(
          ".patient-management-mode-switcher button",
          messagePattern("advanced.search"),
        )
          .should("be.visible")
          .click();
      }
    });
    cy.get("body").then(($body) => {
      if (!$body.find("#patientId").length) {
        cy.contains(
          ".patient-compact-search__actions button",
          messagePattern("advanced.search"),
        )
          .should("be.visible")
          .click();
      }
    });
    cy.get("#patientId").should("be.visible");
    cy.get("#local_search").should("be.visible");
    cy.get("#external_search").should("not.exist");
  }

  clickNewPatientTab() {
    cy.contains(
      ".oe-page-header__actions button",
      messagePattern("new.patient.label"),
    )
      .should("be.visible")
      .click();
    cy.location("pathname").should("eq", "/PatientManagement/new");
    this.getPatientEntryPageTitle()
      .invoke("text")
      .should("match", messagePattern("patient.management.new.title"));
  }

  getDateOfBirthForCurrentLocale(year = 2001, month = 5, day = 12) {
    const yyyy = String(year).padStart(4, "0");
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    return cy
      .get(this.dateOfBirth)
      .should("be.visible")
      .invoke("attr", "placeholder")
      .then((placeholder = "") => {
        const normalized = placeholder.trim().toLowerCase();
        if (normalized.startsWith("yyyy") || normalized.startsWith("年")) {
          return `${yyyy}/${mm}/${dd}`;
        }
        if (normalized.startsWith("dd") || normalized.startsWith("日")) {
          return `${dd}/${mm}/${yyyy}`;
        }
        return `${mm}/${dd}/${yyyy}`;
      });
  }

  enterPatientInfo(
    firstName,
    lastName,
    subjectNumber,
    NationalId,
    dateOfBirth,
  ) {
    cy.enterText(this.subjectNumber, subjectNumber);
    cy.enterText(this.nationalId, NationalId);
    cy.enterText(this.lastNameSelector, lastName);
    cy.enterText(this.firstNameSelector, firstName);
    cy.enterText(this.dateOfBirth, dateOfBirth);
    this.selectCreatePatientMaleGender();
  }

  assertEnteredPatientInfo(patient) {
    cy.get(this.subjectNumber).should("have.value", patient.subjectNumber);
    cy.get(this.nationalId).should("have.value", patient.nationalId);
    cy.get(this.lastNameSelector).should("have.value", patient.lastName);
    cy.get(this.firstNameSelector).should("have.value", patient.firstName);
    cy.get(this.dateOfBirth).should("have.value", patient.dateOfBirth);
    cy.get("#radio-1").should("be.checked");
  }

  selectCreatePatientMaleGender() {
    cy.get("label[for='radio-1']")
      .should("be.visible")
      .invoke("text")
      .should("match", messagePattern("patient.male"));
    cy.get("label[for='radio-1']").click();
    cy.get("#radio-1").should("be.checked");
  }

  clickSavePatientButton() {
    this.getSubmitButton().should("be.enabled").click();
  }

  savePatientAndVerifyDetails(patient) {
    cy.intercept("POST", "**/rest/PatientManagement").as("savePatient");
    cy.intercept("GET", "**/rest/patient-details?*").as("savedPatientDetails");
    this.clickSavePatientButton();

    return cy.wait("@savePatient").then(({ request, response }) => {
      expect(response?.statusCode, "patient save status").to.eq(200);
      expect(response?.body?.status, "patient save response state").to.eq(
        "success",
      );
      expect(request.body.subjectNumber).to.eq(patient.subjectNumber);
      expect(request.body.nationalId).to.eq(patient.nationalId);
      expect(request.body.lastName).to.eq(patient.lastName);
      expect(request.body.firstName).to.eq(patient.firstName);
      expect(request.body.gender).to.eq("M");
      expect(request.body.birthDateForDisplay).to.eq(patient.dateOfBirth);
      expect(request.body).not.to.have.property("years");
      expect(request.body).not.to.have.property("months");
      expect(request.body).not.to.have.property("days");

      const savedPatientId = String(
        response?.body?.patientId || response?.body?.patientPK || "",
      );
      expect(savedPatientId, "saved patient database id").to.match(
        /^[1-9][0-9]*$/,
      );

      cy.contains(
        "[role='status']",
        messagePattern("success.save.patient"),
      ).should("be.visible");
      cy.location("pathname").should(
        "eq",
        `/PatientManagement/${savedPatientId}`,
      );

      return cy.wait("@savedPatientDetails").then(({ request, response }) => {
        const requestUrl = new URL(request.url);
        expect(requestUrl.searchParams.get("patientID")).to.eq(savedPatientId);
        expect(response?.statusCode, "saved patient detail status").to.eq(200);
        expect(String(response?.body?.patientPK)).to.eq(savedPatientId);
        expect(response?.body?.subjectNumber).to.eq(patient.subjectNumber);
        expect(response?.body?.nationalId).to.eq(patient.nationalId);
        expect(response?.body?.lastName).to.eq(patient.lastName);
        expect(response?.body?.firstName).to.eq(patient.firstName);
        expect(response?.body?.gender).to.eq("M");
        expect(response?.body?.birthDateForDisplay).to.eq(patient.dateOfBirth);

        this.getPatientEntryPageTitle()
          .invoke("text")
          .should("match", messagePattern("patient.management.edit.title"));
        this.assertEnteredPatientInfo(patient);
        return cy.wrap(savedPatientId, { log: false });
      });
    });
  }

  getMaleGenderRadioButton() {
    return cy.get("label[for='search-radio-1']").should("be.visible").click();
  }

  visibleFormattedInput(inputId) {
    return cy.get("body").then(($body) => {
      const displaySelector = `#display_${inputId}:visible`;
      if ($body.find(displaySelector).length) {
        return cy.get(displaySelector);
      }
      return cy.get(`#${inputId}`).should("be.visible");
    });
  }

  enterPreviousLabNumber(value) {
    this.visibleFormattedInput("labNumber")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  enterAccessionNumber(value) {
    this.visibleFormattedInput("accessionNumber")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  startLabNumber(value) {
    this.visibleFormattedInput("startLabNo")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  endLabNo(value) {
    cy.get(this.endLabNoSelector)
      .should("be.visible")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  clickSearchPatientButton() {
    cy.get("#local_search").should("be.visible").click();
  }

  getExternalSearchButton() {
    return cy.get("#external_search");
  }

  getLastName() {
    return cy.get(this.lastNameSelector);
  }

  getFirstName() {
    return cy.get(this.firstNameSelector);
  }

  searchPatientByFirstNameOnly(firstName) {
    cy.enterText(this.firstNameSelector, firstName);
  }

  searchPatientByLastNameOnly(lastName) {
    cy.enterText(this.lastNameSelector, lastName);
  }

  searchPatientByDateOfBirth(dateOfBirth) {
    cy.enterText(this.dateOfBirth, dateOfBirth);
    cy.get("body").type("{esc}");
  }

  clearPatientInfo() {
    cy.get("#clear").should("be.visible").click();
  }

  assertPatientInfoCleared() {
    [
      this.subjectNumber,
      this.nationalId,
      this.lastNameSelector,
      this.firstNameSelector,
      this.dateOfBirth,
    ].forEach((selector) => cy.get(selector).should("have.value", ""));
    cy.get("#radio-1").should("not.be.checked");
    cy.get("#radio-2").should("not.be.checked");
  }

  getSubmitButton() {
    return cy.get(this.savePatientBtn);
  }

  searchPatientByFirstAndLastName(firstName, lastName) {
    cy.enterText(this.firstNameSelector, firstName);
    cy.enterText(this.lastNameSelector, lastName);
  }

  searchPatientByPatientId(PID) {
    cy.enterText(this.patientIdSelector, PID);
  }

  searchPatientBylabNo(labNo) {
    this.enterPreviousLabNumber(labNo);
  }

  fillAdvancedCriteria(criteria) {
    if (criteria.patientId) {
      this.searchPatientByPatientId(criteria.patientId);
    }
    if (criteria.labNumber) {
      this.searchPatientBylabNo(criteria.labNumber);
    }
    if (criteria.lastName) {
      this.searchPatientByLastNameOnly(criteria.lastName);
    }
    if (criteria.firstName) {
      this.searchPatientByFirstNameOnly(criteria.firstName);
    }
    if (criteria.dateOfBirth) {
      this.searchPatientByDateOfBirth(criteria.dateOfBirth);
    }
    if (criteria.gender === "M") {
      cy.get("label[for='search-radio-1']").should("be.visible").click();
      cy.get("#search-radio-1").should("be.checked");
    }
    if (criteria.gender === "F") {
      cy.get("label[for='search-radio-2']").should("be.visible").click();
      cy.get("#search-radio-2").should("be.checked");
    }
  }

  assertInitialAdvancedRequest(requestUrl, criteria) {
    expect(
      requestUrl.searchParams.has("quickQuery"),
      "advanced search excludes quickQuery",
    ).to.eq(false);
    expect(
      requestUrl.searchParams.has("page"),
      "initial advanced search starts a new result session",
    ).to.eq(false);
    expect(
      requestUrl.searchParams.has("queryId"),
      "initial advanced search has no stale query id",
    ).to.eq(false);
    expect(requestUrl.searchParams.get("suppressExternalSearch")).to.eq("true");
    expect(
      requestUrl.searchParams.has("crSearch"),
      "local search excludes client-registry mode",
    ).to.eq(false);

    Object.entries(advancedRequestParams(criteria)).forEach(([key, value]) => {
      expect(
        requestUrl.searchParams.get(key),
        `initial query parameter ${key}`,
      ).to.eq(value);
    });
  }

  assertPatientResultRow(
    targetPatientId,
    target,
    expectedResult,
    rowValues,
    rowMessageKeys,
  ) {
    Object.entries(expectedResult).forEach(([key, value]) => {
      expect(String(target[key]), `saved patient ${key}`).to.eq(String(value));
    });

    return cy
      .get(`[data-cy='patient-result-row-${targetPatientId}']`)
      .should("be.visible")
      .invoke("text")
      .should((text) => {
        rowValues.forEach((value) => expect(text).to.contain(value));
        rowMessageKeys.forEach((key) =>
          expect(text).to.match(messagePattern(key)),
        );
      });
  }

  findPatientThroughResultPages(
    interception,
    {
      targetPatientId,
      expectedResult,
      rowValues,
      rowMessageKeys,
      expectedPage,
      criteria,
      expectedQueryId = "",
    },
  ) {
    const { request, response } = interception;
    expect(response?.statusCode, `patient search page ${expectedPage}`).to.eq(
      200,
    );

    const requestUrl = new URL(request.url);
    if (expectedPage === 1) {
      expect(
        requestUrl.searchParams.has("page"),
        "first result page comes from the initial search",
      ).to.eq(false);
    } else {
      expect(
        requestUrl.searchParams.get("page"),
        "requested result page",
      ).to.eq(String(expectedPage));
      expect(
        requestUrl.searchParams.get("queryId"),
        "server-issued query id remains bound to the next page",
      ).to.eq(expectedQueryId);
      expect(requestUrl.searchParams.get("suppressExternalSearch")).to.eq(
        "true",
      );
      expect(requestUrl.searchParams.has("quickQuery")).to.eq(false);
      expect(requestUrl.searchParams.has("crSearch")).to.eq(false);
      Object.entries(advancedRequestParams(criteria)).forEach(
        ([key, value]) => {
          expect(
            requestUrl.searchParams.get(key),
            `page ${expectedPage} query parameter ${key}`,
          ).to.eq(value);
        },
      );
    }

    const results = response?.body?.patientSearchResults;
    expect(results, `patient results on page ${expectedPage}`).to.be.an(
      "array",
    );
    const paging = response?.body?.paging;
    expect(paging, `paging metadata on page ${expectedPage}`).to.be.an(
      "object",
    );
    const currentPage = Number(paging.currentPage);
    const totalPages = Number(paging.totalPages);
    const responseQueryId = String(
      response?.body?.queryId || expectedQueryId || "",
    );
    expect(currentPage, "paging current page").to.eq(expectedPage);
    expect(
      Number.isInteger(totalPages),
      "paging total pages is an integer",
    ).to.eq(true);
    expect(totalPages, "paging total pages covers current page").to.be.at.least(
      currentPage,
    );
    expect(responseQueryId, "server-issued advanced-search query id").to.match(
      /^[0-9a-f-]{36}$/i,
    );
    if (expectedQueryId) {
      expect(responseQueryId, "paged response keeps the same query id").to.eq(
        expectedQueryId,
      );
    }

    const target = results.find(
      (result) => String(result.patientID) === String(targetPatientId),
    );
    if (target) {
      return this.assertPatientResultRow(
        targetPatientId,
        target,
        expectedResult,
        rowValues,
        rowMessageKeys,
      );
    }

    if (currentPage >= totalPages) {
      throw new Error(
        `Saved patient ${targetPatientId} was not found after traversing ${totalPages} real result page(s)`,
      );
    }

    const nextPage = currentPage + 1;
    const pageAlias = `patientResultPage${++patientPageSequence}`;
    cy.intercept("GET", "**/rest/patient-search-results?*", (pageRequest) => {
      const pageRequestUrl = new URL(pageRequest.url);
      if (
        pageRequestUrl.searchParams.get("queryId") === responseQueryId &&
        pageRequestUrl.searchParams.get("page") === String(nextPage)
      ) {
        pageRequest.alias = pageAlias;
      }
    });
    cy.get(".patient-search-results .cds--select__page-number select")
      .should("be.visible")
      .and("not.be.disabled")
      .select(String(nextPage));

    return cy.wait(`@${pageAlias}`).then((nextPageInterception) =>
      this.findPatientThroughResultPages(nextPageInterception, {
        targetPatientId,
        expectedResult,
        rowValues,
        rowMessageKeys,
        expectedPage: nextPage,
        criteria,
        expectedQueryId: responseQueryId,
      }),
    );
  }

  runAdvancedSearch(
    criteria,
    {
      targetPatientId,
      expectedResult = {},
      rowValues = [],
      rowMessageKeys = [],
      expectEmpty = false,
    } = {},
  ) {
    const alias = `patientAdvancedSearch${++patientSearchSequence}`;
    cy.intercept({
      method: "GET",
      url: "**/rest/patient-search-results?*",
      times: 1,
    }).as(alias);

    this.fillAdvancedCriteria(criteria);
    this.clickSearchPatientButton();

    return cy.wait(`@${alias}`).then(({ request, response }) => {
      const requestUrl = new URL(request.url);
      this.assertInitialAdvancedRequest(requestUrl, criteria);

      expect(response?.statusCode, "patient search status").to.eq(200);
      const results = response?.body?.patientSearchResults;
      expect(results, "patient search result collection").to.be.an("array");

      if (expectEmpty) {
        expect(results, "no patient matches the supplied lab number").to.be
          .empty;
        cy.get("[data-cy^='patient-result-row-']").should("not.exist");
        return cy
          .get(".patient-search-results .oe-empty-state")
          .should("be.visible");
      }

      return this.findPatientThroughResultPages(
        { request, response },
        {
          targetPatientId,
          expectedResult,
          rowValues,
          rowMessageKeys,
          expectedPage: 1,
          criteria,
        },
      );
    });
  }

  getPatientSearchResultsTable() {
    return cy.get("[data-cy='patientResultsTable'] tbody");
  }

  validatePatientSearchTablebyRespectiveField(expectedFieldValue, searchBy) {
    const columnByField = { lastName: 2, firstName: 3, DOB: 5 };
    const column = columnByField[searchBy];
    expect(column, `supported patient result field: ${searchBy}`).to.exist;
    this.getPatientSearchResultsTable()
      .find("tr")
      .each(($row) => {
        cy.wrap($row)
          .find(`td:nth-child(${column})`)
          .invoke("text")
          .should("contain", expectedFieldValue);
      });
  }

  validatePatientSearchTable(actualName, inValidName) {
    this.getPatientSearchResultsTable()
      .find("tr")
      .last()
      .invoke("text")
      .should((text) => {
        expect(text).to.contain(actualName);
        expect(text).not.to.contain(inValidName);
      });
  }

  validatePatientByGender(expectedGender) {
    const expectedPattern =
      expectedGender === "M"
        ? messagePattern("patient.male")
        : expectedGender === "F"
          ? messagePattern("patient.female")
          : new RegExp(Cypress._.escapeRegExp(expectedGender));
    this.getPatientSearchResultsTable()
      .find("tr")
      .last()
      .find("td:nth-child(4)")
      .invoke("text")
      .should("match", expectedPattern);
  }

  selectPatientFromSearchResults() {
    this.getPatientSearchResultsTable()
      .find("tr")
      .first()
      .find("[data-cy='radioButton']")
      .then(($radio) => {
        const id = $radio.attr("id");
        expect(id, "patient selection radio id").to.be.a("string").and.not.be
          .empty;
        cy.get(`label[for='${id}']`).should("exist").click();
      });
  }
}

export default PatientEntryPage;
