import config from "../../src/config.json";
import {
  body,
  label,
  openAuthorizedSidebarLink,
  setCheckbox,
} from "./AdminUiContract";

const editor = ".label-preset-editor.is-visible";

class BarcodeConfigPage {
  openNewPreset(name) {
    this.presetName = name;
    cy.get(".label-presets-workspace h1")
      .should("be.visible")
      .invoke("text")
      .should("match", label("admin.labelPresets.title"));
    cy.get("[data-testid='add-preset-btn']")
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.get(`${editor} #preset-name`)
      .should("be.visible")
      .clear()
      .type(name)
      .should("have.value", name);
  }

  defaults() {
    setCheckbox("scope-order", true);
    setCheckbox("scope-sample", true);
    cy.get(`${editor} #defaultPerOrder`)
      .clear()
      .type("2")
      .should("have.value", "2");
    cy.get(`${editor} #defaultPerSample`)
      .clear()
      .type("1")
      .should("have.value", "1");
  }

  templateAndMaximums() {
    cy.get(`${editor} #preset-barcodeType`)
      .select("CODE_128")
      .should("have.value", "CODE_128");
    cy.get(`${editor} #maxPerOrder`)
      .clear()
      .type("10")
      .should("have.value", "10");
    cy.get(`${editor} #maxPerSample`)
      .clear()
      .type("1")
      .should("have.value", "1");
    cy.get(`${editor} .label-preset-editor__preview-panel`).should(
      "contain.text",
      "CODE_128",
    );
  }

  disableOrderScope() {
    setCheckbox("scope-order", false);
    cy.get(`${editor} #defaultPerOrder`)
      .should("be.disabled")
      .and("have.value", "2");
    cy.get(`${editor} #maxPerOrder`)
      .should("be.disabled")
      .and("have.value", "10");
    cy.get(`${editor} #defaultPerSample`).should("not.be.disabled");
  }

  dimensions() {
    cy.get(`${editor} #preset-widthMm`)
      .clear()
      .type("76")
      .should("have.value", "76");
    cy.get(`${editor} #preset-heightMm`)
      .clear()
      .type("25")
      .should("have.value", "25");
    cy.get(`${editor} .label-preset-editor__preview-panel`).should(
      "contain.text",
      "76 × 25 mm",
    );
  }

  restoreScopes() {
    setCheckbox("scope-order", true);
    setCheckbox("scope-sample", true);
    setCheckbox("preset-isActive", true);
    cy.get(`${editor} #defaultPerOrder`).should("not.be.disabled");
    cy.get(`${editor} #defaultPerSample`).should("not.be.disabled");
  }

  saveAndReadPreset() {
    const expected = {
      name: this.presetName,
      heightMm: 25,
      widthMm: 76,
      barcodeType: "CODE_128",
      printsPerOrder: true,
      printsPerSample: true,
      defaultPerOrder: 2,
      maxPerOrder: 10,
      defaultPerSample: 1,
      maxPerSample: 1,
      isActive: true,
      fields: [],
    };
    cy.intercept("POST", "**/api/labelPresets").as("newLabelPreset");
    cy.intercept("GET", "**/api/labelPresets").as("labelPresetsAfterSave");
    cy.get(`${editor} .cds--modal-footer`).within(() => {
      cy.contains("button", label("label.button.save"))
        .should("be.visible")
        .and("not.be.disabled")
        .click();
    });
    cy.wait("@newLabelPreset").then(({ request, response }) => {
      expect(response.statusCode).to.eq(201);
      expect(body(request.body)).to.deep.eq(expected);
    });
    cy.get(editor).should("not.exist");
    cy.wait("@labelPresetsAfterSave").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      const matches = body(response.body).filter(
        (row) => row.name === this.presetName,
      );
      expect(matches, "saved preset identity").to.have.length(1);
      for (const key of Object.keys(expected))
        expect(matches[0][key], key).to.deep.eq(expected[key]);
      expect(String(matches[0].id)).to.match(/^[1-9]\d*$/);
    });
    cy.request(`${config.serverBaseUrl}/api/labelPresets`).then((read) => {
      expect(read.status).to.eq(200);
      const matches = read.body.filter((row) => row.name === this.presetName);
      expect(matches).to.have.length(1);
      for (const key of Object.keys(expected))
        expect(matches[0][key], key).to.deep.eq(expected[key]);
    });
    cy.contains(".label-preset-card", this.presetName)
      .should("be.visible")
      .and("contain.text", "76 × 25 mm");
  }

  openPrintFromMenu() {
    openAuthorizedSidebarLink("menu_intake_workspace", "/order");
    cy.intercept(
      "GET",
      "**/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC",
    ).as("barcodeSites");
    cy.intercept("GET", "**/rest/user-sample-types").as("barcodeSamples");
    cy.contains(
      ".intake-header-actions button",
      label("intake.workspace.barcode"),
    )
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.location("pathname").should("eq", "/PrintBarcode");
    cy.location("search").should("eq", "?mode=preprint");
    cy.wait("@barcodeSites").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.sites = body(response.body);
      expect(this.sites).to.be.an("array");
    });
    cy.wait("@barcodeSamples").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.sampleTypes = body(response.body);
      expect(this.sampleTypes).to.be.an("array");
    });
    this.validatePage();
  }

  validatePage() {
    cy.get(".barcode-workspace h1")
      .should("be.visible")
      .invoke("text")
      .should("match", label("barcode.print.title"));
    cy.contains("[role='tab']", label("workspace.barcode.preprint"))
      .should("be.visible")
      .and("have.attr", "aria-selected", "true");
    cy.get(".barcode-preprint").should("be.visible");
  }

  enterSiteName(name) {
    cy.then(() => {
      // The current clinic list displays "short code - organization name".
      const matches = this.sites.filter(
        (site) => site.value === name || site.value.endsWith(` - ${name}`),
      );
      expect(
        matches,
        "original site fixture in real current reference",
      ).to.have.length(1);
      this.siteId = String(matches[0].id);
      this.siteDisplayName = matches[0].value;
    });
    cy.get(".barcode-preprint #siteName")
      .should("be.visible")
      .clear()
      .type(name);
    cy.contains("[role='option']", name).should("be.visible").click();
    cy.get(".barcode-preprint #siteName").should(($input) => {
      expect($input).to.have.value(this.siteDisplayName);
    });
  }

  selectSampleTypeOption(name) {
    cy.intercept("GET", "**/rest/sample-type-tests?*").as("barcodeTests");
    cy.then(() => {
      const names = name === "Serum" ? label("sample.type.serum") : null;
      const matches = this.sampleTypes.filter((sampleType) =>
        names ? names.test(sampleType.value) : sampleType.value === name,
      );
      expect(
        matches,
        "original specimen type in current locale",
      ).to.have.length(1);
      this.sampleTypeId = String(matches[0].id);
      cy.get(".barcode-preprint #selectSampleType")
        .should("be.visible")
        .select(this.sampleTypeId)
        .should("have.value", this.sampleTypeId);
      cy.get(".barcode-preprint #selectSampleType option:selected").should(
        "have.text",
        matches[0].value,
      );
    });
    cy.wait("@barcodeTests").then(({ request, response }) => {
      expect(new URL(request.url).searchParams.get("sampleType")).to.eq(
        this.sampleTypeId,
      );
      expect(response.statusCode).to.eq(200);
      this.sampleTests = body(response.body);
      expect(this.sampleTests.panels).to.be.an("array");
      expect(this.sampleTests.tests).to.be.an("array");
    });
  }

  selectOriginalPanels() {
    // Localization preserves the original fixture entities, panel 1 and panel 4.
    cy.then(() => {
      const availableIds = new Set(
        this.sampleTests.tests.map((test) => String(test.id)),
      );
      this.expectedPanelTestIds = [];
      this.excludedPanelTestIds = [];
      this.originalPanels = [
        { id: "1", names: ["Bilan Biochimique", "生化检验组合"] },
        { id: "4", names: ["Serologie VIH", "HIV血清学"] },
      ].map((fixture) => {
        const matches = this.sampleTests.panels.filter((panel) =>
          fixture.names.includes(panel.name),
        );
        expect(matches, `unique original panel ${fixture.id}`).to.have.length(
          1,
        );
        expect(String(matches[0].id)).to.eq(fixture.id);
        const name = new RegExp(`^${Cypress._.escapeRegExp(matches[0].name)}$`);
        cy.contains(".barcode-preprint label", name)
          .should("have.attr", "for", `panel_${fixture.id}`)
          .and("be.visible")
          .click();
        cy.get(`#panel_${fixture.id}`).should("be.checked");
        // Panels span specimen types; preprinting selects only the current type.
        const panelIds = matches[0].testIds.split(",").map((id) => id.trim());
        const eligibleIds = panelIds.filter((id) => availableIds.has(id));
        expect(eligibleIds, `panel ${fixture.id} current specimen tests`).not.to
          .be.empty;
        eligibleIds.forEach((id) => {
          cy.get(`#test_${id}`).should("be.checked");
        });
        const excludedIds = panelIds.filter((id) => !availableIds.has(id));
        excludedIds.forEach((id) => {
          cy.get(`#test_${id}`).should("not.exist");
        });
        this.expectedPanelTestIds.push(...eligibleIds);
        this.excludedPanelTestIds.push(...excludedIds);
        return matches[0];
      });
    });
  }

  clickPrePrintButton() {
    cy.intercept("GET", "**/LabelMakerServlet?*").as("realPreprintLabels");
    cy.get(".barcode-preprint button[data-cy='pre-Print']")
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.wait("@realPreprintLabels").then(({ request, response }) => {
      expect(response.statusCode).to.eq(200);
      const params = new URL(request.url).searchParams;
      expect(params.get("prePrinting")).to.eq("true");
      expect(params.get("facilityName")).to.eq(this.siteId);
      expect(params.get("numSetsOfLabels")).to.eq("1");
      expect(params.get("numOrderLabelsPerSet")).to.eq("1");
      expect(params.get("numSpecimenLabelsPerSet")).to.eq("1");
      const originalPanels = this.originalPanels;
      expect(originalPanels).to.have.length(2);
      const ids = [...new Set(this.expectedPanelTestIds)].sort();
      expect(ids, "eligible original panel tests").not.to.be.empty;
      const printedIds = (params.get("testIds") || "").split(",").sort();
      expect(printedIds).to.deep.eq(ids);
      this.excludedPanelTestIds.forEach((id) => {
        expect(printedIds, `other-specimen panel test ${id}`).not.to.include(
          id,
        );
      });
    });
    cy.get(".barcode-preview-modal.is-visible iframe")
      .should("be.visible")
      .and("have.attr", "src")
      .and("include", "LabelMakerServlet");
    cy.get(".barcode-preview-modal.is-visible").within(() => {
      cy.get("button.cds--modal-close").should("be.visible").click();
    });
    cy.get(".barcode-preview-modal.is-visible").should("not.exist");
  }

  searchExistingAccession(labNumber) {
    cy.contains("[role='tab']", label("workspace.order.reprint"))
      .should("be.visible")
      .click()
      .should("have.attr", "aria-selected", "true");
    cy.get("#labNumber")
      .should("be.visible")
      .clear()
      .type(labNumber)
      .should("have.value", labNumber);
    cy.intercept("GET", "**/rest/patient-search-results?*").as(
      "existingBarcodePatient",
    );
    cy.intercept("GET", "**/rest/SampleEdit?*").as("existingBarcodeOrder");
    cy.get("button[data-cy='submitButton']")
      .should("be.visible")
      .and("not.be.disabled")
      .click();
    cy.wait("@existingBarcodePatient").then(({ request, response }) => {
      expect(new URL(request.url).searchParams.get("labNumber")).to.eq(
        labNumber,
      );
      expect(response.statusCode).to.eq(200);
      expect(body(response.body)).to.be.an("object");
    });
    cy.wait("@existingBarcodeOrder").then(({ request, response }) => {
      expect(new URL(request.url).searchParams.get("accessionNumber")).to.eq(
        labNumber,
      );
      expect(response.statusCode).to.eq(200);
      expect(body(response.body)).to.be.an("object");
    });
    cy.get(".barcode-patient-summary").should("be.visible");
  }
}

export default BarcodeConfigPage;
