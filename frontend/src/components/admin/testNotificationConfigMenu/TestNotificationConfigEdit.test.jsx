import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import TestNotificationConfigEdit from "./TestNotificationConfigEdit";

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

const payload = {
  formName: "testNotificationConfig",
  formMethod: "POST",
  editSystemDefaultPayloadTemplate: false,
  systemDefaultPayloadTemplate: {
    subjectTemplate: "系统主题",
    messageTemplate: "系统消息",
  },
  config: {
    testId: "101",
    defaultPayloadTemplate: {
      subjectTemplate: "项目主题",
      messageTemplate: "项目消息",
    },
    providerEmail: {
      active: true,
      payloadTemplate: {
        subjectTemplate: "医生主题",
        messageTemplate: "医生邮件",
      },
    },
    providerSMS: {
      active: false,
      payloadTemplate: { messageTemplate: "医生短信" },
    },
    patientEmail: {
      active: false,
      payloadTemplate: {
        subjectTemplate: "患者主题",
        messageTemplate: "患者邮件",
      },
    },
    patientSMS: {
      active: false,
      payloadTemplate: { messageTemplate: "患者短信" },
    },
  },
};

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={["/MasterListsPage/testNotificationConfig?testId=101"]}
    >
      <IntlProvider locale="zh" messages={messages}>
        <NotificationContext.Provider value={notificationContext}>
          <TestNotificationConfigEdit />
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
    if (url.startsWith("/rest/TestNotificationConfig?")) callback(payload);
    if (url === "/rest/test-list") callback([{ id: "101", value: "血常规" }]);
  });
});

test("shows the test channels, guidance and template hierarchy", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { name: "血常规" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "启用通知渠道" })).toBeVisible();
  expect(screen.getByText("已启用 1 个渠道")).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "提供者电子邮件" }),
  ).toBeChecked();
  expect(screen.getByRole("heading", { name: "系统默认消息" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "检测的默认消息" })).toBeVisible();
  expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled();
});

test("protects the system default template until editing is enabled", async () => {
  renderPage();

  const systemSubject = await screen.findByDisplayValue("系统主题");
  expect(systemSubject).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "编辑系统默认模板" }));
  expect(systemSubject).toBeEnabled();
  expect(screen.getByText(/系统默认模板会影响所有/)).toBeVisible();
});

test("tracks and discards template edits", async () => {
  renderPage();

  const defaultMessage = await screen.findByDisplayValue("项目消息");
  fireEvent.change(defaultMessage, { target: { value: "新的项目消息" } });
  expect(screen.getByText("有未保存修改")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存配置" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
  expect(screen.getByDisplayValue("项目消息")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存配置" })).toBeDisabled();
});

test("confirms before posting message template changes", async () => {
  renderPage();

  fireEvent.click(await screen.findByRole("checkbox", { name: "患者短信" }));
  fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

  expect(screen.getByRole("dialog", { name: "保存消息模板？" })).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "确认保存" }));
  expect(mocks.post).toHaveBeenCalledWith(
    "/rest/TestNotificationConfig",
    expect.any(String),
    expect.any(Function),
  );
});
