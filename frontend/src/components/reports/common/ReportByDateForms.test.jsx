import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import zhMessages from "../../../languages/zh.json";
import { ConfigurationContext } from "../../layout/Layout";
import ReportByDate from "./ReportByDate";
import ReportByDateCSV from "./ReportByDateCSV";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: apiMocks.get,
  Roles: { REPORTS: "reports" },
}));

vi.mock("../../common/CustomDatePicker", () => ({
  default: ({ id, labelText, value, onChange }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));

const renderReport = (ui, dateLocale = "fr-FR") =>
  render(
    <ConfigurationContext.Provider
      value={{
        configurationProperties: { DEFAULT_DATE_LOCALE: dateLocale },
      }}
    >
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        {ui}
      </IntlProvider>
    </ConfigurationContext.Provider>,
  );

const fillDateRange = (start = "31/01/2026", end = "01/02/2026") => {
  fireEvent.change(screen.getByLabelText("开始日期"), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText("结束日期"), {
    target: { value: end },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.get.mockImplementation((url, callback) => {
    callback(
      url === "/rest/test-list"
        ? [{ id: "TEST A&B/1", value: "测试项目甲" }]
        : [{ id: "PROJECT A&B/1", value: "研究项目甲" }],
    );
  });
  vi.spyOn(window, "open").mockReturnValue({ opener: window });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("date report forms", () => {
  test("ReportByDate requires both dates and safely launches a cross-month filtered report", async () => {
    renderReport(
      <ReportByDate report="activityReportByTest" id="reports.button" />,
    );

    const generate = screen.getByRole("button", {
      name: "生成可打印版本",
    });
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByLabelText("开始日期"), {
      target: { value: "31/01/2026" },
    });
    expect(generate).toBeDisabled();
    fireEvent.change(screen.getByLabelText("结束日期"), {
      target: { value: "01/02/2026" },
    });
    expect(generate).toBeEnabled();

    const filter = await screen.findByLabelText("筛选项目");
    fireEvent.change(filter, { target: { value: "TEST A&B/1" } });
    expect(filter).toHaveValue("TEST A&B/1");
    fireEvent.click(generate);

    expect(window.open).toHaveBeenCalledTimes(1);
    const reportUrl = window.open.mock.calls[0][0];
    expect(reportUrl).toContain("lowerDateRange=31%2F01%2F2026");
    expect(reportUrl).not.toContain("%252F");
    const openedUrl = new URL(reportUrl, "http://local");
    expect(openedUrl.searchParams.get("type")).toBe("indicator");
    expect(openedUrl.searchParams.get("selectList.selection")).toBe(
      "TEST A&B/1",
    );
    expect(openedUrl.searchParams.get("upperDateRange")).toBe("01/02/2026");
  });

  test("ReportByDate rejects a reverse date range", async () => {
    renderReport(
      <ReportByDate report="activityReportByTest" id="reports.button" />,
    );
    fireEvent.change(await screen.findByLabelText("筛选项目"), {
      target: { value: "TEST A&B/1" },
    });
    fillDateRange("02/02/2026", "01/02/2026");
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    expect(screen.getByText("结束日期不得早于开始日期")).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });

  test("ReportByDate validates and submits a Chinese year-first date range", async () => {
    renderReport(
      <ReportByDate report="activityReportByTest" id="reports.button" />,
      "zh-CN",
    );
    fireEvent.change(await screen.findByLabelText("筛选项目"), {
      target: { value: "TEST A&B/1" },
    });
    fillDateRange("2026/01/31", "2026/02/01");
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    expect(window.open).toHaveBeenCalledTimes(1);
    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("lowerDateRange")).toBe("2026/01/31");
    expect(openedUrl.searchParams.get("upperDateRange")).toBe("2026/02/01");
  });

  test("ReportByDate shows a visible popup-blocked error", () => {
    window.open.mockReturnValue(null);
    renderReport(
      <ReportByDate report="patientCollection" id="reports.button" />,
    );
    fillDateRange();
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    expect(
      screen.getByText(
        "报告窗口被浏览器拦截，请允许此网站打开弹出式窗口后重试。",
      ),
    ).toBeInTheDocument();
  });

  test("ReportByDate handles an undefined option response and retries", async () => {
    apiMocks.get
      .mockImplementationOnce((_url, callback) => callback(undefined))
      .mockImplementationOnce((_url, callback) =>
        callback([{ id: "T-1", value: "重试后的项目" }]),
      );
    renderReport(
      <ReportByDate report="activityReportByTest" id="reports.button" />,
    );

    expect(await screen.findByText("无法加载报告选项")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("重试后的项目")).toBeInTheDocument();
    expect(apiMocks.get).toHaveBeenCalledTimes(2);
  });

  test("ReportByDate renders a clear empty state instead of an empty selector", async () => {
    apiMocks.get.mockImplementation((_url, callback) => callback([]));
    renderReport(
      <ReportByDate report="activityReportByPanel" id="reports.button" />,
    );

    expect(
      await screen.findByText("当前没有可用的报告选项。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成可打印版本" }),
    ).toBeDisabled();
  });

  test("ReportByDateCSV localizes choices and safely encodes export criteria", async () => {
    renderReport(
      <ReportByDateCSV report="CIStudyExport" id="reports.button" />,
    );

    const study = await screen.findByLabelText("选择研究类型");
    expect(
      screen.getByRole("option", { name: "请选择研究类型" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "申请日期" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "结果日期" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "打印日期" }),
    ).toBeInTheDocument();

    fillDateRange();
    fireEvent.change(study, { target: { value: "PROJECT A&B/1" } });
    expect(study).toHaveValue("PROJECT A&B/1");
    fireEvent.change(screen.getByLabelText("日期类型"), {
      target: { value: "PRINT_DATE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    expect(window.open).toHaveBeenCalledTimes(1);
    const reportUrl = window.open.mock.calls[0][0];
    expect(reportUrl).not.toContain("%252F");
    const openedUrl = new URL(reportUrl, "http://local");
    expect(openedUrl.searchParams.get("projectCode")).toBe("PROJECT A&B/1");
    expect(openedUrl.searchParams.get("dateType")).toBe("PRINT_DATE");
    expect(openedUrl.searchParams.get("lowerDateRange")).toBe("31/01/2026");
  });

  test("ReportByDateCSV shows popup-blocked feedback without a false success", async () => {
    window.open.mockReturnValue(null);
    renderReport(
      <ReportByDateCSV report="CIStudyExport" id="reports.button" />,
    );
    fillDateRange();
    fireEvent.change(await screen.findByLabelText("选择研究类型"), {
      target: { value: "PROJECT A&B/1" },
    });
    fireEvent.change(screen.getByLabelText("日期类型"), {
      target: { value: "RESULT_DATE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成可打印版本" }));

    expect(
      screen.getByText(
        "报告窗口被浏览器拦截，请允许此网站打开弹出式窗口后重试。",
      ),
    ).toBeInTheDocument();
  });

  test("ReportByDateCSV handles an undefined study list without crashing", async () => {
    apiMocks.get.mockImplementation((_url, callback) => callback(undefined));
    renderReport(
      <ReportByDateCSV report="CIStudyExport" id="reports.button" />,
    );

    expect(await screen.findByText("无法加载报告选项")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成可打印版本" }),
    ).toBeDisabled();
  });
});
