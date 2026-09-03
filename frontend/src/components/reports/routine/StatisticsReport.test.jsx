import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import zhMessages from "../../../languages/zh.json";
import StatisticsReport from "./StatisticsReport";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: apiMocks.get,
  Roles: { REPORTS: "reports" },
}));

const renderReport = () =>
  render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <StatisticsReport />
    </IntlProvider>,
  );

const generateButton = () =>
  screen.getByRole("button", { name: "生成可打印版本" });

const selectAllCheckboxes = () =>
  [
    "select-all-lab-units",
    "select-all-priorities",
    "select-all-time-frames",
  ].map((id) => document.getElementById(id));

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.get.mockImplementation((url, callback) => {
    callback(
      url.includes("user-test-sections")
        ? [
            { id: "LAB A&B/1", value: "生化" },
            { id: "LAB-2", value: "血液学" },
          ]
        : [
            { id: "ROUTINE", value: "Routine" },
            { id: "STAT", value: "STAT" },
            { id: "FUTURE_STAT", value: "Future STAT" },
          ],
    );
  });
  vi.spyOn(window, "open").mockReturnValue({ opener: window });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StatisticsReport", () => {
  test("defaults every filter group to all and launches one safely encoded report", () => {
    renderReport();

    expect(generateButton()).toBeEnabled();
    expect(screen.getByText("统计范围")).toBeInTheDocument();
    expect(
      screen.getByText("正常工作时间（接收时间 09:00–15:30）"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("非正常工作时间（15:31–次日 08:59）"),
    ).toBeInTheDocument();
    expect(screen.getByText("报告年份")).toBeInTheDocument();
    expect(screen.getByText("常规")).toBeInTheDocument();
    expect(screen.getByText("急诊")).toBeInTheDocument();
    expect(screen.getByText("预定急诊")).toBeInTheDocument();
    selectAllCheckboxes().forEach((checkbox) => expect(checkbox).toBeChecked());

    fireEvent.click(generateButton());

    expect(window.open).toHaveBeenCalledTimes(1);
    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.get("report")).toBe("statisticsReport");
    expect(openedUrl.searchParams.get("type")).toBe("indicator");
    expect(openedUrl.searchParams.getAll("labSections")).toEqual([
      "LAB A&B/1",
      "LAB-2",
    ]);
    expect(openedUrl.searchParams.getAll("priority")).toEqual([
      "ROUTINE",
      "STAT",
      "FUTURE_STAT",
    ]);
    expect(openedUrl.searchParams.getAll("receptionTime")).toEqual([
      "NORMAL_WORK_HOURS",
      "OUT_OF_NORMAL_WORK_HOURS",
    ]);
    expect(openedUrl.searchParams.get("upperYear")).toBe(
      new Date().getFullYear().toString(),
    );
  });

  test("treats a deliberately cleared group as all available values", () => {
    renderReport();
    expect(generateButton()).toBeEnabled();

    selectAllCheckboxes().forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(generateButton());

    const openedUrl = new URL(window.open.mock.calls[0][0], "http://local");
    expect(openedUrl.searchParams.getAll("labSections")).toEqual([
      "LAB A&B/1",
      "LAB-2",
    ]);
    expect(openedUrl.searchParams.getAll("priority")).toEqual([
      "ROUTINE",
      "STAT",
      "FUTURE_STAT",
    ]);
    expect(openedUrl.searchParams.getAll("receptionTime")).toEqual([
      "NORMAL_WORK_HOURS",
      "OUT_OF_NORMAL_WORK_HOURS",
    ]);
    expect(openedUrl.searchParams.get("upperYear")).toBe(
      new Date().getFullYear().toString(),
    );
  });

  test("shows a Chinese popup-blocked error instead of reporting success", () => {
    window.open.mockReturnValue(null);
    renderReport();
    expect(generateButton()).toBeEnabled();

    fireEvent.click(generateButton());

    expect(
      screen.getByText(
        "报告窗口被浏览器拦截，请允许此网站打开弹出式窗口后重试。",
      ),
    ).toBeInTheDocument();
    expect(window.open).toHaveBeenCalledTimes(1);
  });

  test("blocks generation when a required option list cannot be loaded", async () => {
    apiMocks.get.mockImplementation((url, callback) => {
      callback(url.includes("user-test-sections") ? undefined : []);
    });
    renderReport();

    expect(await screen.findByText("无法加载报告选项")).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    expect(window.open).not.toHaveBeenCalled();
  });

  test("blocks generation when no authorized lab unit or priority is available", async () => {
    apiMocks.get.mockImplementation((_url, callback) => callback([]));
    renderReport();

    expect(
      await screen.findByText("当前没有可用的报告选项。"),
    ).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    fireEvent.click(generateButton());
    expect(window.open).not.toHaveBeenCalled();
  });
});
