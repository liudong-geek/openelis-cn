import { body, label, openAuthorizedSidebarLink } from "./AdminUiContract";
import en from "../../src/languages/en.json";
import zh from "../../src/languages/zh.json";
import zhCN from "../../src/languages/zh_CN.json";
import TestProperties from "../common/TestProperties";

const API = "/api/OpenELIS-Global";
const POSITIVE = "DEV01260000000000001";
const NEGATIVE = "DEV01260000000000002";
const ID = /^[1-9]\d*$/;
const VERSION = /^\d{13}$/;
const ROW_CELLS = ".results-workbench__cell--test";
const identity = (row) => ({
  analysisId: row.analysisId,
  sampleItemId: row.sampleItemId,
  testId: row.testId,
  labNumber: row.accessionNumber,
  analysisLastupdated: row.analysisLastupdated,
});
const sameResultReturnPath = (actualPath, expectedPath) => {
  if (
    typeof actualPath !== "string" ||
    typeof expectedPath !== "string" ||
    !actualPath.startsWith("/Results?") ||
    !expectedPath.startsWith("/Results?") ||
    actualPath.includes("#") ||
    expectedPath.includes("#")
  )
    return false;
  const pathname = (path) => path.slice(0, path.indexOf("?"));
  const entries = (path) => {
    const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));
    params.sort();
    return [...params];
  };
  return (
    pathname(actualPath) === pathname(expectedPath) &&
    JSON.stringify(entries(actualPath)) ===
      JSON.stringify(entries(expectedPath))
  );
};
const sameRow = (actual, expected, version = true) => {
  ["analysisId", "sampleItemId", "testId"].forEach((key) =>
    expect(actual[key], "same clinical " + key).to.eq(expected[key]),
  );
  expect(actual.accessionNumber, "same accession").to.eq(expected.labNo);
  expect(actual.analysisLastupdated, "actual analysis version").to.match(
    VERSION,
  );
  if (version) {
    expect(actual.analysisLastupdated).to.eq(expected.analysisLastupdated);
    expect(actual.readOnly, "current result-entry permission").to.eq(
      expected.kind === "negative",
    );
    expect(
      actual.resultEntryBlockedReason ?? "",
      "current intake reason",
    ).to.eq(
      expected.kind === "negative" ? "error.results.specimenIntakeMissing" : "",
    );
  }
};
const options = (key, fallback) =>
  [...new Set([en[key], zh[key], zhCN[key], fallback])].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
const dateForLocale = (iso, locale) => {
  expect(iso, "real ISO collection date").to.match(/^\d{4}-\d{2}-\d{2}$/);
  const [year, month, day] = iso.split("-");
  const language = locale.replace("_", "-").split("-")[0].toLowerCase();
  return language === "zh"
    ? [year, month, day].join("/")
    : language === "fr"
      ? [day, month, year].join("/")
      : [month, day, year].join("/");
};

class ResultsPage {
  sequence = 0;
  rows = [];
  resultWrites = [];
  intakeWrites = [];
  witnesses = null;
  lastSaved = null;
  lastRestriction = null;
  referralRows = [];

  alias(prefix) {
    return prefix + ++this.sequence;
  }

  bindActualWitness() {
    const path = Cypress.env("CLINICAL_RESULTS_INPUT_FILE");
    const expectedSHA = Cypress.env("CLINICAL_RESULTS_INPUT_SHA256");
    expect(path, "read-only current clinical input path").to.be.a("string");
    expect(path).to.match(/^\//);
    expect(expectedSHA, "root-bound clinical input SHA256").to.match(
      /^[a-f0-9]{64}$/,
    );
    return cy
      .readFile(path, null, { log: false })
      .then((raw) =>
        cy.window({ log: false }).then(async (window) => {
          expect(
            Cypress.Buffer.isBuffer(raw),
            "raw clinical envelope bytes",
          ).to.eq(true);
          const bytes = new window.Uint8Array(raw);
          const digest = await window.crypto.subtle.digest("SHA-256", bytes);
          const actualSHA = Array.from(new Uint8Array(digest))
            .map((value) => value.toString(16).padStart(2, "0"))
            .join("");
          expect(actualSHA, "exact reviewed runtime clinical envelope").to.eq(
            expectedSHA,
          );
          const envelope = JSON.parse(
            new window.TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
          expect(envelope.schema).to.eq(
            "lis-cypress-current-clinical-results-input-v1",
          );
          expect(envelope.databaseContainerId).to.match(/^[a-f0-9]{64}$/);
          expect(envelope.databaseContainerId).to.eq(
            Cypress.env("OWNED_DATABASE_ID"),
          );
          expect(
            envelope.laboratoryTimeZone,
            "actual server clock timezone",
          ).to.be.a("string").and.not.be.empty;
          this.laboratoryTimeZone = envelope.laboratoryTimeZone;
          new Intl.DateTimeFormat("en", {
            timeZone: this.laboratoryTimeZone,
          }).format(new Date());
          [
            "setupResultSHA256",
            "actualBindingsSHA256",
            "setupIndependentReviewSHA256",
          ].forEach((key) =>
            expect(envelope[key], key).to.match(/^[a-f0-9]{64}$/),
          );
          expect(envelope.setupResult.schema).to.eq(
            "lis-current-clinical-real-setup-actual-v1",
          );
          expect(envelope.setupResult.passed).to.eq(true);
          expect(envelope.setupResult.explicitPOSTCount).to.eq(5);
          expect(envelope.setupResult.actualBindingsSHA256).to.eq(
            envelope.actualBindingsSHA256,
          );
          expect(envelope.setupIndependentReview.reviewer).to.be.a("string").and
            .not.be.empty;
          expect(envelope.setupIndependentReview.reviewer).not.to.eq(
            "/root/url_validation_review",
          );
          expect(envelope.setupIndependentReview.candidateManifestSHA256).to.eq(
            envelope.setupResult.executorManifestSHA256,
          );
          expect(envelope.setupIndependentReview.blockingFindings).to.deep.eq(
            [],
          );
          expect(envelope.setupIndependentReview.status).to.match(
            /^ACTUAL_.*ACCEPTED/,
          );
          expect(envelope.setupIndependentReview.resultSHA256).to.eq(
            envelope.setupResultSHA256,
          );
          expect(envelope.setupIndependentReview.actualBindingsSHA256).to.eq(
            envelope.actualBindingsSHA256,
          );
          const witnesses = envelope.actualBindings;
          expect(witnesses.schema).to.eq(
            "lis-current-clinical-real-setup-bindings-v1",
          );
          expect(witnesses.resultSaveExecuted).to.eq(false);
          expect(witnesses.syntheticQASetupNotHospitalPolicy).to.eq(true);
          expect(
            witnesses.rows,
            "two real writable rows and one restricted row",
          ).to.have.length(3);
          expect(witnesses.actualDefaultDateLocale).to.be.a("string").and.not.be
            .empty;
          const logical = [
            ["positive", POSITIVE, "9200301", "31", "117", "D"],
            ["positive", POSITIVE, "9200302", "13", "36", "N"],
            ["negative", NEGATIVE, "9200303", "13", "36", "N"],
          ];
          logical.forEach(
            ([kind, labNo, requestId, testId, testSectionId, resultType]) => {
              const match = witnesses.rows.filter(
                (row) => row.requestId === requestId,
              );
              expect(
                match,
                "exact existing request " + requestId,
              ).to.have.length(1);
              const row = match[0];
              expect([
                row.kind,
                row.labNo,
                row.testId,
                row.testSectionId,
                row.resultType,
              ]).to.deep.eq([kind, labNo, testId, testSectionId, resultType]);
              ["analysisId", "sampleItemId", "sampleId", "patientId"].forEach(
                (key) =>
                  expect(row[key], "actual generated/bound " + key).to.match(
                    ID,
                  ),
              );
              expect(row.patientId).to.eq("9200100");
              expect(row.sampleId).to.eq(
                kind === "positive" ? "9200201" : "9200202",
              );
              expect(row.analysisLastupdated).to.match(VERSION);
              expect(row.collectionDate).to.match(/^\d{4}-\d\d-\d\dT/);
              expect(row.readOnly).to.eq(kind === "negative");
              expect(row.resultEntryBlockedReason || "").to.eq(
                kind === "negative"
                  ? "error.results.specimenIntakeMissing"
                  : "",
              );
              sameRow(row.worklistRow, row);
              if (kind === "positive") {
                expect(row.receivedDate).to.be.a("string").and.not.be.empty;
                expect(row.decisionResponse.currentAcceptanceVerified).to.eq(
                  false,
                );
                expect(row.decisionResponse.recordedDecision).to.eq("ACCEPTED");
              } else {
                expect(row.receivedDate).to.eq(null);
              }
            },
          );
          expect(
            new Set(witnesses.rows.map((row) => row.analysisId)).size,
          ).to.eq(3);
          const hiv = witnesses.rows.find((row) => row.testId === "31");
          expect(
            hiv.dictionaryResults,
            "actual current HIV dictionary",
          ).to.be.an("array").and.not.be.empty;
          hiv.dictionaryResults.forEach((option) => {
            expect(option.id).to.match(ID);
            expect(option.value).to.be.a("string").and.not.be.empty;
          });
          this.witnesses = witnesses;
        }),
      )
      .then(() =>
        cy
          .request({ url: API + "/session", log: false })
          .then(({ status, body: session }) => {
            expect(status).to.eq(200);
            expect(session.authenticated).to.eq(true);
            expect(session.userId, "same existing Results owner").to.eq(
              this.witnesses.actorIds.results,
            );
            ["Results", "Reception"].forEach((role) =>
              expect(session.roles).to.include(role),
            );
            this.session = {
              userId: session.userId,
              loginName: session.loginName,
              roles: session.roles,
            };
          }),
      );
  }

  installWriteObservers() {
    cy.intercept(
      "POST",
      "**/rest/results-entry/analysis/*/result",
      (request) => {
        this.resultWrites.push({ url: request.url, body: body(request.body) });
      },
    );
    cy.intercept("POST", "**/rest/specimen-intake-decisions", (request) => {
      this.intakeWrites.push({ url: request.url, body: body(request.body) });
    });
  }

  witness(kind, testId = "13") {
    const matches = this.witnesses.rows.filter(
      (row) => row.kind === kind && row.testId === testId,
    );
    expect(
      matches,
      "exact clinical witness; no random substitute",
    ).to.have.length(1);
    return matches[0];
  }

  acceptRows(response) {
    expect(response.statusCode, "real current worklist HTTP").to.eq(200);
    expect(response.body.testResult, "real worklist array").to.be.an("array");
    const rows = response.body.testResult;
    rows.forEach((row) => {
      ["analysisId", "sampleItemId", "testId"].forEach((key) =>
        expect(row[key]).to.match(ID),
      );
      expect(row.analysisLastupdated).to.match(VERSION);
      expect(row.testName).to.be.a("string").and.not.be.empty;
      expect(row.accessionNumber).to.be.a("string").and.not.be.empty;
    });
    expect(
      new Set(
        rows.map(
          (row) =>
            row.analysisId + "-" + (row.testResultComponentId || "primary"),
        ),
      ).size,
    ).to.eq(rows.length);
    this.rows = rows;
    return rows;
  }

  assertTable(rows = this.rows, pageSize = 25) {
    if (rows.length === 0) {
      cy.get(".results-workbench__empty").should("be.visible");
      cy.get(ROW_CELLS).should("not.exist");
      return;
    }
    cy.get(ROW_CELLS).should(($cells) => {
      const names = [...$cells].map((cell) =>
        cell.firstChild.textContent.trim(),
      );
      expect(names, "rendered real worklist in server order").to.deep.eq(
        rows.slice(0, pageSize).map((row) => row.testName),
      );
    });
  }

  openWorkbench() {
    const pending = this.alias("currentPending");
    const units = this.alias("currentUnits");
    const statuses = this.alias("currentStatuses");
    cy.intercept("GET", "**/rest/results-entry/pending").as(pending);
    cy.intercept("GET", "**/rest/results-entry/lab-units").as(units);
    cy.intercept("GET", "**/rest/analysis-status-types").as(statuses);
    openAuthorizedSidebarLink(
      "menu_testing_workspace",
      "/Results",
      "?scope=pending&page=1&pageSize=25",
    );
    cy.wait("@" + units).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body).to.be.an("array");
      this.units = response.body;
      ["117", "36"].forEach((id) =>
        expect(
          this.units.filter(
            (unit) => unit.id === id && unit.domain === "CLINICAL",
          ),
        ).to.have.length(1),
      );
    });
    cy.wait("@" + statuses).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body).to.be.an("array").and.not.be.empty;
      this.statuses = response.body;
    });
    return cy.wait("@" + pending).then(({ response }) => {
      this.acceptRows(response);
      this.witnesses.rows
        .filter((row) => row.kind === "positive")
        .forEach((expected) => {
          const matches = this.rows.filter(
            (row) => row.analysisId === expected.analysisId,
          );
          expect(
            matches,
            "known genuinely received pending analysis",
          ).to.have.length(1);
          sameRow(matches[0], expected);
        });
      cy.get("#results-title")
        .should("be.visible")
        .invoke("text")
        .should("match", label("results.workbench.title"));
      this.assertTable();
    });
  }

  query({ labNumber = "", unit = "", date = "" } = {}) {
    const alias = this.alias("currentWorklist");
    const filtered = Boolean(labNumber || unit || date);
    const path = filtered
      ? "**/rest/LogbookResults?*"
      : "**/rest/results-entry/pending";
    const observe = (name) => {
      let active = true;
      cy.intercept("GET", path, (request) => {
        if (!active) return;
        if (!filtered) {
          request.alias = name;
          active = false;
        } else {
          const query = new URL(request.url).searchParams;
          if (
            query.get("labNumber") === (labNumber || null) &&
            query.get("testSectionId") === (unit || null) &&
            query.get("collectionDate") === (date || null) &&
            query.get("doRange") === "false" &&
            query.get("finished") === "false"
          ) {
            request.alias = name;
            active = false;
          }
        }
      });
    };
    cy.get("#unifiedResultsSearch").should("be.visible").clear();
    if (labNumber)
      cy.get("#unifiedResultsSearch")
        .type(labNumber)
        .should("have.value", labNumber);
    cy.get("#unifiedResultsDate").should("be.visible").clear();
    if (date)
      cy.get("#unifiedResultsDate").type(date).should("have.value", date);
    cy.get("#unifiedResultsDate").type("{esc}").blur();
    return cy
      .get("#unifiedResultsLabUnit")
      .then(($select) => {
        if ($select.val() !== unit) {
          const automatic = this.alias("unitSelectionRead");
          observe(automatic);
          cy.get("#unifiedResultsLabUnit")
            .select(unit)
            .should("have.value", unit);
          cy.wait("@" + automatic)
            .its("response.statusCode")
            .should("eq", 200);
        } else {
          cy.get("#unifiedResultsLabUnit").should("have.value", unit);
        }
      })
      .then(() => {
        observe(alias);
        cy.contains(
          ".results-workbench__filters button",
          label("results.workbench.applyFilters"),
        )
          .should("be.enabled")
          .click();
        return cy.wait("@" + alias);
      })
      .then(({ request, response }) => {
        if (filtered) {
          const params = new URL(request.url).searchParams;
          expect(params.get("labNumber")).to.eq(labNumber || null);
          expect(params.get("testSectionId")).to.eq(unit || null);
          expect(params.get("collectionDate")).to.eq(date || null);
          expect(params.get("doRange")).to.eq("false");
          expect(params.get("finished")).to.eq("false");
        }
        this.acceptRows(response);
        cy.get(".results-workbench__status-filters button")
          .first()
          .should(($button) => {
            expect(
              options("label.results.status.all").some((text) =>
                $button.text().startsWith(text),
              ),
              "real All status action",
            ).to.eq(true);
          })
          .should("be.enabled")
          .click();
        this.assertTable();
        return cy.then(() => this.rows);
      });
  }

  exactRows(kind, testId) {
    const expected = this.witness(kind, testId);
    const matches = this.rows.filter(
      (row) => row.analysisId === expected.analysisId,
    );
    expect(matches, "the exact known analysis must be present").to.have.length(
      1,
    );
    sameRow(
      matches[0],
      expected,
      !this.lastSaved || this.lastSaved.analysisId !== expected.analysisId,
    );
    return matches[0];
  }

  currentDate() {
    return dateForLocale(
      this.collectionISODate(),
      this.witnesses.actualDefaultDateLocale,
    );
  }

  collectionISODate() {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone: this.laboratoryTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(this.witness("positive", "31").collectionDate));
    return ["year", "month", "day"]
      .map((kind) => parts.find((part) => part.type === kind).value)
      .join("-");
  }

  row(row) {
    return cy.then(() => {
      ["analysisId", "sampleItemId", "testId"].forEach((key) =>
        expect(row[key], `target clinical ${key}`).to.match(ID),
      );
      const component = row.testResultComponentId || "primary";
      const matches = this.rows.filter(
        (current) =>
          ["analysisId", "sampleItemId", "testId", "accessionNumber"].every(
            (key) => current[key] === row[key],
          ) && (current.testResultComponentId || "primary") === component,
      );
      expect(
        matches,
        "same complete identity in the actual worklist response",
      ).to.have.length(1);
      const current = matches[0];
      expect(current.testName).to.eq(row.testName);
      expect(
        current.sampleItemExternalId,
        "actual target specimen barcode",
      ).to.be.a("string").and.not.be.empty;
      expect(row.sampleItemExternalId).to.eq(current.sampleItemExternalId);
      const field = `unifiedResultValue-${current.analysisId}-${component}`;
      return cy
        .get(ROW_CELLS)
        .filter((_, cell) => {
          const tr = cell.closest("tr");
          const accession = tr.querySelector(".results-workbench__accession");
          const barcode = tr.querySelector(".results-workbench__barcode-value");
          const controls = [
            ...tr.querySelectorAll("[id^='unifiedResultValue-']"),
          ];
          return (
            cell.firstChild.textContent.trim() === current.testName &&
            accession?.textContent === current.accessionNumber &&
            barcode?.textContent === current.sampleItemExternalId &&
            controls.every(
              (control) =>
                control.id === field || control.id.startsWith(field + "-"),
            )
          );
        })
        .should("have.length", 1)
        .closest("tr");
    });
  }

  focusKnownSpecimen() {
    return this.query({ labNumber: POSITIVE }).then(() => {
      const expected = this.witness("positive", "31");
      const groups = [];
      this.rows.forEach((row) => {
        if (!groups.some((group) => group.sampleItemId === row.sampleItemId))
          groups.push({ sampleItemId: row.sampleItemId });
      });
      expect(groups).to.have.length(2);
      const index = groups.findIndex(
        (group) => group.sampleItemId === expected.sampleItemId,
      );
      expect(index).to.be.gte(0);
      cy.get(".result-specimen-queue__item")
        .should("have.length", 2)
        .eq(index)
        .click()
        .should("have.attr", "aria-pressed", "true");
      this.assertTable(
        this.rows.filter((row) => row.sampleItemId === expected.sampleItemId),
      );
    });
  }

  blocked() {
    return this.query({ labNumber: NEGATIVE, unit: "36" }).then(() => {
      const row = this.exactRows("negative");
      expect(row.readOnly).to.eq(true);
      expect(row.resultEntryBlockedReason).to.eq(
        "error.results.specimenIntakeMissing",
      );
      this.blockedRow = row;
      return row;
    });
  }

  expandBlocks() {
    cy.get(
      ".result-specimen-blocks__heading button[aria-controls='result-specimen-block-details']",
    )
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") cy.wrap($button).click();
      });
    cy.get(
      ".result-specimen-blocks__heading button[aria-controls='result-specimen-block-details']",
    ).should("have.attr", "aria-expanded", "true");
    cy.get("#result-specimen-block-details").should("be.visible");
    cy.get(".result-specimen-blocks__item").should("have.length", 1);
    cy.get(".result-specimen-blocks__item").should("contain.text", NEGATIVE);
    cy.get(".result-specimen-blocks__item [role='status']")
      .invoke("text")
      .should((text) =>
        expect(
          options("error.results.specimenIntakeMissing").some((value) =>
            text.includes(value),
          ),
        ).to.eq(true),
      );
  }

  openRestriction() {
    return this.blocked().then(() => {
      this.expandBlocks();
      const alias = this.alias("currentRestriction");
      let active = true;
      cy.intercept(
        "GET",
        "**/rest/results-entry/analysis/*/restriction?*",
        (request) => {
          const url = new URL(request.url);
          if (
            active &&
            url.pathname.endsWith(
              "/" + this.blockedRow.analysisId + "/restriction",
            )
          ) {
            request.alias = alias;
            active = false;
          }
        },
      );
      cy.contains(
        ".result-specimen-blocks__item button",
        label("results.workbench.blocked.openOrders"),
      )
        .should("be.enabled")
        .click();
      return cy.wait("@" + alias).then(({ request, response }) => {
        this.checkRestriction(request, response);
        cy.get("[role='dialog'] .result-restriction-facts").should(
          "be.visible",
        );
      });
    });
  }

  checkRestriction(request, response) {
    const expected = identity(this.blockedRow);
    expect(response.statusCode).to.eq(200);
    const params = new URL(request.url).searchParams;
    expect(params.get("queryVersion")).to.eq("2");
    Object.entries(expected)
      .filter(([key]) => key !== "analysisId")
      .forEach(([key, value]) => expect(params.get(key)).to.eq(value));
    const data = response.body;
    expect(data.queryVersion).to.eq("2");
    expect(data.currentUserId).to.eq(this.session.userId);
    expect(data.readOnly).to.eq(true);
    expect(data.query).to.deep.eq(expected);
    Object.entries(expected).forEach(([key, value]) =>
      expect(data.identity[key]).to.eq(value),
    );
    expect(data.identity.sampleId).to.eq(this.witness("negative").sampleId);
    expect(data.blockedReason).to.eq("error.results.specimenIntakeMissing");
    expect(data.facts.collection.state).to.eq("RECORDED");
    expect(data.facts.receipt.state).to.eq("MISSING");
    expect(data.facts.acceptance.state).to.eq("MISSING");
    expect(data.facts.request.statusCode).to.eq("COLLECTED");
    this.lastRestriction = data;
  }

  assertRestrictedDOM() {
    this.row(this.blockedRow).within(() => {
      cy.get("input, select, textarea").should("not.exist");
      cy.contains("button", label("label.results.save")).should("not.exist");
      cy.get(".unifiedResultsReadOnlyValue").should("be.visible");
    });
  }

  closeRestriction() {
    cy.get("[role='dialog'] .result-restriction-facts")
      .should("have.length", 1)
      .should("be.visible")
      .closest("[role='dialog']")
      .find("button.cds--modal-close")
      .should("have.length", 1)
      .should("be.visible")
      .click();
    cy.get("[role='dialog'] .result-restriction-facts").should("not.exist");
  }

  openIntake() {
    return this.openRestriction().then(() => {
      expect(
        this.lastRestriction.canOpenIntake,
        "existing Reception scope required",
      ).to.eq(true);
      const alias = this.alias("freshIntakeRestriction");
      cy.intercept("GET", "**/rest/results-entry/analysis/*/restriction?*").as(
        alias,
      );
      cy.location().then((location) => {
        this.resultReturnPath = location.pathname + location.search;
      });
      cy.contains(
        "[role='dialog'] button",
        label("results.restriction.openIntake"),
      )
        .should("be.enabled")
        .click();
      cy.wait("@" + alias).then(({ request, response }) => {
        this.checkRestriction(request, response);
        expect(response.body.canOpenIntake).to.eq(true);
      });
      cy.location("pathname").should("eq", "/order/result-intake");
      cy.location("search").then((search) => {
        const params = new URLSearchParams(search);
        Object.entries(identity(this.blockedRow)).forEach(([key, value]) =>
          expect(params.get(key)).to.eq(value),
        );
        const returnTo = params.get("returnTo");
        expect(
          sameResultReturnPath(returnTo, this.resultReturnPath),
          "same results route and every query key/value, including duplicates",
        ).to.eq(true);
        this.resultReturnPath = returnTo;
      });
      cy.get(".result-intake-handoff h1")
        .should("be.visible")
        .invoke("text")
        .should("match", label("results.restriction.handoffTitle"));
      cy.wait("@" + alias).then(({ request, response }) => {
        this.checkRestriction(request, response);
        expect(response.body.canOpenIntake).to.eq(true);
      });
      cy.get(".result-intake-handoff .result-restriction-facts")
        .should("be.visible")
        .and("contain.text", this.blockedRow.analysisId)
        .and("contain.text", this.blockedRow.sampleItemId)
        .and("contain.text", NEGATIVE);
    });
  }

  saveReceivedHIV() {
    cy.request({ url: API + "/rest/esig/enabled", log: false }).then(
      ({ status, headers, body: setting }) => {
        expect(status).to.eq(200);
        expect(headers["content-type"]).to.match(/application\/json/i);
        expect(
          setting.enabled,
          "real signing must be prepared before this signed-save scenario",
        ).to.eq(true);
      },
    );
    return this.query({ labNumber: POSITIVE, unit: "117" }).then(() => {
      const row = this.exactRows("positive", "31");
      expect(row.readOnly).to.eq(false);
      expect(row.resultEntryBlockedReason || "").to.eq("");
      expect(row.resultType).to.eq("D");
      expect(row.dictionaryResults).to.deep.eq(
        this.witness("positive", "31").dictionaryResults,
      );
      const selected = row.dictionaryResults[0];
      expect(selected.id).to.match(ID);
      const field =
        "#unifiedResultValue-" +
        row.analysisId +
        "-" +
        (row.testResultComponentId || "primary");
      cy.get(field)
        .should("be.visible")
        .and("not.be.disabled")
        .select(selected.id)
        .should("have.value", selected.id);
      cy.get(field + " option:selected").should("have.text", selected.value);
      const signature = this.alias("realSignature");
      const post = this.alias("singleAnalysisSave");
      const readback = this.alias("sameAnalysisReadback");
      cy.intercept("POST", "**/rest/esig/sign").as(signature);
      cy.intercept(
        "POST",
        "**/rest/results-entry/analysis/" + row.analysisId + "/result",
      ).as(post);
      cy.intercept("GET", "**/rest/LogbookResults?*", (request) => {
        const params = new URL(request.url).searchParams;
        if (
          params.get("labNumber") === POSITIVE &&
          !params.has("testSectionId") &&
          params.get("doRange") === "false" &&
          params.get("finished") === "false"
        )
          request.alias = readback;
      });
      this.row(row)
        .contains("button", label("label.results.save"))
        .should("be.enabled")
        .click();
      const username = this.session.loginName;
      const password =
        Cypress.env("PASSWORD") || new TestProperties().getPassword();
      expect(
        typeof password === "string" && password.length > 0,
        "current owner's real signing credential supplied privately",
      ).to.eq(true);
      cy.get("[role='dialog']").should("be.visible");
      cy.get("[role='dialog']")
        .should(($dialog) => {
          expect(
            $dialog.find("#certification-password, #signature-password").length,
            "actual signature ceremony ready",
          ).to.eq(1);
        })
        .then(($dialog) => {
          if ($dialog.find("#certification-password").length) {
            const certification = this.alias("realCertification");
            cy.intercept("POST", "**/rest/esig/certify").as(certification);
            cy.get("label[for='certification-acknowledgement']")
              .should("be.visible")
              .click();
            cy.get("#certification-password").type(password, { log: false });
            cy.contains("[role='dialog'] button", label("esig.button.certify"))
              .should("be.enabled")
              .click();
            cy.wait("@" + certification).then(({ response }) => {
              expect(response.statusCode).to.be.oneOf([200, 201]);
              expect(String(response.body.certificationId)).to.match(ID);
              expect(String(response.body.userId)).to.eq(this.session.userId);
            });
          }
        });
      cy.get("#signature-password")
        .should("be.visible")
        .type(password, { log: false });
      cy.get("[role='dialog']").then(($dialog) => {
        if ($dialog.find("#signature-username").length)
          cy.get("#signature-username")
            .should("have.value", username)
            .and("have.attr", "readonly");
      });
      cy.contains("[role='dialog'] button", label("esig.button.sign"))
        .should("be.enabled")
        .click();
      cy.wait("@" + signature).then(({ request, response }) => {
        expect(response.statusCode).to.be.oneOf([200, 201]);
        const value = body(request.body);
        expect(value.recordType).to.eq("RESULT");
        expect(value.recordId)
          .to.be.a("number")
          .and.to.eq(Number(row.analysisId));
        expect(value.signatureMeaning).to.eq("AUTHORED");
        expect(value.username).to.eq(username);
        expect(response.body.recordId)
          .to.be.a("number")
          .and.to.eq(Number(row.analysisId));
        expect(response.body.signerId)
          .to.be.a("number")
          .and.to.eq(Number(this.session.userId));
        expect(String(response.body.signatureId)).to.match(ID);
        expect(response.body.signatureMeaning).to.eq("AUTHORED");
      });
      let receipt;
      cy.wait("@" + post).then(({ request, response }) => {
        expect(response.statusCode).to.be.within(200, 299);
        const submitted = body(request.body).testResult;
        [
          "analysisId",
          "sampleItemId",
          "testId",
          "analysisLastupdated",
          "accessionNumber",
        ].forEach((key) =>
          expect(submitted[key], "single original analysis " + key).to.eq(
            row[key],
          ),
        );
        expect(submitted.resultValue).to.eq(selected.id);
        expect(submitted.isModified).to.eq(true);
        receipt = response.body;
        expect(receipt.error).to.eq(undefined);
        expect(receipt.errorKey).to.eq(undefined);
        expect(receipt.analysisLastupdated).to.match(VERSION);
        expect(receipt.analysisStatusId).to.match(ID);
        expect(receipt.reflex).to.be.an("array");
        expect(receipt.calculated).to.be.an("array");
      });
      return cy.wait("@" + readback).then(({ response }) => {
        expect(response.statusCode).to.eq(200);
        const matches = response.body.testResult.filter(
          (item) => item.analysisId === row.analysisId,
        );
        expect(
          matches,
          "nonempty same analysis server save readback",
        ).to.have.length(1);
        const saved = matches[0];
        sameRow(saved, this.witness("positive", "31"), false);
        expect(saved.analysisLastupdated).to.eq(receipt.analysisLastupdated);
        expect(saved.analysisStatusId).to.eq(receipt.analysisStatusId);
        expect(saved.resultId).to.match(ID);
        expect(saved.resultValue).to.eq(selected.id);
        expect(saved.readOnly).to.eq(false);
        this.lastSaved = { ...saved, selectedLabel: selected.value };
        this.row(saved)
          .find(".unifiedResultsReadOnlyValue")
          .should("have.text", selected.value);
        cy.then(() =>
          expect(
            this.resultWrites,
            "exactly one real result write",
          ).to.have.length(1),
        );
      });
    });
  }

  openSameSavedReview() {
    expect(this.lastSaved, "previous real successful save required").to.be.an(
      "object",
    );
    expect(
      this.session.roles,
      "existing Validation authorization; never grant",
    ).to.include("Validation");
    const read = this.alias("sameSavedReviewRead");
    cy.intercept("GET", "**/rest/AccessionValidation?*", (request) => {
      if (new URL(request.url).searchParams.get("accessionNumber") === POSITIVE)
        request.alias = read;
    });
    this.row(this.lastSaved)
      .contains("button", label("results.workbench.review.open"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.location("pathname").should("eq", "/AccessionValidation");
    cy.location("search").then((search) => {
      const params = new URLSearchParams(search);
      expect([...params.keys()]).to.deep.eq(["accessionNumber"]);
      expect(params.get("accessionNumber")).to.eq(POSITIVE);
    });
    cy.wait("@" + read).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.queryId).to.be.a("string").and.not.be.empty;
      expect(response.body.resultList).to.be.an("array").and.not.be.empty;
      const same = response.body.resultList.filter(
        (row) => row.analysisId === this.lastSaved.analysisId,
      );
      expect(
        same,
        "real review contains the same saved analysis",
      ).to.have.length(1);
      expect(same[0].accessionNumber).to.eq(POSITIVE);
      expect(same[0].testName).to.include(this.lastSaved.testName);
      cy.get("#validation-page-title").should("be.visible");
      cy.contains("table tbody tr", this.lastSaved.testName).should(
        "be.visible",
      );
    });
    cy.then(() => expect(this.resultWrites).to.have.length(1));
  }

  openReferral() {
    const tests = this.alias("actualReferralTests");
    const sections = this.alias("actualReferralSections");
    cy.intercept("GET", "**/rest/test-list").as(tests);
    cy.intercept("GET", "**/rest/user-test-sections/Results").as(sections);
    openAuthorizedSidebarLink("menu_testing_workspace", "/ReferredOutTests");
    cy.wait("@" + tests).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body).to.be.an("array").and.not.be.empty;
      this.referralTests = response.body;
      expect(
        this.referralTests.filter((test) => String(test.id) === "31"),
      ).to.have.length(1);
    });
    cy.wait("@" + sections).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body).to.be.an("array").and.not.be.empty;
      this.referralSections = response.body;
      expect(
        this.referralSections.filter((section) => String(section.id) === "117"),
      ).to.have.length(1);
    });
    cy.get("#referral-title")
      .should("be.visible")
      .invoke("text")
      .should("match", label("referral.out.head"));
    cy.get("#referral-query-mode option").then(($options) =>
      expect([...$options].map((option) => option.value)).to.deep.eq([
        "TEST_AND_DATES",
        "PATIENT",
        "LAB_NUMBER",
      ]),
    );
  }

  observeReferral(expected) {
    const alias = this.alias("realReferralQuery");
    let active = true;
    cy.intercept("GET", "**/rest/ReferredOutTests?*", (request) => {
      const query = new URL(request.url).searchParams;
      if (
        active &&
        Object.entries(expected).every(
          ([key, value]) => query.get(key) === value,
        )
      ) {
        request.alias = alias;
        active = false;
      }
    });
    return alias;
  }

  finishReferral(alias, expected) {
    return cy.wait("@" + alias).then(({ request, response }) => {
      const query = new URL(request.url).searchParams;
      expect([...query.keys()].sort()).to.deep.eq(Object.keys(expected).sort());
      Object.entries(expected).forEach(([key, value]) =>
        expect(query.get(key)).to.eq(value),
      );
      expect(response.statusCode).to.eq(200);
      expect(
        response.body.referralDisplayItems,
        "actual referral query result",
      ).to.be.an("array");
      this.referralRows = response.body.referralDisplayItems;
      this.referralRows.forEach((row) => {
        ["accessionNumber", "patientFirstName", "patientLastName"].forEach(
          (key) => expect(row[key]).to.be.a("string"),
        );
        if (expected.selPatient || expected.labNumber) {
          expect(row.patientFirstName).to.eq("John");
          expect(row.patientLastName).to.eq("Smith");
        }
        if (expected.labNumber)
          expect(row.accessionNumber).to.eq(expected.labNumber);
      });
      this.assertReferralFacts();
      return cy.then(() => this.referralRows);
    });
  }

  assertReferralFacts() {
    if (this.referralRows.length === 0) {
      cy.get(".referral-results-panel .referral-empty").should("be.visible");
      cy.get(".referral-results-panel table, .referral-results-actions").should(
        "not.exist",
      );
      return;
    }
    cy.get(".referral-results-panel table tbody tr").should(
      "have.length",
      Math.min(10, this.referralRows.length),
    );
    cy.get(".referral-results-panel table tbody tr").each(($row, index) => {
      const actual = this.referralRows[index];
      expect($row.text()).to.include(actual.accessionNumber);
      expect($row.attr("aria-disabled")).to.eq(
        String(Boolean(actual.disabled || !actual.analysisId)),
      );
      cy.wrap($row)
        .find("input[name='selectRowCheckbox']")
        .should(
          actual.disabled || !actual.analysisId
            ? "be.disabled"
            : "not.be.disabled",
        );
    });
    cy.contains(
      ".referral-results-actions button",
      label("referral.print.selected.patient.reports"),
    ).should("be.disabled");
    cy.contains(
      ".referral-results-actions button",
      label("referral.print.selected.patient.reports.selectnone.button"),
    ).should("be.disabled");
  }

  searchReferralPatient() {
    cy.get("#referral-query-mode")
      .select("PATIENT")
      .should("have.value", "PATIENT");
    const patient = this.alias("realReferralPatient");
    const details = this.alias("realReferralPatientDetails");
    const expected = { searchType: "PATIENT", selPatient: "9200100" };
    const alias = this.observeReferral(expected);
    cy.intercept("GET", "**/rest/patient-search-results?*", (request) => {
      const params = new URL(request.url).searchParams;
      if (params.get("quickQuery") === "UG-23SLHD7DBD") request.alias = patient;
    });
    cy.intercept("GET", "**/rest/patient-details?patientID=9200100").as(
      details,
    );
    cy.get("#patientManagementQuickQuery")
      .should("be.visible")
      .clear()
      .type("UG-23SLHD7DBD");
    cy.contains(
      ".patient-compact-search__actions button",
      label("label.button.search"),
    ).click();
    cy.wait("@" + patient).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(
        response.body.patientSearchResults.filter(
          (row) => String(row.patientID) === "9200100",
        ),
      ).to.have.length(1);
    });
    cy.get("[data-cy='patient-result-row-9200100']")
      .should("contain.text", "John")
      .and("contain.text", "Smith")
      .find("label[for='9200100']")
      .should("be.visible")
      .click();
    cy.wait("@" + details).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(String(response.body.patientPK)).to.eq("9200100");
      expect(response.body.firstName).to.eq("John");
      expect(response.body.lastName).to.eq("Smith");
    });
    return this.finishReferral(alias, expected);
  }

  referralDates(dateType, selection) {
    this.resetReferral();
    cy.get("#referral-query-mode").select("TEST_AND_DATES");
    cy.get("button[aria-controls='referral-advanced']").then(($button) => {
      if ($button.attr("aria-expanded") !== "true") cy.wrap($button).click();
    });
    cy.get("#dateType").select(dateType).should("have.value", dateType);
    const date = this.collectionISODate();
    cy.get("#startDate").clear().type(date).should("have.value", date);
    cy.get("#endDate").clear().type(date).should("have.value", date);
    const expected = {
      searchType: "TEST_AND_DATES",
      dateType,
      startDate: dateForLocale(date, this.witnesses.actualDefaultDateLocale),
      endDate: dateForLocale(date, this.witnesses.actualDefaultDateLocale),
      testIds: "",
      testUnitIds: "",
    };
    if (selection) {
      const list =
        selection === "unit" ? this.referralSections : this.referralTests;
      const id = selection === "unit" ? "117" : "31";
      const item = list.filter((value) => String(value.id) === id);
      expect(item, "existing real HIV catalog option").to.have.length(1);
      const selector = selection === "unit" ? "#testunits" : "#testnames";
      cy.get(selector).should("be.visible").click();
      cy.get(".cds--list-box__menu-item")
        .filter((_, element) => element.textContent.trim() === item[0].value)
        .should("have.length", 1)
        .click();
      cy.get(selector).type("{esc}");
      expected[selection === "unit" ? "testUnitIds" : "testIds"] = id;
    }
    const alias = this.observeReferral(expected);
    cy.contains(".referral-query-actions button", label("label.button.search"))
      .should("be.enabled")
      .click();
    return this.finishReferral(alias, expected);
  }

  resetReferral() {
    const reset = this.alias("realReferralReset");
    cy.intercept("GET", "**/rest/ReferredOutTests?*").as(reset);
    cy.contains(".referral-query-actions button", label("label.button.reset"))
      .should("be.enabled")
      .click();
    cy.wait("@" + reset).then(({ request, response }) => {
      expect(new URL(request.url).searchParams.get("searchType")).to.eq(
        "TEST_AND_DATES",
      );
      expect(response.statusCode).to.eq(200);
      expect(response.body.referralDisplayItems).to.be.an("array");
      this.referralRows = response.body.referralDisplayItems;
      this.assertReferralFacts();
    });
  }

  referralLabNumber() {
    cy.get("#referral-query-mode")
      .select("LAB_NUMBER")
      .should("have.value", "LAB_NUMBER");
    cy.get("#labNumberInput").should("be.visible").clear().type(POSITIVE);
    const expected = { searchType: "LAB_NUMBER", labNumber: POSITIVE };
    const alias = this.observeReferral(expected);
    cy.contains(".referral-query-actions button", label("label.button.search"))
      .should("be.enabled")
      .click();
    return this.finishReferral(alias, expected);
  }
}

export { POSITIVE, NEGATIVE, identity, options, sameRow };
export default ResultsPage;
