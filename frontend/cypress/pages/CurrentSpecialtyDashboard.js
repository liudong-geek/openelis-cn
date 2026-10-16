import config from "../../src/config.json";
import { currentLabel, assertCurrentHeading } from "./CurrentChinaLabels";

const DEFINITIONS = {
  pathology: {
    path: "/PathologyDashboard",
    casePath: "/PathologyCaseView",
    api: "pathology",
    sampleKey: "pathologySampleId",
    heading: "pathology.label.title",
    unit: "Pathology",
    specialistRole: "Pathologist",
    specialistAction: "assignPathologist",
    ready: "READY_PATHOLOGIST",
    program: "Histopathology",
    specimenKey: "sample.type.histopathology",
    orderable: "Histopathology examination",
    orderableKind: "test",
  },
  immunohistochemistry: {
    path: "/ImmunohistochemistryDashboard",
    casePath: "/ImmunohistochemistryCaseView",
    api: "immunohistochemistry",
    sampleKey: "immunohistochemistrySampleId",
    heading: "immunohistochemistry.label.title",
    unit: "Immunohistochemistry",
    specialistRole: "Pathologist",
    specialistAction: "assignPathologist",
    ready: "READY_PATHOLOGIST",
    program: "Immunohistochemistry",
    specimenKey: "sample.type.immunohistochemistry",
    orderable: "Anti-CD7",
    orderableKind: "test",
  },
  cytology: {
    path: "/CytologyDashboard",
    casePath: "/CytologyCaseView",
    api: "cytology",
    sampleKey: "cytologySampleId",
    heading: "cytology.label.title",
    unit: "Cytology",
    specialistRole: "Cytopathologist",
    specialistAction: "assignCytoPathologist",
    ready: "READY_FOR_CYTOPATHOLOGIST",
    program: "Cytology",
    specimenKey: "sample.type.fluid",
    // CHG-117 explicitly replaces the obsolete cross-unit COVID fixture.
    orderable: "E2E Synthetic Cytology Report",
    orderablePattern: /^(?:E2E Synthetic Cytology Report|E2E 合成细胞学报告)$/,
    orderableKind: "test",
    fixtureIdentity: { programId: "5", sampleTypeId: "32", testId: "9000165" },
  },
};
const STATES = {};
const jsonRead = (path, qs) =>
  cy
    .request({
      url: `${config.serverBaseUrl}${path}`,
      qs,
      followRedirect: false,
      headers: { Accept: "application/json" },
    })
    .then((response) => {
      expect(response.status, "protected real read status").to.eq(200);
      expect(
        response.headers["content-type"],
        "JSON rather than a SPA fallback",
      ).to.match(/application\/json/i);
      return response.body;
    });
const bodyObject = (body) =>
  typeof body === "string" ? JSON.parse(body) : body;
const csv = (value) =>
  String(value || "")
    .split(",")
    .filter(Boolean);

class CurrentSpecialtyDashboard {
  constructor(kind) {
    expect(DEFINITIONS[kind], "known protected specialty workflow").to.be.an(
      "object",
    );
    this.definition = DEFINITIONS[kind];
    this.state = STATES[kind] || (STATES[kind] = {});
  }

  visit() {
    const d = this.definition;
    jsonRead("/session").then((session) => {
      expect(session.authenticated).to.eq(true);
      expect(String(session.userId)).to.match(/^[1-9]\d*$/);
      // Current case workflow needs actual technician and specialist authority.
      // GlobalAdmin alone does not grant these product permissions.
      expect(
        session.roles,
        "technician and specialty release roles",
      ).to.include.members(["Results", d.specialistRole]);
      const labRoles =
        session.userLabRolesMap?.AllLabUnits ||
        session.userLabRolesMap?.[d.unit] ||
        [];
      expect(labRoles, `real ${d.unit} result scope`).to.include("Results");
      this.state.userId = String(session.userId);
    });
    cy.intercept("GET", `**/rest/${d.api}/dashboard?*`).as(
      "actualSpecialtyDashboard",
    );
    cy.visit(d.path);
    cy.location("pathname").should("eq", d.path);
    assertCurrentHeading(d.heading);
    cy.wait("@actualSpecialtyDashboard")
      .its("response.statusCode")
      .should("eq", 200);
    cy.get("#statusFilter").should("be.visible");
    cy.then(() => {
      if (this.state.labNumber && !this.state.completed) this.findExactOrder();
    });
    return this;
  }

  findExactOrder() {
    return cy.then(() => {
      const d = this.definition;
      const labNumber = this.state.labNumber;
      const savedStatus = this.state.dashboardStatus;
      expect(labNumber, "the order created by this original scenario").to.be.a(
        "string",
      ).and.not.be.empty;
      cy.intercept({
        method: "GET",
        pathname: `**/rest/${d.api}/dashboard`,
        query: {
          searchTerm: labNumber,
          ...(savedStatus ? { statuses: savedStatus } : {}),
        },
      }).as("exactCreatedSpecialtyOrder");
      if (savedStatus) {
        cy.get("#statusFilter")
          .should("be.visible")
          .select(savedStatus)
          .should("have.value", savedStatus);
      }
      cy.get(".gridBoundary input.cds--search-input")
        .should("be.visible")
        .clear()
        .type(labNumber);
      cy.wait("@exactCreatedSpecialtyOrder").then(({ request, response }) => {
        if (savedStatus)
          expect(new URL(request.url).searchParams.get("statuses")).to.eq(
            savedStatus,
          );
        expect(response.statusCode).to.eq(200);
        expect(response.headers["content-type"]).to.match(/application\/json/i);
        expect(response.body).to.be.an("array");
        const matches = response.body.filter(
          (entry) => entry.labNumber === labNumber,
        );
        expect(matches, "one actual newly saved specialty case").to.have.length(
          1,
        );
        const id = String(matches[0][d.sampleKey]);
        expect(id).to.match(/^[1-9]\d*$/);
        if (this.state.caseId) expect(id).to.eq(this.state.caseId);
        this.state.caseId = id;
        this.state.dashboardStatus = matches[0].status;
      });
      this.row().should("have.length", 1).and("be.visible");
    });
  }

  row() {
    return cy.then(() => {
      const exact = new RegExp(
        `^${Cypress._.escapeRegExp(this.state.labNumber)}$`,
      );
      return cy.contains(".gridBoundary table tbody td", exact).parents("tr");
    });
  }

  addOriginalOrder(homePage) {
    const d = this.definition;
    // Explicit legacy Reception-protected bookmark; shared method belongs to
    // the separately reviewed Order8 candidate, not a restored China menu.
    homePage.visit();
    homePage.expectOverview();
    homePage.goToCompatibilityOrderEntry();
    cy.intercept({
      method: "GET",
      pathname: "**/rest/patient-search-results",
      query: { firstName: "John" },
    }).as("actualSpecialtyPatientSearch");
    cy.get("#firstName").should("be.visible").type("John");
    cy.get("#local_search").should("be.visible").click();
    cy.wait("@actualSpecialtyPatientSearch").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.patientSearchResults).to.be.an("array").and.not.be
        .empty;
      const patient = response.body.patientSearchResults.find(
        (entry) =>
          entry.firstName === "John" && entry.dataSourceName === "OpenElis",
      );
      expect(patient, "unchanged local John patient fixture").to.be.an(
        "object",
      );
      this.state.patientId = String(patient.patientID);
      cy.intercept("GET", "**/rest/patient-details?*", (read) => {
        if (
          new URL(read.url).searchParams.get("patientID") ===
          String(patient.patientID)
        ) {
          read.alias = "actualSpecialtyPatientDetails";
        }
      });
      cy.get(
        `[data-cy='patient-result-row-${patient.patientID}'] label[for='${patient.patientID}']`,
      )
        .should("be.visible")
        .click();
      return cy
        .wait("@actualSpecialtyPatientDetails")
        .then(({ request, response }) => {
          expect(new URL(request.url).searchParams.get("patientID")).to.eq(
            String(patient.patientID),
          );
          expect(response?.statusCode).to.eq(200);
          expect(response?.headers?.["content-type"]).to.match(
            /application\/json/i,
          );
          const details = response?.body;
          expect(details, "same selected patient detail").to.be.an("object");
          expect(details).not.to.have.property("error");
          expect(String(details.patientPK)).to.eq(String(patient.patientID));
          expect(details.firstName).to.eq(patient.firstName);
          expect(details.lastName).to.eq(patient.lastName);
          cy.get("[data-cy='patientSelectionReady'] form:visible")
            .should("have.length", 1)
            .within(() => {
              cy.get("input#firstName").should("have.value", details.firstName);
              cy.get("input#lastName").should("have.value", details.lastName);
              cy.get("input#nationalId").should(
                "have.value",
                details.nationalId,
              );
              cy.get("input#date-picker-default-id").should(
                "have.value",
                details.birthDateForDisplay,
              );
              cy.get("input[name='gender']:checked").should(
                "have.value",
                details.gender,
              );
            });
        });
    });
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    const programOptions = ($options) => {
      const labels = currentLabel(d.heading);
      const literal = [...$options].filter(
        (option) => option.text.trim() === d.program,
      );
      return literal.length
        ? literal
        : [...$options].filter((option) => labels.test(option.text.trim()));
    };
    cy.get("#additionalQuestionsSelect option")
      .should(($options) => {
        expect(
          programOptions($options),
          "same specialty program",
        ).to.have.length(1);
      })
      .then(($options) => {
        const matching = programOptions($options);
        expect(matching, "same specialty program").to.have.length(1);
        if (d.fixtureIdentity)
          expect(matching[0].value, "fixed synthetic Cytology program").to.eq(
            d.fixtureIdentity.programId,
          );
        this.state.programId = matching[0].value;
        cy.get("#additionalQuestionsSelect")
          .select(matching[0].value)
          .should("have.value", matching[0].value);
      });
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    const sampleTypeOptions = ($options) =>
      [...$options].filter((option) =>
        currentLabel(d.specimenKey).test(option.text.trim()),
      );
    cy.get("#sampleId_0 option")
      .should(($options) => {
        expect(
          sampleTypeOptions($options),
          "same physical specimen type",
        ).to.have.length(1);
      })
      .then(($options) => {
        const matching = sampleTypeOptions($options);
        expect(matching, "same physical specimen type").to.have.length(1);
        if (d.fixtureIdentity)
          expect(
            matching[0].value,
            "fixed synthetic Cytology Fluid type",
          ).to.eq(d.fixtureIdentity.sampleTypeId);
        this.state.sampleTypeId = matching[0].value;
        cy.get("#sampleId_0")
          .select(matching[0].value)
          .should("have.value", matching[0].value);
      });
    const orderableLabel = d.fixtureIdentity
      ? cy
          .get(`label[for='test_0_${d.fixtureIdentity.testId}']`)
          .should("have.length", 1)
          .should(($label) =>
            expect($label.text().trim()).to.match(d.orderablePattern),
          )
      : cy.contains("label.cds--checkbox-label", d.orderable);
    orderableLabel.should("be.visible").then(($label) => {
      const id = $label.attr("for");
      expect(id).to.match(new RegExp(`^${d.orderableKind}_0_[1-9]\\d*$`));
      this.state.orderableId = id.slice(`${d.orderableKind}_0_`.length);
      if (d.fixtureIdentity)
        expect(
          this.state.orderableId,
          "fixed E2E synthetic Cytology test",
        ).to.eq(d.fixtureIdentity.testId);
      cy.wrap($label).click();
      cy.get(`#${id}`).should("be.checked");
    });
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    cy.get("[data-cy=generate-labNumber]").should("be.visible").click();
    cy.get("#labNo")
      .should("not.have.value", "")
      .invoke("val")
      .then((value) => {
        this.state.labNumber = String(value);
      });
    cy.fixture("Order").then((order) => {
      expect(order.siteName, "original specialty institution").to.eq(
        "CAMES MAN",
      );
      expect(order.requester).to.deep.equal({
        fullName: "Prime, Optimus",
        firstName: "Optimus",
        lastName: "Prime",
      });
      return jsonRead("/rest/Provider/raw/9000001").then((originalProvider) => {
        expect(
          String(originalProvider.id),
          "original fixture provider ID",
        ).to.eq("9000001");
        expect(originalProvider.person.firstName).to.eq(
          order.requester.firstName,
        );
        expect(originalProvider.person.lastName).to.eq(
          order.requester.lastName,
        );
        expect(
          String(originalProvider.person.id),
          "original provider person ID",
        ).to.match(/^[1-9]\d*$/);
        return jsonRead("/rest/SamplePatientEntry").then(
          ({ sampleOrderItems }) => {
            const sites = sampleOrderItems.referringSiteList.filter(
              (site) =>
                site.value === order.siteName ||
                site.value.endsWith(` - ${order.siteName}`),
            );
            expect(sites, "same original referring institution").to.have.length(
              1,
            );
            const providers = sampleOrderItems.providersList.filter(
              (provider) =>
                String(provider.id) === String(originalProvider.person.id) &&
                provider.value === order.requester.fullName,
            );
            expect(
              providers,
              "same original requester identity",
            ).to.have.length(1);
            const requesterOptions = sampleOrderItems.providersList.filter(
              (provider) =>
                provider.value
                  .toLowerCase()
                  .includes(order.requester.fullName.toLowerCase()),
            );
            const requesterIndex = requesterOptions.findIndex(
              (provider) =>
                String(provider.id) === String(originalProvider.person.id),
            );
            expect(
              requesterIndex,
              "original person in the filtered option order",
            ).to.be.at.least(0);
            this.state.expectedMetadata = {
              referringSiteId: String(sites[0].id),
              referringSiteName: order.siteName,
              providerId: String(originalProvider.id),
              providerPersonId: String(originalProvider.person.id),
              providerFirstName: order.requester.firstName,
              providerLastName: order.requester.lastName,
            };
            cy.get("#siteName")
              .should("be.visible")
              .clear()
              .type(order.siteName);
            cy.get(".suggestions li")
              .filter(
                (_, option) => option.textContent.trim() === sites[0].value,
              )
              .should("have.length", 1)
              .and("be.visible")
              .click();
            cy.intercept({
              method: "GET",
              pathname: "**/rest/practitioner",
              query: { providerId: String(originalProvider.person.id) },
            }).as("actualSpecialtyRequester");
            cy.get("#requesterId")
              .should("be.visible")
              .clear()
              .type(order.requester.fullName);
            cy.get(".suggestions li")
              .should(($options) => {
                expect(
                  [...$options].map((option) => option.textContent.trim()),
                  "unchanged autocomplete option order",
                ).to.deep.equal(
                  requesterOptions.map((provider) => provider.value),
                );
              })
              .eq(requesterIndex)
              .should("be.visible")
              .click();
            cy.wait("@actualSpecialtyRequester").then(
              ({ request, response }) => {
                expect(
                  new URL(request.url).searchParams.get("providerId"),
                ).to.eq(String(originalProvider.person.id));
                expect(response.statusCode).to.eq(200);
                expect(response.headers["content-type"]).to.match(
                  /application\/json/i,
                );
                expect(String(response.body.id)).to.eq(
                  String(originalProvider.id),
                );
                expect(String(response.body.person.id)).to.eq(
                  String(originalProvider.person.id),
                );
                expect(response.body.person.firstName).to.eq(
                  order.requester.firstName,
                );
                expect(response.body.person.lastName).to.eq(
                  order.requester.lastName,
                );
              },
            );
            cy.get("#requesterFirstName").should(
              "have.value",
              order.requester.firstName,
            );
            cy.get("#requesterLastName").should(
              "have.value",
              order.requester.lastName,
            );
          },
        );
      });
    });
    cy.intercept("POST", "**/rest/SamplePatientEntry").as(
      "actualSavedSpecialtyOrder",
    );
    cy.get(".forwardButton").should("be.visible").and("be.enabled").click();
    cy.wait("@actualSavedSpecialtyOrder").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.headers["content-type"]).to.match(/application\/json/i);
      const sent = bodyObject(request.body);
      expect(response.body.error).to.be.undefined;
      expect(response.body.sampleOrderItems.labNo).to.eq(this.state.labNumber);
      expect(String(sent.patientProperties.patientPK)).to.eq(
        this.state.patientId,
      );
      expect(sent.sampleOrderItems.programId).to.eq(this.state.programId);
      for (const key of [
        "referringSiteId",
        "providerId",
        "providerPersonId",
        "providerFirstName",
        "providerLastName",
      ])
        expect(
          String(sent.sampleOrderItems[key]),
          `original specialty ${key}`,
        ).to.eq(this.state.expectedMetadata[key]);
      const xml = new DOMParser().parseFromString(
        sent.sampleXML,
        "application/xml",
      );
      expect(xml.querySelector("parsererror")).to.eq(null);
      const samples = [...xml.querySelectorAll("samples > sample")];
      expect(samples).to.have.length(1);
      expect(samples[0].getAttribute("sampleID")).to.eq(
        this.state.sampleTypeId,
      );
      expect(
        csv(
          samples[0].getAttribute(
            d.orderableKind === "panel" ? "panels" : "tests",
          ),
        ),
      ).to.include(this.state.orderableId);
      return jsonRead("/rest/order/saved", {
        queryVersion: "2",
        labNumber: this.state.labNumber,
      }).then((saved) => {
        expect(saved.queryVersion).to.eq("2");
        expect(saved.labNumber).to.eq(this.state.labNumber);
        expect(String(saved.patient.patientId)).to.eq(this.state.patientId);
        for (const [key, value] of Object.entries(this.state.expectedMetadata))
          expect(
            String(saved.sampleOrderItems[key]),
            `persisted original specialty ${key}`,
          ).to.eq(value);
        expect(saved.samples).to.have.length(1);
        expect(saved.samples[0].sampleTypeId).to.eq(this.state.sampleTypeId);
        const analyses = saved.samples[0].analyses;
        expect(analyses).to.be.an("array").and.not.be.empty;
        const persistedIds = analyses.map((analysis) =>
          String(
            d.orderableKind === "panel" ? analysis.panelId : analysis.testId,
          ),
        );
        expect(persistedIds).to.include(this.state.orderableId);
        const specimen = saved.samples[0];
        expect(specimen.sortOrder, "actual saved clinical tube sort order")
          .to.be.a("string")
          .and.match(/^[1-9]\d{0,4}$/);
        expect(
          saved.requests,
          "one real collected specialty request",
        ).to.have.length(1);
        const planned = saved.requests[0];
        expect(planned.status).to.eq("COLLECTED");
        expect(String(planned.sampleItemId)).to.eq(
          String(specimen.sampleItemId),
        );
        expect(String(planned.sampleTypeId)).to.eq(this.state.sampleTypeId);
        const testIds = analyses
          .map((analysis) => String(analysis.testId))
          .sort();
        expect(
          planned.tests.map((test) => String(test.testId)).sort(),
        ).to.deep.eq(testIds);
        if (d.fixtureIdentity)
          expect(
            testIds,
            "one synthetic Cytology report test, never COVID302",
          ).to.deep.eq([d.fixtureIdentity.testId]);
        this.state.createdOrder = {
          sampleId: String(saved.orderId),
          labNo: saved.labNumber,
          patientId: String(saved.patient.patientId),
          sampleItemId: String(specimen.sampleItemId),
          sampleTypeId: String(specimen.sampleTypeId),
          barcode: specimen.barcode,
          lookupCode: `${saved.labNumber}.${specimen.sortOrder}`,
          requestId: String(planned.sampleTypeRequestId),
          analysisIds: analyses
            .map((analysis) => String(analysis.analysisId))
            .sort(),
          testIds,
        };
      });
    });
    cy.contains("h4", currentLabel("save.success")).should("be.visible");
    cy.get(".post-save-dialog__accession-tag").should(($tag) => {
      expect(this.state.labNumber, "saved original order number").to.be.a(
        "string",
      ).and.not.be.empty;
      expect($tag.text(), "same saved original order tag").to.eq(
        this.state.labNumber,
      );
    });
    // Preparation is explicit and follows the original save UI assertions.
    cy.then(() => this.receiveAndAcceptCreatedSpecimen());
  }

  receiveAndAcceptCreatedSpecimen() {
    return cy.then(() => {
      const target = this.state.createdOrder;
      expect(
        target,
        "independently read newly created specialty order",
      ).to.be.an("object");
      for (const key of [
        "sampleId",
        "patientId",
        "sampleItemId",
        "sampleTypeId",
        "requestId",
      ])
        expect(target[key], `same saved ${key}`).to.match(/^[1-9]\d*$/);
      expect(target.labNo).to.eq(this.state.labNumber);
      expect(target.patientId).to.eq(this.state.patientId);
      expect(target.testIds).to.be.an("array").and.not.be.empty;
      expect(
        this.state.intakePreparationStarted,
        "one preparation attempt per newly saved order",
      ).not.to.eq(true);
      this.state.intakePreparationStarted = true;
      const readTube = () =>
        jsonRead("/rest/specimen-intake/lookup", {
          code: target.lookupCode,
        }).then((lookup) => {
          expect(lookup.version).to.eq(1);
          expect(lookup.source).to.eq("specimen_lookup");
          expect(lookup.readOnly).to.eq(true);
          expect(lookup.matchedKind).to.eq("specimen");
          expect(lookup.selection).to.deep.eq({
            sampleId: target.sampleId,
            sampleItemId: target.sampleItemId,
            requestId: target.requestId,
          });
          const current = lookup.current;
          expect(current.sampleId).to.eq(target.sampleId);
          expect(current.labNo).to.eq(target.labNo);
          expect(current.patientMasked).to.eq(false);
          expect(current.patient.id).to.eq(target.patientId);
          expect(current.requestedSpecimens).to.have.length(1);
          expect(current.physicalSpecimens).to.have.length(1);
          const planned = current.requestedSpecimens[0],
            tube = current.physicalSpecimens[0];
          expect(planned.id).to.eq(target.requestId);
          expect(planned.sampleItemId).to.eq(target.sampleItemId);
          expect(planned.status).to.eq("COLLECTED");
          expect(planned.typeOfSampleId).to.eq(target.sampleTypeId);
          expect(tube.id).to.eq(target.sampleItemId);
          expect(tube.requestId).to.eq(target.requestId);
          expect(tube.typeOfSampleId).to.eq(target.sampleTypeId);
          expect(target.lookupCode).to.eq(`${target.labNo}.${tube.sortOrder}`);
          expect(tube.voided).to.eq(false);
          expect(tube.rejected).to.eq(false);
          return tube;
        });
      const postOnce = (path, body, csrf) =>
        cy
          .request({
            method: "POST",
            url: `${config.serverBaseUrl}${path}`,
            body,
            followRedirect: false,
            retryOnNetworkFailure: false,
            retryOnStatusCodeFailure: false,
            log: false,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json; charset=UTF-8",
              "X-CSRF-Token": csrf,
            },
          })
          .then((response) => {
            expect(
              response.status,
              "single real specialty preparation POST",
            ).to.eq(200);
            expect(response.headers["content-type"]).to.match(
              /application\/json/i,
            );
            expect(response.body.success).to.eq(true);
            for (const key of ["sampleId", "labNo", "patientId"])
              expect(response.body[key]).to.eq(target[key]);
            return response.body;
          });
      return jsonRead("/session").then((actor) => {
        expect(actor.authenticated).to.eq(true);
        expect(String(actor.userId)).to.eq(this.state.userId);
        expect(actor.roles).to.include.members([
          "Reception",
          "Results",
          this.definition.specialistRole,
        ]);
        expect(actor.csrf).to.be.a("string").and.not.be.empty;
        return readTube().then((tube) => {
          expect(tube.decisionState).to.eq("NOT_RECORDED");
          expect(tube.recordedDecision ?? null).to.eq(null);
          expect(tube.operationId ?? null).to.eq(null);
          expect(tube.receivedDate ?? null).to.eq(null);
          expect(Number.isFinite(Date.parse(tube.collectionDate))).to.eq(true);
          return jsonRead("/rest/server-time").then((clock) => {
            expect(Number.isFinite(Date.parse(clock.instant))).to.eq(true);
            expect(Date.parse(clock.instant)).to.be.at.least(
              Date.parse(tube.collectionDate),
            );
            const receipt = {
              sampleId: target.sampleId,
              labNo: target.labNo,
              patientId: target.patientId,
              tubes: [
                {
                  requestId: target.requestId,
                  sampleItemId: target.sampleItemId,
                  collectionDate: tube.collectionDate,
                  receivedDate: clock.instant,
                },
              ],
            };
            return postOnce(
              "/rest/specimen-receipts",
              receipt,
              actor.csrf,
            ).then((ack) => {
              expect(ack.tubes).to.deep.eq([
                { ...receipt.tubes[0], replayed: false },
              ]);
              return readTube().then((received) => {
                expect(received.collectionDate).to.eq(tube.collectionDate);
                expect(received.receivedDate).to.eq(clock.instant);
                expect(received.decisionState).to.eq("NOT_RECORDED");
                expect(received.operationId ?? null).to.eq(null);
                expect(received.expectedEvidenceDigest).to.match(
                  /^[a-f0-9]{64}$/,
                );
                const acceptance = {
                  version: 1,
                  operationId: crypto.randomUUID(),
                  sampleId: target.sampleId,
                  labNo: target.labNo,
                  patientId: target.patientId,
                  requestId: target.requestId,
                  sampleItemId: target.sampleItemId,
                  decision: "ACCEPTED",
                  reason: null,
                  expectedEvidenceDigest: received.expectedEvidenceDigest,
                };
                return postOnce(
                  "/rest/specimen-intake-decisions",
                  acceptance,
                  actor.csrf,
                ).then((accepted) => {
                  for (const key of [
                    "requestId",
                    "sampleItemId",
                    "operationId",
                  ])
                    expect(accepted[key]).to.eq(acceptance[key]);
                  expect(accepted.replayed).to.eq(false);
                  expect(accepted.recordedDecision).to.eq("ACCEPTED");
                  expect(accepted.reason ?? null).to.eq(null);
                  expect(String(accepted.decidedBy)).to.eq(
                    String(actor.userId),
                  );
                  expect(Number.isFinite(Date.parse(accepted.decidedAt))).to.eq(
                    true,
                  );
                  // The acknowledgement is persistence evidence, never current admission.
                  expect(accepted.currentAcceptanceVerified).to.eq(false);
                  return readTube().then((verified) => {
                    expect(verified.collectionDate).to.eq(
                      receipt.tubes[0].collectionDate,
                    );
                    expect(verified.receivedDate).to.eq(
                      receipt.tubes[0].receivedDate,
                    );
                    expect(verified.decisionState).to.eq("RECORDED");
                    expect(verified.recordedDecision).to.eq("ACCEPTED");
                    expect(verified.operationId).to.eq(acceptance.operationId);
                    return jsonRead("/rest/order/saved", {
                      queryVersion: "2",
                      labNumber: target.labNo,
                    }).then((saved) => {
                      expect(String(saved.orderId)).to.eq(target.sampleId);
                      expect(saved.labNumber).to.eq(target.labNo);
                      expect(String(saved.patient.patientId)).to.eq(
                        target.patientId,
                      );
                      expect(saved.samples).to.have.length(1);
                      expect(saved.requests).to.have.length(1);
                      const sample = saved.samples[0],
                        request = saved.requests[0];
                      expect(String(sample.sampleItemId)).to.eq(
                        target.sampleItemId,
                      );
                      expect(String(sample.sampleTypeId)).to.eq(
                        target.sampleTypeId,
                      );
                      expect(sample.barcode).to.eq(target.barcode);
                      expect(String(request.sampleTypeRequestId)).to.eq(
                        target.requestId,
                      );
                      expect(String(request.sampleItemId)).to.eq(
                        target.sampleItemId,
                      );
                      expect(String(request.sampleTypeId)).to.eq(
                        target.sampleTypeId,
                      );
                      expect(request.status).to.eq("COLLECTED");
                      expect(
                        request.tests.map((test) => String(test.testId)).sort(),
                      ).to.deep.eq(target.testIds);
                      expect(
                        sample.analyses
                          .map((analysis) => String(analysis.analysisId))
                          .sort(),
                      ).to.deep.eq(target.analysisIds);
                      expect(
                        sample.analyses
                          .map((analysis) => String(analysis.testId))
                          .sort(),
                      ).to.deep.eq(target.testIds);
                      this.state.intakePrepared = true;
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  }

  assertOriginalPrintBarcodeButton() {
    cy.get(".post-save-dialog__accession-tag").should(($tag) => {
      expect(this.state.labNumber, "saved original order number").to.be.a(
        "string",
      ).and.not.be.empty;
      expect($tag.text(), "same saved original order tag").to.eq(
        this.state.labNumber,
      );
    });
    cy.contains(
      ".post-save-dialog__action-cell button",
      currentLabel("barcode.print.button"),
    )
      .should("be.visible")
      .and("be.enabled");
  }

  openExactCase() {
    return cy.then(() => {
      const d = this.definition;
      expect(this.state.caseId).to.match(/^[1-9]\d*$/);
      cy.intercept("GET", `**/rest/${d.api}/caseView/${this.state.caseId}`).as(
        "actualExactSpecialtyCase",
      );
      this.row().should("be.visible").click();
      cy.location("pathname").should(
        "eq",
        `${d.casePath}/${this.state.caseId}`,
      );
      cy.wait("@actualExactSpecialtyCase").then(({ response }) => {
        expect(response.statusCode).to.eq(200);
        expect(response.body.labNumber).to.eq(this.state.labNumber);
      });
    });
  }

  saveCase(status, release) {
    return cy.then(() => {
      const d = this.definition;
      const id = this.state.caseId;
      cy.intercept("POST", `**/rest/${d.api}/caseView/${id}`).as(
        "actualSaveSpecialtyCase",
      );
      cy.get("#pathology_save2").should("be.visible").and("be.enabled").click();
      cy.wait("@actualSaveSpecialtyCase").then(({ request, response }) => {
        expect(response.statusCode).to.eq(200);
        const sent = bodyObject(request.body);
        expect(sent.status).to.eq(status);
        expect(sent.release).to.eq(release);
        expect(String(sent.assignedTechnicianId)).to.eq(this.state.userId);
        if (release) {
          expect(
            String(
              sent[
                d.api === "cytology"
                  ? "assignedCytoPathologistId"
                  : "assignedPathologistId"
              ],
            ),
          ).to.eq(this.state.userId);
        }
        return jsonRead(`/rest/${d.api}/caseView/${id}`).then((saved) => {
          expect(saved.labNumber).to.eq(this.state.labNumber);
          expect(saved.status).to.eq(release ? "COMPLETED" : status);
          this.state.dashboardStatus = saved.status;
          expect(String(saved.assignedTechnicianId)).to.eq(this.state.userId);
          if (release)
            expect(String(saved.assignedPathologistId)).to.eq(
              this.state.userId,
            );
          this.state.completed = release;
        });
      });
    });
  }

  completeThroughActualAssignmentAndRelease() {
    const d = this.definition;
    cy.then(() =>
      expect(
        this.state.intakePrepared,
        "explicitly received and accepted created specialty tube",
      ).to.eq(true),
    );
    this.findExactOrder();
    cy.then(() => {
      expect(this.state.caseId, "same loaded specialty case").to.match(
        /^[1-9]\d*$/,
      );
      cy.intercept(
        "POST",
        `**/rest/${d.api}/assignTechnician?${d.sampleKey}=${this.state.caseId}`,
      ).as("actualTechnicianClaim");
    });
    this.row()
      .find("td")
      .eq(4)
      .contains("button", currentLabel("label.button.start"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@actualTechnicianClaim")
      .its("response.statusCode")
      .should("eq", 200);
    this.visit();
    this.openExactCase();
    cy.get("#assignedTechnician")
      .should("be.disabled")
      .should(($select) =>
        expect($select.val(), "same current assigned actor").to.eq(
          this.state.userId,
        ),
      );
    cy.get("#assignedPathologist").should("be.disabled");
    cy.get("#status option[value=COMPLETED]").should("not.exist");
    cy.get("#status")
      .should("be.enabled")
      .select(d.ready)
      .should("have.value", d.ready);
    this.saveCase(d.ready, false);
    this.visit();
    cy.then(() => {
      expect(this.state.caseId, "same loaded specialty case").to.match(
        /^[1-9]\d*$/,
      );
      cy.intercept(
        "POST",
        `**/rest/${d.api}/${d.specialistAction}?${d.sampleKey}=${this.state.caseId}`,
      ).as("actualSpecialistClaim");
    });
    this.row()
      .find("td")
      .eq(5)
      .contains("button", currentLabel("label.button.start"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@actualSpecialistClaim")
      .its("response.statusCode")
      .should("eq", 200);
    this.visit();
    this.openExactCase();
    cy.get("#assignedTechnician")
      .should("be.disabled")
      .should(($select) =>
        expect($select.val(), "same current assigned actor").to.eq(
          this.state.userId,
        ),
      );
    cy.get("#assignedPathologist")
      .should("be.disabled")
      .should(($select) =>
        expect($select.val(), "same current assigned actor").to.eq(
          this.state.userId,
        ),
      );
    cy.get("label[for=release]").should("be.visible").click();
    cy.get("#release").should("be.checked");
    this.saveCase(d.ready, true);
  }

  assertCreatedCaseCompletedInDashboard() {
    return cy.then(() => {
      const d = this.definition;
      cy.intercept({
        method: "GET",
        pathname: `**/rest/${d.api}/dashboard`,
        query: { searchTerm: this.state.labNumber, statuses: "COMPLETED" },
      }).as("actualCompletedCaseFilter");
      cy.get("#statusFilter")
        .should("be.visible")
        .select("COMPLETED")
        .should("have.value", "COMPLETED");
      cy.get(".gridBoundary input.cds--search-input")
        .should("be.visible")
        .clear()
        .type(this.state.labNumber);
      cy.wait("@actualCompletedCaseFilter").then(({ request, response }) => {
        expect(new URL(request.url).searchParams.get("statuses")).to.eq(
          "COMPLETED",
        );
        expect(response.statusCode).to.eq(200);
        const matches = response.body.filter(
          (entry) => entry.labNumber === this.state.labNumber,
        );
        expect(matches).to.have.length(1);
        expect(String(matches[0][d.sampleKey])).to.eq(this.state.caseId);
        expect(matches[0].status).to.eq("COMPLETED");
      });
      this.row().should("have.length", 1).and("be.visible");
    });
  }
}

export default CurrentSpecialtyDashboard;
