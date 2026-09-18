import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ReviewReportWorkspaceSwitcher, {
  getReviewReportWorkspaceViews,
} from "./ReviewReportWorkspaceSwitcher";

const renderSwitcher = (
  activeView = "review",
  roles = ["Validation", "Reports"],
) => {
  const history = createMemoryHistory({
    initialEntries: [
      activeView === "review" ? "/validation?type=routine" : "/RoutineReports",
    ],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { roles } }}
        >
          <ReviewReportWorkspaceSwitcher activeView={activeView} />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("ReviewReportWorkspaceSwitcher", () => {
  test("shows authorized review and report tasks in one page-level switcher", () => {
    renderSwitcher();

    expect(
      screen.getByRole("tab", { name: "Review workbench" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "Report workbench" }),
    ).toBeInTheDocument();
  });

  test("navigates to the existing report route without a document reload", () => {
    const history = renderSwitcher();

    fireEvent.click(screen.getByRole("tab", { name: "Report workbench" }));

    expect(history.location.pathname).toBe("/RoutineReports");
  });

  test("does not expose a workspace that the current role cannot open", () => {
    renderSwitcher("review", ["Validation"]);

    expect(screen.getByRole("tab", { name: "Review workbench" })).toBeVisible();
    expect(
      screen.queryByRole("tab", { name: "Report workbench" }),
    ).not.toBeInTheDocument();
    expect(getReviewReportWorkspaceViews(["Reports"], "reports")).toHaveLength(
      1,
    );
  });
});
