import { setCarbonToggle } from "./CurrentAdminLabels";
import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";

const API_BASE = "/api/OpenELIS-Global";
const pattern = (id) =>
  new RegExp(
    `^(?:${[enMessages[id], zhMessages[id]].map(Cypress._.escapeRegExp).join("|")})$`,
  );
const STUDY_IDS = [
  "menu_sample_create",
  "menu_patient_create",
  "menu_reports_study",
  "menu_reports_patients",
  "menu_reports_arv",
  "menu_reports_eid",
  "menu_reports_indeterminate",
  "menu_reports_indicator",
  "menu_reports_nonconformity.study",
  "menu_resultvalidation_study",
  "menu_reports_vl",
  "menu_resultvalidation_virology",
];
const ROOTS = {
  patient: "menu_patient",
  nonconformity: "menu_nonconformity",
  study: "menu_study",
};
const treeRows = (items) =>
  items.flatMap((item) => [item.menu, ...treeRows(item.childMenus)]);
// Active states are the requested change; the technical audit time may change on save.
const fixedFields = (value, omitActive = false) => {
  if (Array.isArray(value))
    return value.map((item) => fixedFields(item, omitActive));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            key !== "lastupdated" && (!omitActive || key !== "isActive"),
        )
        .map(([key, item]) => [key, fixedFields(item, omitActive)]),
    );
  return value;
};
const validDto = (dto, expectedId) => {
  expect(dto?.menu?.elementId, "exact actual configuration identity").to.eq(
    expectedId,
  );
  expect(
    dto.menu.isActive,
    `${expectedId} has a real boolean active state`,
  ).to.be.a("boolean");
  expect(dto.childMenus, `${expectedId} has its full child DTO list`).to.be.an(
    "array",
  );
  dto.childMenus.forEach((child) => validDto(child, child.menu.elementId));
};

class CurrentMenuContract {
  constructor(page) {
    this.page = page;
    this.category = page.category;
    this.intent = null;
    this.sequence = 0;
  }

  readConfigured() {
    if (this.category !== "study") {
      const root = ROOTS[this.category];
      expect(root, "recognized current category").to.be.a("string");
      return cy
        .request(`${API_BASE}/rest/admin/menu/${root}`)
        .then(({ status, body }) => {
          expect(status, "independent unfiltered configuration read").to.eq(
            200,
          );
          validDto(body, root);
          return [body];
        });
    }
    const loaded = [];
    STUDY_IDS.forEach((id) =>
      cy
        .request(`${API_BASE}/rest/admin/menu/${id}`)
        .then(({ status, body }) => {
          expect(status, `actual imported study configuration ${id}`).to.eq(
            200,
          );
          validDto(body, id);
          loaded.push(body);
        }),
    );
    return cy.then(() => {
      expect(
        loaded.map((item) => item.menu.elementId),
        "all original twelve study records in order",
      ).to.deep.eq(STUDY_IDS);
      return loaded;
    });
  }

  assertPersisted(active) {
    return this.readConfigured().then((items) => {
      const rows = treeRows(items);
      expect(
        rows.length,
        "nonempty real stored configuration",
      ).to.be.greaterThan(0);
      rows.forEach((row) =>
        expect(row.isActive, `persisted ${row.elementId}`).to.eq(active),
      );
      const required =
        this.category === "study"
          ? STUDY_IDS
          : this.category === "patient"
            ? [
                "menu_patient",
                "menu_patient_add_or_edit",
                "menu_patienthistory",
                "menu_patient_create",
              ]
            : [
                "menu_nonconformity",
                "menu_non_conforming_report",
                "menu_non_conforming_view",
                "menu_non_conforming_corrective_actions",
              ];
      const identities =
        this.category === "study" ? items.map((item) => item.menu) : rows;
      required.forEach((id) =>
        expect(
          identities.filter((row) => row.elementId === id),
          `original configured identity ${id}`,
        ).to.have.length(1),
      );
      return items;
    });
  }

  showChildren(show) {
    const observed = this.page.watchMenuPosts();
    this.readConfigured().then((before) => {
      setCarbonToggle("toggleShowChildren", show);
      if (this.category === "study" && show) {
        STUDY_IDS.forEach((id) =>
          cy.get(`[id='${id}_checkbox']`).should("have.length", 1),
        );
      }
      this.readConfigured().then((after) => {
        expect(
          after,
          "display filtering never changes stored configuration",
        ).to.deep.eq(before);
        expect(
          observed.requests,
          "display filter sends no configuration POST",
        ).to.have.length(0);
      });
    });
  }

  deactivate() {
    this.intent = false;
    const selector = `[id='${ROOTS[this.category]}_checkbox']`;
    // Bulk OFF must clear a partially active tree as well as an active root.
    cy.get(selector).then(($input) => {
      if (!$input.prop("checked"))
        cy.get(`label[for='${ROOTS[this.category]}_checkbox']`)
          .scrollIntoView()
          .should("be.visible")
          .click();
    });
    cy.get(selector).should("be.checked");
    cy.get(`label[for='${ROOTS[this.category]}_checkbox']`)
      .scrollIntoView()
      .should("be.visible")
      .click();
    cy.get(selector).should("not.be.checked");
  }

  submit() {
    const observed = this.page.watchMenuPosts();
    this.readConfigured().then((before) => {
      expect(
        this.intent,
        "explicit ON/OFF intent, never an empty navigation assertion",
      ).to.be.a("boolean");
      cy.contains(
        ".menu-config-workspace button, .admin-entry-workspace button",
        pattern("label.button.submit"),
      )
        .should("have.length", 1)
        .scrollIntoView()
        .should("be.visible")
        .and("be.enabled")
        .click();
      cy.wait(`@${observed.alias}`).then(({ request, response }) => {
        const expectedPath =
          this.category === "study"
            ? `${API_BASE}/rest/menu/`
            : `${API_BASE}/rest/menu/${ROOTS[this.category]}`;
        expect(
          new URL(request.url).pathname,
          "unchanged real category POST",
        ).to.eq(expectedPath);
        expect(response?.statusCode, "actual configuration save").to.eq(200);
        const payload =
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body;
        const submitted = this.category === "study" ? payload : [payload];
        expect(
          fixedFields(submitted, true),
          "all identities, URLs, display keys, child order and other fields preserved",
        ).to.deep.eq(fixedFields(before, true));
        treeRows(submitted).forEach((row) =>
          expect(row.isActive, `actual POST ${row.elementId}`).to.eq(
            this.intent,
          ),
        );
        this.assertPersisted(this.intent).then((after) => {
          expect(
            fixedFields(after),
            "independent exact DTO readback after the real save",
          ).to.deep.eq(fixedFields(submitted));
          expect(observed.requests, "exactly one actual save").to.have.length(
            1,
          );
        });
      });
    });
  }

  openSidebar() {
    cy.get("body").then(($body) => {
      if ($body.find(".cds--side-nav--expanded").length === 0)
        cy.get("[data-cy='menuButton']").should("be.visible").click();
    });
    cy.get(".cds--side-nav--expanded").should("be.visible");
    cy.get("#menu_management_workspace").should("be.visible");
  }

  openTask(groupId, route) {
    this.openSidebar();
    cy.get(`#${groupId} > li > button.cds--side-nav__submenu`).then(
      ($button) => {
        if ($button.attr("aria-expanded") !== "true")
          cy.wrap($button).should("be.visible").click();
      },
    );
    cy.get(`#${groupId} a[href='${route}']`)
      .should("have.length", 1)
      .and("be.visible")
      .click();
    cy.location("pathname").should("eq", route);
    cy.get("body").then(($body) => {
      const $button = $body.find("[data-cy='menuButton']");
      if ($button.length && $body.find(".cds--side-nav--expanded").length)
        cy.wrap($button).should("be.visible").click();
    });
  }

  openPatientList() {
    const alias = `currentPatientList${++this.sequence}`;
    cy.intercept({
      method: "GET",
      pathname: `${API_BASE}/rest/patient-management-list`,
    }).as(alias);
    this.openTask("menu_intake_workspace", "/PatientManagement");
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response?.statusCode, "real ordinary clinical patient list").to.eq(
        200,
      );
      expect(response.body.patients, "actual patient records").to.be.an("array")
        .and.not.be.empty;
    });
    cy.get(".patient-master-list tbody tr").should(
      "have.length.greaterThan",
      0,
    );
  }

  clinicalPatientAndOrder() {
    this.openPatientList();
    cy.contains(
      ".patient-master-list__actions button",
      pattern("patient.management.list.results"),
    )
      .should("be.visible")
      .and("be.enabled");
    cy.contains(".oe-page-header button", pattern("new.patient.label"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get(".patient-create-modal.is-visible").should("be.visible");
    cy.get(".patient-create-modal.is-visible .cds--modal-close")
      .should("be.visible")
      .click();
    cy.get(".patient-create-modal.is-visible").should("not.exist");
    this.clinicalOrderPatientPicker(true);
  }

  clinicalOrderPatientPicker(headerAvailable) {
    this.openTask("menu_intake_workspace", "/order");
    if (!headerAvailable) {
      cy.contains(
        ".intake-header-actions button",
        pattern("intake.workspace.patient"),
      ).should("not.exist");
    } else {
      const alias = `actualPatientHeader${++this.sequence}`;
      cy.intercept({
        method: "GET",
        pathname: `${API_BASE}/rest/patient-management-list`,
      }).as(alias);
      cy.contains(
        ".intake-header-actions button",
        pattern("intake.workspace.patient"),
      )
        .should("be.visible")
        .and("be.enabled")
        .click();
      cy.location("pathname").should("eq", "/PatientManagement");
      cy.wait(`@${alias}`).then(({ response }) => {
        expect(
          response?.statusCode,
          "real patient header destination read",
        ).to.eq(200);
        expect(
          response.body.patients,
          "actual patient header destination records",
        ).to.be.an("array").and.not.be.empty;
      });
      this.openTask("menu_intake_workspace", "/order");
      cy.contains(
        ".intake-header-actions button",
        pattern("intake.workspace.patient"),
      )
        .should("be.visible")
        .and("be.enabled");
    }
    cy.get(".new-order-btn").should("be.visible").and("be.enabled").click();
    cy.location("pathname").should("eq", "/order/enter");
    cy.get(".patient-search-section")
      .should("be.visible")
      .within(() => {
        cy.contains("button", pattern("order.entry.patient.picker.open"))
          .should("be.visible")
          .and("be.enabled")
          .click();
      });
    cy.get("#patientManagementQuickQuery")
      .should("be.visible")
      .and("be.enabled");
    cy.get(".cds--modal.is-visible").within(() =>
      cy
        .contains("button", pattern("label.button.cancel"))
        .should("be.visible")
        .click(),
    );
  }

  patientOff() {
    this.assertPersisted(false);
    this.openSidebar();
    cy.get(".cds--side-nav a[href='/PatientManagement']").should("not.exist");
    this.clinicalOrderPatientPicker(false);
  }
  patientOn() {
    this.assertPersisted(true);
    this.clinicalPatientAndOrder();
  }
  study(active) {
    this.assertPersisted(active);
    this.openSidebar();
    ["menu_study", ...STUDY_IDS].forEach((id) =>
      cy.get(`.cds--side-nav [id='${id}']`).should("not.exist"),
    );
    // Exact twelve-record persistence plus usable ordinary clinical UI proves that
    // China specialty hiding does not accidentally revoke shared clinical work.
    this.clinicalPatientAndOrder();
  }
  nceOff() {
    this.assertPersisted(false);
    this.openSidebar();
    cy.get(".cds--side-nav a[href='/NceDashboard']").should("not.exist");
  }

  nceOn() {
    this.assertPersisted(true);
    const metaAlias = `nceMetadata${++this.sequence}`;
    cy.intercept({
      method: "GET",
      pathname: `${API_BASE}/rest/nce/registration/meta`,
    }).as(metaAlias);
    this.openTask("menu_quality_workspace", "/NceDashboard");
    cy.wait(`@${metaAlias}`).then(({ response }) => {
      expect(
        response?.statusCode,
        "actual registration scope and metadata",
      ).to.eq(200);
      expect(
        response.body.canCreate,
        "real ADD permission is required; no manufactured capability",
      ).to.eq(true);
    });
    cy.contains(".nce-dashboard-header button", pattern("nce.button.reportNce"))
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get(".nce-registration-modal.is-visible").should("be.visible");
    const title = `CYPRESS-MENU-NCE-${Date.now()}`;
    cy.get(".nce-registration-modal.is-visible").within(() => {
      ["reporting-unit", "nce-category"].forEach((id) =>
        cy.get(`#${id} option`).then(($options) => {
          const values = [...$options]
            .map((option) => option.value)
            .filter(Boolean);
          expect(values, `actual ${id} choices from backend metadata`).not.to.be
            .empty;
          cy.get(`#${id}`).select(values[0]);
        }),
      );
      cy.get("#date-of-event").should("not.have.value", "");
      cy.get("label[for='nce-severity-MINOR']").should("be.visible").click();
      cy.get("#nce-title").type(title);
      cy.get("#nce-description").type(
        "原菜单登记、查看及纠正措施入口验收；隔离合成记录。",
      );
    });
    const saveAlias = `nceActualCreate${++this.sequence}`;
    cy.intercept({
      method: "POST",
      pathname: `${API_BASE}/rest/nce/registration`,
    }).as(saveAlias);
    cy.get(".nce-registration-modal.is-visible").within(() =>
      cy
        .contains("button", pattern("nce.button.submit"))
        .should("be.enabled")
        .click(),
    );
    cy.wait(`@${saveAlias}`).then(({ request, response }) => {
      expect(response?.statusCode, "real registration receipt").to.eq(200);
      const command =
        typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      expect(command.title).to.eq(title);
      expect(command.severity).to.eq("MINOR");
      expect(command.linkedSpecimens).to.deep.eq([]);
      expect(command.dateOfEvent).to.match(/^\d{4}-\d{2}-\d{2}$/);
      const receipt = response.body;
      expect(receipt.operation).to.eq("CREATE");
      expect(receipt.outcome).to.eq("APPLIED");
      expect(receipt.requestId).to.eq(command.requestId);
      expect(receipt.statusCode).to.eq("Pending");
      expect(receipt.eventId).to.be.a("string").and.not.be.empty;
      expect(receipt.nceNumber).to.be.a("string").and.not.be.empty;
      cy.get(".nce-registration-modal.is-visible").should("not.exist");
      cy.request(
        `${API_BASE}/rest/nce/workspace?keyword=${encodeURIComponent(title)}&status=&categoryId=&severity=&page=1&pageSize=25&queryVersion=2`,
      ).then(({ status, body }) => {
        expect(status, "independent actual registered-event readback").to.eq(
          200,
        );
        const row = body.nceList.find((item) => item.id === receipt.eventId);
        expect(row, "the exact real saved event, not any existing row").to
          .exist;
        expect(row.nceNumber).to.eq(receipt.nceNumber);
        expect(row.title).to.eq(title);
        expect(row.canAssign, "real current UPDATE capability").to.eq(true);
        expect(row.canAddNote, "real current UPDATE capability").to.eq(true);
      });
      const listAlias = `nceRegisteredList${++this.sequence}`;
      cy.intercept({
        method: "GET",
        pathname: `${API_BASE}/rest/nce/workspace`,
        query: { keyword: title },
      }).as(listAlias);
      cy.get("#nce-workspace-keyword").clear().type(title).type("{enter}");
      cy.wait(`@${listAlias}`).its("response.statusCode").should("eq", 200);
      cy.contains(".nce-list-item", title).within(() => {
        cy.get(".nce-list-item-header").should("be.enabled").click();
        cy.get(`[id='nce-details-${receipt.eventId}']`)
          .should("be.visible")
          .within(() => {
            cy.contains("[role='tab']", pattern("nce.tab.capa"))
              .should("be.visible")
              .click();
            cy.contains("button", pattern("nce.workspace.openCapa"))
              .should("be.visible")
              .and("be.enabled")
              .click();
          });
      });
      cy.location("pathname").should("eq", "/NCECorrectiveAction");
      cy.get("#type").select("nceNumber");
      cy.get("[data-cy='fieldName']").type(receipt.nceNumber);
      const lookupAlias = `nceActualCapa${++this.sequence}`;
      cy.intercept({
        method: "GET",
        pathname: `${API_BASE}/rest/NCECorrectiveAction`,
      }).as(lookupAlias);
      cy.get("[data-testid='nce-search-button']").should("be.enabled").click();
      cy.wait(`@${lookupAlias}`).then(
        ({ request: lookup, response: result }) => {
          expect(new URL(lookup.url).searchParams.get("nceNumber")).to.eq(
            receipt.nceNumber,
          );
          expect(
            result?.statusCode,
            "real original corrective-action object read",
          ).to.eq(200);
          expect(result.body.nceNumber).to.eq(receipt.nceNumber);
          expect(result.body.id).to.eq(receipt.eventId);
        },
      );
      cy.get("[data-testid='nce-number-result']").should(
        "contain.text",
        receipt.nceNumber,
      );
    });
  }
}
export default CurrentMenuContract;
