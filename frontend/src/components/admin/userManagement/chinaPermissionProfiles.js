const ROLE_NAMES = Object.freeze({
  GLOBAL_ADMIN: "Global Administrator",
  USER_ACCOUNT_ADMIN: "User Account Administrator",
  AUDIT_TRAIL: "Audit Trail",
  ANALYSER_IMPORT: "Analyser Import",
  RECEPTION: "Reception",
  RESULTS: "Results",
  VALIDATION: "Validation",
  REPORTS: "Reports",
});

export const CHINA_PERMISSION_PROFILES = Object.freeze([
  {
    id: "reception",
    labelId: "user.editor.profile.reception",
    descriptionId: "user.editor.profile.reception.description",
    boundaryId: "user.editor.profile.reception.boundary",
    menuIds: [
      "sidenav.workspace.today",
      "sidenav.workspace.orders",
      "sidenav.workspace.quality",
    ],
    globalRoleNames: [],
    labUnitRoleNames: [ROLE_NAMES.RECEPTION],
  },
  {
    id: "technician",
    labelId: "user.editor.profile.technician",
    descriptionId: "user.editor.profile.technician.description",
    boundaryId: "user.editor.profile.technician.boundary",
    menuIds: ["sidenav.workspace.today", "sidenav.workspace.results"],
    globalRoleNames: [],
    labUnitRoleNames: [ROLE_NAMES.RESULTS],
  },
  {
    id: "reviewer",
    labelId: "user.editor.profile.reviewer",
    descriptionId: "user.editor.profile.reviewer.description",
    boundaryId: "user.editor.profile.reviewer.boundary",
    menuIds: [
      "sidenav.workspace.today",
      "sidenav.workspace.reports",
      "sidenav.workspace.quality",
    ],
    globalRoleNames: [],
    labUnitRoleNames: [ROLE_NAMES.VALIDATION],
  },
  {
    id: "reportIssuer",
    labelId: "user.editor.profile.reportIssuer",
    descriptionId: "user.editor.profile.reportIssuer.description",
    boundaryId: "user.editor.profile.reportIssuer.boundary",
    menuIds: ["sidenav.workspace.today", "sidenav.workspace.reports"],
    globalRoleNames: [],
    labUnitRoleNames: [ROLE_NAMES.REPORTS],
  },
  {
    id: "qualityManager",
    labelId: "user.editor.profile.qualityManager",
    descriptionId: "user.editor.profile.qualityManager.description",
    boundaryId: "user.editor.profile.qualityManager.boundary",
    menuIds: [
      "sidenav.workspace.today",
      "sidenav.workspace.quality",
      "sidenav.workspace.reports",
    ],
    globalRoleNames: [ROLE_NAMES.AUDIT_TRAIL],
    labUnitRoleNames: [ROLE_NAMES.VALIDATION, ROLE_NAMES.REPORTS],
  },
  {
    id: "analyzerOperator",
    labelId: "user.editor.profile.analyzerOperator",
    descriptionId: "user.editor.profile.analyzerOperator.description",
    boundaryId: "user.editor.profile.analyzerOperator.boundary",
    menuIds: [
      "sidenav.workspace.today",
      "sidenav.workspace.results",
      "banner.menu.administration",
    ],
    globalRoleNames: [ROLE_NAMES.ANALYSER_IMPORT],
    labUnitRoleNames: [ROLE_NAMES.RESULTS],
  },
  {
    id: "accountAdmin",
    labelId: "user.editor.profile.accountAdmin",
    descriptionId: "user.editor.profile.accountAdmin.description",
    boundaryId: "user.editor.profile.accountAdmin.boundary",
    menuIds: ["sidenav.workspace.today", "banner.menu.administration"],
    globalRoleNames: [ROLE_NAMES.USER_ACCOUNT_ADMIN],
    labUnitRoleNames: [],
  },
  {
    id: "systemAdmin",
    labelId: "user.editor.profile.systemAdmin",
    descriptionId: "user.editor.profile.systemAdmin.description",
    boundaryId: "user.editor.profile.systemAdmin.boundary",
    menuIds: [
      "sidenav.workspace.today",
      "sidenav.workspace.configuration",
      "banner.menu.administration",
    ],
    globalRoleNames: [ROLE_NAMES.GLOBAL_ADMIN],
    labUnitRoleNames: [],
  },
  {
    id: "auditor",
    labelId: "user.editor.profile.auditor",
    descriptionId: "user.editor.profile.auditor.description",
    boundaryId: "user.editor.profile.auditor.boundary",
    menuIds: ["sidenav.workspace.today", "sidenav.china.analytics"],
    globalRoleNames: [ROLE_NAMES.AUDIT_TRAIL],
    labUnitRoleNames: [],
  },
]);

export const getPermissionProfile = (profileId) =>
  CHINA_PERMISSION_PROFILES.find((profile) => profile.id === profileId) || null;

const roleMapByName = (roles = []) =>
  new Map(
    roles.map((role) => [String(role.roleName || "").trim(), role.roleId]),
  );

export const resolvePermissionProfile = ({
  profile,
  globalRoles = [],
  labUnitRoles = [],
  labUnitId = "",
}) => {
  if (!profile) {
    return {
      globalRoleIds: [],
      selectedTestSectionLabUnits: {},
      missingRoleNames: [],
      requiresLabUnit: false,
      missingLabUnit: false,
    };
  }

  const globalRoleMap = roleMapByName(globalRoles);
  const labUnitRoleMap = roleMapByName(labUnitRoles);
  const missingRoleNames = [];
  const globalRoleIds = profile.globalRoleNames.flatMap((roleName) => {
    const roleId = globalRoleMap.get(roleName);
    if (!roleId) missingRoleNames.push(roleName);
    return roleId ? [roleId] : [];
  });
  const labUnitRoleIds = profile.labUnitRoleNames.flatMap((roleName) => {
    const roleId = labUnitRoleMap.get(roleName);
    if (!roleId) missingRoleNames.push(roleName);
    return roleId ? [roleId] : [];
  });
  const requiresLabUnit = profile.labUnitRoleNames.length > 0;
  const missingLabUnit = requiresLabUnit && !labUnitId;

  return {
    globalRoleIds,
    selectedTestSectionLabUnits:
      !missingLabUnit && labUnitRoleIds.length > 0
        ? { [labUnitId]: labUnitRoleIds }
        : {},
    missingRoleNames: [...new Set(missingRoleNames)],
    requiresLabUnit,
    missingLabUnit,
  };
};

export const findDutySeparationConflicts = (
  selectedTestSectionLabUnits = {},
  labUnitRoles = [],
) => {
  const roleNameById = new Map(
    labUnitRoles.map((role) => [
      role.roleId,
      String(role.roleName || "").trim(),
    ]),
  );

  return Object.entries(selectedTestSectionLabUnits)
    .filter(([, roleIds]) => {
      const names = new Set((roleIds || []).map((id) => roleNameById.get(id)));
      return names.has(ROLE_NAMES.RESULTS) && names.has(ROLE_NAMES.VALIDATION);
    })
    .map(([labUnitId]) => labUnitId);
};

export { ROLE_NAMES };
