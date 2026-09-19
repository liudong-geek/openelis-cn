import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import messages from "../../../languages/zh.json";
import InterfaceWorkspace from "./InterfaceWorkspace";

const renderWorkspace = ({
  route = "/MasterListsPage/interfaceWorkspace",
  roles = ["Global Administrator", "Analyser Import"],
} = {}) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { roles } }}
        >
          <InterfaceWorkspace />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

test("consolidates permitted analyzer and interface settings", () => {
  renderWorkspace();

  expect(
    screen.getByRole("heading", { name: "仪器与接口配置", level: 1 }),
  ).toBeVisible();
  expect(screen.getAllByTestId("interface-workspace-area")).toHaveLength(4);

  const paths = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
  expect(paths).toContain("/analyzers");
  expect(paths).toContain("/MasterListsPage/AnalyzerTestName");
  expect(paths).toContain("/MasterListsPage/externalConnections");
  expect(paths).toContain("/MasterListsPage/dataExportStatus");
});

test("keeps the analyzer entry hidden without analyzer permission", () => {
  renderWorkspace({ roles: ["Global Administrator"] });

  expect(screen.getAllByTestId("interface-workspace-area")).toHaveLength(3);
  expect(
    screen.queryByRole("heading", { name: "分析仪接口管理" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "分析仪项目映射" })).toBeVisible();
});

test("filters interface settings by translated search and category", () => {
  renderWorkspace();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "FHIR" },
  });
  expect(screen.getAllByTestId("interface-workspace-area")).toHaveLength(1);
  expect(
    screen.getByRole("heading", { name: "FHIR 数据交换监控" }),
  ).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "不存在的接口" },
  });
  expect(
    screen.queryByTestId("interface-workspace-area"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配的仪器或接口配置")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  fireEvent.click(screen.getByRole("combobox", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("option", { name: "外部系统" }));
  expect(screen.getAllByTestId("interface-workspace-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "外部接口配置" })).toBeVisible();
});

test("keeps admin-local links in the /admin route family", () => {
  renderWorkspace({ route: "/admin/interfaceWorkspace" });
  expect(screen.getByRole("link", { name: "外部接口配置" })).toHaveAttribute(
    "href",
    "/admin/externalConnections",
  );
});
