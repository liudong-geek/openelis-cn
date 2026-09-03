import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../languages/en.json";
import RoutedResultsViewer from "../results-viewer";
import UserSessionDetailsContext from "../../../../UserSessionDetailsContext";

const getFromOpenElisServer = vi.hoisted(() => vi.fn());
const viewerState = vi.hoisted(() => ({
  roots: [{ display: "Laboratory", flatName: "Laboratory" }],
  loading: false,
  error: null as Error | null,
}));
const treeViewProps = vi.hoisted(() => ({ current: null as any }));

vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer,
  hasRole: (details: { roles?: string[] } | null | undefined, role: string) =>
    Boolean(details?.roles?.includes(role)),
  Roles: { RESULTS: "Results", REPORTS: "Reports" },
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ patientId: "42" }),
  useLocation: () => ({ pathname: "/PatientResults/42", state: undefined }),
  Link: ({
    children,
    to,
  }: {
    children: React.ReactNode;
    to: string | { pathname: string };
  }) => <a href={typeof to === "string" ? to : to.pathname}>{children}</a>,
}));

vi.mock("../grouped-timeline", () => ({
  useGetManyObstreeData: () => viewerState,
}));

vi.mock("../tree-view", () => ({
  default: (props: Record<string, unknown>) => {
    treeViewProps.current = props;
    return <div data-testid="result-tree">result tree</div>;
  },
}));

vi.mock("../PatientReportReleasePanel", () => ({
  default: () => <div data-testid="formal-report-panel" />,
}));

describe("RoutedResultsViewer", () => {
  it("passes loaded roots to the tree once patient identity is verified", async () => {
    getFromOpenElisServer.mockImplementation(
      (
        endpoint: string,
        callback: (response: Record<string, unknown>) => void,
      ) => {
        if (endpoint.startsWith("/rest/patient-details")) {
          callback({
            patientPK: "42",
            patientID: "P-001",
            lastName: "Li",
            firstName: "Ming",
            gender: "M",
            birthDateForDisplay: "1980-01-02",
          });
        }
      },
    );

    render(
      <IntlProvider locale="en" messages={enMessages}>
        <RoutedResultsViewer basePath="/" />
      </IntlProvider>,
    );

    expect(await screen.findByTestId("result-tree")).toBeVisible();
    expect(treeViewProps.current.roots).toEqual(viewerState.roots);
    expect(treeViewProps.current.loading).toBe(false);
    expect(screen.getByText("Li Ming")).toBeVisible();
    expect(screen.getByText("P-001")).toBeVisible();
    expect(screen.queryByTestId("formal-report-panel")).not.toBeInTheDocument();
  });

  it("offers the Chinese PDF preview in the patient context to report users", async () => {
    getFromOpenElisServer.mockImplementation(
      (
        endpoint: string,
        callback: (response: Record<string, unknown>) => void,
      ) => {
        if (endpoint.startsWith("/rest/patient-details")) {
          callback({
            patientPK: "42",
            patientID: "P-001",
            lastName: "Li",
            firstName: "Ming",
          });
        }
      },
    );

    render(
      <IntlProvider
        locale="zh-CN"
        messages={{
          ...enMessages,
          "patient.report.previewPdf": "预览中文检验报告",
        }}
      >
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { roles: ["Reports"] } } as any}
        >
          <RoutedResultsViewer basePath="/" />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>,
    );

    const reportLink = await screen.findByRole("link", {
      name: "预览中文检验报告",
    });
    expect(reportLink).toHaveAttribute(
      "href",
      "/api/OpenELIS-Global/rest/reports/patient-results.pdf?patientId=42",
    );
    expect(reportLink).toHaveAttribute("target", "_blank");
    expect(screen.getByTestId("formal-report-panel")).toBeVisible();
  });
});
