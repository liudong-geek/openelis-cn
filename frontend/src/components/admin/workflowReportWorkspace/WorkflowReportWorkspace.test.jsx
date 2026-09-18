import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import messages from "../../../languages/zh.json";
import WorkflowReportWorkspace from "./WorkflowReportWorkspace";

const renderWorkspace = (route = "/MasterListsPage/workflowReportWorkspace") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <IntlProvider locale="zh" messages={messages}>
        <WorkflowReportWorkspace />
      </IntlProvider>
    </MemoryRouter>,
  );

test("consolidates workflow and report settings without removing legacy routes", () => {
  renderWorkspace();

  expect(
    screen.getByRole("heading", { name: "流程与报告配置", level: 1 }),
  ).toBeVisible();
  expect(screen.getAllByTestId("workflow-report-area")).toHaveLength(12);

  const paths = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
  expect(paths).toContain("/MasterListsPage/SampleEntryConfigurationMenu");
  expect(paths).toContain("/MasterListsPage/labNumber");
  expect(paths).toContain("/MasterListsPage/labelPresets");
  expect(paths).toContain("/MasterListsPage/resultReportingConfiguration");
  expect(paths).toContain("/MasterListsPage/testNotificationConfigMenu");
});

test("filters settings by translated search and business category", () => {
  renderWorkspace();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "验证规则" },
  });
  expect(screen.getAllByTestId("workflow-report-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "验证配置" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "不存在的配置" },
  });
  expect(screen.queryByTestId("workflow-report-area")).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配的流程或报告配置")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  fireEvent.click(screen.getByRole("combobox", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("option", { name: "结果与报告" }));
  expect(screen.getAllByTestId("workflow-report-area")).toHaveLength(5);
});

test("keeps the /admin route family", () => {
  renderWorkspace("/admin/workflowReportWorkspace");
  expect(screen.getByRole("link", { name: "标签模板" })).toHaveAttribute(
    "href",
    "/admin/labelPresets",
  );
});
