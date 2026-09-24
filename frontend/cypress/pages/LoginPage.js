import HomePage from "./HomePage";
import TestProperties from "../common/TestProperties";
import zhMessages from "../../src/languages/zh.json";

const SELECTORS = {
  USERNAME: "#loginName",
  PASSWORD: "#password",
  LOGIN_BUTTON: "[data-cy='loginButton']",
  USER_ICON: "#user-Icon",
  LOGOUT: "[data-cy='logOut']",
  CHANGE_PASSWORD: "[data-cy='changePassword']",
  CURRENT_PASSWORD: "#current-password",
};
const API_BASE = "/api/OpenELIS-Global";

class LoginPage {
  testProperties = new TestProperties();
  notificationObservers = [];
  loginReturnSequence = 0;

  visit() {
    cy.intercept("GET", "**/rest/open-configuration-properties").as(
      "loginConfiguration",
    );
    cy.visit("/login");
    cy.wait("@loginConfiguration").its("response.statusCode").should("eq", 200);
  }

  getUsernameElement() {
    return cy.get(SELECTORS.USERNAME);
  }

  getPasswordElement() {
    return cy.get(SELECTORS.PASSWORD);
  }

  enterUsername(value) {
    this.getUsernameElement()
      .should("be.visible")
      .clear()
      .type(value)
      .should("have.value", value);
  }

  enterPassword(value) {
    this.fillPassword(SELECTORS.PASSWORD, value);
  }

  fillPassword(selector, value) {
    cy.get(selector)
      .should("be.visible")
      .clear({ log: false })
      .type(value, { log: false })
      .should(($input) => {
        expect($input.val() === value, "password field matches entered value")
          .to.be.true;
      });
  }

  signIn() {
    cy.get(SELECTORS.LOGIN_BUTTON)
      .should("be.visible")
      .and("be.enabled")
      .click();
  }

  // Observe real, visible DOM before the request. The toast auto-closes after
  // 2/3 seconds, so checking only after a slow response can miss it. This does
  // not stub the response, freeze timers, or keep the notification open.
  watchNotification(messageId, kind) {
    const observation = { seen: false };
    cy.document().then((document) => {
      const selector = `[role="status"].cds--toast-notification--${kind}`;
      const existing = new WeakSet(document.querySelectorAll(selector));
      const inspect = () => {
        document.querySelectorAll(selector).forEach((element) => {
          if (
            !existing.has(element) &&
            element.textContent.includes(zhMessages[messageId]) &&
            Cypress.dom.isVisible(Cypress.$(element))
          ) {
            observation.seen = true;
          }
        });
      };
      const observer = new document.defaultView.MutationObserver(inspect);
      observer.observe(document.body, {
        childList: true,
        characterData: true,
        attributes: true,
        subtree: true,
      });
      this.notificationObservers.push(observer);
    });
    return observation;
  }

  assertNotificationObserved(observation, messageId) {
    cy.wrap(observation, { log: false }).should((actual) => {
      expect(
        actual.seen,
        `visible status notification: ${zhMessages[messageId]}`,
      ).to.be.true;
    });
  }

  stopNotificationObservers() {
    this.notificationObservers
      .splice(0)
      .forEach((observer) => observer.disconnect());
  }

  assertUnauthenticated() {
    cy.request({
      url: `${API_BASE}/session`,
      failOnStatusCode: false,
      log: false,
    }).then(({ status, body }) => {
      expect(status, "session endpoint remains available").to.eq(200);
      expect(body.authenticated, "no authenticated session").to.eq(false);
    });
  }

  ensureLoggedOut() {
    cy.ensureLoggedOut();
    this.assertUnauthenticated();
  }

  signInExpectingRejection() {
    const messageId = "error.invalidcredentials";
    const notification = this.watchNotification(messageId, "error");
    cy.intercept("POST", "**/ValidateLogin?apiCall=true").as("rejectedLogin");
    this.signIn();
    cy.wait("@rejectedLogin").then(({ response }) => {
      expect(response?.statusCode, "invalid credentials rejected").to.eq(401);
      expect(response?.body?.error).to.eq(messageId);
    });
    this.assertNotificationObserved(notification, messageId);
    cy.location("pathname").should("eq", "/login");
    this.getUsernameElement().should("be.visible");
    cy.get("#mainHeader").should("not.be.visible");
    cy.get(".oe-app-shell--authenticated").should("not.exist");
    this.assertUnauthenticated();
  }

  signInExpectingSuccess(username) {
    cy.intercept("GET", "**/session").as("loginSession");
    cy.intercept("POST", "**/ValidateLogin?apiCall=true").as("acceptedLogin");
    this.signIn();
    cy.wait("@acceptedLogin").then(({ response }) => {
      expect(response?.statusCode, "credentials accepted").to.eq(200);
    });
    this.waitForAuthenticatedSession(username);
    cy.location("pathname").should("eq", "/Dashboard");
    cy.get("#mainHeader").should("be.visible");
  }

  waitForAuthenticatedSession(username, remaining = 3) {
    return cy.wait("@loginSession").then(({ response }) => {
      expect(response?.statusCode, "application session refresh").to.eq(200);
      // A login-page poll already in flight may still be anonymous. Only the
      // subsequent authenticated refresh for this exact account can pass.
      if (response.body?.authenticated === false && remaining > 1) {
        return this.waitForAuthenticatedSession(username, remaining - 1);
      }
      expect(
        response.body?.authenticated,
        "authenticated application session",
      ).to.eq(true);
      expect(
        response.body?.loginName,
        "session belongs to the supplied account",
      ).to.eq(username);
    });
  }

  signOut() {
    // Preserve the existing shared user-menu behavior outside this login spec.
    cy.get(SELECTORS.USER_ICON).should("exist").click({ force: true });
    cy.get(SELECTORS.LOGOUT).should("exist").click({ force: true });
    cy.get(SELECTORS.USERNAME, { timeout: 30000 }).should("be.visible");
  }

  changingPassword() {
    cy.get(SELECTORS.CHANGE_PASSWORD).should("be.visible").click();
    cy.location("pathname").should("eq", "/ChangePasswordLogin");
    cy.get(SELECTORS.CURRENT_PASSWORD).should("be.visible");
  }

  enterCurrentPassword(value) {
    this.fillPassword(SELECTORS.CURRENT_PASSWORD, value);
  }

  enterNewPassword(value) {
    this.fillPassword("#new-password", value);
  }

  repeatNewPassword(value) {
    this.fillPassword("#repeat-new-password", value);
  }

  observeLoginReturn() {
    const sequence = ++this.loginReturnSequence;
    const observation = {
      configurationAlias: `returnedLoginConfiguration${sequence}`,
      sessionAlias: `returnedLoginSession${sequence}`,
      intermediateSessionAlias: `intermediateLoggedOutSession${sequence}`,
      rootDocuments: 0,
      loginDocuments: 0,
      configurationRequests: 0,
      sessionRequests: 0,
    };
    // Exit first loads "/", whose unauthenticated SecureRoute then reloads
    // "/login". Only requests belonging to that final new document prove the
    // login form is ready; the intermediate page has its own config/session.
    cy.then(() => {
      cy.on("window:before:load", (window) => {
        if (window.location.pathname === "/") {
          observation.rootDocuments += 1;
        }
        if (window.location.pathname === "/login") {
          observation.loginDocuments += 1;
        }
      });
    });
    const belongsToReturnedLogin = (request) => {
      const referer = request.headers.referer;
      return (
        observation.loginDocuments > 0 &&
        typeof referer === "string" &&
        new URL(referer).pathname === "/login"
      );
    };
    cy.intercept("GET", "**/rest/open-configuration-properties", (request) => {
      if (belongsToReturnedLogin(request)) {
        observation.configurationRequests += 1;
        request.alias = observation.configurationAlias;
      }
    });
    cy.intercept("GET", "**/session", (request) => {
      if (belongsToReturnedLogin(request)) {
        observation.sessionRequests += 1;
        request.alias = observation.sessionAlias;
      } else if (
        observation.rootDocuments > 0 &&
        typeof request.headers.referer === "string" &&
        new URL(request.headers.referer).pathname === "/"
      ) {
        request.alias = observation.intermediateSessionAlias;
      }
    });
    return observation;
  }

  assertReturnedLoginReady(observation) {
    cy.wait(`@${observation.configurationAlias}`).then(
      ({ request, response }) => {
        expect(
          new URL(request.headers.referer).pathname,
          "configuration document",
        ).to.eq("/login");
        expect(response?.statusCode, "returned login configuration").to.eq(200);
        expect(response?.body?.useFormLogin, "form login is configured").to.eq(
          "true",
        );
      },
    );
    cy.wait(`@${observation.sessionAlias}`).then(({ request, response }) => {
      expect(
        new URL(request.headers.referer).pathname,
        "session document",
      ).to.eq("/login");
      expect(response?.statusCode, "returned login session").to.eq(200);
      expect(
        response?.body?.authenticated,
        "returned page is unauthenticated",
      ).to.eq(false);
    });
    cy.then(() => {
      expect(
        observation.loginDocuments,
        "new login document observed",
      ).to.be.greaterThan(0);
      expect(
        observation.configurationRequests,
        "new login config requested",
      ).to.be.greaterThan(0);
      expect(
        observation.sessionRequests,
        "new login session requested",
      ).to.be.greaterThan(0);
    });
    cy.location("pathname").should("eq", "/login");
    this.getUsernameElement().should("be.visible");
    this.getPasswordElement().should("be.visible");
    cy.get(SELECTORS.LOGIN_BUTTON).should("be.visible").and("be.enabled");
  }

  submitNewPassword() {
    const loginReturn = this.observeLoginReturn();
    const messageId = "notification.password.change.success";
    const notification = this.watchNotification(messageId, "success");
    cy.intercept("POST", "**/ChangePasswordLogin?apiCall=true").as(
      "changePassword",
    );
    cy.get("[data-cy='submitNewPassword']")
      .should("be.visible")
      .and("be.enabled")
      .click();
    cy.wait("@changePassword").then(({ response }) => {
      expect(response?.statusCode, "password change accepted").to.eq(200);
      expect(response?.body?.success).to.eq(true);
    });
    this.assertNotificationObserved(notification, messageId);
    this.assertReturnedLoginReady(loginReturn);
    this.assertUnauthenticated();
  }

  clickExitPasswordReset() {
    const loginReturn = this.observeLoginReturn();
    cy.get("[data-cy='exitPasswordReset']").should("be.visible").click();
    // SecureRoute must receive the intermediate root page's anonymous session
    // before it can navigate to /login. Wait on that actual prerequisite, then
    // begin waiting for the final document's requests with the normal limits.
    cy.wait(`@${loginReturn.intermediateSessionAlias}`).then(
      ({ request, response }) => {
        expect(
          new URL(request.headers.referer).pathname,
          "intermediate session document",
        ).to.eq("/");
        expect(response?.statusCode, "intermediate session available").to.eq(
          200,
        );
        expect(response?.body?.authenticated, "root page requires login").to.eq(
          false,
        );
        expect(
          loginReturn.rootDocuments,
          "new intermediate document observed",
        ).to.be.greaterThan(0);
      },
    );
    this.assertReturnedLoginReady(loginReturn);
    cy.get(SELECTORS.CURRENT_PASSWORD).should("not.exist");
    this.assertUnauthenticated();
  }

  clearInputs() {
    this.getUsernameElement().should("be.visible").clear();
    this.getPasswordElement().should("be.visible").clear({ log: false });
  }

  goToHomePage() {
    cy.location("pathname").then((pathname) => {
      if (pathname === "/login") {
        cy.get(SELECTORS.LOGIN_BUTTON).should("be.visible");
        const username =
          Cypress.env("USERNAME") || this.testProperties.getUsername();
        const password =
          Cypress.env("PASSWORD") || this.testProperties.getPassword();
        this.enterUsername(username);
        this.enterPassword(password);
        this.signInExpectingSuccess(username);
      }
    });
    cy.get("#mainHeader").should("be.visible");
    return new HomePage();
  }
}

export default LoginPage;
