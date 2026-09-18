import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

test("filters configuration areas by category and translated search text", () => {
  render(
    <MemoryRouter
      initialEntries={["/MasterListsPage/testManagementConfigMenu"]}
    >
      <IntlProvider locale="zh" messages={messages}>
        <TestManagementConfigMenu />
      </IntlProvider>
    </MemoryRouter>,
  );

  expect(screen.getAllByTestId("master-data-area")).toHaveLength(8);

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "样本类型" },
  });
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "管理样本类型" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "不存在的配置" },
  });
  expect(screen.queryByTestId("master-data-area")).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配的检验主数据")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(8);

  fireEvent.click(screen.getByRole("combobox", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("option", { name: "规则与计算" }));
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "反射检测配置" })).toBeVisible();
});
