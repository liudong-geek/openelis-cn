import LoginPage from "../pages/LoginPage";
import ResultsPage, { POSITIVE, NEGATIVE, options } from "../pages/ResultsPage";
import { label } from "../pages/AdminUiContract";

// E01: original Result30 records remain in the sealed case-contract mapping.
// These are current workbench/referral contracts, not legacy PCR/referral,
// received-date/range/bulk-accept equivalence. No hospital rule is created.
const login = new LoginPage();
const page = new ResultsPage();

before("bind real current clinical rows and existing authorized owner", () => {
  login.visit();
  login.goToHomePage();
  page.bindActualWitness();
});
beforeEach(() => page.installWriteObservers());
after(() => login.stopNotificationObservers());

describe("China LIS Results Workbench", () => {
  it("enters the real current results menu and reads the pending worklist", () => {
    page.openWorkbench();
  });

  it("shows the current workbench heading and exact server list facts", () => {
    cy.get("#results-title")
      .should("be.visible")
      .invoke("text")
      .should("match", label("results.workbench.title"));
    cy.get("#result-specimen-queue-title").should("be.visible");
    cy.get("#result-specimen-detail h2").should("be.visible");
    page.assertTable();
    cy.then(() => {
      expect(page.rows, "actual pending rows include real known analyses").not
        .to.be.empty;
      const specimenIds = new Set(page.rows.map((row) => row.sampleItemId));
      cy.get(".result-specimen-queue__item").should(
        "have.length",
        specimenIds.size,
      );
    });
  });

  it("filters by a real permitted laboratory unit with the exact request", () => {
    page.query({ unit: "117" }).then(() => {
      page.exactRows("positive", "31");
      cy.get("#unifiedResultsLabUnit").should("have.value", "117");
      cy.location("search").should("include", "testSectionId=117");
    });
  });

  it("finds the exact known clinical accession number", () => {
    page.query({ labNumber: POSITIVE }).then(() => {
      expect(page.rows, "two exact received specimen tests").to.have.length(2);
      page.exactRows("positive", "31");
      page.exactRows("positive", "13");
      page.rows.forEach((row) => expect(row.accessionNumber).to.eq(POSITIVE));
    });
  });

  it("returns a real empty worklist for a run-unique unmatched accession", () => {
    const unmatched =
      POSITIVE.slice(0, -8) + "9" + Cypress._.random(1000000, 9999999);
    expect([POSITIVE, NEGATIVE]).not.to.include(unmatched);
    page.query({ labNumber: unmatched }).then(() => {
      expect(page.rows, "real empty HTTP200 result").to.have.length(0);
      cy.get(".results-workbench__empty").should("be.visible");
      cy.get(".results-workbench__cell--test").should("not.exist");
    });
  });

  it("filters by the known collection date", () => {
    page.query({ date: page.currentDate() }).then(() => {
      page.exactRows("positive", "31");
      cy.get("#unifiedResultsDate").should("have.value", page.currentDate());
    });
  });

  it("combines accession unit and collection date in one real query", () => {
    page
      .query({ labNumber: POSITIVE, unit: "117", date: page.currentDate() })
      .then(() => {
        expect(page.rows).to.have.length(1);
        page.exactRows("positive", "31");
        cy.location("search").then((search) => {
          const params = new URLSearchParams(search);
          expect(params.get("accessionNumber")).to.eq(POSITIVE);
          expect(params.get("testSectionId")).to.eq("117");
          expect(params.get("collectionDate")).to.eq(page.currentDate());
        });
      });
  });

  it("restores the exact filters after a real document reload", () => {
    const alias = page.alias("reloadExactResults");
    cy.intercept("GET", "**/rest/LogbookResults?*", (request) => {
      const params = new URL(request.url).searchParams;
      if (
        params.get("labNumber") === POSITIVE &&
        params.get("testSectionId") === "117" &&
        params.get("collectionDate") === page.currentDate()
      )
        request.alias = alias;
    });
    cy.reload();
    cy.wait("@" + alias).then(({ response }) => {
      page.acceptRows(response);
      expect(page.rows).to.have.length(1);
      page.exactRows("positive", "31");
      page.assertTable();
    });
    cy.get("#unifiedResultsSearch").should("have.value", POSITIVE);
    cy.get("#unifiedResultsLabUnit").should("have.value", "117");
    cy.get("#unifiedResultsDate").should("have.value", page.currentDate());
    cy.location("pathname").should("eq", "/Results");
  });

  it("filters analysis status locally and preserves its URL state", () => {
    page.query({ labNumber: POSITIVE }).then(() => {
      const row = page.exactRows("positive", "31");
      const statuses = page.statuses.filter(
        (status) => status.id === row.analysisStatusId,
      );
      expect(statuses, "real current analysis status option").to.have.length(1);
      const names = options(
        "results.analysisStatus." + row.analysisStatusId,
        statuses[0].value,
      );
      cy.get(".results-workbench__status-filters button")
        .filter((_, button) =>
          names.some((name) => button.textContent.startsWith(name + " (")),
        )
        .should("have.length", 1)
        .click();
      page.assertTable(
        page.rows.filter(
          (item) => item.analysisStatusId === row.analysisStatusId,
        ),
      );
      cy.location("search").then((search) =>
        expect(new URLSearchParams(search).get("status")).to.eq(
          row.analysisStatusId,
        ),
      );
    });
  });

  it("changes the real worklist page size from twenty five to fifty", () => {
    page.query({ labNumber: POSITIVE }).then(() => {
      cy.get(".results-workbench .cds--pagination select")
        .first()
        .should("have.value", "25")
        .select("50")
        .should("have.value", "50");
      page.assertTable(page.rows, 50);
      cy.location("search").then((search) =>
        expect(new URLSearchParams(search).get("pageSize")).to.eq("50"),
      );
    });
  });

  it("focuses the exact selected specimen in the queue", () => {
    page.focusKnownSpecimen();
  });

  it("restores the complete worklist from specimen focus", () => {
    cy.get(".result-specimen-queue__all")
      .should("have.attr", "aria-pressed", "false")
      .should("be.enabled")
      .click()
      .should("have.attr", "aria-pressed", "true");
    page.assertTable();
    cy.get(".results-workbench__cell--test").should("have.length", 2);
  });

  it("expands the real specimen restriction summary", () => {
    page.blocked().then(() => page.expandBlocks());
  });

  it("keeps a restricted clinical row read only without Save", () => {
    page.blocked().then(() => page.assertRestrictedDOM());
  });

  it("sends no result write while the restricted row is read only", () => {
    page.blocked().then(() => {
      page.assertRestrictedDOM();
      cy.then(() =>
        expect(
          page.resultWrites,
          "passive real result POST observer",
        ).to.have.length(0),
      );
      cy.then(() =>
        expect(
          page.intakeWrites,
          "inspection does not accept a specimen",
        ).to.have.length(0),
      );
    });
  });

  it("shows the exact restriction reason and row identity", () => {
    page.blocked().then((row) => {
      const expected = page.witness("negative");
      expect([
        row.analysisId,
        row.sampleItemId,
        row.testId,
        row.accessionNumber,
        row.analysisLastupdated,
      ]).to.deep.eq([
        expected.analysisId,
        expected.sampleItemId,
        expected.testId,
        expected.labNo,
        expected.analysisLastupdated,
      ]);
      expect(row.resultEntryBlockedReason).to.eq(
        "error.results.specimenIntakeMissing",
      );
      page.expandBlocks();
    });
  });

  it("opens the real restriction modal for the same clinical identity", () => {
    page.openRestriction().then(() => {
      cy.get("[role='dialog'] .result-restriction-facts__identity")
        .should("contain.text", page.blockedRow.analysisId)
        .and("contain.text", page.blockedRow.sampleItemId)
        .and("contain.text", NEGATIVE);
    });
  });

  it("closes restriction inspection without automatically accepting a specimen", () => {
    page.closeRestriction();
    page.blocked().then((row) => {
      expect(row.readOnly).to.eq(true);
      expect(row.resultEntryBlockedReason).to.eq(
        "error.results.specimenIntakeMissing",
      );
      expect(page.intakeWrites).to.have.length(0);
      expect(page.resultWrites).to.have.length(0);
    });
  });

  it("opens the intake handoff with exact identity and result return path", () => {
    page.openIntake();
  });

  it("returns from intake to the exact results worklist", () => {
    const returned = page.alias("realReturnWorklist");
    cy.intercept("GET", "**/rest/LogbookResults?*", (request) => {
      const params = new URL(request.url).searchParams;
      if (
        params.get("labNumber") === NEGATIVE &&
        params.get("testSectionId") === "36"
      )
        request.alias = returned;
    });
    cy.contains(
      ".result-intake-handoff > button",
      label("results.restriction.back"),
    )
      .should("be.enabled")
      .click();
    cy.location().then((location) =>
      expect(location.pathname + location.search).to.eq(page.resultReturnPath),
    );
    cy.wait("@" + returned).then(({ response }) => {
      page.acceptRows(response);
      page.exactRows("negative");
      page.assertTable();
      expect(page.intakeWrites).to.have.length(0);
    });
  });

  it("saves one genuinely received result and verifies server readback", () => {
    page.saveReceivedHIV();
  });

  it("opens real saved result review for the same clinical identity", () => {
    page.openSameSavedReview();
  });
});

describe("China LIS Referred Out Query", () => {
  it("enters the current referred out workspace from its real menu", () => {
    page.openReferral();
  });

  it("searches the exact patient through the current patient query mode", () => {
    page.searchReferralPatient();
  });

  it("shows real referral selection and print eligibility facts", () => {
    page.assertReferralFacts();
    cy.then(() => {
      expect(
        page.referralRows,
        "actual patient referral response retained",
      ).to.be.an("array");
      expect(
        page.resultWrites,
        "query cannot create another result",
      ).to.have.length(1);
    });
  });

  it("queries referrals by their real sent date range", () => {
    page.referralDates("SENT");
  });

  it("queries referrals by their real result date range", () => {
    page.referralDates("RESULT");
  });

  it("queries referrals by the real laboratory unit", () => {
    page.referralDates("SENT", "unit");
  });

  it("queries referrals by the real test identity", () => {
    page.referralDates("SENT", "test");
  });

  it("queries referrals by the exact clinical accession number", () => {
    page.referralLabNumber();
  });
});
