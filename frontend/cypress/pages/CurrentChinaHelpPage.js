import { currentLabel } from "./CurrentChinaLabels";

const MANUAL_URL = "/docs/china-lis-user-manual.html";
const MANUAL_TITLE = "LIS 检验工作台功能与操作手册";

class CurrentChinaHelpPage {
  openActualHeaderManual() {
    cy.window().then((win) => {
      // Browser-window transport is observed; the real bundled URL is then loaded.
      cy.stub(win, "open").as("currentManualOpen");
    });
    cy.get(".cds--header-panel--expanded")
      .contains("button", currentLabel("banner.menu.help.usermanual"))
      .should("be.visible")
      .click();
    cy.get("@currentManualOpen")
      .should("have.been.calledOnce")
      .and(
        "have.been.calledWithExactly",
        MANUAL_URL,
        "_blank",
        "noopener,noreferrer",
      )
      .then((opened) => {
        cy.visit(opened.firstCall.args[0]);
      });
    cy.location("pathname").should("eq", MANUAL_URL);
    cy.get("h1").should("have.text", MANUAL_TITLE);
    cy.get(".hero-actions").should("contain.text", "版本 0.6");
    cy.get("nav[aria-label='手册目录']").should("be.visible");
  }

  followOperationDirectory() {
    cy.visit(MANUAL_URL);
    cy.get("nav[aria-label='手册目录'] a").should("have.length", 14);
    cy.get("nav[aria-label='手册目录'] a[href='#section-5']")
      .should("contain.text", "申请与标本操作规程")
      .scrollIntoView()
      .should("be.visible")
      .click();
    cy.location("hash").should("eq", "#section-5");
    cy.get("#section-5 h2")
      .should("be.visible")
      .and("have.text", "5. 申请与标本操作规程");
    cy.get("#section-5").should("contain.text", "患者");
  }

  downloadActualPDF() {
    cy.visit(MANUAL_URL);
    cy.get("a.manual-pdf-action")
      .should("be.visible")
      .should(($link) => {
        expect($link).to.have.attr("download");
      })
      .then(($link) => {
        const pdfURL = $link[0].href;
        expect(new URL(pdfURL).pathname).to.eq(
          "/docs/china-lis-user-manual.pdf",
        );
        cy.request({ url: pdfURL, encoding: "binary" }).then((response) => {
          expect(response.status).to.eq(200);
          expect(response.headers["content-type"]).to.match(/application\/pdf/);
          expect(response.body.slice(0, 5)).to.eq("%PDF-");
          cy.wrap($link).click();
          cy.readFile(
            `${Cypress.config("downloadsFolder")}/china-lis-user-manual.pdf`,
            "binary",
          ).should("eq", response.body);
        });
      });
    cy.location("pathname").should("eq", MANUAL_URL);
  }

  invokeActualBrowserPrint() {
    cy.visit(MANUAL_URL);
    cy.window().then((win) => {
      // OS print dialogs are outside Cypress; this verifies the real click handler.
      cy.stub(win, "print").as("manualPrint");
    });
    cy.get("#manual-print-button")
      .scrollIntoView()
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.get("@manualPrint").should("have.been.calledOnce");
    cy.get("#manual-print-button")
      .should("be.enabled")
      .and("have.text", "浏览器打印");
    cy.get("#manual-print-status").should(
      "have.text",
      "未显示打印窗口时，请使用浏览器菜单中的“打印”。",
    );
  }
}

export default CurrentChinaHelpPage;
