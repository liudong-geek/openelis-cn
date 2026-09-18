import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import QualityWorkspaceSwitcher, {
  getQualityWorkspaceViews,
} from "./QualityWorkspaceSwitcher";

const renderSwitcher = (
  activeView = "nonconformity",
  roles = ["Reception", "Validation", "Results", "Lab Supervisor"],
) => {
  const history = createMemoryHistory({ initialEntries: ["/NceDashboard"] });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { roles } }}
        >
          <QualityWorkspaceSwitcher activeView={activeView} />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("QualityWorkspaceSwitcher", () => {
  test("shows the three authorized quality tasks in one page-level switcher", () => {
    renderSwitcher();

    expect(screen.getByRole("tab", { name: "Non-Conform" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: "Alerts Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Quality Control Dashboard" }),
    ).toBeInTheDocument();
  });

  test("navigates to the registered QC dashboard route", () => {
    const history = renderSwitcher();

    fireEvent.click(
      screen.getByRole("tab", { name: "Quality Control Dashboard" }),
    );

    expect(history.location.pathname).toBe("/analyzers/qc/db");
  });

  test("hides unavailable tasks and omits a redundant one-item switcher", () => {
    renderSwitcher("qc", ["Lab Supervisor"]);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(
      getQualityWorkspaceViews(["Results"], "alerts").map((view) => view.id),
    ).toEqual(["alerts"]);
  });
});
