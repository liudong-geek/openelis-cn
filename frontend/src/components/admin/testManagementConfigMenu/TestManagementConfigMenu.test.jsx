import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/zh.json";
import TestManagementConfigMenu from "./TestManagementConfigMenu";

test("groups master data by object and removes duplicate test CRUD entry points", () => {
  render(
    <MemoryRouter
      initialEntries={["/MasterListsPage/testManagementConfigMenu"]}
    >
      <IntlProvider locale="zh" messages={messages}>
        <TestManagementConfigMenu />
      </IntlProvider>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("heading", { name: "检验主数据", level: 1 }),
  ).toBeVisible();
  const paths = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
  expect(paths).toContain("/MasterListsPage/TestCatalogList");
  expect(paths).toContain("/MasterListsPage/SampleTypeManagement");
  expect(paths).toContain("/MasterListsPage/PanelManagement");
  for (const old of [
    "TestAdd",
    "TestRenameEntry",
    "TestModifyEntry",
    "TestActivation",
    "TestOrderability",
  ]) {
    expect(paths).not.toContain("/MasterListsPage/" + old);
  }
});
