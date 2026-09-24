import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";
import zhCNMessages from "../../src/languages/zh_CN.json";

// E-01: exercise the current provider controls and real persistence without
// changing the configured locale or restoring obsolete UI for the test.
const labelPattern = (key, count) => {
  const labels = [enMessages[key], zhMessages[key], zhCNMessages[key]];
  if (labels.some((label) => typeof label !== "string")) {
    throw new Error(`Missing provider label: ${key}`);
  }
  return new RegExp(
    `^(?:${[...new Set(labels)]
      .map((label) =>
        Cypress._.escapeRegExp(label.replace("{count}", String(count))),
      )
      .join("|")})$`,
  );
};

const PROVIDER_PATH = "/api/OpenELIS-Global/rest";
const PAGE = ".provider-management-page";
const VISIBLE_MODAL = ".cds--modal.is-visible";

class ProviderManagementPage {
  observeList(alias) {
    cy.intercept({
      method: "GET",
      pathname: `${PROVIDER_PATH}/ProviderMenu`,
      query: { paging: "1", startingRecNo: "1" },
    }).as(alias);
  }

  waitForList(alias) {
    cy.wait(`@${alias}`).then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.providers).to.be.an("array");
    });
    cy.contains(`${PAGE} h1`, labelPattern("provider.browse.title")).should(
      "be.visible",
    );
    cy.get("#provider-search-bar").should("be.visible");
  }

  modal(headingKey) {
    return cy
      .get(VISIBLE_MODAL)
      .should("have.length", 1)
      .and("be.visible")
      .contains(".cds--modal-header__heading", labelPattern(headingKey))
      .closest(".cds--modal");
  }

  providerRow(provider) {
    const fullName = `${provider.lastName} ${provider.firstName}`;
    return cy
      .then(() => {
        expect(provider.id, "saved provider identity").to.match(
          /^[1-9][0-9]*$/,
        );
        // ProviderMenu passes Carbon's `${row.id}:select` cell ID to the real
        // checkbox, keeping repeated fixture names distinct without new UI.
        return cy.get(
          `${PAGE} table tbody input[type="checkbox"][id="${provider.id}:select"]`,
        );
      })
      .should("have.length", 1)
      .closest("tr")
      .should("be.visible")
      .and("contain.text", fullName);
  }

  clickAddProviderButton() {
    cy.contains(
      `${PAGE} .oe-page-header__actions button`,
      labelPattern("provider.management.action.add"),
    )
      .should("be.visible")
      .click();
    this.modal("provider.modal.add.heading");
  }

  enterProviderLastName(value) {
    cy.get("#provider-add-last-name")
      .should("be.visible")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  enterProviderFirstName(value) {
    cy.get("#provider-add-first-name")
      .should("be.visible")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  activeStatus(active) {
    const value = active ? "yes" : "no";
    cy.get("#provider-add-active").select(value).should("have.value", value);
  }

  modifyStatus(active) {
    const value = active ? "yes" : "no";
    cy.get("#provider-update-active").select(value).should("have.value", value);
  }

  saveProvider(provider, active, editing) {
    cy.intercept("POST", `**/rest/Provider/FhirUuid*`).as("saveProvider");
    this.observeList("providerListAfterSave");
    this.modal(
      editing ? "provider.modal.update.heading" : "provider.modal.add.heading",
    )
      .contains(
        "button",
        labelPattern(editing ? "label.button.update" : "label.button.add"),
      )
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.wait("@saveProvider").then(({ request, response }) => {
      const submitted =
        typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      expect(submitted.person.lastName).to.eq(provider.lastName);
      expect(submitted.person.firstName).to.eq(provider.firstName);
      expect(submitted.active).to.eq(active);
      expect(new URL(request.url).searchParams.get("fhirUuid")).to.eq(
        editing ? provider.fhirUuid : "",
      );
      expect(response.statusCode).to.eq(200);
      const saved = response.body;
      expect(saved.person.lastName).to.eq(provider.lastName);
      expect(saved.person.firstName).to.eq(provider.firstName);
      expect(saved.active).to.eq(active);
      expect(String(saved.id)).to.match(/^[1-9][0-9]*$/);
      expect(saved.fhirUuid).to.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      if (editing) {
        expect(submitted.fhirUuid).to.eq(provider.fhirUuid);
        expect(String(saved.id)).to.eq(provider.id);
        expect(saved.fhirUuid).to.eq(provider.fhirUuid);
      } else {
        provider.id = String(saved.id);
        provider.fhirUuid = saved.fhirUuid;
      }
    });
    this.waitForList("providerListAfterSave");
    cy.get(VISIBLE_MODAL).should("not.exist");
    this.searchProvider(provider, active);
    this.confirmProvider(provider, active);
  }

  addProvider(provider, active) {
    this.saveProvider(provider, active, false);
  }

  updateProvider(provider, active) {
    this.saveProvider(provider, active, true);
  }

  searchProvider(provider, active) {
    // Clear a previous applied search and await its real read, so searching the
    // same provider again still proves persistence through a fresh response.
    cy.get("#provider-search-bar")
      .should("be.visible")
      .then(($input) => {
        if ($input.val()) {
          this.observeList("clearedProviderSearch");
          cy.wrap($input).clear();
          this.waitForList("clearedProviderSearch");
        }
      });
    cy.intercept({
      method: "GET",
      pathname: `${PROVIDER_PATH}/SearchProviderMenu`,
      query: {
        search: "Y",
        startingRecNo: "1",
        searchString: provider.firstName,
      },
    }).as("searchProvider");
    cy.get("#provider-search-bar")
      .type(provider.firstName)
      .should("have.value", provider.firstName);
    cy.wait("@searchProvider").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.providers).to.be.an("array");
      const matches = response.body.providers.filter(
        (item) => String(item.id) === provider.id,
      );
      expect(
        matches,
        "the created provider in the fresh server result",
      ).to.have.length(1);
      expect(matches[0].person.lastName).to.eq(provider.lastName);
      expect(matches[0].person.firstName).to.eq(provider.firstName);
      expect(matches[0].fhirUuid).to.eq(provider.fhirUuid);
      expect(matches[0].active).to.eq(active);
      const rowIndex = response.body.providers.findIndex(
        (item) => String(item.id) === provider.id,
      );
      // The current list renders ten rows per page. Use its real pagination
      // when a prior fixture with the same name precedes the created record.
      const targetPage = String(Math.floor(rowIndex / 10) + 1);
      cy.get(`${PAGE} .admin-list-workspace__refreshing`).should("not.exist");
      cy.get(`${PAGE} .cds--select__page-number select`)
        .should("be.visible")
        .then(($select) => {
          if (String($select.val()) !== targetPage) {
            cy.wrap($select).should("not.be.disabled").select(targetPage);
          }
        });
      cy.get(`${PAGE} .cds--select__page-number select`).should(
        "have.value",
        targetPage,
      );
    });
  }

  confirmProvider(provider, active) {
    this.providerRow(provider)
      .find(".cds--tag")
      .should("have.length", 1)
      .invoke("text")
      .should("match", labelPattern(active ? "label.yes" : "label.no"));
  }

  checkProvider(provider) {
    this.providerRow(provider)
      .find('input[type="checkbox"]')
      .should("not.be.checked")
      .invoke("attr", "id")
      .then((id) => {
        this.providerRow(provider)
          .find(`label[for="${id}"]`)
          .should("be.visible")
          .click();
      });
    this.providerRow(provider)
      .find('input[type="checkbox"]')
      .should("be.checked");
    cy.contains(
      `${PAGE} .admin-list-workspace__selection-actions span`,
      labelPattern("provider.management.selected", 1),
    ).should("be.visible");
  }

  modifyProvider(provider, currentActive) {
    this.providerRow(provider)
      .contains("button", labelPattern("externalconnections.action.edit"))
      .should("be.visible")
      .click();
    this.modal("provider.modal.update.heading");
    cy.get("#provider-update-last-name").should(
      "have.value",
      provider.lastName,
    );
    cy.get("#provider-update-first-name").should(
      "have.value",
      provider.firstName,
    );
    cy.get("#provider-update-active").should(
      "have.value",
      currentActive ? "yes" : "no",
    );
  }

  deactivateProvider(provider) {
    cy.contains(
      `${PAGE} .admin-list-workspace__selection-actions button`,
      labelPattern("externalconnections.action.deactivate"),
    )
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    this.modal("provider.management.deactivate.confirm.title")
      .contains(
        labelPattern("provider.management.deactivate.confirm.message", 1),
      )
      .should("be.visible");
    cy.intercept("POST", "**/rest/DeleteProvider*").as("deactivateProvider");
    this.observeList("providerListAfterDeactivate");
    this.modal("provider.management.deactivate.confirm.title")
      .contains("button", labelPattern("externalconnections.action.deactivate"))
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.wait("@deactivateProvider").then(({ request, response }) => {
      expect(new URL(request.url).searchParams.get("ID")).to.eq(provider.id);
      const submitted =
        typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      expect(submitted.selectedIDs.map(String)).to.deep.eq([provider.id]);
      expect(response.statusCode).to.eq(200);
    });
    this.waitForList("providerListAfterDeactivate");
    cy.get(VISIBLE_MODAL).should("not.exist");
    this.searchProvider(provider, false);
    this.confirmProvider(provider, false);
  }
}

export default ProviderManagementPage;
