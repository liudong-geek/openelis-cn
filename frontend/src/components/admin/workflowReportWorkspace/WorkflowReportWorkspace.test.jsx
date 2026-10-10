import React from "react";
import { fireEvent, render, screen, act, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import WorkflowReportWorkspace, {
  WORKFLOW_PARAMETER_CATEGORIES,
} from "./WorkflowReportWorkspace";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServer: mocks.post,
  postToOpenElisServerFormData: vi.fn(),
}));
const notification = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};
const renderWorkspace = (route = "/MasterListsPage/workflowReportWorkspace") =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <IntlProvider locale="zh" messages={messages}>
        <NotificationContext.Provider value={notification}>
          <WorkflowReportWorkspace />
        </NotificationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.get.mockImplementation((url, callback) => {
    if (url.includes("?ID="))
      callback({
        paramName: "facilityName",
        description: "机构名称",
        value: "原检验科",
        valueType: "text",
      });
    else
      callback({
        menuList: [
          {
            id: "137",
            name: "facilityName",
            description: "机构名称",
            value: "原检验科",
            valueType: "text",
          },
        ],
      });
  });
});
test("opens the actual parameter list with nine categories and one page title", async () => {
  const { container } = renderWorkspace();
  expect(
    screen.getByRole("heading", { name: "流程参数", level: 1 }),
  ).toBeVisible();
  expect(container.querySelectorAll(".oe-page-header h1")).toHaveLength(1);
  expect(
    within(screen.getByLabelText("配置类别")).getAllByRole("option"),
  ).toHaveLength(9);
  expect(await screen.findByText("facilityName")).toBeVisible();
  expect(mocks.get).toHaveBeenCalledWith(
    "/rest/SiteInformationMenu",
    expect.any(Function),
  );
  expect(screen.queryByTestId("workflow-report-area")).not.toBeInTheDocument();
});
test("loads each real site_information category without changing route or adding a sidebar", () => {
  renderWorkspace();
  for (const category of WORKFLOW_PARAMETER_CATEGORIES) {
    fireEvent.change(screen.getByLabelText("配置类别"), {
      target: { value: category.id },
    });
    expect(mocks.get).toHaveBeenCalledWith(
      `/rest/${category.id}`,
      expect.any(Function),
    );
  }
  expect(screen.getAllByLabelText("配置类别")).toHaveLength(1);
});
test("keeps a parameter edit in a dialog and cancellation does not write", async () => {
  const { container } = renderWorkspace();
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  expect(screen.getByLabelText("配置类别")).toBeDisabled();
  fireEvent.change(container.querySelector("#config-text-137"), {
    target: { value: "未保存名称" },
  });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(mocks.post).not.toHaveBeenCalled();
  expect(screen.getByLabelText("配置类别")).not.toBeDisabled();
  expect(screen.getByText("原检验科")).toBeVisible();
});
test("saves the exact existing parameter ID and re-reads the same category", async () => {
  const { container } = renderWorkspace();
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  fireEvent.change(container.querySelector("#config-text-137"), {
    target: { value: "中文示范检验科" },
  });
  mocks.post.mockImplementation((url, payload, callback) => callback(200));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "保存" })),
  );
  expect(mocks.post).toHaveBeenCalledWith(
    "/rest/SiteInformation?ID=137",
    JSON.stringify({
      paramName: "facilityName",
      description: "机构名称",
      value: "中文示范检验科",
      valueType: "text",
      dictionaryValues: [],
    }),
    expect.any(Function),
  );
  expect(
    mocks.get.mock.calls.filter(([url]) => url === "/rest/SiteInformationMenu"),
  ).toHaveLength(2);
});
test("uses the same category editor from the retained /admin route family", async () => {
  renderWorkspace("/admin/workflowReportWorkspace");
  expect(await screen.findByText("facilityName")).toBeVisible();
  expect(mocks.get).toHaveBeenCalledWith(
    "/rest/SiteInformationMenu",
    expect.any(Function),
  );
});
