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

const previewButton = () => screen.getByRole("button", { name: "查询统计" });

const previewResponse = {
  year: new Date().getFullYear(),
  rows: [
    {
      testName: "白细胞计数（WBC）",
      testsJan: 3,
      samplesJan: 2,
      testsFeb: 0,
      samplesFeb: 0,
      testsMar: 0,
      samplesMar: 0,
      testsApr: 0,
      samplesApr: 0,
      testsMay: 0,
      samplesMay: 0,
      testsJun: 0,
      samplesJun: 0,
      testsJul: 0,
      samplesJul: 0,
      testsAug: 0,
      samplesAug: 0,
      testsSep: 4,
      samplesSep: 4,
      testsOct: 0,
      samplesOct: 0,
      testsNov: 0,
      samplesNov: 0,
      testsDec: 0,
      samplesDec: 0,
      totalTests: 7,
      totalSamples: 6,
    },
  ],
  totals: { tests: 7, samples: 6 },
};

const selectAllCheckboxes = () =>
  [
    "select-all-lab-units",
    "select-all-priorities",
    "select-all-time-frames",
  ].map((id) => document.getElementById(id));

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.get.mockImplementation((url, callback) => {
    if (url.includes("/rest/reports/statistics/workload")) {
      callback(previewResponse);
      return;
    }
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
  test("defaults every filter group to all, previews the list, then prints the same scope", () => {
    renderReport();

    expect(previewButton()).toBeEnabled();
    expect(generateButton()).toBeDisabled();
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

    fireEvent.click(previewButton());

    expect(screen.getByText("白细胞计数（WBC）")).toBeInTheDocument();
    expect(screen.getByText("检验量 7")).toBeInTheDocument();
    expect(screen.getByText("标本量 6")).toBeInTheDocument();
    expect(generateButton()).toBeEnabled();
    const previewUrl = new URL(
      apiMocks.get.mock.calls.find(([url]) =>
        url.includes("/rest/reports/statistics/workload"),
      )[0],
      "http://local",
    );
    expect(previewUrl.searchParams.getAll("labSections")).toEqual([
      "LAB A&B/1",
      "LAB-2",
    ]);

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
    expect(previewButton()).toBeEnabled();

    selectAllCheckboxes().forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(previewButton());
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
    fireEvent.click(previewButton());
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
    expect(previewButton()).toBeDisabled();
    expect(generateButton()).toBeDisabled();
    expect(window.open).not.toHaveBeenCalled();
  });

  test("blocks generation when no authorized lab unit or priority is available", async () => {
    apiMocks.get.mockImplementation((_url, callback) => callback([]));
    renderReport();

    expect(
      await screen.findByText("当前没有可用的报告选项。"),
    ).toBeInTheDocument();
    expect(previewButton()).toBeDisabled();
    expect(generateButton()).toBeDisabled();
    fireEvent.click(generateButton());
    expect(window.open).not.toHaveBeenCalled();
  });

  test("keeps print disabled when the preview request fails", () => {
    apiMocks.get.mockImplementation((url, callback) => {
      if (url.includes("/rest/reports/statistics/workload")) {
        callback(undefined);
        return;
      }
      callback(
        url.includes("user-test-sections")
          ? [{ id: "LAB-1", value: "生化" }]
          : [{ id: "ROUTINE", value: "Routine" }],
      );
    });
    renderReport();

    fireEvent.click(previewButton());

    expect(screen.getByText("工作量统计失败")).toBeInTheDocument();
    expect(generateButton()).toBeDisabled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
