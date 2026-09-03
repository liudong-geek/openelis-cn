import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vitest";
import FilterContext from "../filter/filter-context";
import { filterTreeNodes, type FilterTreeNode } from "../filter/filter-set";
import GroupedTimeline, {
  interpretationToTagType,
} from "../grouped-timeline/grouped-timeline";

const messages = {
  "label.results.range": "Reference Range",
  "patient.resultsViewer.interpretation.notAssessed": "Not assessed",
  "patient.resultsViewer.timeline.data": "result data",
  "patient.resultsViewer.timeline.test": "Test",
  "patient.resultsViewer.timeline.title": "Results timeline",
  "patient.resultsViewer.trend.view": "View trend",
};

describe("patient results viewer behavior", () => {
  it("renders an unassessed qualitative result in a neutral tag instead of green", () => {
    const contextValue = {
      activeTests: ["microbiology-Culture"],
      checkboxes: {},
      someChecked: false,
      timelineData: {
        loaded: true,
        data: {
          parsedTime: { sortedTimes: ["2026-08-23T08:30:00Z"] },
          rowData: [
            {
              flatName: "microbiology-Culture",
              display: "Culture",
              entries: [{ value: "Positive", interpretation: "UNKNOWN" }],
            },
          ],
        },
      },
    } as any;

    render(
      <IntlProvider locale="en" messages={messages}>
        <FilterContext.Provider value={contextValue}>
          <GroupedTimeline />
        </FilterContext.Provider>
      </IntlProvider>,
    );

    expect(screen.getByText("Positive · Not assessed")).toBeVisible();
    expect(interpretationToTagType("UNKNOWN")).toBe("gray");
    expect(interpretationToTagType("UNKNOWN")).not.toBe("green");
  });

  it("keeps the matching path when filtering the test tree", () => {
    const roots: FilterTreeNode[] = [
      {
        display: "Laboratory",
        flatName: "laboratory",
        subSets: [
          {
            display: "Hematology",
            flatName: "laboratory-Hematology",
            subSets: [
              {
                display: "White blood cells",
                flatName: "laboratory-Hematology-WBC",
                obs: [{ value: "7.2" }],
              },
            ],
          },
          {
            display: "Chemistry",
            flatName: "laboratory-Chemistry",
          },
        ],
      },
    ];

    const filtered = filterTreeNodes(roots, "white blood");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].subSets).toHaveLength(1);
    expect(filtered[0].subSets?.[0].display).toBe("Hematology");
    expect(filtered[0].subSets?.[0].subSets?.[0].display).toBe(
      "White blood cells",
    );
  });

  it("provides a reachable trend action only for numeric results", () => {
    window.history.replaceState({}, "", "/PatientResults/42");
    const contextValue = {
      activeTests: ["hematology-WBC"],
      checkboxes: {},
      someChecked: false,
      timelineData: {
        loaded: true,
        data: {
          parsedTime: { sortedTimes: ["2026-08-23T08:30:00Z"] },
          rowData: [
            {
              flatName: "hematology-WBC",
              conceptUuid: "concept-1",
              display: "WBC",
              entries: [{ value: "7.2", interpretation: "NORMAL" }],
            },
          ],
        },
      },
    } as any;

    render(
      <IntlProvider locale="en" messages={messages}>
        <FilterContext.Provider value={contextValue}>
          <GroupedTimeline />
        </FilterContext.Provider>
      </IntlProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "View trend" }));
    expect(window.location.hash).toBe("#trendline/concept-1");
  });

  it("shows observation-specific units and reference ranges when history values differ", () => {
    const contextValue = {
      activeTests: ["chemistry-Analyte"],
      checkboxes: {},
      someChecked: false,
      timelineData: {
        loaded: true,
        data: {
          parsedTime: {
            sortedTimes: ["2026-08-23T08:30:00Z", "2026-07-23T08:30:00Z"],
          },
          rowData: [
            {
              flatName: "chemistry-Analyte",
              display: "Analyte",
              entries: [
                {
                  value: "7.2",
                  interpretation: "NORMAL",
                  units: "g/L",
                  lowNormal: 4,
                  hiNormal: 10,
                },
                {
                  value: "11.5",
                  interpretation: "HIGH",
                  units: "mmol/L",
                  lowNormal: 5,
                  hiNormal: 11,
                },
              ],
            },
          ],
        },
      },
    } as any;

    render(
      <IntlProvider locale="en" messages={messages}>
        <FilterContext.Provider value={contextValue}>
          <GroupedTimeline />
        </FilterContext.Provider>
      </IntlProvider>,
    );

    expect(screen.getByText("7.2 g/L")).toBeVisible();
    expect(screen.getByText("Reference Range: 4 – 10")).toBeVisible();
    expect(screen.getByText("11.5 mmol/L")).toBeVisible();
    expect(screen.getByText("Reference Range: 5 – 11")).toBeVisible();
  });
});
