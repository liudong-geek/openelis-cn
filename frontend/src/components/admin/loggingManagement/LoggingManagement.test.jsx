import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import zhMessages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import LoggingManagement, { appendLogLine } from "./LoggingManagement";

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: apiMocks.get,
}));

let eventSource;

class MockEventSource {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    eventSource = this;
  }

  close = vi.fn();
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={zhMessages}>
        <NotificationContext.Provider
          value={{
            notificationVisible: false,
            setNotificationVisible: vi.fn(),
            addNotification: vi.fn(),
            removeNotification: vi.fn(),
            notifications: [],
          }}
        >
          <LoggingManagement />
        </NotificationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  global.EventSource = MockEventSource;
});

afterEach(() => {
  delete global.EventSource;
});

test("shows the log list first and keeps level settings collapsed", () => {
  renderPage();

  expect(screen.getByRole("heading", { name: "系统日志" })).toBeVisible();
  expect(screen.getByRole("log", { name: "实时日志" })).toBeVisible();
  const settingsToggle = screen.getByRole("button", {
    name: "日志级别设置",
  });
  expect(settingsToggle).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(settingsToggle);
  expect(settingsToggle).toHaveAttribute("aria-expanded", "true");
});

test("appends incoming entries and clears only the displayed list", () => {
  renderPage();

  act(() => {
    eventSource.onmessage({ data: "2026-09-29 INFO 演示日志" });
  });
  expect(screen.getByText("2026-09-29 INFO 演示日志")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "清空显示" }));
  expect(
    screen.queryByText("2026-09-29 INFO 演示日志"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("正在等待应用日志…")).toBeVisible();
});

test("keeps only the configured number of newest log entries", () => {
  expect(appendLogLine(["1", "2", "3"], "4", 3)).toEqual(["2", "3", "4"]);
});
