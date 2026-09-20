import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import LabNumberManagement from "./LabNumberManagement";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
  convertAlphaNumLabNumForDisplay: (value: string) => value,
}));

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <ConfigurationContext.Provider
          value={{
            configurationProperties: { AccessionFormat: "ALPHANUM" },
            reloadConfiguration: mocks.reload,
          }}
        >
          <NotificationContext.Provider value={notificationContext}>
            <LabNumberManagement />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.reload.mockReset();
  notificationContext.setNotificationVisible.mockReset();
  notificationContext.addNotification.mockReset();

  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/labnumbermanagement") {
      callback({
        labNumberType: "ALPHANUM",
        usePrefix: false,
        alphanumPrefix: "",
      });
      return;
    }
    if (url.includes("format=SITEYEARNUM")) {
      callback({ status: true, body: "DEV01260000000000028" });
      return;
    }
    if (url.includes("SampleEntryGenerateScanProvider")) {
      callback({ status: true, body: "26000001" });
    }
  });
});

test("shows a clear numbering rule and preview workspace", async () => {
  renderPage();

  expect(
    await screen.findByRole("heading", { name: "实验室编号管理" }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "编号规则" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "编号预览" })).toBeVisible();
  expect(screen.getByText("26000001")).toBeVisible();
  expect(screen.getByRole("button", { name: "保存并启用" })).toBeDisabled();
});

test("requires confirmation before changing the active numbering rule", async () => {
  renderPage();

  const typeSelect = await screen.findByRole("combobox", {
    name: "实验室编号类型",
  });
  fireEvent.change(typeSelect, { target: { value: "SITEYEARNUM" } });

  const saveButton = screen.getByRole("button", { name: "保存并启用" });
  expect(saveButton).toBeEnabled();
  fireEvent.click(saveButton);

  expect(
    screen.getByRole("heading", { name: "启用新的编号规则？" }),
  ).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
});

test("enables the prefix field only when the option is selected", async () => {
  renderPage();

  const prefixInput = await screen.findByRole("textbox", { name: "前缀" });
  expect(prefixInput).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "使用前缀" }));
  expect(prefixInput).toBeEnabled();
});
