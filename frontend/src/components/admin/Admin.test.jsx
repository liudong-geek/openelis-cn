import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Route } from "react-router-dom";
import { vi } from "vitest";
import Admin from "./Admin";
import AdminDashboard from "./AdminDashboard";
import messages from "../../languages/en.json";

vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  getFromOpenElisServerV2: vi.fn(async () => ({})),
  postToOpenElisServer: vi.fn(),
  putToOpenElisServer: vi.fn(),
  deleteToOpenElisServer: vi.fn(),
}));

const renderAdmin = (route = "/MasterListsPage") => {
  const basePath = route.startsWith("/admin") ? "/admin" : "/MasterListsPage";

  return render(
    <MemoryRouter initialEntries={[route]}>
      <IntlProvider locale="en" messages={messages}>
        <Route path={basePath} component={Admin} />
        <Route
          path="*"
          render={({ location }) => (
            <span data-testid="current-path">{location.pathname}</span>
          )}
        />
      </IntlProvider>
    </MemoryRouter>,
  );
};

describe("Admin", () => {
  test.each(["/MasterListsPage", "/admin"])(
    "renders a dashboard on the base admin route %s",
    (route) => {
      const { container } = renderAdmin(route);

      expect(
        screen.getByText(messages["admin.dashboard.title"]),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: messages["workspace.organizationPeople.title"],
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(messages["workspace.masterData.title"]),
      ).toBeInTheDocument();
      expect(screen.getAllByTestId("admin-dashboard-domain")).toHaveLength(6);
      expect(
        container.querySelectorAll(".admin-dashboard__tile-icon"),
      ).toHaveLength(6);
      expect(
        container.querySelectorAll(".admin-dashboard__domain-links a"),
      ).toHaveLength(8);
      expect(document.querySelector(".cds--side-nav")).not.toBeInTheDocument();
    },
  );

  test("dashboard links navigate within the current admin route family", () => {
    render(
      <MemoryRouter initialEntries={["/MasterListsPage"]}>
        <IntlProvider locale="en" messages={messages}>
          <AdminDashboard basePath="/MasterListsPage" />
          <Route
            path="*"
            render={({ location }) => (
              <span data-testid="current-path">{location.pathname}</span>
            )}
          />
        </IntlProvider>
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("link", {
        name: messages["workspace.organizationPeople.title"],
      }),
    );

    expect(screen.getByTestId("current-path")).toHaveTextContent(
      "/MasterListsPage/organizationPeopleWorkspace",
    );
  });

  test("searches configuration links and keeps their business domain context", () => {
    render(
      <MemoryRouter initialEntries={["/MasterListsPage"]}>
        <IntlProvider locale="en" messages={messages}>
          <AdminDashboard basePath="/MasterListsPage" />
        </IntlProvider>
      </MemoryRouter>,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        messages["admin.dashboard.search.placeholder"],
      ),
      { target: { value: "barcode" } },
    );

    expect(screen.getAllByTestId("admin-dashboard-domain")).toHaveLength(1);
    expect(
      screen.getByText(messages["admin.dashboard.domain.workflow"]),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: messages["workspace.workflowReport.title"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(messages["unifiedSystemUser.browser.title"]),
    ).not.toBeInTheDocument();
  });
});
