import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/en.json";
import WorkplanModeSwitcher, {
  getWorkplanModeIndex,
  WORKPLAN_MODES,
} from "./WorkplanModeSwitcher";

const renderSwitcher = (type = "test") => {
  const history = createMemoryHistory({
    initialEntries: [WORKPLAN_MODES[getWorkplanModeIndex(type)].path],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <WorkplanModeSwitcher type={type} />
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("WorkplanModeSwitcher", () => {
  test("shows the four workplan views inside one workspace", () => {
    renderSwitcher();

    expect(screen.getByRole("tab", { name: "By Test Type" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "By Panel" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "By Unit" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "By Priority" }),
    ).toBeInTheDocument();
  });

  test("moves between existing bookmark-compatible routes", () => {
    const history = renderSwitcher();

    fireEvent.click(screen.getByRole("tab", { name: "By Priority" }));

    expect(history.location.pathname).toBe("/WorkPlanByPriority");
    expect(history.location.search).toBe("?type=priority");
  });
});
