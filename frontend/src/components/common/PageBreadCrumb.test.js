import { getResolvedLabelId } from "./PageBreadCrumb";

test("assigns user and runtime administration routes to system management", () => {
  expect(
    getResolvedLabelId(
      "breadcrums.admin.managment",
      "/MasterListsPage/userManagement",
    ),
  ).toBe("banner.menu.administration");
  expect(
    getResolvedLabelId(
      "breadcrums.admin.managment",
      "/MasterListsPage/commonproperties",
    ),
  ).toBe("banner.menu.administration");
  expect(
    getResolvedLabelId(
      "breadcrums.admin.managment",
      "/MasterListsPage/SampleTypeManagement",
    ),
  ).toBe("sidenav.workspace.configuration");
});
