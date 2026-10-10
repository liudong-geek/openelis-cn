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
      .type("76.2")
      .should("have.value", "76.2");
    cy.get(`${editor} #preset-heightMm`)
      .clear()
      .type("25.4")
      .should("have.value", "25.4");
    cy.get(`${editor} .label-preset-editor__preview-panel`).should(
      "contain.text",
      "76.2 × 25.4 mm",
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
      heightMm: 25.4,
      widthMm: 76.2,
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
      .and("contain.text", "76.2 × 25.4 mm");
  }

  openPrintFromMenu() {
    cy.intercept(
      "GET",
      "**/rest/displayList/SAMPLE_PATIENT_REFERRING_CLINIC",
    ).as("barcodeSites");
    cy.intercept("GET", "**/rest/user-sample-types").as("barcodeSamples");
    openAuthorizedSidebarLink(
      "menu_intake_workspace",
      "/PrintBarcode?mode=preprint",
    );
    cy.wait("@barcodeSites").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.sites = body(response.body);
      expect(this.sites).to.be.an("array");
    });
    cy.wait("@barcodeSamples").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(body(response.body)).to.be.an("array");
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
      const matches = this.sites.filter((site) => site.value === name);
      expect(
        matches,
        "original site fixture in real current reference",
      ).to.have.length(1);
      this.siteId = String(matches[0].id);
    });
    cy.get(".barcode-preprint #siteName")
      .should("be.visible")
      .clear()
      .type(name);
    cy.contains("[role='option']", name).should("be.visible").click();
    cy.get(".barcode-preprint #siteName").should("have.value", name);
  }

  selectSampleTypeOption(name) {
    cy.intercept("GET", "**/rest/sample-type-tests?*").as("barcodeTests");
    cy.get(".barcode-preprint #selectSampleType")
      .should("be.visible")
      .select(name);
    cy.get(".barcode-preprint #selectSampleType option:selected").should(
      "have.text",
      name,
    );
    cy.wait("@barcodeTests").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      this.sampleTests = body(response.body);
      expect(this.sampleTests.panels).to.be.an("array");
      expect(this.sampleTests.tests).to.be.an("array");
    });
  }

  selectOriginalPanels() {
    // Preserve both original clinical panel names, not an arbitrary available panel.
    for (const name of ["Bilan Biochimique", "Serologie VIH"]) {
      cy.contains(".barcode-preprint label", name).should("be.visible").click();
      cy.contains(".barcode-preprint label", name)
        .invoke("attr", "for")
        .then((id) => {
          cy.get(`#${id}`).should("be.checked");
        });
    }
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
      const originalPanels = this.sampleTests.panels.filter((panel) =>
        ["Bilan Biochimique", "Serologie VIH"].includes(panel.name),
      );
      expect(originalPanels).to.have.length(2);
      const ids = originalPanels
        .flatMap((panel) => panel.testIds.split(",").map((id) => id.trim()))
        .sort();
      for (const id of ids)
        expect(
          this.sampleTests.tests.some((test) => String(test.id) === id),
          `configured panel test ${id}`,
        ).to.eq(true);
      expect((params.get("testIds") || "").split(",").sort()).to.deep.eq(ids);
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
