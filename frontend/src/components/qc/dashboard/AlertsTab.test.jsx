import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import zhMessages from "../../../languages/zh_CN.json";
import AlertsTab from "./AlertsTab";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";

vi.mock("../../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
    postToOpenElisServerFullResponse: vi.fn(),
  };
});

const renderAlerts = () =>
  render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <AlertsTab />
    </IntlProvider>,
  );

describe("AlertsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("异常响应显示中文错误并退出加载状态", async () => {
    getFromOpenElisServer
      .mockImplementationOnce((_url, callback) =>
        callback({ data: { message: "bad response" } }),
      )
      .mockImplementationOnce((_url, callback) => callback([]));
    const user = userEvent.setup();
    renderAlerts();

    expect(await screen.findByText("室内质控数据加载失败")).toBeInTheDocument();
    expect(screen.queryByTestId("alerts-tab-loading")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重新加载警报" }));

    expect(
      await screen.findByText("当前没有待处理的失控记录"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("alerts-tab-error")).not.toBeInTheDocument();
    expect(getFromOpenElisServer).toHaveBeenCalledTimes(2);
  });

  test("质控严重程度中文化，确认请求失败时可恢复且不崩溃", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback([
        {
          id: "V 01/A",
          severity: "WARNING",
          status: "UNRESOLVED",
          ruleCode: "1-2s",
          instrumentName: "血球分析仪",
          testName: "白细胞计数",
          violationDateTime: new Date().toISOString(),
        },
      ]),
    );
    postToOpenElisServerFullResponse.mockImplementation(
      (_url, _body, callback) => callback(undefined),
    );
    const user = userEvent.setup();
    const { container } = renderAlerts();

    expect(await screen.findByText("警告")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("WARNING");

    await user.click(screen.getByRole("button", { name: "确认已知悉" }));

    expect(postToOpenElisServerFullResponse).toHaveBeenCalledWith(
      "/rest/qc/violations/V%2001%2FA/acknowledge",
      "{}",
      expect.any(Function),
    );
    expect(
      await screen.findByText("确认失控记录失败，请重试。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认已知悉" })).toBeEnabled();
  });

  test("已确认的拒绝级失控必须填写纠正措施后才能解决", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback([
        {
          id: "V-RESOLVE",
          severity: "REJECTION",
          resolutionStatus: "ACKNOWLEDGED",
          ruleCode: "1-3s",
          instrumentName: "生化分析仪",
          testName: "葡萄糖",
          acknowledgedDate: new Date().toISOString(),
          violationDateTime: new Date().toISOString(),
        },
      ]),
    );
    postToOpenElisServerFullResponse.mockImplementation(
      (_url, _body, callback) => callback({ ok: true }),
    );
    const user = userEvent.setup();
    renderAlerts();

    await user.click(
      await screen.findByRole("button", { name: "登记纠正措施" }),
    );
    const confirm = screen.getByRole("button", { name: "解决并恢复放行" });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText("纠正措施与验证结果"),
      "重新校准并复测质控品合格",
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(postToOpenElisServerFullResponse).toHaveBeenCalledWith(
      "/rest/qc/violations/V-RESOLVE/resolve",
      JSON.stringify({ notes: "重新校准并复测质控品合格" }),
      expect.any(Function),
    );
  });
});
