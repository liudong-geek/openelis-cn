import LoginPage from "../pages/LoginPage";

const login = new LoginPage();
let usersData;

describe("Login Test Cases", function () {
  before("Load users fixture", () => {
    cy.fixture("Users").then((users) => {
      const username = Cypress.env("USERNAME") || users[3].username;
      const password = Cypress.env("PASSWORD") || users[3].password;
      usersData = users.map((user, index) => ({
        ...user,
        username:
          user.username === users[3].username ? username : user.username,
        password:
          index === 4
            ? `${password}!`
            : user.password === users[3].password
              ? password
              : user.password,
      }));
    });
  });

  beforeEach("User visits login page without an authenticated session", () => {
    login.ensureLoggedOut();
    login.visit();
    login.clearInputs();
  });

  afterEach(() => {
    login.stopNotificationObservers();
  });

  it("Tries to login without credentials", function () {
    login.signInExpectingRejection();
  });

  it("Fails to login with only username", function () {
    login.enterUsername(usersData[3].username);
    login.signInExpectingRejection();
  });

  it("Fails to login with only password", function () {
    login.enterPassword(usersData[3].password);
    login.signInExpectingRejection();
  });

  it("User changes from default credentials", function () {
    login.changingPassword();
    login.enterUsername(usersData[3].username);
    login.enterCurrentPassword(usersData[3].password);
    login.enterNewPassword(usersData[4].password);
    login.repeatNewPassword(usersData[4].password);
    login.submitNewPassword();
  });

  it("Logs in with correct credentials", function () {
    const user = usersData[4];
    login.enterUsername(user.username);
    login.enterPassword(user.password);
    login.signInExpectingSuccess(user.username);
  });

  it("Resets the default credentials", function () {
    login.changingPassword();
    login.enterUsername(usersData[4].username);
    login.enterCurrentPassword(usersData[4].password);
    login.enterNewPassword(usersData[3].password);
    login.repeatNewPassword(usersData[3].password);
    login.submitNewPassword();
  });

  it("User exits password reset", function () {
    login.changingPassword();
    login.enterUsername(usersData[3].username);
    login.enterCurrentPassword(usersData[3].password);
    login.enterNewPassword(usersData[4].password);
    login.repeatNewPassword(usersData[4].password);
    const passwordChanges = [];
    cy.intercept("POST", "**/ChangePasswordLogin?apiCall=true", (request) => {
      passwordChanges.push(request);
    });
    login.clickExitPasswordReset();
    cy.then(() =>
      expect(
        passwordChanges,
        "exit does not submit a password change",
      ).to.have.length(0),
    );
    login.enterUsername(usersData[3].username);
    login.enterPassword(usersData[3].password);
    login.signInExpectingSuccess(usersData[3].username);
  });

  it("Validates user authentication", function () {
    usersData.forEach((user) => {
      login.ensureLoggedOut();
      login.visit();
      login.clearInputs();
      login.enterUsername(user.username);
      login.enterPassword(user.password);
      if (user.correctPass) {
        login.signInExpectingSuccess(user.username);
      } else {
        login.signInExpectingRejection();
      }
    });
    login.ensureLoggedOut();
  });
});
