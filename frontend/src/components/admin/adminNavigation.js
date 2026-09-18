import {
  Catalog,
  DataReference,
  Flow,
  Network_3,
  Security,
  UserMultiple,
} from "@carbon/icons-react";

export const ADMIN_NAVIGATION_DOMAINS = [
  {
    id: "catalog",
    titleId: "admin.dashboard.domain.catalog",
    descriptionId: "admin.dashboard.domain.catalog.description",
    icon: Catalog,
    links: [["workspace.masterData.title", "testManagementConfigMenu"]],
    routeRoots: [
      "testManagementConfigMenu",
      "reflex",
      "DictionaryMenu",
      "TestCatalogList",
      "TestCatalogEditor",
      "SampleTypeManagement",
      "calculatedValue",
      "AnalyzerTestName",
      "batchTestReassignment",
      "TestCatalog",
      "TestModifyEntry",
      "TestSectionManagement",
      "TestSectionCreate",
      "TestSectionOrder",
      "TestSectionTestAssign",
      "SampleTypeOrder",
      "SampleTypeTestAssign",
      "MethodManagment",
      "MethodRenameEntry",
      "UomManagement",
      "UomCreate",
      "PanelManagement",
      "PanelTestAssign",
      "ResultSelectListAdd",
      "TestOrderability",
    ],
  },
  {
    id: "organization",
    titleId: "admin.dashboard.domain.organization",
    descriptionId: "admin.dashboard.domain.organization.description",
    icon: UserMultiple,
    links: [
      ["workspace.organizationPeople.title", "organizationPeopleWorkspace"],
    ],
    routeRoots: [
      "organizationPeopleWorkspace",
      "userManagement",
      "userEdit",
      "organizationManagement",
      "organizationEdit",
      "providerMenu",
    ],
  },
  {
    id: "workflow",
    titleId: "admin.dashboard.domain.workflow",
    descriptionId: "admin.dashboard.domain.workflow.description",
    icon: Flow,
    links: [["workspace.workflowReport.title", "workflowReportWorkspace"]],
    routeRoots: [
      "workflowReportWorkspace",
      "SiteInformationMenu",
      "SiteBrandingMenu",
      "labNumber",
      "barcodeConfiguration",
      "labelPresets",
      "resultReportingConfiguration",
      "testNotificationConfigMenu",
      "testNotificationConfig",
      "NonConformityConfigurationMenu",
      "MenuStatementConfigMenu",
      "WorkPlanConfigurationMenu",
      "ResultConfigurationMenu",
      "PatientConfigurationMenu",
      "PrintedReportsConfigurationMenu",
      "SampleEntryConfigurationMenu",
      "ValidationConfigurationMenu",
    ],
  },
  {
    id: "interfaces",
    titleId: "admin.dashboard.domain.interfaces",
    descriptionId: "admin.dashboard.domain.interfaces.description",
    icon: Network_3,
    links: [["externalconnections.browse.title", "externalConnections"]],
    routeRoots: [
      "externalConnections",
      "externalConnectionEdit",
      "dataExportStatus",
    ],
  },
  {
    id: "security",
    titleId: "admin.dashboard.domain.security",
    descriptionId: "admin.dashboard.domain.security.description",
    icon: Security,
    links: [
      ["sidenav.label.admin.menu", "globalMenuManagement"],
      ["sidenav.label.admin.commonproperties", "commonproperties"],
    ],
    routeRoots: [
      "globalMenuManagement",
      "billingMenuManagement",
      "nonConformityMenuManagement",
      "patientMenuManagement",
      "studyMenuManagement",
      "commonproperties",
      "SearchIndexManagement",
      "loggingManagement",
      "languageManagement",
      "translationManagement",
      "NotifyUser",
      "DatabaseCleaning",
    ],
  },
  {
    id: "data",
    titleId: "admin.dashboard.domain.data",
    descriptionId: "admin.dashboard.domain.data.description",
    icon: DataReference,
    links: [
      ["masterData.title", "masterDataIdentity"],
      ["sidenav.label.admin.program", "program"],
    ],
    routeRoots: [
      "masterDataIdentity",
      "program",
      "PluginFile",
      "calendarManagement",
    ],
  },
];

export const getAdminRouteRoot = (pathname) =>
  String(pathname || "")
    .replace(/^\/(?:admin|MasterListsPage)\/?/, "")
    .split(/[/?#]/)[0];

export const getAdminNavigationDomain = (pathname) => {
  const routeRoot = getAdminRouteRoot(pathname);
  return (
    ADMIN_NAVIGATION_DOMAINS.find((domain) =>
      domain.routeRoots.includes(routeRoot),
    ) || null
  );
};
