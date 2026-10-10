import { canLaunchNceCapa, nceMenuAvailability } from "./nceMenuAvailability";
import { navigationMenus } from "./nceWorkspace.testData";

const none = { registration: false, view: false, capa: false };
const item = (elementId, isActive, childMenus = []) => ({
  menu: { elementId, isActive },
  childMenus,
});

test("the three original IDs map independently under the actual dashboard chain", () => {
  expect(nceMenuAvailability(navigationMenus())).toEqual({
    registration: true,
    view: true,
    capa: true,
  });
  for (const key of ["registration", "view", "capa"]) {
    expect(nceMenuAvailability(navigationMenus({ [key]: false }))).toEqual({
      registration: key !== "registration",
      view: key !== "view",
      capa: key !== "capa",
    });
  }
});

test.each(["root", "dashboard"])(
  "the original %s must remain active even with all three task flags enabled",
  (key) => {
    expect(nceMenuAvailability(navigationMenus({ [key]: false }))).toEqual(
      none,
    );
  },
);

test.each([null, undefined, {}, []])(
  "missing or unknown owner-bound snapshot %j cannot manufacture an entry",
  (menus) => {
    expect(nceMenuAvailability(menus)).toEqual(none);
  },
);

test.each([false, null, undefined, "true", 1])(
  "ancestor activity must be explicit true rather than %j",
  (isActive) => {
    expect(
      nceMenuAvailability([item("menu_main", isActive, navigationMenus())]),
    ).toEqual(none);
  },
);

test("each task and the dashboard retain their nested ancestor active chain", () => {
  const menus = navigationMenus();
  const report = menus[0].childMenus.splice(1, 1)[0];
  menus[0].childMenus.push(item("menu_report_parent", false, [report]));
  expect(nceMenuAvailability(menus)).toEqual({
    registration: false,
    view: true,
    capa: true,
  });
  menus[0].childMenus[3].menu.isActive = true;
  expect(nceMenuAvailability(menus).registration).toBe(true);
  const dashboard = menus[0].childMenus.splice(0, 1)[0];
  menus[0].childMenus.push(item("menu_dashboard_parent", false, [dashboard]));
  expect(nceMenuAvailability(menus)).toEqual(none);
});

test("matching routes or flags outside the exact original root cannot grant entries", () => {
  const menus = navigationMenus();
  menus[0].childMenus = menus[0].childMenus.filter(
    (entry) => entry.menu.elementId !== "menu_non_conforming_report",
  );
  menus.push(
    item("menu_other_root", true, [item("menu_non_conforming_report", true)]),
  );
  menus[0].childMenus.push({
    menu: {
      elementId: "alias_report",
      isActive: true,
      actionURL: "/ReportNonConformingEvent",
    },
    childMenus: [],
  });
  expect(nceMenuAvailability(menus).registration).toBe(false);
});

test("duplicate original identities fail closed even when one copy is active", () => {
  const menus = navigationMenus();
  menus.push(item("menu_nonconformity", false));
  expect(nceMenuAvailability(menus)).toEqual(none);
  const repeatedChild = navigationMenus();
  repeatedChild[0].childMenus.push(item("menu_non_conforming_report", false));
  expect(nceMenuAvailability(repeatedChild).registration).toBe(false);
});

test.each([
  {},
  { canAcknowledge: true },
  { canAssign: true },
  { canAddNote: true },
  { canAssign: true, canAddNote: false },
  { canAssign: "true", canAddNote: true },
])(
  "menu ON cannot grant absent current object UPDATE capabilities %j",
  (row) => {
    expect(canLaunchNceCapa(nceMenuAvailability(navigationMenus()), row)).toBe(
      false,
    );
  },
);

test("CAPA launch also requires the exact view and CAPA flags with current UPDATE", () => {
  const row = { canAssign: true, canAddNote: true };
  expect(canLaunchNceCapa(nceMenuAvailability(navigationMenus()), row)).toBe(
    true,
  );
  for (const key of ["root", "dashboard", "view", "capa"]) {
    expect(
      canLaunchNceCapa(
        nceMenuAvailability(navigationMenus({ [key]: false })),
        row,
      ),
    ).toBe(false);
  }
});
