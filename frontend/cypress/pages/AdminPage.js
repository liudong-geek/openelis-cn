// This handles all pages of the admin
import LabNumberManagementPage from "./LabNumberManagementPage";
import MenuConfigPage from "./MenuConfigPage";
import BarcodeConfigPage from "./BarcodeConfigPage";
import ProgramEntryPage from "./ProgramEntryPage";
import ProviderManagementPage from "./ProviderManagementPage";
import OrganizationManagementPage from "./OrganizationManagementPage";
import UserManagementPage from "./UserManagementPage";
import ReflexTestsConfigPage from "./ReflexTestsConfigPage";
import DictionaryMenuPage from "./DictionaryMenu";
import GeneralConfigurationsPage from "./GeneralConfigurationsPage";
import NotifyUserPage from "./NotifyUserPage";
import ResultReportingConfigurationPage from "./ResultReportingConfiguration";
import BatchTestReassignmentandCancelationPage from "./BatchTestReassignmentandCancelation";
import TestManagementPage from "./TestManagementPage";
import { label } from "./AdminUiContract";

class AdminPage {
  constructor() {
    this.selectors = {
      providerManagement: "[data-cy='providerMgmnt']",
      organizationManagement: "[data-cy='orgMgmnt']",
      labNumberManagement: "[data-cy='labNumberMgmnt']",
      globalMenuManagement: "[data-cy='globalMenuMgmnt']",
      barcodeConfig: "[data-cy='barcodeConfig']",
      programEntry: "[data-cy='programEntry']",
      userManagement: "[data-cy='userMgmnt']",
      notifyUser: "[data-cy='notifyUser']",
      resultReportingConfig: "[data-cy='resultReportingConfiguration']",
      batchTest: "[data-cy='batchTestReassignment']",
      span: "span",
      testManagement: "[data-cy='testManagementConfigMenu']",
    };
  }

  visit() {
    cy.visit("/MasterListsPage/DictionaryMenu");
  }

  ensureAdminShell() {
    cy.location("pathname").then((pathname) => {
      if (!/^\/(MasterListsPage|admin)(\/|$)/.test(pathname)) {
        this.openNavigationTask(
          "menu_configuration_workspace",
          "DictionaryMenu",
        );
      }
    });
  }

  openNavigationTask(workspaceId, route) {
    // Follow the current server-authorized China sidebar; never enter the retired root directory.
    cy.get(".cds--side-nav").then(($nav) => {
      if (!$nav.hasClass("cds--side-nav--expanded")) {
        cy.get("[data-cy='menuButton']").should("be.visible").click();
      }
    });
    cy.get(".cds--side-nav").should("have.class", "cds--side-nav--expanded");
    const toggle = `#${workspaceId} > li > button.cds--side-nav__submenu`;
    cy.get(toggle)
      .should("have.length", 1)
      .scrollIntoView()
      .should("be.visible")
      .then(($button) => {
        if ($button.attr("aria-expanded") !== "true") {
          cy.wrap($button).click();
        }
      });
    // Carbon remounts on expansion; assert the newly rendered control.
    cy.get(toggle).should("have.attr", "aria-expanded", "true");
    cy.get(`#${workspaceId} a[href="/MasterListsPage/${route}"]`)
      .should("have.length", 1)
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should("eq", `/MasterListsPage/${route}`);
    cy.get("body").then(($body) => {
      const $button = $body.find("[data-cy='menuButton']");
      if ($button.length && $body.find(".cds--side-nav--expanded").length) {
        cy.wrap($button).click();
      }
    });
  }

  openMenuConfiguration(categoryId) {
    this.openNavigationTask("menu_management_workspace", "menuConfiguration");
    cy.get("#menu-configuration-category")
      .should("be.visible")
      .and("be.enabled")
      .select(categoryId);
    cy.get("#menu-configuration-category").should("have.value", categoryId);
  }

  openWorkflowCategory(categoryId) {
    this.openNavigationTask(
      "menu_configuration_workspace",
      "workflowReportWorkspace",
    );
    cy.get("#workflow-parameter-category")
      .should("be.visible")
      .and("be.enabled")
      .select(categoryId);
    cy.get("#workflow-parameter-category").should("have.value", categoryId);
    return new GeneralConfigurationsPage();
  }

  openOrganizationArea(route, title) {
    this.openNavigationTask("menu_configuration_workspace", route);
    cy.contains("h1", title).should("be.visible");
  }

  goToProviderManagementPage() {
    this.openOrganizationArea("providerMenu", "申请医生管理");
    return new ProviderManagementPage();
  }

  goToOrganizationManagement() {
    this.openOrganizationArea("organizationManagement", "机构与科室");
    return new OrganizationManagementPage();
  }

  goToLabNumberManagementPage() {
    this.openNavigationTask("menu_configuration_workspace", "labNumber");
    cy.get(".lab-number-workspace h1")
      .should("be.visible")
      .invoke("text")
      .should("match", label("configure.labNumber.title"));
    return new LabNumberManagementPage();
  }

  goToGlobalMenuConfigPage() {
    this.openMenuConfiguration("global");
    return new MenuConfigPage("global");
  }

  goToNonConformConfigPage() {
    this.openMenuConfiguration("nonconformity");
    return new MenuConfigPage("nonconformity");
  }

  goToPatientConfigPage() {
    this.openMenuConfiguration("patient");
    return new MenuConfigPage("patient");
  }

  goToStudyConfigPage() {
    this.openMenuConfiguration("study");
    return new MenuConfigPage("study");
  }

  goToBillingConfigPage() {
    this.openMenuConfiguration("billing");
    return new MenuConfigPage("billing");
  }

  goToBarcodeConfigPage() {
    cy.intercept("GET", "**/api/labelPresets").as("labelPresetsAtEntry");
    this.openNavigationTask("menu_configuration_workspace", "labelPresets");
    cy.wait("@labelPresetsAtEntry").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body).to.be.an("array");
    });
    return new BarcodeConfigPage();
  }

  goToProgramEntry() {
    this.openNavigationTask("menu_configuration_workspace", "program");
    return new ProgramEntryPage();
  }

  goToDictionaryMenuPage() {
    this.openNavigationTask("menu_configuration_workspace", "DictionaryMenu");
    return new DictionaryMenuPage();
  }

  goToUserManagementPage() {
    this.openNavigationTask("menu_management_workspace", "userManagement");
    return new UserManagementPage();
  }

  goToReflexTestsManagement() {
    this.openNavigationTask("menu_configuration_workspace", "rulesWorkspace");
    return new ReflexTestsConfigPage("reflex").openNew();
  }

  goToCalculatedValueTestsManagement() {
    this.openNavigationTask("menu_configuration_workspace", "rulesWorkspace");
    return new ReflexTestsConfigPage("calculation").openNew();
  }

  goToNonConformityConfig() {
    return this.openWorkflowCategory("NonConformityConfigurationMenu");
  }

  goToMenuStatementConfig() {
    return this.openWorkflowCategory("MenuStatementConfigMenu");
  }

  goToWorkPlanConfig() {
    return this.openWorkflowCategory("WorkplanConfigurationMenu");
  }

  goToSiteInformationConfig() {
    return this.openWorkflowCategory("SiteInformationMenu");
  }

  goToResultEntityConfig() {
    return this.openWorkflowCategory("ResultConfigurationMenu");
  }

  goToPatientEntityConfig() {
    return this.openWorkflowCategory("PatientConfigurationMenu");
  }

  goToPrintedReportConfig() {
    return this.openWorkflowCategory("PrintedReportsConfigurationMenu");
  }

  goToOrderEntityConfig() {
    return this.openWorkflowCategory("SampleEntryConfigMenu");
  }

  goToValidationConfig() {
    return this.openWorkflowCategory("ValidationConfigurationMenu");
  }

  goToNotifyUserPage() {
    this.openNavigationTask("menu_management_workspace", "NotifyUser");
    return new NotifyUserPage();
  }

  goToResultReportingConfigurationPage() {
    this.openNavigationTask(
      "menu_configuration_workspace",
      "resultReportingConfiguration",
    );
    return new ResultReportingConfigurationPage();
  }

  goToBatchTestReassignmentandCanelationPage() {
    this.openNavigationTask("menu_configuration_workspace", "rulesWorkspace");
    cy.get(
      '.rules-workspace__tool a[href="/MasterListsPage/batchTestReassignment"]',
    )
      .should("have.length", 1)
      .scrollIntoView()
      .should("be.visible")
      .and("not.have.attr", "aria-disabled", "true")
      .click();
    cy.location("pathname").should(
      "eq",
      "/MasterListsPage/batchTestReassignment",
    );
    return new BatchTestReassignmentandCancelationPage();
  }

  goToTestManagementPage() {
    cy.intercept("GET", "**/rest/test-catalog/tests?*").as(
      "testCatalogAtEntry",
    );
    this.openNavigationTask("menu_configuration_workspace", "TestCatalogList");
    cy.wait("@testCatalogAtEntry").then(({ response }) => {
      expect(response.statusCode).to.eq(200);
      expect(response.body.rows).to.be.an("array");
    });
    return new TestManagementPage();
  }
}

export default AdminPage;
