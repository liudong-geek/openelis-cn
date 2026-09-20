import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import TestNotificationConfigMenu from "./TestNotificationConfigMenu";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerJsonResponse: mocks.post,
}));

vi.mock("../../utils/NavigationUtils", () => ({
  navigateToInternalPath: mocks.navigate,
}));

const menuList = [
  {
    testId: "101",
    patientEmail: { active: true },
    patientSMS: { active: false },
    providerEmail: { active: false },
    providerSMS: { active: false },
  },
  {
    testId: "102",
    patientEmail: { active: false },
    patientSMS: { active: false },
    providerEmail: { active: true },
    providerSMS: { active: false },
  },
];

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <NotificationContext.Provider value={notificationContext}>
          <TestNotificationConfigMenu />
        </NotificationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.navigate.mockReset();
  notificationContext.setNotificationVisible.mockReset();
  notificationContext.addNotification.mockReset();
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/TestNotificationConfigMenu") {
      callback({ formMethod: "POST", menuList });
    } else if (url === "/rest/test-list") {
      callback([
        { id: "101", value: "血常规" },
        { id: "102", value: "肝功能" },
      ]);
    } else if (url === "/rest/user-sample-types") {
      callback([{ id: "1", value: "全血" }]);
    } else if (url.startsWith("/rest/sample-type-tests")) {
      callback({ tests: [{ id: "101" }] });
    }
  });
});

test("shows notification metrics, filters and channel rules", async () => {
  renderPage();

  expect(
    await screen.findByRole("heading", { name: "检验通知配置" }),
  ).toBeVisible();
  expect(screen.getByText("血常规")).toBeVisible();
  expect(screen.getByText("肝功能")).toBeVisible();
  expect(screen.getByText("已配置项目")).toBeVisible();
  expect(screen.getByText("已启用通知渠道")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "放弃修改" })).toBeDisabled();
});

test("marks changed tests and can discard channel edits", async () => {
  renderPage();

  const sms = await screen.findByRole("checkbox", {
    name: "血常规：患者短信",
  });
  expect(sms).not.toBeChecked();
  fireEvent.click(sms);

  expect(screen.getByText("1 项待保存")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));

  expect(sms).not.toBeChecked();
  expect(screen.getByText("配置已保存")).toBeVisible();
});

test("filters by name and sample type", async () => {
  renderPage();

  const search = await screen.findByRole("searchbox", {
    name: "搜索检验项目",
  });
  fireEvent.change(search, { target: { value: "肝" } });
  expect(screen.queryByText("血常规")).not.toBeInTheDocument();
  expect(screen.getByText("肝功能")).toBeVisible();

  fireEvent.change(search, { target: { value: "" } });
  fireEvent.change(screen.getByRole("combobox", { name: "样本类型" }), {
    target: { value: "1" },
  });
  expect(await screen.findByText("血常规")).toBeVisible();
  expect(screen.queryByText("肝功能")).not.toBeInTheDocument();
});

test("confirms before saving changed notification channels", async () => {
  renderPage();

  fireEvent.click(
    await screen.findByRole("checkbox", { name: "血常规：患者短信" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

  expect(screen.getByRole("heading", { name: "保存通知配置？" })).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
  expect(mocks.post).toHaveBeenCalledWith(
    "/rest/TestNotificationConfigMenu",
    expect.any(String),
    expect.any(Function),
  );
});
