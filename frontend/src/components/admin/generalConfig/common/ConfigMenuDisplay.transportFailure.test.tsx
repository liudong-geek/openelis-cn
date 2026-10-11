import React, { useState } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import ConfigMenuDisplay from "./ConfigMenuDisplay";
import Admin from "../../Admin";
import SecureRoute from "../../../security/SecureRoute";
import UserSessionDetailsContext from "../../../../UserSessionDetailsContext";
import {
  ConfigurationContext,
  NotificationContext,
} from "../../../layout/Layout";
import messages from "../../../../languages/en.json";
import { defaultLanguages } from "../../../../languages";

vi.mock("../../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext(null),
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});

const configuration = {
  id: "1",
  name: "lab director",
  paramName: "lab director",
  description: "instructions.site.lab.director",
  value: "Original director",
  valueType: "text",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notificationVisible, setNotificationVisible] = useState(false);
  type Notification = NonNullable<
    React.ContextType<typeof NotificationContext>
  >["notifications"][number];
  const [notifications, setNotifications] = useState<Notification[]>([]);
  return (
    // Match Layout: publishing a notification also publishes a new configuration
    // context value, which SecureRoute consumes before the real Admin route.
    <ConfigurationContext.Provider
      value={{
        configurationProperties: {},
        reloadConfiguration: () => undefined,
        navigationMenuItems: null,
        publishNavigationMenu: () => undefined,
        supportedLocales: [],
        enabledLanguages: defaultLanguages,
      }}
    >
      <NotificationContext.Provider
        value={{
          notificationVisible,
          setNotificationVisible,
          notifications,
          addNotification: (notification: Notification) =>
            setNotifications((current) => [...current, notification]),
          removeNotification: (index: number) =>
            setNotifications((current) =>
              current.filter((_, currentIndex) => currentIndex !== index),
            ),
        }}
      >
        {children}
      </NotificationContext.Provider>
    </ConfigurationContext.Provider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const AdminRoute = () => <Admin />;

const routes = [
  {
    actualRoute: false,
    path: "PrintedReportsConfigurationMenu",
    menu: "PrintedReportsConfigurationMenu",
  },
  ...[
    ["NonConformityConfigurationMenu", "NonConformityConfigurationMenu"],
    ["MenuStatementConfigMenu", "MenuStatementConfigMenu"],
    ["ValidationConfigurationMenu", "ValidationConfigurationMenu"],
    ["SampleEntryConfigurationMenu", "SampleEntryConfigMenu"],
    ["WorkPlanConfigurationMenu", "WorkplanConfigurationMenu"],
    ["SiteInformationMenu", "SiteInformationMenu"],
    ["ResultConfigurationMenu", "ResultConfigurationMenu"],
    ["PatientConfigurationMenu", "PatientConfigurationMenu"],
    ["PrintedReportsConfigurationMenu", "PrintedReportsConfigurationMenu"],
  ].map(([path, menu]) => ({ actualRoute: true, path, menu })),
];

test.each(routes)(
  "an HTTP 500 retains the draft and permits a successful retry: $path, actual routing=$actualRoute",
  async ({ actualRoute, path, menu }) => {
    let completeFailure: (response: Response) => void;
    const failure = new Promise<Response>((resolve) => {
      completeFailure = resolve;
    });
    let savedValue = configuration.value;
    let writes = 0;
    const transport = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        writes += 1;
        if (writes === 1) return failure;
        savedValue = JSON.parse(String(options.body)).value;
        return json({ saved: true });
      }
      if (url.endsWith(`/rest/${menu}`)) {
        return json({ menuList: [{ ...configuration, value: savedValue }] });
      }
      if (url.endsWith(`/rest/${menu.replace(/Menu$/, "")}?ID=1`)) {
        return json({ ...configuration, value: savedValue });
      }
      throw new Error(`Unexpected test request: ${url}`);
    });
    vi.stubGlobal("fetch", transport);
    render(
      <MemoryRouter initialEntries={[`/MasterListsPage/${path}`]}>
        <IntlProvider locale="en" messages={messages}>
          <NotificationProvider>
            {actualRoute ? (
              <UserSessionDetailsContext.Provider
                value={{
                  userSessionDetails: {
                    authenticated: true,
                    roles: ["Global Administrator"],
                  },
                  errorLoadingSessionDetails: false,
                  isCheckingLogin: () => false,
                }}
              >
                <SecureRoute
                  path="/MasterListsPage"
                  component={AdminRoute}
                  role="Global Administrator"
                />
              </UserSessionDetailsContext.Provider>
            ) : (
              <ConfigMenuDisplay
                id="sidenav.label.admin.formEntry.PrintedReportsconfig"
                label="Printed Reports Configuration"
                menuType="PrintedReportsConfigurationMenu"
              />
            )}
          </NotificationProvider>
        </IntlProvider>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", {
        name: messages["config.workspace.edit"],
      }),
    );
    const field = await screen.findByLabelText(
      messages["admin.page.configuration.formEntryConfigMenu.value"],
    );
    const dialog = field.closest('[role="dialog"]') as HTMLElement;
    await user.clear(field);
    await user.type(field, "Pending director");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(field).toBeDisabled();
    await act(async () => {
      completeFailure(json({ error: "Controlled verification failure" }, 500));
    });
    await vi.waitFor(() => expect(field).toBeEnabled());
    expect(field).toBeInTheDocument();
    expect(field.closest('[role="dialog"]')).toBe(dialog);
    expect(field).toHaveValue("Pending director");
    expect(writes).toBe(1);
    expect(
      transport.mock.calls.filter(([url]) => url.endsWith(`/rest/${menu}`)),
    ).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(field).not.toBeInTheDocument());
    expect(writes).toBe(2);
    expect(savedValue).toBe("Pending director");
    expect(
      transport.mock.calls.filter(([url]) => url.endsWith(`/rest/${menu}`)),
    ).toHaveLength(2);
  },
);

test("moving between configuration categories closes the previous editor without carrying its row ID or draft", async () => {
  const siteConfiguration = {
    ...configuration,
    id: "2",
    name: "SiteName",
    paramName: "SiteName",
    value: "Original site",
  };
  const transport = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST")
      throw new Error("Category navigation must not submit the draft");
    if (url.endsWith("/rest/PrintedReportsConfigurationMenu"))
      return json({ menuList: [configuration] });
    if (url.endsWith("/rest/PrintedReportsConfiguration?ID=1"))
      return json(configuration);
    if (url.endsWith("/rest/SiteInformationMenu"))
      return json({ menuList: [siteConfiguration] });
    if (url.endsWith("/rest/SiteInformation?ID=2"))
      return json(siteConfiguration);
    if (url.endsWith("/rest/SiteInformation?ID=1"))
      return json({ ...siteConfiguration, id: "1", value: "Wrong site row" });
    throw new Error(`Unexpected test request: ${url}`);
  });
  vi.stubGlobal("fetch", transport);
  const history = createMemoryHistory({
    initialEntries: ["/MasterListsPage/PrintedReportsConfigurationMenu"],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <NotificationProvider>
          <UserSessionDetailsContext.Provider
            value={{
              userSessionDetails: {
                authenticated: true,
                roles: ["Global Administrator"],
              },
              errorLoadingSessionDetails: false,
              isCheckingLogin: () => false,
            }}
          >
            <SecureRoute
              path="/MasterListsPage"
              component={AdminRoute}
              role="Global Administrator"
            />
          </UserSessionDetailsContext.Provider>
        </NotificationProvider>
      </IntlProvider>
    </Router>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: messages["config.workspace.edit"],
    }),
  );
  const valueLabel =
    messages["admin.page.configuration.formEntryConfigMenu.value"];
  const field = await screen.findByLabelText(valueLabel);
  await user.clear(field);
  await user.type(field, "Unsubmitted director draft");
  act(() => history.push("/MasterListsPage/SiteInformationMenu"));
  await screen.findByText("Original site");
  expect(screen.queryByLabelText(valueLabel)).toBeNull();
  expect(
    transport.mock.calls.some(([url]) =>
      url.endsWith("/rest/SiteInformation?ID=1"),
    ),
  ).toBe(false);
  await user.click(
    screen.getByRole("button", { name: messages["config.workspace.edit"] }),
  );
  expect(await screen.findByLabelText(valueLabel)).toHaveValue("Original site");
  act(() => history.push("/MasterListsPage/PrintedReportsConfigurationMenu"));
  await screen.findByText("Original director");
  expect(screen.queryByLabelText(valueLabel)).toBeNull();
  await user.click(
    screen.getByRole("button", { name: messages["config.workspace.edit"] }),
  );
  expect(await screen.findByLabelText(valueLabel)).toHaveValue(
    "Original director",
  );
  expect(
    transport.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
});
