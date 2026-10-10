import { setCarbonToggle } from "./CurrentAdminLabels";
import CurrentMenuContract from "./CurrentMenuContract";
import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
const API_BASE = "/api/OpenELIS-Global";
const labelPattern = (id) =>
  new RegExp(
    `^(?:${[enMessages[id], zhMessages[id]].map(Cypress._.escapeRegExp).join("|")})$`,
  );
const rowsOf = (items, depth = 0) =>
  items.flatMap((item) => [
    { id: item.menu.elementId, active: item.menu.isActive, depth },
    ...rowsOf(item.childMenus || [], depth + 1),
  ]);

class MenuConfigPage {
  constructor(category = "global") {
    this.category = category;
    this.currentContract = ["patient", "nonconformity", "study"].includes(
      category,
    )
      ? new CurrentMenuContract(this)
      : null;
    this.sequence = 0;
    this.changedIds = new Set();
    this.checkedIds = [];
    this.selectors = {
      menuButton: "[data-cy='menuButton']",
      nonConformMenu: "#menu_nonconformity",
      nonConformCheck: "Non-Conformity Menu Active",
      nonConformReport: "#menu_non_conforming_report",
      nonConformView: "#menu_non_conforming_view",
      correctiveAction: "#menu_non_conforming_corrective_actions",
      patientMenu: "#menu_patient",
      addEditPatient: "#menu_patient_add_or_edit",
      patientHistory: "#menu_patienthistory",
      studyPatient: "#menu_patient_create",
      enterBillingAddress: "#billing_address",
      billingMenu: "#menu_billing",
      patientCheck: "Patient Menu Active",
      billingMenuCheck: "Billing Menu Active",
      toggleText: ".cds--toggle__text",
      toggleOn: "div.cds--toggle__switch",
      toggleOff: "div.cds--toggle label div > div",
    };
  }

  // This method is used to visit the page
  visit() {
    cy.visit("/MasterListsPage/menuConfiguration");
  }

  navigateToMainMenu() {
    if (this.currentContract) {
      this.currentContract.openSidebar();
      return;
    }
    cy.wait(5000);
    cy.get("body").then(($body) => {
      if ($body.find("[data-testid='admin-back-to-main-nav']").length > 0) {
        cy.get("[data-testid='admin-back-to-main-nav']").click();
        cy.location("pathname").should("eq", "/Dashboard");
      }
    });
    cy.get("body").then(($body) => {
      if ($body.find(".cds--side-nav--expanded").length === 0) {
        cy.get(this.selectors.menuButton).click();
      }
    });
  }

  watchMenuPosts() {
    const observation = { requests: [], alias: `menuPosts${++this.sequence}` };
    cy.intercept(
      { method: "POST", pathname: /\/rest\/menu(?:\/|$)/ },
      (request) => {
        observation.requests.push(request);
      },
    ).as(observation.alias);
    return observation;
  }

  readGlobalTree() {
    return cy.request(`${API_BASE}/rest/menu`).then(({ status, body }) => {
      expect(status, "independent server menu GET").to.eq(200);
      expect(body).to.be.an("array");
      return body;
    });
  }

  setShowChildren(show) {
    if (this.currentContract) {
      this.currentContract.showChildren(show);
      return;
    }
    const observation = this.watchMenuPosts();
    this.readGlobalTree().then((before) => {
      setCarbonToggle("toggleShowChildren", show);
      if (this.category === "global") {
        cy.get("#security-menu-search").clear();
        const expected = rowsOf(before)
          .filter((row) => show || row.depth === 0)
          .slice(0, 30);
        cy.get(".security-menu-page input[id^='menu-active-']").should(
          ($inputs) => {
            expect([...$inputs].map((input) => input.id)).to.deep.eq(
              expected.map((row) => `menu-active-${row.id}`),
            );
          },
        );
        this.saveButton().should("be.disabled");
      }
      this.readGlobalTree().then((after) => {
        expect(
          after,
          "showChildren only filters display; does not save active states",
        ).to.deep.eq(before);
        expect(
          observation.requests,
          "zero menu POSTs for display filtering",
        ).to.have.length(0);
      });
    });
  }

  turnOffToggleSwitch() {
    this.setShowChildren(false);
  }
  turnOnToggleSwitch() {
    this.setShowChildren(true);
  }

  validateToggleStatus(value) {
    expect(["Off", "On"]).to.include(value);
    cy.get("#toggleShowChildren").should(
      "have.attr",
      "aria-checked",
      String(value === "On"),
    );
  }

  saveButton() {
    return cy.contains(
      ".security-menu-page .admin-entry-workspace__actions button",
      labelPattern("security.menu.save"),
    );
  }

  beginGlobalSelection() {
    cy.get("#menu-configuration-category").should("have.value", "global");
    cy.get("#toggleShowChildren").should("have.attr", "aria-checked", "true");
    this.changedIds.clear();
    this.checkedIds = [];
    this.readGlobalTree().then((body) => {
      this.beforeSelection = body;
    });
  }

  verifyGlobalMenuAfterLogin() {
    this.readGlobalTree().then((body) => {
      const actual = new Map(rowsOf(body).map((row) => [row.id, row.active]));
      expect(
        this.checkedIds,
        "original requested menu identities retained",
      ).to.have.length(15);
      this.checkedIds.forEach((id) =>
        expect(actual.get(id), `persisted active state for ${id}`).to.eq(true),
      );
    });
    cy.get(".cds--side-nav").should("have.class", "cds--side-nav--expanded");
    cy.get("#menu_intake_workspace").should("be.visible");
    cy.get("#menu_configuration_workspace").should("be.visible");
    cy.get("#menu_management_workspace").should("be.visible");
    // Optional study/specialty tasks remain hidden by the current China profile;
    // activation readback is not proof of their route authorization or visibility.
  }

  uncheckNonConform() {
    this.currentContract.deactivate();
  }

  validateNonConformOff() {
    this.currentContract.nceOff();
  }

  validateNonConformOn() {
    this.currentContract.nceOn();
  }

  uncheckPatientMenu() {
    this.currentContract.deactivate();
  }

  validatePatientMenuOff() {
    this.currentContract.patientOff();
  }

  validatePatientMenuOn() {
    this.currentContract.patientOn();
  }

  uncheckStudyMenu() {
    this.currentContract.deactivate();
  }
  validateStudyOff() {
    this.currentContract.study(false);
  }
  validateStudyOn() {
    this.currentContract.study(true);
  }

  validateBillingMenuOn() {
    cy.get(this.selectors.billingMenu).should("exist");
  }

  validateBillingMenuOff() {
    cy.get(this.selectors.billingMenu).should("not.exist");
  }

  billingAddress(value) {
    cy.get(this.selectors.enterBillingAddress).clear().type(value);
  }

  uncheckBillingMenu() {
    cy.contains(".cds--checkbox-label-text", this.selectors.billingMenuCheck)
      .scrollIntoView()
      .should("exist")
      .click({ force: true });
  }

  submitButton() {
    if (this.currentContract) {
      this.currentContract.submit();
      return;
    }
    if (this.category !== "global") {
      // Billing remains outside this three-category migration.
      cy.contains("button", labelPattern("label.button.submit"))
        .scrollIntoView()
        .should("be.visible")
        .and("be.enabled")
        .click();
      return;
    }
    const observation = this.watchMenuPosts();
    cy.then(() => {
      if (this.changedIds.size === 0) {
        this.saveButton().should("be.visible").and("be.disabled");
        this.readGlobalTree().then((after) => {
          if (this.beforeSelection) {
            expect(
              after,
              "no-change menu selection preserves the independent tree",
            ).to.deep.eq(this.beforeSelection);
          }
          expect(
            observation.requests,
            "zero no-change menu POSTs",
          ).to.have.length(0);
        });
        return;
      }
      this.saveButton().should("be.visible").and("be.enabled").click();
      cy.get(".oe-confirm-modal.is-visible")
        .should("be.visible")
        .within(() => {
          cy.contains("button", labelPattern("security.menu.confirm.save"))
            .should("be.visible")
            .and("be.enabled")
            .click();
        });
      cy.wait(`@${observation.alias}`).then(({ request, response }) => {
        expect(response?.statusCode, "real confirmed global-menu save").to.eq(
          200,
        );
        const submitted =
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body;
        const expected = rowsOf(submitted).map(({ id, active }) => ({
          id,
          active,
        }));
        const sent = new Map(expected.map((row) => [row.id, row.active]));
        this.checkedIds.forEach((id) =>
          expect(sent.get(id), `requested activation ${id}`).to.eq(true),
        );
        this.readGlobalTree().then((after) => {
          expect(
            rowsOf(after).map(({ id, active }) => ({ id, active })),
            "independent exact identity/state readback",
          ).to.deep.eq(expected);
          expect(observation.requests, "one confirmed save").to.have.length(1);
        });
      });
      this.saveButton().should("be.disabled");
    });
  }

  checkMenuItem = function (menuItem) {
    // Map of menu items to their respective checkboxes
    const menuItems = {
      home: "#menu_home_checkbox",
      order: "#menu_sample_checkbox",
      immunoChem: "#menu_immunochem_checkbox",
      cytology: "#menu_cytology_checkbox",
      results: "#menu_results_checkbox",
      validation: "#menu_resultvalidation_checkbox",
      reports: "#menu_reports_checkbox",
      study: "#menu_reports_study_checkbox",
      studyConfig: "#menu_study_checkbox",
      studySample: "#menu_sample_create_checkbox",
      studyReports: "#menu_reports_study_checkbox",
      billing: "#menu_billing_checkbox",
      billingMenu: "#billing_active",
      admin: "#menu_administration_checkbox",
      help: "#menu_help_checkbox",
      patient: "#menu_patient_checkbox",
      addEditPatient: "#menu_patient_add_or_edit_checkbox",
      patientHistory: "#menu_patienthistory_checkbox",
      studyPatient: "#menu_patient_create_checkbox",
      nonConform: "#menu_nonconformity_checkbox",
      reportNCE: "#menu_non_conforming_report_checkbox",
      viewNCE: "#menu_non_conforming_view_checkbox",
      correctiveAction: "#menu_non_conforming_corrective_actions_checkbox",
      workplan: "#menu_workplan_checkbox",
      pathology: "#menu_pathology_checkbox",
    };

    const originalSelector = menuItems[menuItem];
    expect(
      originalSelector,
      `recognized original menu identity: ${menuItem}`,
    ).to.be.a("string");
    const elementId = originalSelector
      .replace(/^#/, "")
      .replace(/_checkbox$/, "");
    if (this.category === "global") {
      this.checkedIds.push(elementId);
      cy.get("#security-menu-search").clear().type(elementId);
      const selector = `[id="menu-active-${elementId}"]`;
      cy.get(selector)
        .should("have.length", 1)
        .then(($input) => {
          if (!$input.prop("checked")) {
            this.changedIds.add(elementId);
            cy.get(`label[for="menu-active-${elementId}"]`)
              .scrollIntoView()
              .should("be.visible")
              .click();
          }
        });
      cy.get(selector).should("be.checked");
    } else {
      if (this.currentContract) this.currentContract.intent = true;
      // Exact stored identity through the current category editor; natural clicks.
      cy.get(originalSelector).then(($input) => {
        if (!$input.prop("checked")) {
          cy.get(`label[for="${elementId}_checkbox"]`)
            .scrollIntoView()
            .should("be.visible")
            .click();
        }
      });
      cy.get(originalSelector).should("be.checked");
    }
  };
}

export default MenuConfigPage;
