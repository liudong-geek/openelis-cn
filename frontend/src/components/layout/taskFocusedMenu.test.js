import {
  buildTaskFocusedMenu,
  CHINA_MENU_MESSAGE_IDS,
  MENU_PROFILES,
  normalizeOrderMenu,
  ROLE_NAMES,
} from "./taskFocusedMenu";
import { SECURITY_REVIEW_REPORTS } from "../reports/reportAvailability";

const item = (elementId, actionURL = "", childMenus = []) => ({
  menu: {
    elementId,
    displayKey: elementId,
    actionURL,
    isActive: true,
  },
  childMenus,
});

const findById = (items, elementId) => {
  for (const menuItem of items || []) {
    if (menuItem.menu?.elementId === elementId) return menuItem;
    const childMatch = findById(menuItem.childMenus, elementId);
    if (childMatch) return childMatch;
  }
  return null;
};

const allIds = (items) =>
  (items || []).flatMap((menuItem) => [
    menuItem.menu?.elementId,
    ...allIds(menuItem.childMenus),
  ]);

const chinaMenuFixture = () => [
  item("menu_home", "/Dashboard"),
  item("menu_sample", "", [
    item("menu_sample_add", "/SamplePatientEntry"),
    item("menu_order_workflow", "", [
      item("menu_order_dashboard", "/order"),
      item("menu_order_enter", "/order/enter"),
      item("menu_order_collect", "/order/collect"),
      item("menu_order_label", "/order/label"),
      item("menu_order_qa", "/order/qa"),
    ]),
    item("menu_sample_edit", "/SampleEdit"),
    item("menu_sample_create", "", [
      item("menu_sample_create_initial", "/SampleEntryByProject?type=initial"),
    ]),
    item("menu_sample_shipment", "/SampleShipment"),
  ]),
  item("menu_patient", "", [
    item("menu_patient_add_or_edit", "/PatientManagement"),
    item("menu_patienthistory", "/PatientHistory"),
    item("menu_patient_merge", "/PatientMerge"),
    item("menu_patient_create", "", [
      item(
        "menu_patient_create_initial",
        "/PatientEntryByProject?type=initial",
      ),
    ]),
  ]),
  item("menu_storage", "", [item("menu_storage_management", "/Storage")]),
  item("menu_aliquot", "/Aliquot"),
  item("menu_inventory", "", [item("menu_inventory_management", "/inventory")]),
  item("menu_results", "", [
    item("menu_results_unified", "/Results"),
    item("menu_results_analyzer", "/AnalyzerResults"),
    item("order_programmes", "/genericProgram"),
  ]),
  item("menu_workplan", "", [item("menu_workplan_test", "/WorkplanByTest")]),
  item("menu_resultvalidation", "", [
    item("menu_resultvalidation_routine", "/ResultValidation"),
    item("menu_resultvalidation_study", "/validation"),
  ]),
  item("menu_reports", "", [
    item("menu_reports_routine", "", [
      item(
        "menu_reports_patient",
        "/Report?type=patient&report=patientClinical",
      ),
      item("menu_reports_whonet", "/Report?report=ExportWHONETReportByDate"),
    ]),
    item("menu_reports_tatreport", "/TATReport"),
    item("menu_reports_audittrail", "/AuditTrailReport"),
    item("menu_reports_study", "", [
      item("menu_reports_arv", "/Report?report=patientARV1"),
    ]),
    item(
      "menu_reports_haiti",
      "/Report?type=patient&report=haitiNonConformityByDate",
    ),
  ]),
  item("menu_nonconformity", "", [
    item("menu_non_conforming_view", "/ViewNonConformingEvent"),
  ]),
  item("menu_eqa_tests", "", [item("menu_eqa_orders", "/EQAOrders")]),
  item("menu_alerts_standalone", "/Alerts"),
  item("menu_analyzers", "/analyzers", [
    item("menu_analyzers_list", "/analyzers/list"),
    item("menu_analyzers_errors", "/analyzers/errors"),
    item("menu_analyzers_types", "/analyzers/types"),
    item("menu_analyzers_qc", "", [
      item("menu_analyzers_qc_dashboard", "/analyzers/qc"),
      item("menu_analyzers_qc_alerts", "/analyzers/qc/alerts"),
      item(
        "menu_analyzers_qc_corrective_actions",
        "/analyzers/qc/corrective-actions",
      ),
      item("menu_analyzers_qc_control_lots", "/analyzers/qc/control-lots"),
      item("menu_analyzers_qc_rule_config", "/analyzers/qc/rules"),
    ]),
  ]),
  item("menu_billing", ""),
  item("menu_administration", "/MasterListsPage", [
    item("menu_administration_test_management", "/admin/TestManagement"),
  ]),
  item("menu_help", "", [
    item("menu_help_user_manual", "/documentation/CI_Regional_fr.pdf"),
  ]),
];

describe("taskFocusedMenu", () => {
  test("keeps legacy entries if the server did not authorize their replacement list", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_patient", "", [
          item("menu_patienthistory", "/PatientHistory"),
        ]),
        item("menu_sample", "", [item("menu_sample_edit", "/SampleEdit")]),
      ],
      { roles: [ROLE_NAMES.RECEPTION] },
    );
    expect(findById(result, "menu_patienthistory")).not.toBeNull();
    expect(findById(result, "menu_sample_edit")).not.toBeNull();
  });

  test("keeps batch preprinting as a distinct tool", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_sample", "", [
          item("menu_sample_print_barcode", "/PrintBarcode"),
        ]),
      ],
      { roles: [ROLE_NAMES.RECEPTION] },
    );
    expect(findById(result, "menu_sample_print_barcode").menu.actionURL).toBe(
      "/PrintBarcode?mode=preprint",
    );
  });
  test("flattens the supported global order workflow and removes the duplicate legacy entry", () => {
    const orderMenu = item("menu_sample", "", [
      item("menu_sample_add", "/SamplePatientEntry.do?type=legacy"),
      item("menu_order_workflow", "", [
        item("menu_order_dashboard", "/order"),
        item("menu_order_enter", "/order/enter"),
        item("menu_order_collect", "/order/collect"),
      ]),
      item("menu_sample_edit", "/SampleEdit?type=readwrite"),
    ]);

    const normalized = normalizeOrderMenu(orderMenu);

    expect(normalized.childMenus.map((child) => child.menu.elementId)).toEqual([
      "menu_order_dashboard",
      "menu_order_enter",
      "menu_order_collect",
      "menu_order_more",
    ]);
    expect(
      normalized.childMenus.some(
        (child) => child.menu.elementId === "menu_sample_add",
      ),
    ).toBe(false);
    expect(normalized.childMenus[3].childMenus[0].menu.elementId).toBe(
      "menu_sample_edit",
    );
  });

  test("builds the China LIS task architecture in the required order without changing source ids or routes", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture(), {
      roles: Object.values(ROLE_NAMES),
    });

    expect(result.map((menuItem) => menuItem.menu.elementId)).toEqual([
      "menu_home",
      "menu_sample",
      "menu_patient",
      "menu_storage",
      "menu_results",
      "menu_resultvalidation",
      "menu_reports",
      "menu_query_statistics",
      "menu_quality_management",
      "menu_administration",
    ]);
    expect(result.map((menuItem) => menuItem.menu.displayKey)).toEqual([
      "banner.menu.home",
      "banner.menu.sample",
      "banner.menu.patient",
      "sidenav.china.specimens",
      "banner.menu.results",
      "banner.menu.resultvalidation",
      "banner.menu.reports",
      "sidenav.china.analytics",
      "sidenav.china.quality",
      "banner.menu.administration",
    ]);

    expect(findById(result, "menu_order_enter")).toBeNull();
    expect(findById(result, "menu_sample_edit")).toBeNull();
    expect(findById(result, "menu_order_collect").menu.actionURL).toBe(
      "/order/collect",
    );
    expect(findById(result, "menu_patienthistory")).toBeNull();
    expect(findById(result, "menu_results_unified").menu.actionURL).toBe(
      "/Results",
    );
    expect(findById(result, "menu_reports_tatreport").menu.actionURL).toBe(
      "/TATReport",
    );
  });

  test("moves collection, labeling, acceptance and shipment under specimen management without duplicate entries", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture(), {
      roles: [ROLE_NAMES.RECEPTION, ROLE_NAMES.RESULTS],
    });
    const orderRoot = findById(result, "menu_sample");
    const specimenRoot = findById(result, "menu_storage");

    expect(allIds(orderRoot.childMenus)).toEqual(
      expect.arrayContaining(["menu_order_dashboard"]),
    );
    expect(allIds(orderRoot.childMenus)).not.toEqual(
      expect.arrayContaining([
        "menu_order_collect",
        "menu_order_label",
        "menu_order_qa",
        "menu_sample_shipment",
      ]),
    );
    expect(allIds(specimenRoot.childMenus)).toEqual(
      expect.arrayContaining([
        "menu_order_collect",
        "menu_order_label",
        "menu_order_qa",
        "menu_sample_shipment",
        "menu_storage_management",
        "menu_inventory",
      ]),
    );
    expect(
      findById(specimenRoot.childMenus, "menu_sample_shipment").menu.actionURL,
    ).toBe("/SampleShipment/boxes");

    const ids = allIds(result);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  test("removes the legacy standalone aliquot page because aliquoting is available in specimen management", () => {
    const source = chinaMenuFixture();
    const china = buildTaskFocusedMenu(source, {
      roles: [ROLE_NAMES.RECEPTION],
    });
    const global = buildTaskFocusedMenu(source, {
      profile: MENU_PROFILES.GLOBAL,
      roles: [ROLE_NAMES.RECEPTION],
    });

    expect(findById(china, "menu_aliquot")).toBeNull();
    expect(findById(china, "menu_storage_management")).not.toBeNull();
    expect(findById(global, "menu_aliquot").menu.actionURL).toBe("/Aliquot");
  });

  test("moves the complete analyzer QC subtree to quality management while keeping analyzer configuration in system management", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture(), {
      roles: [ROLE_NAMES.ANALYSER_IMPORT, ROLE_NAMES.GLOBAL_ADMIN],
    });
    const qualityRoot = findById(result, "menu_quality_management");
    const systemRoot = findById(result, "menu_administration");
    const analyzerRoot = findById(systemRoot.childMenus, "menu_analyzers");
    const analyzerQcRoot = findById(
      qualityRoot.childMenus,
      "menu_analyzers_qc",
    );

    expect(allIds(analyzerRoot.childMenus)).toEqual([
      "menu_analyzers_list",
      "menu_analyzers_errors",
      "menu_analyzers_types",
    ]);
    expect(allIds(analyzerRoot.childMenus)).not.toContain("menu_analyzers_qc");
    expect(allIds(analyzerQcRoot.childMenus)).toEqual([
      "menu_analyzers_qc_dashboard",
      "menu_analyzers_qc_alerts",
      "menu_analyzers_qc_corrective_actions",
      "menu_analyzers_qc_control_lots",
      "menu_analyzers_qc_rule_config",
    ]);
    expect(analyzerQcRoot.menu.actionURL).toBe("");
    expect(
      findById(result, "menu_analyzers_qc_control_lots").menu.actionURL,
    ).toBe("/analyzers/qc/control-lots");

    const ids = allIds(result);
    expect(
      ids.filter((elementId) => elementId === "menu_analyzers_qc"),
    ).toHaveLength(1);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  test.each([
    {
      role: ROLE_NAMES.LAB_SUPERVISOR,
      hasQc: true,
      hasAnalyzerConfiguration: false,
    },
    {
      role: ROLE_NAMES.ANALYSER_IMPORT,
      hasQc: true,
      hasAnalyzerConfiguration: true,
    },
    {
      role: ROLE_NAMES.GLOBAL_ADMIN,
      hasQc: true,
      hasAnalyzerConfiguration: true,
    },
    {
      role: ROLE_NAMES.RECEPTION,
      hasQc: false,
      hasAnalyzerConfiguration: false,
    },
    {
      role: ROLE_NAMES.RESULTS,
      hasQc: false,
      hasAnalyzerConfiguration: false,
    },
    {
      role: ROLE_NAMES.VALIDATION,
      hasQc: false,
      hasAnalyzerConfiguration: false,
    },
    {
      role: "ROLE_USER",
      hasQc: false,
      hasAnalyzerConfiguration: false,
    },
  ])(
    "keeps analyzer QC and configuration fail-closed for the $role role",
    ({ role, hasQc, hasAnalyzerConfiguration }) => {
      const result = buildTaskFocusedMenu(chinaMenuFixture(), {
        roles: [role],
      });

      expect(Boolean(findById(result, "menu_analyzers_qc"))).toBe(hasQc);
      expect(Boolean(findById(result, "menu_analyzers"))).toBe(
        hasAnalyzerConfiguration,
      );
    },
  );

  test("hides analyzer QC and configuration when no explicit sensitive role is available", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture(), { roles: [] });

    expect(findById(result, "menu_analyzers_qc")).toBeNull();
    expect(findById(result, "menu_analyzers")).toBeNull();
  });

  test("removes empty China menu roots after hidden or inactive children are filtered", () => {
    const source = [
      item("menu_home", "/Dashboard"),
      item("menu_billing", "", [
        item("menu_billing_empty", ""),
        item("menu_help", "", [
          item("menu_help_manual", "/documentation/manual.pdf"),
        ]),
        {
          ...item("menu_billing_inactive", "/billing"),
          menu: {
            elementId: "menu_billing_inactive",
            actionURL: "/billing",
            isActive: false,
          },
        },
      ]),
    ];

    expect(allIds(buildTaskFocusedMenu(source))).toEqual(["menu_home"]);

    const globalIds = allIds(
      buildTaskFocusedMenu(source, { profile: MENU_PROFILES.GLOBAL }),
    );
    expect(globalIds).toEqual(
      expect.arrayContaining([
        "menu_billing",
        "menu_billing_empty",
        "menu_help",
        "menu_help_manual",
      ]),
    );
  });

  test("keeps the analyzer QC subtree in its server-provided location for the global profile", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture(), {
      profile: MENU_PROFILES.GLOBAL,
    });
    const analyzerRoot = findById(result, "menu_analyzers");

    expect(
      findById(analyzerRoot.childMenus, "menu_analyzers_qc"),
    ).not.toBeNull();
    expect(findById(result, "menu_quality_management")).toBeNull();
    expect(findById(result, "menu_billing")).not.toBeNull();
  });

  test("does not restore an analyzer QC subtree excluded by server authorization", () => {
    const source = chinaMenuFixture();
    const analyzerRoot = findById(source, "menu_analyzers");
    const qcRoot = findById(analyzerRoot.childMenus, "menu_analyzers_qc");
    qcRoot.menu.isActive = false;

    const result = buildTaskFocusedMenu(source, {
      roles: [ROLE_NAMES.LAB_SUPERVISOR, ROLE_NAMES.GLOBAL_ADMIN],
    });

    expect(findById(result, "menu_analyzers_qc")).toBeNull();
    expect(findById(result, "menu_analyzers")).not.toBeNull();
  });

  test("China profile removes research, ARV/EID/Haiti, French help and the catch-all more bucket", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture());
    const ids = allIds(result);

    expect(ids).not.toEqual(
      expect.arrayContaining([
        "menu_sample_create",
        "menu_patient_create",
        "menu_resultvalidation_study",
        "menu_reports_study",
        "menu_reports_arv",
        "menu_reports_haiti",
        "order_programmes",
        "menu_help",
        "menu_more_functions",
        "menu_order_more",
      ]),
    );
  });

  test("keeps unadapted specialist work areas out of the routine China LIS menu", () => {
    const source = [
      item("menu_home", "/Dashboard"),
      item("menu_results", "", [item("menu_results_unified", "/Results")]),
      item("menu_pathology", "/PathologyDashboard"),
      item("menu_immunochem", "/ImmunohistochemistryDashboard"),
      item("menu_cytology", "/CytologyDashboard"),
      item("menu_notebook", "/NotebookDashboard"),
      item("menu_workplan", "", [
        item("menu_workplan_test", "/WorkPlanByTest?type=test"),
      ]),
    ];

    const chinaIds = allIds(
      buildTaskFocusedMenu(source, { roles: [ROLE_NAMES.RESULTS] }),
    );

    expect(chinaIds).toContain("menu_workplan");
    expect(chinaIds).not.toEqual(
      expect.arrayContaining([
        "menu_pathology",
        "menu_immunochem",
        "menu_cytology",
        "menu_notebook",
      ]),
    );

    const globalIds = allIds(
      buildTaskFocusedMenu(source, { profile: MENU_PROFILES.GLOBAL }),
    );
    expect(globalIds).toEqual(
      expect.arrayContaining([
        "menu_pathology",
        "menu_immunochem",
        "menu_cytology",
        "menu_notebook",
      ]),
    );
  });

  test("hides generic-sample menus and routes only in the China profile", () => {
    const source = [
      item("menu_home", "/Dashboard"),
      item("menu_sample", "", [
        item("menu_generic_sample_route_alias", "/GenericSample/Import"),
      ]),
      item("generic_program", "/genericProgram?mode=search"),
      item("menu_generic_sample", "", [
        item("menu_generic_sample_order", "/GenericSample/Order"),
        item("menu_generic_sample_edit", "/GenericSample/Edit"),
        item("menu_generic_sample_results", "/GenericSample/Results"),
      ]),
    ];

    const chinaIds = allIds(buildTaskFocusedMenu(source));

    [
      "menu_generic_sample",
      "menu_generic_sample_order",
      "menu_generic_sample_edit",
      "menu_generic_sample_results",
      "menu_generic_sample_route_alias",
      "generic_program",
    ].forEach((elementId) => expect(chinaIds).not.toContain(elementId));

    const globalMenu = buildTaskFocusedMenu(source, {
      profile: MENU_PROFILES.GLOBAL,
    });
    const globalIds = allIds(globalMenu);

    expect(globalIds).toEqual(
      expect.arrayContaining([
        "menu_generic_sample",
        "menu_generic_sample_order",
        "menu_generic_sample_edit",
        "menu_generic_sample_results",
        "menu_generic_sample_route_alias",
        "generic_program",
      ]),
    );
    expect(
      findById(globalMenu, "menu_generic_sample_results").menu.actionURL,
    ).toBe("/GenericSample/Results");
  });

  test.each([
    {
      role: ROLE_NAMES.RECEPTION,
      visible: [
        "menu_home",
        "menu_sample",
        "menu_patient",
        "menu_storage",
        "menu_quality_management",
      ],
      hidden: [
        "menu_results",
        "menu_resultvalidation",
        "menu_reports",
        "menu_administration",
      ],
    },
    {
      role: ROLE_NAMES.RESULTS,
      visible: [
        "menu_home",
        "menu_storage",
        "menu_results",
        "menu_quality_management",
      ],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_resultvalidation",
        "menu_reports",
        "menu_administration",
      ],
    },
    {
      role: ROLE_NAMES.VALIDATION,
      visible: [
        "menu_home",
        "menu_resultvalidation",
        "menu_quality_management",
      ],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_results",
        "menu_reports",
        "menu_eqa_tests",
      ],
    },
    {
      role: ROLE_NAMES.REPORTS,
      visible: ["menu_home", "menu_reports", "menu_query_statistics"],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_results",
        "menu_resultvalidation",
        "menu_reports_audittrail",
      ],
    },
    {
      role: ROLE_NAMES.GLOBAL_ADMIN,
      visible: [
        "menu_home",
        "menu_storage",
        "menu_query_statistics",
        "menu_administration",
        "menu_reports_audittrail",
      ],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_results",
        "menu_resultvalidation",
        "menu_reports_tatreport",
      ],
    },
    {
      role: ROLE_NAMES.USER_ACCOUNT_ADMIN,
      visible: ["menu_home", "menu_administration"],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_results",
        "menu_resultvalidation",
        "menu_reports",
      ],
    },
    {
      role: ROLE_NAMES.AUDIT_TRAIL,
      visible: [
        "menu_home",
        "menu_query_statistics",
        "menu_reports_audittrail",
      ],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_results",
        "menu_resultvalidation",
        "menu_reports_tatreport",
        "menu_administration",
      ],
    },
    {
      role: ROLE_NAMES.LAB_SUPERVISOR,
      visible: ["menu_home", "menu_quality_management"],
      hidden: [
        "menu_sample",
        "menu_patient",
        "menu_results",
        "menu_resultvalidation",
        "menu_reports",
        "menu_administration",
      ],
    },
  ])(
    "slices the China menu for the $role role",
    ({ role, visible, hidden }) => {
      const result = buildTaskFocusedMenu(chinaMenuFixture(), {
        roles: [role],
      });
      const ids = allIds(result);

      expect(ids).toEqual(expect.arrayContaining(visible));
      hidden.forEach((elementId) => expect(ids).not.toContain(elementId));
    },
  );

  test("treats menu_admin and menu_administration as one system-management root", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_home", "/Dashboard"),
        item("menu_admin", "/MasterListsPage", [
          item("menu_admin_users", "/admin/users"),
        ]),
        item("menu_administration", "/MasterListsPage", [
          item("menu_administration_tests", "/admin/tests"),
        ]),
      ],
      { roles: [ROLE_NAMES.GLOBAL_ADMIN] },
    );

    expect(
      result.filter((menuItem) =>
        ["menu_admin", "menu_administration"].includes(menuItem.menu.elementId),
      ),
    ).toHaveLength(1);
    expect(result.at(-1).menu.elementId).toBe("menu_administration");
    expect(allIds(result.at(-1).childMenus)).toEqual(
      expect.arrayContaining(["menu_admin_users", "menu_administration_tests"]),
    );
  });

  test("falls back to the server-authorized tree when no known session role is available", () => {
    const result = buildTaskFocusedMenu(chinaMenuFixture(), {
      roles: ["ROLE_USER"],
    });

    expect(result.map((menuItem) => menuItem.menu.elementId)).toEqual([
      "menu_home",
      "menu_sample",
      "menu_patient",
      "menu_storage",
      "menu_results",
      "menu_resultvalidation",
      "menu_reports",
      "menu_query_statistics",
      "menu_quality_management",
      "menu_administration",
    ]);
  });

  test("keeps the upstream/global grouping available as an explicit profile", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_home", "/Dashboard"),
        item("menu_sample"),
        item("menu_patient"),
        item("menu_storage", "", [item("menu_storage_samples", "/Storage")]),
        item("menu_reports"),
      ],
      { profile: MENU_PROFILES.GLOBAL },
    );

    expect(result.map((menuItem) => menuItem.menu.elementId)).toEqual([
      "menu_home",
      "menu_sample",
      "menu_patient",
      "menu_reports",
      "menu_more_functions",
    ]);
    expect(result[4].childMenus[0].menu.elementId).toBe("menu_storage");
  });

  test("never restores menu items excluded by backend permissions", () => {
    const result = buildTaskFocusedMenu([
      item("menu_home", "/Dashboard"),
      {
        ...item("menu_administration", "/MasterListsPage"),
        menu: { elementId: "menu_administration", isActive: false },
      },
    ]);

    expect(result.map((menuItem) => menuItem.menu.elementId)).toEqual([
      "menu_home",
    ]);
  });

  test("declares every China message id used by menu behavior", () => {
    expect(CHINA_MENU_MESSAGE_IDS).toEqual(
      expect.arrayContaining([
        "banner.menu.home",
        "banner.menu.sample",
        "banner.menu.patienthistory",
        "sidenav.label.order.qa",
        "sideNav.label.audittrail",
      ]),
    );
    expect(CHINA_MENU_MESSAGE_IDS).toHaveLength(
      new Set(CHINA_MENU_MESSAGE_IDS).size,
    );
  });

  test("marks restricted report actions without changing available reports in the global profile", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_reports", "", [
          item(
            "menu_reports_export_routine",
            "/Report?type=routine&report=CISampleRoutineExport",
          ),
          item(
            "menu_reports_statistics",
            "/Report?type=indicator&report=statistics",
          ),
        ]),
      ],
      { profile: MENU_PROFILES.GLOBAL },
    );

    const [restrictedReport, availableReport] = result[0].childMenus;

    expect(restrictedReport.securityRestricted).toBe(true);
    expect(restrictedReport.menu.actionURL).toBe(
      "/Report?type=routine&report=CISampleRoutineExport",
    );
    expect(availableReport.securityRestricted).toBe(false);
  });

  test("marks direct report documents to open outside the application shell", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_reports", "", [
          item(
            "menu_reports_validation_backlog",
            "/ReportPrint?type=indicator&report=validationBacklog",
          ),
        ]),
      ],
      { profile: MENU_PROFILES.CHINA },
    );

    const directReport = findById(result, "menu_reports_validation_backlog");
    expect(directReport.menu).toMatchObject({
      actionURL: "/ReportPrint?type=indicator&report=validationBacklog",
      navigationMode: "document",
      openInNewWindow: true,
    });
  });

  test("hides security-review reports from the China task menu", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_reports", "", [
          item(
            "menu_reports_whonet",
            "/Report?type=routine&report=ExportWHONETReportByDate",
          ),
          item(
            "menu_reports_patient",
            "/Report?type=patient&report=patientClinical",
          ),
        ]),
      ],
      { profile: MENU_PROFILES.CHINA },
    );

    expect(result[0].childMenus.map((child) => child.menu.elementId)).toEqual([
      "menu_reports_patient",
    ]);
  });

  test("recognizes an encoded restricted report parameter in a server menu URL", () => {
    const result = buildTaskFocusedMenu(
      [
        item("menu_reports", "", [
          item(
            "menu_reports_patient_collection",
            "/Report?type=patient&report=patient%43ollection",
          ),
          item(
            "menu_reports_whonet",
            "/Report?type=patient&report=ExportWHONETReportByDate#launch",
          ),
        ]),
      ],
      { profile: MENU_PROFILES.GLOBAL },
    );

    expect(result[0].childMenus[0].securityRestricted).toBe(true);
    expect(result[0].childMenus[1].securityRestricted).toBe(true);
  });

  test("marks every report in the shared security review registry", () => {
    const restrictedReportItems = [...SECURITY_REVIEW_REPORTS].map(
      (report, index) =>
        item(
          `menu_reports_restricted_${index}`,
          `/Report?type=routine&report=${encodeURIComponent(report)}`,
        ),
    );
    const result = buildTaskFocusedMenu(
      [item("menu_reports", "", restrictedReportItems)],
      { profile: MENU_PROFILES.GLOBAL },
    );

    expect(result[0].childMenus).toHaveLength(SECURITY_REVIEW_REPORTS.size);
    expect(
      result[0].childMenus.every(
        (reportItem) => reportItem.securityRestricted === true,
      ),
    ).toBe(true);
  });
});
