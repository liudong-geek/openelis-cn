import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/en.json";
import TestingWorkspaceSwitcher, {
  getTestingWorkspaceViewIndex,
  TESTING_WORKSPACE_VIEWS,
} from "./TestingWorkspaceSwitcher";

const renderSwitcher = (activeView = "results") => {
  const history = createMemoryHistory({
    initialEntries: [
      TESTING_WORKSPACE_VIEWS[getTestingWorkspaceViewIndex(activeView)].path,
    ],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <TestingWorkspaceSwitcher activeView={activeView} />
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("TestingWorkspaceSwitcher", () => {
  test("shows the three daily testing tasks in one page-level switcher", () => {
    renderSwitcher();

    expect(screen.getByRole("tab", { name: "Result entry" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: "Referred-out tests" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Workplan" })).toBeInTheDocument();
  });

  test("navigates to an existing route without a document reload", () => {
    const history = renderSwitcher();

    fireEvent.click(screen.getByRole("tab", { name: "Workplan" }));

    expect(history.location.pathname).toBe("/WorkPlanByTest");
    expect(history.location.search).toBe("?type=test");
  });
});
