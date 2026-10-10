import LoginPage from "../pages/LoginPage";
import CurrentChinaHelpPage from "../pages/CurrentChinaHelpPage";

let homePage = null;
let helpPage = null;

// Explicit replacement of the four retired foreign documentation contracts.
// The existing English/VL/DBS files remain preserved as compatibility files.
describe("Interacts with current China LIS help", function () {
  before(() => {
    const loginPage = new LoginPage();
    loginPage.visit();
    homePage = loginPage.goToHomePage();
    helpPage = new CurrentChinaHelpPage();
  });

  it("User opens current Chinese manual from the header help panel", function () {
    helpPage = homePage.goToHelp();
    helpPage.openActualHeaderManual();
  });

  it("User follows the operation directory to the application and specimen section", function () {
    helpPage.followOperationDirectory();
  });

  it("User downloads the actual bundled Chinese manual PDF", function () {
    helpPage.downloadActualPDF();
  });

  it("User invokes browser printing and sees the actual fallback feedback", function () {
    helpPage.invokeActualBrowserPrint();
  });
});
