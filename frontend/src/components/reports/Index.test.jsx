import React from "react";
import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import ReportIndex from "./Index";
import messages from "../../languages/en.json";
import { NotificationContext } from "../layout/Layout";

vi.mock("./routine/Index", () => ({
  RoutineReports: ({ type, report }) => (
    <div>{`routine:${type}:${report}`}</div>
  ),
}));
vi.mock("./study/index", () => ({
  StudyReports: ({ type, report }) => <div>{`study:${type}:${report}`}</div>,
}));

const renderReport = (initialPath) => {
  const history = createMemoryHistory({ initialEntries: [initialPath] });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <NotificationContext.Provider value={{ notificationVisible: false }}>
          <ReportIndex />
        </NotificationContext.Provider>
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("ReportIndex", () => {
  test("sends incomplete report renderer URLs to the report centre", async () => {
    const history = renderReport("/Report");

    await waitFor(() => {
      expect(history.location.pathname).toBe("/RoutineReports");
    });
  });

  test("keeps a complete report renderer URL", () => {
    renderReport("/Report?type=patient&report=status");

    expect(screen.getByText("routine:patient:status")).toBeInTheDocument();
    expect(screen.getByText("study:patient:status")).toBeInTheDocument();
  });

  test("shows a clear safety notice instead of rendering a restricted legacy report", () => {
    renderReport("/Report?type=routine&report=CISampleRoutineExport");

    expect(
      screen.getAllByText(messages["reports.securityReview.title"]),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByText(messages["reports.securityReview.description"]),
    ).not.toHaveLength(0);
    expect(
      screen.queryByText("routine:routine:CISampleRoutineExport"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("study:routine:CISampleRoutineExport"),
    ).not.toBeInTheDocument();
  });
});
