import {
  hasPatientManagementMenu,
  hasPatientHistoryMenu,
  canViewPatientHistory,
  navigationMenuOwner,
} from "./navigationMenuAvailability";

const item = (elementId, isActive, childMenus = []) => ({
  menu: { elementId, isActive },
  childMenus,
});
const tree = (root, child) => [
  item("menu_patient", root, [item("menu_patient_add_or_edit", child)]),
];

test("uses only the active patient root and its actual maintenance child", () => {
  expect(hasPatientManagementMenu(tree(true, true))).toBe(true);
  expect(
    hasPatientManagementMenu([item("menu_main", true, tree(true, true))]),
  ).toBe(true);
  expect(
    hasPatientManagementMenu([item("menu_main", false, tree(true, true))]),
  ).toBe(false);
  expect(
    hasPatientManagementMenu([
      item("menu_other", true, [item("menu_patient_add_or_edit", true)]),
    ]),
  ).toBe(false);
});

test.each([false, undefined, null, "true", 1])(
  "unknown or inactive flag %s does not supply navigation availability",
  (flag) => {
    expect(hasPatientManagementMenu(tree(flag, true))).toBe(false);
    expect(hasPatientManagementMenu(tree(true, flag))).toBe(false);
  },
);

test.each([
  undefined,
  null,
  [],
  {},
  [item("menu_patient", true)],
  [item("menu_patient_add_or_edit", true)],
])("missing patient root/child data %s has no fallback entry", (menus) =>
  expect(hasPatientManagementMenu(menus)).toBe(false),
);

test("navigation snapshots are bound to the same identity, role and lab context as Header reads", () => {
  const details = {
    authenticated: true,
    userId: "1",
    sessionId: "SIM-session",
    loginLabUnit: "2",
    roles: ["Reception"],
    userLabRolesMap: { 2: ["Results"] },
  };
  const owner = navigationMenuOwner(details);
  expect(owner).not.toBeNull();
  [
    { userId: "3" },
    { sessionId: "SIM-other-session" },
    { loginLabUnit: "4" },
    { roles: ["Results"] },
    { userLabRolesMap: {} },
  ].forEach((changed) =>
    expect(navigationMenuOwner({ ...details, ...changed })).not.toBe(owner),
  );
  expect(navigationMenuOwner({ ...details, authenticated: false })).toBeNull();
  expect(navigationMenuOwner({ ...details, userId: "" })).toBeNull();
  expect(navigationMenuOwner({ ...details, sessionId: "" })).toBeNull();
  expect(navigationMenuOwner(null)).toBeNull();
});

test("history uses its exact direct child and active ancestry, independent of research creation", () => {
  const history = (active) => [
    item("menu_patient", true, [
      item("menu_patient_add_or_edit", true),
      item("menu_patienthistory", active),
      item("menu_patient_create", false),
    ]),
  ];
  expect(hasPatientHistoryMenu(history(true))).toBe(true);
  expect(hasPatientHistoryMenu(history(false))).toBe(false);
  expect(hasPatientHistoryMenu(history("true"))).toBe(false);
  expect(hasPatientHistoryMenu([item("menu_main", false, history(true))])).toBe(
    false,
  );
  const duplicate = history(true);
  duplicate[0].childMenus.push(item("menu_patienthistory", false));
  expect(hasPatientHistoryMenu(duplicate)).toBe(false);
  expect(hasPatientHistoryMenu([item("menu_patienthistory", true)])).toBe(
    false,
  );
  expect(
    hasPatientHistoryMenu([
      item("menu_patient", true, [item("menu_patient_history", true)]),
    ]),
  ).toBe(false);
  expect(hasPatientHistoryMenu(null)).toBe(false);
});

test("history shortcut still needs the exact authenticated results route role", () => {
  const details = {
    authenticated: true,
    userId: "history-user",
    sessionId: "history-session",
    roles: ["Reception"],
  };
  const menus = [
    item("menu_patient", true, [item("menu_patienthistory", true)]),
  ];
  expect(canViewPatientHistory(details, menus)).toBe(true);
  for (const role of ["Results", "Reports"])
    expect(canViewPatientHistory({ ...details, roles: [role] }, menus)).toBe(
      true,
    );
  expect(
    canViewPatientHistory(
      { ...details, roles: ["User Account Administrator"] },
      menus,
    ),
  ).toBe(false);
  expect(
    canViewPatientHistory({ ...details, authenticated: false }, menus),
  ).toBe(false);
  expect(canViewPatientHistory({ ...details, sessionId: "" }, menus)).toBe(
    false,
  );
  expect(canViewPatientHistory(details, null)).toBe(false);
});
