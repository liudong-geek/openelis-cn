import enMessages from "../../src/languages/en.json";
import zhMessages from "../../src/languages/zh.json";

const API_BASE = "/api/OpenELIS-Global";
const labelPattern = (id, withCount = false) =>
  new RegExp(
    `^(?:${[enMessages[id], zhMessages[id]].map(Cypress._.escapeRegExp).join("|")})${withCount ? "\\s*\\d+" : ""}$`,
  );

class NotifyUserPage {
  constructor() {
    this.selectors = {
      title: ".notification-workspace h1",
      textArea: "#notify-message",
      enterUser: "#notify-user",
      submit: ".notification-workspace__panel footer button",
      useroption: ".suggestion-active",
    };
    this.postSequence = 0;
    this.message = "Remember to logout";
  }

  validatePageTitle() {
    cy.get(this.selectors.title)
      .should("be.visible")
      .invoke("text")
      .should((text) => {
        expect([
          enMessages["notify.main.title"],
          zhMessages["notify.main.title"],
        ]).to.include(text);
      });
  }

  typeMessage() {
    cy.get(this.selectors.textArea)
      .clear()
      .type(this.message)
      .should("have.value", this.message);
  }

  clearMessage() {
    cy.get(this.selectors.textArea).clear().should("have.value", "");
  }

  selectUser(value) {
    cy.get(this.selectors.enterUser)
      .find("option")
      .filter((_index, option) => option.textContent.includes(value))
      .should("have.length", 1)
      .then(($option) => {
        this.recipientId = String($option.attr("value"));
        expect(this.recipientId, "real selected recipient id").not.to.eq("");
        cy.get(this.selectors.enterUser)
          .select(this.recipientId)
          .should("have.value", this.recipientId);
      });
  }

  watchPosts() {
    const observation = {
      requests: [],
      alias: `notifyPost${++this.postSequence}`,
    };
    cy.intercept("POST", "**/rest/notification/*", (request) => {
      observation.requests.push(request);
    }).as(observation.alias);
    return observation;
  }

  readAllNotifications() {
    return cy
      .request(`${API_BASE}/rest/notifications/all`)
      .then(({ status, body }) => {
        expect(status, "independent persisted notifications GET").to.eq(200);
        expect(body).to.be.an("array");
        return body;
      });
  }

  assertMissingFieldsPreventSubmit(missingField) {
    const observation = this.watchPosts();
    this.readAllNotifications().then((before) => {
      if (missingField === "recipient") {
        cy.get(this.selectors.enterUser).should("have.value", "");
        cy.get(this.selectors.textArea).should("have.value", this.message);
      } else {
        expect(missingField).to.eq("message");
        cy.get(this.selectors.enterUser).should("have.value", this.recipientId);
        cy.get(this.selectors.textArea).should("have.value", "");
      }
      cy.get(this.selectors.submit).should("be.visible").and("be.disabled");
      // The native disabled button has no submit event; never force-click it.
      this.readAllNotifications().then((after) => {
        expect(
          observation.requests,
          "zero notification POSTs for incomplete input",
        ).to.have.length(0);
        expect(after, "no persisted notification change").to.deep.eq(before);
      });
    });
  }

  submitMessage() {
    const observation = this.watchPosts();
    this.readAllNotifications().then((before) => {
      const beforeIds = new Set(before.map((row) => String(row.id)));
      cy.get(this.selectors.enterUser).should("have.value", this.recipientId);
      cy.get(this.selectors.textArea).should("have.value", this.message);
      cy.get(this.selectors.submit)
        .should("be.visible")
        .and("be.enabled")
        .click();
      cy.wait(`@${observation.alias}`).then(({ request, response }) => {
        expect(
          response?.statusCode,
          "real positive send HTTP response; 404 is a failure",
        ).to.eq(200);
        const receipt =
          typeof response.body === "string"
            ? JSON.parse(response.body)
            : response.body;
        expect(receipt.saved, "actual persisted save receipt").to.eq(true);
        expect(
          String(receipt.id),
          "positive server-persisted receipt id",
        ).to.match(/^[1-9][0-9]*$/);
        expect(["NOT_SUBSCRIBED", "FAILED", "ACCEPTED"]).to.include(
          receipt.pushStatus,
        );
        this.savedReceipt = receipt;
        expect(request.url.split("/").pop()).to.eq(this.recipientId);
        const sent =
          typeof request.body === "string"
            ? JSON.parse(request.body)
            : request.body;
        expect(sent).to.deep.eq({ message: this.message });
        expect(
          Boolean(request.headers["x-csrf-token"]),
          "application submits a CSRF token",
        ).to.eq(true);
      });
      this.readAllNotifications().then((after) => {
        const added = after.filter((row) => !beforeIds.has(String(row.id)));
        expect(
          added,
          "exactly one independently read persisted notification",
        ).to.have.length(1);
        expect(
          String(added[0].id),
          "save receipt matches the one independently read persisted row",
        ).to.eq(String(this.savedReceipt.id));
        expect(added[0].message).to.eq(this.message);
        expect(String(added[0].user?.id)).to.eq(this.recipientId);
        // The production NON_NULL converter omits the fresh notice's null read time.
        expect(
          added[0],
          "new saved notification remains unread",
        ).not.to.have.property("readAt");
        // Jackson writes OffsetDateTime as epoch seconds, matching formatTimestamp.
        expect(added[0].createdDate).to.be.a("number").and.be.greaterThan(0);
        expect(
          Number.isFinite(new Date(added[0].createdDate * 1000).getTime()),
          "persisted notification has a valid creation timestamp",
        ).to.eq(true);
        expect(
          observation.requests,
          "no automatic duplicate send",
        ).to.have.length(1);
      });
      cy.get(this.selectors.textArea).should("have.value", "");
      cy.get(this.selectors.submit).should("be.disabled");
      cy.contains(
        ".notification-workspace__tabs button",
        labelPattern("notify.tab.history", true),
      )
        .should("be.visible")
        .click();
      cy.window().should((window) => {
        const history = JSON.parse(
          window.localStorage.getItem("openelis.cn.notification.history.v1"),
        );
        expect(history, "actual browser notification history").to.be.an("array")
          .and.not.to.be.empty;
        expect(
          history[0].id,
          "current receipt is the first history record",
        ).to.eq(String(this.savedReceipt.id));
        expect(history[0].message).to.eq(this.message);
        expect(history[0].status).to.eq("SAVED");
        expect(history[0].pushStatus).to.eq(this.savedReceipt.pushStatus);
      });
      cy.get(".notification-workspace__list article")
        .first()
        .should("be.visible")
        .within(() => {
          cy.contains(
            "p",
            new RegExp(`^${Cypress._.escapeRegExp(this.message)}$`),
          ).should("be.visible");
          cy.contains(".cds--tag", labelPattern("notify.history.saved")).should(
            "be.visible",
          );
          const pushOutcome = {
            NOT_SUBSCRIBED: "notify.saved.noPush",
            FAILED: "notify.saved.pushFailed",
            ACCEPTED: "notify.saved.pushAccepted",
          }[this.savedReceipt.pushStatus];
          cy.contains("p", labelPattern(pushOutcome)).should("be.visible");
        });
    });
  }

  warningMessage() {
    // Retained for historical callers; current negative specs use the disabled contract.
    cy.contains("div", "User and Message are required").should("be.visible");
  }
}

export default NotifyUserPage;
