import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";
import zhMessages from "../../../../languages/zh_CN.json";
import { EmptyState } from "../commons/empty-state/empty-state.component";
import { ErrorState } from "../commons/error-state/error-state.component";
import FilterContext from "../filter/filter-context";
import GroupedTimeline from "../grouped-timeline/grouped-timeline";
import RangeSelector from "../trendline/range-selector.component";
import Trendline from "../trendline/trendline.component";

const trendState = vi.hoisted(() => ({
  current: {
    isLoading: false,
    isValidating: false,
    trendlineData: {
      obs: [
        {
          obsDatetime: "2026-08-23T08:30:00Z",
          value: "7.2",
          interpretation: "NORMAL",
        },
      ],
      display: "WBC",
      hiNormal: 10,
      lowNormal: 4,
      units: "10^9/L",
      range: "4 - 10",
    },
  },
}));

vi.mock("../trendline/trendline-resource", () => ({
  useObstreeData: () => trendState.current,
}));

vi.mock("@carbon/charts-react", () => ({
  LineChart: ({ options }: { options: any }) => (
    <div data-testid="localized-chart-options">
      <span>{options.axes.bottom.title}</span>
      <span>{options.locale.translations.toolbar.zoomIn}</span>
      <span>{options.locale.translations.toolbar.showAsTable}</span>
    </div>
  ),
}));

vi.mock("../overview/common-datatable.component", () => ({
  default: ({
    tableHeaders,
  }: {
    tableHeaders: Array<{ key: string; header: string }>;
  }) => (
    <div data-testid="localized-result-table">
      {tableHeaders.map(({ key, header }) => (
        <span key={key}>{header}</span>
      ))}
    </div>
  ),
}));

const renderInChinese = (component: React.ReactElement) =>
  render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      {component}
    </IntlProvider>,
  );

describe("patient results viewer localization", () => {
  it("renders localized empty and error states without English fallbacks", () => {
    const { rerender } = renderInChinese(
      <EmptyState headerTitle="检验结果" displayText="检验结果数据" />,
    );

    expect(screen.getByText("该患者暂无可显示的检验结果数据。")).toBeVisible();
    expect(screen.getByTitle("暂无患者检验结果数据")).toBeInTheDocument();

    rerender(
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <ErrorState
          headerTitle="数据加载失败"
          error={{
            response: { status: 503, statusText: "Service Unavailable" },
          }}
        />
      </IntlProvider>,
    );

    expect(screen.getByText("错误代码：503")).toBeVisible();
    expect(screen.queryByText(/Service Unavailable/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/无法显示患者检验结果。请刷新页面重试/),
    ).toBeVisible();
  });

  it("localizes the timeline column and uses the active locale for dates", () => {
    const contextValue = {
      activeTests: ["hematology-WBC"],
      checkboxes: {},
      someChecked: false,
      timelineData: {
        loaded: true,
        data: {
          parsedTime: {
            sortedTimes: ["2026-08-23T08:30:00Z"],
          },
          rowData: [
            {
              flatName: "hematology-WBC",
              display: "WBC",
              range: "4-10",
              units: "10^9/L",
              entries: [{ value: "7.2", interpretation: "NORMAL" }],
            },
          ],
        },
      },
    } as any;

    renderInChinese(
      <FilterContext.Provider value={contextValue}>
        <GroupedTimeline />
      </FilterContext.Provider>,
    );

    expect(screen.getByText("检验项目")).toBeVisible();
    expect(screen.getByText("WBC (4-10 10^9/L)")).toBeVisible();
    expect(screen.getByText(/2026年8月23日/)).toBeVisible();
    expect(screen.getByText("7.2")).toBeVisible();
  });

  it("localizes range controls, chart controls, and trend result columns", () => {
    renderInChinese(
      <Trendline
        patientUuid="patient-1"
        conceptUuid="test-1"
        basePath="/"
        showBackToTimelineButton
      />,
    );

    expect(screen.getByText("返回结果时间轴")).toBeVisible();
    expect(
      screen.getByRole("tablist", { name: "趋势图日期范围" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "1 天" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "全部" })).toBeVisible();
    expect(screen.getByTestId("localized-chart-options")).toHaveTextContent(
      "日期放大显示数据表",
    );
    expect(screen.getByTestId("localized-result-table")).toHaveTextContent(
      "日期检测时间结果值 (10^9/L)",
    );
  });

  it("localizes the standalone trend range selector", () => {
    renderInChinese(
      <RangeSelector setLowerRange={vi.fn()} upperRange={new Date()} />,
    );

    expect(screen.getByRole("tab", { name: "5 天" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "6 个月" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "5 年" })).toBeVisible();
  });
});
