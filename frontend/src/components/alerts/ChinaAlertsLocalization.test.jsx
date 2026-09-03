import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import zh from "../../languages/zh.json";
import { getFromOpenElisServer } from "../utils/Utils";
import AlertAcknowledgeModal from "./AlertAcknowledgeModal";
import AlertsDashboard from "./AlertsDashboard";

vi.mock("../utils/Utils", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getFromOpenElisServer: vi.fn(),
    putToOpenElisServer: vi.fn(),
  };
});

const rawAlert = {
  id: 1,
  alertType: "EQA_DEADLINE",
  severity: "CRITICAL",
  status: "OPEN",
  message: "EQA deadline approaching",
  startTime: "2026-01-15T10:00:00Z",
};

const renderInChinese = (component) =>
  render(
    <IntlProvider locale="zh-CN" messages={zh}>
      {component}
    </IntlProvider>,
  );

describe("China quality-alert workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url.includes("/summary")) {
        callback({
          criticalAlerts: 1,
          eqaDeadlines: 1,
          statOverdue: 0,
          sampleExpiration: 0,
        });
      } else {
        callback({ alerts: [rawAlert], totalCount: 1 });
      }
    });
  });

  test("shows the reachable alert dashboard in laboratory Chinese", () => {
    renderInChinese(<AlertsDashboard />);

    expect(screen.getByRole("heading", { name: "质量预警中心" })).toBeTruthy();
    expect(screen.getAllByText("室间质评截止提醒").length).toBeGreaterThan(0);
    expect(
      screen.getByText("室间质评样品截止日期临近，请及时处理"),
    ).toBeTruthy();
    expect(screen.getAllByText("预警类型").length).toBeGreaterThan(0);
    expect(screen.getByText("确认已知悉")).toBeTruthy();
    expect(screen.queryByText("EQA deadline approaching")).toBeNull();
  });

  test("localizes the confirmation modal and does not repeat backend English", () => {
    renderInChinese(
      <AlertAcknowledgeModal
        open
        alert={rawAlert}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "确认质量预警" })).toBeTruthy();
    expect(
      screen.getByText("室间质评样品截止日期临近，请及时处理"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "关闭" })).toBeTruthy();
    expect(screen.queryByText("EQA deadline approaching")).toBeNull();
  });
});
