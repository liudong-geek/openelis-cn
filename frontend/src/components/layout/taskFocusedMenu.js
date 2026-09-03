import { isSecurityRestrictedReport } from "../reports/reportAvailability";

export const MENU_PROFILES = Object.freeze({
  CHINA: "china",
  GLOBAL: "global",
});

const ROLE_NAMES = Object.freeze({
  GLOBAL_ADMIN: "Global Administrator",
  USER_ACCOUNT_ADMIN: "User Account Administrator",
  AUDIT_TRAIL: "Audit Trail",
  ANALYSER_IMPORT: "Analyser Import",
  LAB_SUPERVISOR: "Lab Supervisor",
  RECEPTION: "Reception",
  RESULTS: "Results",
  VALIDATION: "Validation",
  REPORTS: "Reports",
});

const KNOWN_ROLES = new Set(Object.values(ROLE_NAMES));

const CORE_MENU_IDS = new Set([
  "menu_home",
  "menu_sample",
  "menu_patient",
  "menu_results",
  "menu_resultvalidation",
  "menu_reports",
  "menu_admin",
  "menu_administration",
]);

const ADMIN_MENU_ALIASES = new Set(["menu_admin", "menu_administration"]);

const ORDER_WORKFLOW_SPECIMEN_IDS = new Set([
  "menu_order_collect",
  "menu_order_label",
  "menu_order_qa",
]);

const SPECIMEN_CHILD_IDS = new Set([
  ...ORDER_WORKFLOW_SPECIMEN_IDS,
  "menu_sample_management",
  "menu_sample_print_barcode",
  "menu_sample_shipment",
]);

const RESULT_CHILD_IDS = new Set(["menu_generic_sample_results"]);

const ANALYTICS_CHILD_IDS = new Set([
  "menu_reports_tatreport",
  "menu_reports_statistics",
  "menu_reports_audittrail",
  "menu_reports_auditTrail",
]);

const ANALYZER_QC_ELEMENT_ID = "menu_analyzers_qc";

const CHINA_TOP_LEVEL_DISPLAY_KEYS = Object.freeze({
  workspace: "banner.menu.home",
  orders: "banner.menu.sample",
  patients: "banner.menu.patient",
  specimens: "sidenav.china.specimens",
  results: "banner.menu.results",
  validation: "banner.menu.resultvalidation",
  reports: "banner.menu.reports",
  analytics: "sidenav.china.analytics",
  quality: "sidenav.china.quality",
  administration: "banner.menu.administration",
});

const CHINA_ITEM_DISPLAY_KEYS = Object.freeze({
  menu_order_dashboard: "sidenav.label.order.active",
  menu_order_enter: "sidenav.label.order.new",
  menu_sample_edit: "sidenav.label.editorder",
  menu_sample_print_barcode: "workspace.barcode.preprint",
  menu_order_collect: "sidenav.label.order.collect",
  menu_order_label: "sidenav.label.order.label",
  menu_order_qa: "sidenav.label.order.qa",
  menu_patient_add_or_edit: "banner.menu.patient.addOrEdit",
  menu_patienthistory: "banner.menu.patienthistory",
  menu_patient_history: "banner.menu.patienthistory",
  menu_patient_merge: "banner.menu.patient.merge",
  menu_results_unified: "banner.menu.results.unified",
  menu_resultvalidation_routine: "sidenav.label.validation.routine",
  menu_reports_tatreport: "sideNav.title.tatreport",
  menu_reports_audittrail: "sideNav.label.audittrail",
  menu_reports_auditTrail: "sideNav.label.audittrail",
});

// Menu endpoints must represent the page users actually land on. Keeping a
// parent URL that immediately redirects to a default child makes the active
// navigation state flash and breaks direct-entry expectations.
const CHINA_ITEM_ACTION_URLS = Object.freeze({
  menu_sample_shipment: "/SampleShipment/boxes",
  menu_sample_print_barcode: "/PrintBarcode?mode=preprint",
});

/**
 * Message ids consumed by the China information architecture. The language
 * bundles are maintained separately so menu behavior can be reviewed and
 * tested without embedding visible copy in JavaScript.
 */
export const CHINA_MENU_MESSAGE_IDS = Object.freeze([
  ...Object.values(CHINA_TOP_LEVEL_DISPLAY_KEYS),
  ...new Set(Object.values(CHINA_ITEM_DISPLAY_KEYS)),
]);

const CHINA_HIDDEN_ELEMENT_ID_PATTERNS = [
  /^menu_help(?:_|$)/i,
  /^(?:generic_program|order_programmes)$/i,
  /^menu_generic_sample(?:_|$)/i,
  // The modern specimen worklist already provides aliquoting with quantity,
  // hierarchy and concurrency checks. Do not expose the superseded standalone
  // form as a second China-menu task.
  /^menu_aliquot(?:_|$)/i,
  /^menu_(?:pathology|immunochem|cytology|notebook)(?:_|$)/i,
  /^menu_(?:sample|patient)_create(?:_|$)/i,
  /^menu_study_/i,
  /(?:^|[_.])(?:study|research|arv|eid|haiti|indeterminate|vl)(?:[_.]|$)/i,
];

const CHINA_HIDDEN_ACTION_PATTERNS = [
  /^\/GenericSample(?:\/|[?#]|$)/i,
  /^\/genericProgram(?:\/|[?#]|$)/i,
  /\/(?:Sample|Patient)(?:Entry|Edit)ByProject/i,
  /\/documentation\//i,
  /[?&]report=[^&#]*(?:haiti|retroci|cistudy|cisample|cilnsp|ipci)/i,
  /[?&]report=[^&#]*patient(?:arv|eid|vl|indeterminate)/i,
];

const isBlank = (value) =>
  typeof value !== "string" || value.trim().length === 0;

const getElementId = (item) => item?.menu?.elementId || "";

const getActionURL = (item) => item?.menu?.actionURL || "";

const withDisplayKey = (item, displayKey) => ({
  ...item,
  menu: {
    ...(item?.menu || {}),
    displayKey,
    toolTipKey: displayKey,
  },
});

const hasNavigableContent = (item) =>
  Boolean(item) &&
  (!isBlank(getActionURL(item)) || (item.childMenus || []).length > 0);

const isChinaHidden = (item) => {
  const elementId = getElementId(item);
  const actionURL = getActionURL(item);

  return (
    CHINA_HIDDEN_ELEMENT_ID_PATTERNS.some((pattern) =>
      pattern.test(elementId),
    ) || CHINA_HIDDEN_ACTION_PATTERNS.some((pattern) => pattern.test(actionURL))
  );
};

export const getReportNameFromActionURL = (actionURL) => {
  if (typeof actionURL !== "string" || actionURL.trim().length === 0) {
    return null;
  }

  try {
    return new URL(actionURL, "http://openelis.local").searchParams.get(
      "report",
    );
  } catch {
    return null;
  }
};

export const isBackendDocumentAction = (actionURL) =>
  typeof actionURL === "string" &&
  /(?:^|\/)ReportPrint(?:[?#]|$)/i.test(actionURL.trim());

const cloneMenu = (item, profile = MENU_PROFILES.GLOBAL) => {
  if (!item?.menu || item.menu.isActive === false) return null;
  if (profile === MENU_PROFILES.CHINA && isChinaHidden(item)) return null;

  const actionURL = getActionURL(item);
  const securityRestricted = isSecurityRestrictedReport(
    getReportNameFromActionURL(actionURL),
  );
  // China delivery hides reports that are still awaiting data-scope security
  // adaptation. Showing a disabled technical placeholder is not a usable
  // clinical task and makes the navigation look unfinished.
  if (profile === MENU_PROFILES.CHINA && securityRestricted) return null;
  const elementId = getElementId(item);
  const normalizedActionURL =
    profile === MENU_PROFILES.CHINA
      ? CHINA_ITEM_ACTION_URLS[elementId] || actionURL
      : actionURL;
  const backendDocument = isBackendDocumentAction(normalizedActionURL);
  const displayKey =
    profile === MENU_PROFILES.CHINA
      ? CHINA_ITEM_DISPLAY_KEYS[elementId] || item.menu.displayKey
      : item.menu.displayKey;

  const clonedItem = {
    ...item,
    securityRestricted: item?.securityRestricted === true || securityRestricted,
    menu: {
      ...item.menu,
      actionURL: normalizedActionURL,
      navigationMode: backendDocument ? "document" : item.menu.navigationMode,
      openInNewWindow: backendDocument ? true : item.menu.openInNewWindow,
      displayKey,
      toolTipKey:
        profile === MENU_PROFILES.CHINA && CHINA_ITEM_DISPLAY_KEYS[elementId]
          ? displayKey
          : item.menu.toolTipKey,
    },
    childMenus: (item.childMenus || [])
      .map((child) => cloneMenu(child, profile))
      .filter(Boolean),
  };

  return profile === MENU_PROFILES.CHINA && !hasNavigableContent(clonedItem)
    ? null
    : clonedItem;
};

const createGroup = (elementId, displayKey, childMenus) => ({
  menu: {
    elementId,
    displayKey,
    toolTipKey: displayKey,
    actionURL: "",
    isActive: true,
    openInNewWindow: false,
  },
  childMenus,
  expanded: false,
});

const uniqueByElementId = (items) => {
  const seen = new Set();
  return (items || []).filter((item) => {
    const elementId = getElementId(item);
    if (!elementId || seen.has(elementId)) return false;
    seen.add(elementId);
    return true;
  });
};

const hasKnownRole = (roleSet) =>
  [...roleSet].some((role) => KNOWN_ROLES.has(role));

const canUseRoleSlice = (roleSet, allowedRoles) =>
  !hasKnownRole(roleSet) || allowedRoles.some((role) => roleSet.has(role));

const roleSetFromOptions = (options) =>
  new Set(Array.isArray(options?.roles) ? options.roles : []);

const isLegacyOrderEntry = (item) =>
  getElementId(item) === "menu_sample_add" &&
  /^\/SamplePatientEntry(?:\.do)?(?:[?#]|$)/i.test(getActionURL(item));

const splitOrderSource = (source) => {
  if (!source) {
    return { orderRoot: null, specimenItems: [], resultItems: [] };
  }

  const orderChildren = [];
  const specimenItems = [];
  const resultItems = [];

  const addChild = (child) => {
    const elementId = getElementId(child);
    if (isLegacyOrderEntry(child)) return;
    if (SPECIMEN_CHILD_IDS.has(elementId)) {
      specimenItems.push(child);
    } else if (RESULT_CHILD_IDS.has(elementId)) {
      resultItems.push(child);
    } else {
      orderChildren.push(child);
    }
  };

  (source.childMenus || []).forEach((child) => {
    if (getElementId(child) === "menu_order_workflow") {
      (child.childMenus || []).forEach(addChild);
    } else {
      addChild(child);
    }
  });

  return {
    orderRoot: { ...source, childMenus: uniqueByElementId(orderChildren) },
    specimenItems: uniqueByElementId(specimenItems),
    resultItems: uniqueByElementId(resultItems),
  };
};

const splitReports = (source) => {
  if (!source) return { reportRoot: null, analyticsItems: [] };

  const reportChildren = [];
  const analyticsItems = [];
  (source.childMenus || []).forEach((child) => {
    if (ANALYTICS_CHILD_IDS.has(getElementId(child))) {
      analyticsItems.push(child);
    } else {
      reportChildren.push(child);
    }
  });

  return {
    reportRoot: { ...source, childMenus: reportChildren },
    analyticsItems,
  };
};

const splitAnalyzerSource = (source) => {
  if (!source) return { analyzerRoot: null, qualityItems: [] };

  const analyzerChildren = [];
  const qualityItems = [];
  (source.childMenus || []).forEach((child) => {
    if (getElementId(child) === ANALYZER_QC_ELEMENT_ID) {
      qualityItems.push(child);
    } else {
      analyzerChildren.push(child);
    }
  });

  return {
    analyzerRoot: {
      ...source,
      childMenus: uniqueByElementId(analyzerChildren),
    },
    qualityItems: uniqueByElementId(qualityItems),
  };
};

const isSpecimenRoot = (elementId) =>
  /^menu_(?:storage|inventory|aliquot|shipment|sample_shipment|sample_transfer)/i.test(
    elementId,
  );

const isResultsRoot = (elementId) =>
  /^menu_(?:workplan|pathology|immunochem|cytology|notebook)/i.test(elementId);

const isQualityRoot = (elementId) =>
  /^menu_(?:nonconform|non_conform|eqa|alerts?|qc|quality)/i.test(elementId);

const isSystemRoot = (elementId) =>
  /^menu_(?:admin|administration|analyzers?|billing)/i.test(elementId);

const allowedSpecimenRoles = (item) => {
  const elementId = getElementId(item);
  if (ORDER_WORKFLOW_SPECIMEN_IDS.has(elementId)) {
    return [ROLE_NAMES.RECEPTION];
  }
  if (/inventory/i.test(elementId)) {
    return [ROLE_NAMES.RESULTS, ROLE_NAMES.GLOBAL_ADMIN];
  }
  if (/aliquot/i.test(elementId)) {
    return [ROLE_NAMES.RECEPTION];
  }
  return [ROLE_NAMES.RECEPTION, ROLE_NAMES.RESULTS, ROLE_NAMES.GLOBAL_ADMIN];
};

const allowedQualityRoles = (item) => {
  const elementId = getElementId(item);
  if (/non_?conform/i.test(elementId)) {
    return [
      ROLE_NAMES.RECEPTION,
      ROLE_NAMES.VALIDATION,
      ROLE_NAMES.LAB_SUPERVISOR,
    ];
  }
  if (/^(?:menu_)?(?:eqa|alerts?)/i.test(elementId)) {
    return [
      ROLE_NAMES.RECEPTION,
      ROLE_NAMES.RESULTS,
      ROLE_NAMES.LAB_SUPERVISOR,
    ];
  }
  return [
    ROLE_NAMES.ANALYSER_IMPORT,
    ROLE_NAMES.LAB_SUPERVISOR,
    ROLE_NAMES.GLOBAL_ADMIN,
  ];
};

const allowedSystemRoles = (item) => {
  const elementId = getElementId(item);
  if (/analyzers?/i.test(elementId)) {
    return [ROLE_NAMES.ANALYSER_IMPORT, ROLE_NAMES.GLOBAL_ADMIN];
  }
  return [ROLE_NAMES.GLOBAL_ADMIN];
};

const allowedAnalyticsRoles = (item) =>
  /audittrail/i.test(getElementId(item))
    ? [ROLE_NAMES.GLOBAL_ADMIN, ROLE_NAMES.AUDIT_TRAIL]
    : [ROLE_NAMES.REPORTS];

const filterItemsByRoles = (
  items,
  roleSet,
  getAllowedRoles,
  requiresExplicitRole = () => false,
) =>
  (items || []).filter((item) => {
    const allowedRoles = getAllowedRoles(item);
    return requiresExplicitRole(item)
      ? allowedRoles.some((role) => roleSet.has(role))
      : canUseRoleSlice(roleSet, allowedRoles);
  });

const mergeAdminAliases = (adminItems) => {
  if (adminItems.length === 0) return null;

  const primary =
    adminItems.find((item) => getElementId(item) === "menu_administration") ||
    adminItems[0];
  const mergedChildren = uniqueByElementId(
    adminItems.flatMap((item) => item.childMenus || []),
  );

  return { ...primary, childMenus: mergedChildren };
};

const addIfVisible = (target, item) => {
  if (hasNavigableContent(item)) target.push(item);
};

/**
 * Keep the order workflow visible as a simple two-level task list. The legacy
 * SamplePatientEntry link remains routable for bookmarks, but is removed from
 * the primary menu because /order/enter is the supported entry experience.
 * This function retains the global menu's legacy grouping; the China profile
 * further separates specimen work into its own first-level area.
 */
export const normalizeOrderMenu = (orderMenu) => {
  const cloned = cloneMenu(orderMenu, MENU_PROFILES.GLOBAL);
  if (!cloned) return cloned;

  const workflow = cloned.childMenus.find(
    (child) => getElementId(child) === "menu_order_workflow",
  );

  if (!workflow) return cloned;

  const workflowChildren = workflow.childMenus || [];
  const secondaryChildren = cloned.childMenus.filter((child) => {
    if (getElementId(child) === "menu_order_workflow") return false;
    return !isLegacyOrderEntry(child);
  });

  cloned.childMenus = [...workflowChildren];
  if (secondaryChildren.length > 0) {
    cloned.childMenus.push(
      createGroup(
        "menu_order_more",
        "sidenav.label.order.more",
        secondaryChildren,
      ),
    );
  }

  return cloned;
};

const buildGlobalTaskFocusedMenu = (items) => {
  const authorizedItems = items
    .map((item) => cloneMenu(item, MENU_PROFILES.GLOBAL))
    .filter(Boolean)
    .map((item) =>
      getElementId(item) === "menu_sample" ? normalizeOrderMenu(item) : item,
    );

  const coreItems = authorizedItems.filter((item) =>
    CORE_MENU_IDS.has(getElementId(item)),
  );
  const additionalItems = authorizedItems.filter(
    (item) => !CORE_MENU_IDS.has(getElementId(item)),
  );

  if (additionalItems.length === 0) return coreItems;

  return [
    ...coreItems,
    createGroup(
      "menu_more_functions",
      "sidenav.label.moreFunctions",
      additionalItems,
    ),
  ];
};

const buildChinaMenu = (items, options) => {
  const roleSet = roleSetFromOptions(options);
  const roots = items
    .map((item) => cloneMenu(item, MENU_PROFILES.CHINA))
    .filter(Boolean);
  const byId = new Map(roots.map((item) => [getElementId(item), item]));
  const consumed = new Set();
  const take = (elementId) => {
    const item = byId.get(elementId) || null;
    if (item) consumed.add(elementId);
    return item;
  };
  const takeMatching = (predicate) =>
    roots.filter((item) => {
      const elementId = getElementId(item);
      if (consumed.has(elementId) || !predicate(elementId)) return false;
      consumed.add(elementId);
      return true;
    });

  const output = [];

  const home = take("menu_home");
  if (home) {
    addIfVisible(
      output,
      withDisplayKey(home, CHINA_TOP_LEVEL_DISPLAY_KEYS.workspace),
    );
  }

  const sampleSplit = splitOrderSource(take("menu_sample"));
  const genericSplit = splitOrderSource(take("menu_generic_sample"));
  const orderExtras = [];
  if (hasNavigableContent(genericSplit.orderRoot)) {
    orderExtras.push(genericSplit.orderRoot);
  }
  let orderRoot = sampleSplit.orderRoot || genericSplit.orderRoot;
  if (orderRoot && sampleSplit.orderRoot) {
    orderRoot = {
      ...orderRoot,
      childMenus: uniqueByElementId([
        ...(orderRoot.childMenus || []),
        ...orderExtras,
      ]),
    };
  }
  if (
    orderRoot?.childMenus?.some(
      (child) => getElementId(child) === "menu_order_dashboard",
    )
  ) {
    orderRoot.childMenus = orderRoot.childMenus.filter(
      (child) =>
        !["menu_order_enter", "menu_sample_edit"].includes(getElementId(child)),
    );
  }
  if (canUseRoleSlice(roleSet, [ROLE_NAMES.RECEPTION])) {
    addIfVisible(
      output,
      orderRoot
        ? withDisplayKey(orderRoot, CHINA_TOP_LEVEL_DISPLAY_KEYS.orders)
        : null,
    );
  }

  const patient = take("menu_patient");
  // Retire duplicate entries only if their authorized list is present.
  if (
    patient?.childMenus?.some(
      (child) => getActionURL(child) === "/PatientManagement",
    )
  ) {
    patient.childMenus = patient.childMenus.filter(
      (child) =>
        !["menu_patienthistory", "menu_patient_history"].includes(
          getElementId(child),
        ),
    );
  }
  if (canUseRoleSlice(roleSet, [ROLE_NAMES.RECEPTION])) {
    addIfVisible(
      output,
      patient
        ? withDisplayKey(patient, CHINA_TOP_LEVEL_DISPLAY_KEYS.patients)
        : null,
    );
  }

  const movedSpecimenItems = uniqueByElementId([
    ...sampleSplit.specimenItems,
    ...genericSplit.specimenItems,
  ]);
  const specimenRoots = takeMatching(isSpecimenRoot);
  const roleVisibleSpecimenItems = filterItemsByRoles(
    [...movedSpecimenItems, ...specimenRoots],
    roleSet,
    allowedSpecimenRoles,
  );
  if (roleVisibleSpecimenItems.length > 0) {
    const storageRoot = roleVisibleSpecimenItems.find(
      (item) => getElementId(item) === "menu_storage",
    );
    const remainingSpecimenItems = roleVisibleSpecimenItems.filter(
      (item) => item !== storageRoot,
    );
    const specimenRoot = storageRoot
      ? {
          ...withDisplayKey(
            storageRoot,
            CHINA_TOP_LEVEL_DISPLAY_KEYS.specimens,
          ),
          childMenus: uniqueByElementId([
            ...movedSpecimenItems.filter((item) =>
              roleVisibleSpecimenItems.includes(item),
            ),
            ...(storageRoot.childMenus || []),
            ...remainingSpecimenItems.filter(
              (item) => !movedSpecimenItems.includes(item),
            ),
          ]),
        }
      : createGroup(
          "menu_specimen_management",
          CHINA_TOP_LEVEL_DISPLAY_KEYS.specimens,
          roleVisibleSpecimenItems,
        );
    addIfVisible(output, specimenRoot);
  }

  const results = take("menu_results");
  const resultExtras = [
    ...genericSplit.resultItems,
    ...takeMatching(isResultsRoot),
  ];
  const resultChildren = filterItemsByRoles(
    [...(results?.childMenus || []), ...resultExtras],
    roleSet,
    (item) =>
      /analy[sz]erresults/i.test(getActionURL(item))
        ? [ROLE_NAMES.ANALYSER_IMPORT]
        : [ROLE_NAMES.RESULTS],
  );
  const canSeeCoreResults = canUseRoleSlice(roleSet, [ROLE_NAMES.RESULTS]);
  const canSeeAnalyzerResults = resultChildren.some((item) =>
    /analy[sz]erresults/i.test(getActionURL(item)),
  );
  if ((canSeeCoreResults || canSeeAnalyzerResults) && results) {
    addIfVisible(
      output,
      withDisplayKey(
        { ...results, childMenus: uniqueByElementId(resultChildren) },
        CHINA_TOP_LEVEL_DISPLAY_KEYS.results,
      ),
    );
  }

  const validation = take("menu_resultvalidation");
  if (canUseRoleSlice(roleSet, [ROLE_NAMES.VALIDATION])) {
    addIfVisible(
      output,
      validation
        ? withDisplayKey(validation, CHINA_TOP_LEVEL_DISPLAY_KEYS.validation)
        : null,
    );
  }

  const reportSplit = splitReports(take("menu_reports"));
  if (canUseRoleSlice(roleSet, [ROLE_NAMES.REPORTS])) {
    addIfVisible(
      output,
      reportSplit.reportRoot
        ? withDisplayKey(
            reportSplit.reportRoot,
            CHINA_TOP_LEVEL_DISPLAY_KEYS.reports,
          )
        : null,
    );
  }

  const analyticsItems = filterItemsByRoles(
    reportSplit.analyticsItems,
    roleSet,
    allowedAnalyticsRoles,
  );
  if (analyticsItems.length > 0) {
    output.push(
      createGroup(
        "menu_query_statistics",
        CHINA_TOP_LEVEL_DISPLAY_KEYS.analytics,
        analyticsItems,
      ),
    );
  }

  const analyzerSplit = splitAnalyzerSource(take("menu_analyzers"));

  const qualityItems = filterItemsByRoles(
    [...takeMatching(isQualityRoot), ...analyzerSplit.qualityItems],
    roleSet,
    allowedQualityRoles,
    (item) => getElementId(item) === ANALYZER_QC_ELEMENT_ID,
  );
  if (qualityItems.length > 0) {
    output.push(
      createGroup(
        "menu_quality_management",
        CHINA_TOP_LEVEL_DISPLAY_KEYS.quality,
        qualityItems,
      ),
    );
  }

  const adminAliases = takeMatching((elementId) =>
    ADMIN_MENU_ALIASES.has(elementId),
  );
  const systemItems = uniqueByElementId([
    ...takeMatching(isSystemRoot).filter(
      (item) => !ADMIN_MENU_ALIASES.has(getElementId(item)),
    ),
    analyzerSplit.analyzerRoot,
  ]).filter(Boolean);
  const visibleAdminRoot = canUseRoleSlice(roleSet, [
    ROLE_NAMES.GLOBAL_ADMIN,
    ROLE_NAMES.USER_ACCOUNT_ADMIN,
  ])
    ? mergeAdminAliases(adminAliases)
    : null;
  const visibleSystemItems = filterItemsByRoles(
    systemItems,
    roleSet,
    allowedSystemRoles,
    (item) => /analyzers?/i.test(getElementId(item)),
  );
  if (visibleAdminRoot || visibleSystemItems.length > 0) {
    const systemRoot = visibleAdminRoot
      ? {
          ...withDisplayKey(
            visibleAdminRoot,
            CHINA_TOP_LEVEL_DISPLAY_KEYS.administration,
          ),
          childMenus: uniqueByElementId([
            ...(visibleAdminRoot.childMenus || []),
            ...visibleSystemItems,
          ]),
        }
      : createGroup(
          "menu_system_management",
          CHINA_TOP_LEVEL_DISPLAY_KEYS.administration,
          visibleSystemItems,
        );
    addIfVisible(output, systemRoot);
  }

  return output;
};

/**
 * Reorganize only menu items already returned by the server. The China profile
 * is the delivery default for this distribution; callers can request the
 * upstream/global grouping explicitly. Passing session roles enables the same
 * first-level visibility slices enforced by the routed work areas. Unknown or
 * absent roles intentionally fall back to the server menu for compatibility.
 */
export const buildTaskFocusedMenu = (items = [], options = {}) => {
  const profile = options.profile || MENU_PROFILES.CHINA;
  return profile === MENU_PROFILES.CHINA
    ? buildChinaMenu(items, options)
    : buildGlobalTaskFocusedMenu(items);
};

export { CORE_MENU_IDS, ROLE_NAMES };
