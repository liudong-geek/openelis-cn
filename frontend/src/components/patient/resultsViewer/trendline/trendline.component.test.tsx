import React from "react";
import { render } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../languages/en.json";
import Trendline from "./trendline.component";

const chartRender = vi.hoisted(() => vi.fn());
const trendState = vi.hoisted(() => ({
  current: {
    isLoading: false,
    isValidating: false,
    error: null,
    trendlineData: {
      display: "Creatinine",
      hiNormal: 10,
      lowNormal: 0,
      units: "mg/L",
      range: "0 - 10",
      obs: [
        {
          obsDatetime: "2026-08-22T08:30:00Z",
          rawValue: "<5",
          value: "5",
          interpretation: "LOW",
        },
        {
          obsDatetime: "2026-08-23T08:30:00Z",
          rawValue: "<3",
          value: "",
          lowNormal: -10,
          hiNormal: 0,
          interpretation: "LOW",
        },
      ],
    },
  },
}));

vi.mock("./trendline-resource", () => ({
  useObstreeData: () => trendState.current,
}));

vi.mock("@carbon/charts-react", () => ({
  LineChart: (props: unknown) => {
    chartRender(props);
    return <div data-testid="trend-chart" />;
  },
}));

vi.mock("./range-selector.component", () => ({
  default: () => null,
}));

vi.mock("../overview/common-datatable.component", () => ({
  default: () => null,
}));

describe("Trendline", () => {
  beforeEach(() => {
    chartRender.mockClear();
  });

  it("plots normalized and comparison-qualified values with zero reference bounds", () => {
    render(
      <IntlProvider locale="en" messages={messages}>
        <Trendline
          patientUuid="patient-1"
          conceptUuid="test-1"
          basePath="/"
          hideTrendlineHeader
        />
      </IntlProvider>,
    );

    const chartProps = chartRender.mock.lastCall?.[0] as {
      data: Array<{ value: number; min?: number; max?: number }>;
    };

    expect(chartProps.data).toHaveLength(2);
    expect(chartProps.data[0]).toEqual(
      expect.objectContaining({ value: 5, min: 0, max: 10 }),
    );
    expect(chartProps.data[1]).toEqual(
      expect.objectContaining({ value: 3, min: -10, max: 0 }),
    );
    expect(chartProps.data.every(({ value }) => Number.isFinite(value))).toBe(
      true,
    );
  });
});
