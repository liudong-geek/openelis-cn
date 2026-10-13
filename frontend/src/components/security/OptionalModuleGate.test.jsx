/* eslint-disable local/no-raw-react-lazy -- Controlled test factories exercise suspension and rejection; production routes use lazyWithRetry. */
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Switch, useLocation, useParams } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import config from "../../config.json";
import en from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext } from "../layout/Layout";
import SecureRoute from "./SecureRoute";
import OptionalModuleGate from "./OptionalModuleGate";

vi.mock("react-confirm-alert", () => ({ confirmAlert: vi.fn() }));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return { ConfigurationContext: createContext(null) };
});
const modules = [
  "pathology",
  "immunohistochemistry",
  "cytology",
  "notebook",
  "storage",
  "shipment",
  "eqa",
];
const originalOptions = config.optionalModules;
beforeEach(() => {
  config.optionalModules = {};
});
afterEach(() => {
  cleanup();
  config.optionalModules = originalOptions;
  vi.restoreAllMocks();
});
function RoutedChild() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <output>
      {id}
      {location.search}
    </output>
  );
}
const view = (
  child,
  {
    module = "pathology",
    profile = "china",
    roles = ["Results"],
    labRoles = { Pathology: ["Results"] },
  } = {},
) =>
  render(
    <IntlProvider locale="en" messages={en}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            authenticated: true,
            roles,
            userLabRolesMap: labRoles,
          },
          isCheckingLogin: () => false,
        }}
      >
        <ConfigurationContext.Provider
          value={{ configurationProperties: { NAVIGATION_PROFILE: profile } }}
        >
          <MemoryRouter initialEntries={["/case/42?returnTo=kept"]}>
            <Switch>
              <SecureRoute
                path="/case/:id"
                role="Results"
                labUnitRole={{ Pathology: ["Results"] }}
                render={() => (
                  <OptionalModuleGate module={module}>
                    {child}
                  </OptionalModuleGate>
                )}
              />
            </Switch>
          </MemoryRouter>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );

it.each(modules)(
  "does not load or mount a disabled %s direct route",
  (module) => {
    const factory = vi.fn(async () => ({ default: RoutedChild }));
    const Child = React.lazy(factory);
    view(<Child />, { module });
    expect(
      screen.getByRole("heading", { name: en["optionalModule.closed.title"] }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: en["home.label"] }),
    ).toHaveAttribute("href", "/");
    expect(factory).not.toHaveBeenCalled();
  },
);

it.each([false, "true", 1, null])(
  "requires boolean true for China enablement (%s)",
  (enabled) => {
    config.optionalModules.pathology = enabled;
    const child = vi.fn(() => <RoutedChild />);
    const Child = child;
    view(<Child />);
    expect(child).not.toHaveBeenCalled();
  },
);

it("shows loading, then preserves route parameters and search on an enabled module", async () => {
  config.optionalModules.pathology = true;
  let complete;
  const factory = vi.fn(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const Child = React.lazy(factory);
  view(<Child />);
  expect(screen.getByRole("status")).toHaveTextContent(
    en["loading.description"],
  );
  await act(async () => complete({ default: RoutedChild }));
  expect(screen.getByText("42?returnTo=kept")).toBeVisible();
  expect(factory).toHaveBeenCalledTimes(1);
});

it("preserves global profile availability with the module flag off", () => {
  view(<RoutedChild />, { profile: "global" });
  expect(screen.getByText("42?returnTo=kept")).toBeVisible();
});

it.each([{ roles: [] }, { labRoles: {} }])(
  "cannot enable a module through a missing original role (%j)",
  (permission) => {
    config.optionalModules.pathology = true;
    const factory = vi.fn(async () => ({ default: RoutedChild }));
    const Child = React.lazy(factory);
    view(<Child />, permission);
    expect(factory).not.toHaveBeenCalled();
    expect(screen.queryByText("42?returnTo=kept")).toBeNull();
  },
);

it("keeps the route's visible recovery state when loading fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  config.optionalModules.storage = true;
  const failure = new Error("chunk unavailable");
  const handleExpectedError = (event) => {
    if (event.error === failure) event.preventDefault();
  };
  window.addEventListener("error", handleExpectedError);
  try {
    const Child = React.lazy(() => Promise.reject(failure));
    view(<Child />, { module: "storage" });
    expect(
      await screen.findByRole("heading", {
        name: en["errorBoundary.route.storage.title"],
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: en["errorBoundary.reload"] }),
    ).toBeVisible();
  } finally {
    window.removeEventListener("error", handleExpectedError);
  }
});
