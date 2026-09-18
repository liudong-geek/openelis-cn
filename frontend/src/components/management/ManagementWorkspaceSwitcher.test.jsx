import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ManagementWorkspaceSwitcher, {
  getManagementWorkspaceViews,
} from "./ManagementWorkspaceSwitcher";

const ALL_ROLES = [
  "Reports",
  "Global Administrator",
  "Audit Trail",
  "Analyser Import",
];

const renderSwitcher = (activeView = "configuration", roles = ALL_ROLES) => {
  const history = createMemoryHistory({ initialEntries: ["/MasterListsPage"] });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { roles } }}
        >
          <ManagementWorkspaceSwitcher activeView={activeView} />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("ManagementWorkspaceSwitcher", () => {
  test("shows the four authorized management tasks in one page-level switcher", () => {
    renderSwitcher();

    expect(
      screen.getByRole("tab", { name: "Management center" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("tab", { name: "Turn Around Time Report" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Audit Trail" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Analyzers" })).toBeInTheDocument();
  });

  test("navigates to the authorized analyzer workspace", () => {
    const history = renderSwitcher();

    fireEvent.click(screen.getByRole("tab", { name: "Analyzers" }));

    expect(history.location.pathname).toBe("/analyzers");
  });

  test("hides unavailable tasks and omits a redundant one-item switcher", () => {
    renderSwitcher("tat", ["Reports"]);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(
      getManagementWorkspaceViews(["Audit Trail"], "audit").map(
        (view) => view.id,
      ),
    ).toEqual(["audit"]);
  });
});
