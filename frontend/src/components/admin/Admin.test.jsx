import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Route } from "react-router-dom";
import { vi } from "vitest";
import Admin from "./Admin";
import messages from "../../languages/en.json";

vi.mock("./testManagementConfigMenu/TestManagementConfigMenu", () => ({
  default: () => <span>Laboratory master data workspace</span>,
}));

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
    "sends the base admin route directly to the first configuration task %s",
    (route) => {
      renderAdmin(route);
      const basePath = route.startsWith("/admin")
        ? "/admin"
        : "/MasterListsPage";

      expect(screen.getByTestId("current-path")).toHaveTextContent(
        `${basePath}/testManagementConfigMenu`,
      );
      expect(
        screen.getByText("Laboratory master data workspace"),
      ).toBeInTheDocument();
    },
  );
});
