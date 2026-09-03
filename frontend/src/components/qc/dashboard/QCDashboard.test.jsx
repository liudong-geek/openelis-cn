import React from "react";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import zhMessages from "../../../languages/zh_CN.json";
import QCDashboard from "./QCDashboard";
import { getFromOpenElisServer } from "../../utils/Utils";

vi.mock("../../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
  };
});

vi.mock("./AlertsTab", () => ({
  default: () => <div data-testid="alerts-tab-stub" />,
}));

const renderDashboard = () => {
  const history = createMemoryHistory({
    initialEntries: ["/analyzers/qc/db"],
  });
  const view = render(
    <Router history={history}>
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <QCDashboard />
      </IntlProvider>
    </Router>,
  );
  return { ...view, history };
};

const respondWith = ({ summary, instruments }) => {
  getFromOpenElisServer.mockImplementation((url, callback) => {
    if (url === "/rest/qc/dashboard/summary") callback(summary);
    if (url === "/rest/qc/dashboard/instruments") callback(instruments);
  });
};

describe("QCDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("加载期间保留中文页面上下文并禁用重复刷新", () => {
    getFromOpenElisServer.mockImplementation(() => undefined);
    renderDashboard();

    expect(screen.getByText("室内质量控制工作台")).toBeInTheDocument();
    expect(screen.getByTestId("qc-dashboard-loading")).toHaveTextContent(
      "正在加载室内质控数据…",
    );
    expect(screen.getByRole("button", { name: "刷新" })).toBeDisabled();
  });

  test("无分析仪时显示业务指引，不显示无意义的空表和分页", async () => {
    respondWith({
      summary: {
        totalInstruments: 0,
        compliantInstruments: 0,
        warningInstruments: 0,
        nonCompliantInstruments: 0,
      },
      instruments: [],
    });
    const user = userEvent.setup();
    const { history } = renderDashboard();

    expect(await screen.findByText("尚无可监控的分析仪")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("每页项目数")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "前往分析仪管理" }));
    expect(history.location.pathname).toBe("/analyzers");
  });

  test("兼容通用 id 和非字符串字段，详情按钮进入正确分析仪", async () => {
    respondWith({
      summary: {
        totalInstruments: 1,
        compliantInstruments: 1,
        warningInstruments: 0,
        nonCompliantInstruments: 0,
      },
      instruments: [
        {
          id: "QC 01/A",
          instrumentName: "血球分析仪",
          instrumentType: 42,
          instrumentLocation: "血液室",
          complianceColor: "GREEN",
          analyteDetails: [],
          triggeredRuleDetails: [],
        },
      ],
    });
    const user = userEvent.setup();
    const { history } = renderDashboard();

    expect(await screen.findByText("血球分析仪")).toBeInTheDocument();
    expect(screen.getByText("受控")).toBeInTheDocument();
    expect(screen.queryByText("In Control")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "查看详情" }));
    expect(history.location.pathname).toContain("/analyzers/qc/instruments/");
    expect(
      decodeURIComponent(
        history.location.pathname.replace("/analyzers/qc/instruments/", ""),
      ),
    ).toBe("QC 01/A");
  });

  test("接口返回错误结构时结束加载并显示可恢复错误，而不是页面崩溃", async () => {
    respondWith({
      summary: { message: "server failed" },
      instruments: { data: { message: "server failed" } },
    });
    renderDashboard();

    expect(await screen.findByText("室内质控数据加载失败")).toBeInTheDocument();
    expect(
      screen.getByText("暂时无法获取室内质控数据，请稍后重试。"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("正在加载室内质控数据…"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "刷新" })).toBeEnabled();
  });
});
