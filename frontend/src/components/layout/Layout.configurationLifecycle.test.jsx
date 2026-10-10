import React, { useContext } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import Layout, { ConfigurationContext } from "./Layout";
import Login from "../Login";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/en.json";
import zhMessages from "../../languages/zh.json";

vi.mock("./Header", () => ({ default: () => <div>header</div> }));
vi.mock("./Footer", () => ({ default: () => <div>footer</div> }));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const owner = (id) => ({
  authenticated: true,
  userId: id,
  sessionId: `session-${id}`,
  roles: [],
});
function Probe() {
  const context = useContext(ConfigurationContext);
  return (
    <>
      <output data-testid="configuration">
        {JSON.stringify(context.configurationProperties)}
      </output>
      <output data-testid="supported-locales">
        {JSON.stringify(context.supportedLocales)}
      </output>
      <button onClick={context.reloadConfiguration}>
        Reload configuration
      </button>
    </>
  );
}
const tree = (user) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider value={{ userSessionDetails: user }}>
        <Layout>
          <Probe />
        </Layout>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
let requests;
beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      const pending = deferred();
      requests.push({
        ...pending,
        url: String(url),
        signal: options.signal,
        options,
      });
      return pending.promise;
    }),
  );
});

const publicConfiguration = {
  useFormLogin: "true",
  useSaml: "false",
  BANNER_TEXT: "public configuration",
};
const activeLocales = [{ localeCode: "zh", displayName: "简体中文" }];
const locales = () =>
  requests.filter((request) =>
    request.url.endsWith("/supportedlocales/active"),
  );
const loginTree = (user) => (
  <MemoryRouter initialEntries={["/login"]}>
    <IntlProvider locale="zh" messages={zhMessages}>
      <UserSessionDetailsContext.Provider
        value={{ userSessionDetails: user, refresh: vi.fn() }}
      >
        <Layout>
          <Probe />
          {user.authenticated !== true && <Login />}
        </Layout>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const usernameInput = () => document.querySelector("#loginName");
const passwordInput = () => document.querySelector("#password");

describe("anonymous login configuration continuity", () => {
  test("a public config arriving before the anonymous session preserves the actual form, entered values and public locale read", async () => {
    const view = render(loginTree({}));
    const publicRead = configurations()[0];
    const localeRead = locales()[0];
    await flush(() => publicRead.resolve(json(publicConfiguration)));
    const username = usernameInput();
    const password = passwordInput();
    expect(username).toBeVisible();
    expect(password).toBeVisible();
    fireEvent.change(username, { target: { value: "synthetic-account" } });
    fireEvent.change(password, { target: { value: "synthetic-password" } });

    view.rerender(
      loginTree({ authenticated: false, sessionId: "anonymous-1" }),
    );
    expect(usernameInput()).toBe(username);
    expect(passwordInput()).toBe(password);
    expect(username).toBeVisible();
    expect(username).toHaveValue("synthetic-account");
    expect(password).toHaveValue("synthetic-password");
    expect(publicRead.signal.aborted).toBe(false);
    expect(localeRead.signal.aborted).toBe(false);
    expect(configurations()).toHaveLength(1);
    expect(locales()).toHaveLength(1);
    await flush(() => localeRead.resolve(json(activeLocales)));
    expect(screen.getByTestId("supported-locales")).toHaveTextContent(
      "简体中文",
    );

    view.rerender(
      loginTree({ authenticated: false, sessionId: "anonymous-2" }),
    );
    expect(usernameInput()).toBe(username);
    expect(passwordInput()).toBe(password);
    expect(username).toHaveValue("synthetic-account");
    expect(password).toHaveValue("synthetic-password");
    expect(configurations()).toHaveLength(1);
    expect(locales()).toHaveLength(1);
    await flush(() => fireEvent.submit(username.closest("form")));
    const loginRequest = requests.find((request) =>
      request.url.endsWith("/ValidateLogin?apiCall=true"),
    );
    expect(loginRequest.options.method).toBe("POST");
    const submitted = new URLSearchParams(loginRequest.options.body);
    expect(submitted.get("loginName")).toBe("synthetic-account");
    expect(submitted.get("password")).toBe("synthetic-password");
  });

  test("an anonymous session arriving before public config does not cancel that still valid public read", async () => {
    const view = render(loginTree({}));
    const publicRead = configurations()[0];
    const localeRead = locales()[0];
    view.rerender(
      loginTree({ authenticated: false, sessionId: "anonymous-1" }),
    );
    expect(publicRead.signal.aborted).toBe(false);
    expect(localeRead.signal.aborted).toBe(false);
    expect(configurations()).toHaveLength(1);
    await flush(() => publicRead.resolve(json(publicConfiguration)));
    await flush(() => localeRead.resolve(json(activeLocales)));
    expect(usernameInput()).toBeVisible();
    expect(passwordInput()).toBeVisible();
  });

  test("a current public reload failure preserves the form and entered values while keeping the error visible and retryable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(loginTree({ authenticated: false, sessionId: "anonymous-1" }));
    await flush(() => configurations()[0].resolve(json(publicConfiguration)));
    const username = usernameInput();
    fireEvent.change(username, { target: { value: "synthetic-account" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Reload configuration" }),
    );
    const failure = new TypeError("current public configuration failure");
    await flush(() => configurations()[1].reject(failure));
    expect(error).toHaveBeenCalledWith(failure);
    expect(
      screen.getByText(zhMessages["app.session.error.title"]),
    ).toBeVisible();
    expect(usernameInput()).toBe(username);
    expect(username).toHaveValue("synthetic-account");
    fireEvent.click(
      screen.getByRole("button", { name: zhMessages["button.retry"] }),
    );
    await flush(() => configurations()[2].resolve(json(publicConfiguration)));
    expect(usernameInput()).toBe(username);
    expect(username).toHaveValue("synthetic-account");
    expect(
      screen.queryByText(zhMessages["app.session.error.title"]),
    ).not.toBeInTheDocument();
  });

  test("public and authenticated configs never reuse each other's snapshot, and failures remain visible across each boundary", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(
      loginTree({ authenticated: false, sessionId: "anonymous-1" }),
    );
    await flush(() => configurations()[0].resolve(json(publicConfiguration)));
    const publicLocales = locales()[0];
    view.rerender(loginTree(owner("account")));
    expect(publicLocales.signal.aborted).toBe(true);
    expect(screen.getByTestId("configuration")).toHaveTextContent("{}");
    const authenticatedRead = configurations()[1];
    expect(
      authenticatedRead.url.endsWith("/rest/configuration-properties"),
    ).toBe(true);
    const authFailure = new TypeError(
      "current authenticated configuration failure",
    );
    await flush(() => authenticatedRead.reject(authFailure));
    expect(error).toHaveBeenCalledWith(authFailure);
    expect(
      screen.getByText(zhMessages["app.session.error.title"]),
    ).toBeVisible();
    expect(screen.getByTestId("configuration")).not.toHaveTextContent(
      "public configuration",
    );
    fireEvent.click(
      screen.getByRole("button", { name: zhMessages["button.retry"] }),
    );
    await flush(() =>
      configurations()[2].resolve(
        json({ privilegedProperty: "authenticated configuration" }),
      ),
    );
    expect(screen.getByTestId("configuration")).toHaveTextContent(
      "authenticated configuration",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reload configuration" }),
    );
    const pendingAuthenticatedRead = configurations()[3];
    const authenticatedLocales = locales()[1];
    view.rerender(
      loginTree({ authenticated: false, sessionId: "anonymous-2" }),
    );
    expect(pendingAuthenticatedRead.signal.aborted).toBe(true);
    expect(authenticatedLocales.signal.aborted).toBe(true);
    expect(screen.getByTestId("configuration")).toHaveTextContent("{}");
    expect(usernameInput()).toBeNull();
    const returnedPublicRead = configurations()[4];
    expect(
      returnedPublicRead.url.endsWith("/rest/open-configuration-properties"),
    ).toBe(true);
    const publicFailure = new TypeError(
      "returned public configuration failure",
    );
    await flush(() => returnedPublicRead.reject(publicFailure));
    expect(error).toHaveBeenCalledWith(publicFailure);
    expect(
      screen.getByText(zhMessages["app.session.error.title"]),
    ).toBeVisible();
    expect(screen.getByTestId("configuration")).not.toHaveTextContent(
      "authenticated configuration",
    );
    await flush(() =>
      pendingAuthenticatedRead.resolve(
        json({ privilegedProperty: "late authenticated configuration" }),
      ),
    );
    expect(screen.getByTestId("configuration")).not.toHaveTextContent(
      "authenticated configuration",
    );
    fireEvent.click(
      screen.getByRole("button", { name: zhMessages["button.retry"] }),
    );
    await flush(() => configurations()[5].resolve(json(publicConfiguration)));
    expect(usernameInput()).toBeVisible();
    expect(screen.getByTestId("configuration")).not.toHaveTextContent(
      "privilegedProperty",
    );
  });

  test.each([
    ["account", { userId: "different" }],
    ["session", { sessionId: "different" }],
    ["laboratory", { loginLabUnit: "different" }],
    ["roles", { roles: ["different"] }],
    ["professional-group roles", { userLabRolesMap: { 2: ["Validation"] } }],
  ])(
    "an authenticated %s change still cancels both old reads and hides the previous config",
    async (_dimension, change) => {
      const originalOwner = {
        ...owner("same"),
        loginLabUnit: "生化",
        userLabRolesMap: { 1: ["Results"] },
      };
      const view = render(loginTree(originalOwner));
      await flush(() =>
        configurations()[0].resolve(
          json({ BANNER_TEXT: "original authenticated config" }),
        ),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Reload configuration" }),
      );
      const oldConfiguration = configurations()[1];
      const oldLocales = locales()[0];
      view.rerender(loginTree({ ...originalOwner, ...change }));
      expect(oldConfiguration.signal.aborted).toBe(true);
      expect(oldLocales.signal.aborted).toBe(true);
      expect(screen.getByTestId("configuration")).toHaveTextContent("{}");
      expect(configurations()).toHaveLength(3);
      expect(locales()).toHaveLength(2);
      await flush(() =>
        oldLocales.resolve(
          json([{ localeCode: "zh", displayName: "stale locales" }]),
        ),
      );
      expect(screen.getByTestId("supported-locales")).not.toHaveTextContent(
        "stale locales",
      );
      await flush(() =>
        oldConfiguration.resolve(json({ BANNER_TEXT: "stale configuration" })),
      );
      expect(screen.getByTestId("configuration")).not.toHaveTextContent(
        "stale configuration",
      );
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const configurations = () =>
  requests.filter((request) =>
    request.url.endsWith("configuration-properties"),
  );
const flush = async (callback) => {
  await act(async () => {
    callback();
  });
};

describe("Layout configuration read ownership", () => {
  test("identity changes abort old configuration and locale signals; late old data stays hidden", async () => {
    const view = render(
      tree({
        ...owner("same"),
        loginLabUnit: "生化",
        userLabRolesMap: { 1: ["Results"] },
      }),
    );
    const oldRequests = [...requests];
    view.rerender(
      tree({
        ...owner("same"),
        loginLabUnit: "生化",
        userLabRolesMap: { 2: ["Validation"] },
      }),
    );
    expect(
      oldRequests.every(
        (request) =>
          request.signal instanceof AbortSignal && request.signal.aborted,
      ),
    ).toBe(true);
    const current = configurations()[1];
    await flush(() => current.resolve(json({ BANNER_TEXT: "second owner" })));
    await flush(() =>
      configurations()[0].resolve(json({ BANNER_TEXT: "stale first owner" })),
    );
    expect(screen.getByTestId("configuration")).toHaveTextContent(
      "second owner",
    );
    expect(screen.getByTestId("configuration")).not.toHaveTextContent("stale");
  });

  test("a replaced reload cannot overwrite current configuration even after response arrival", async () => {
    render(tree(owner("same")));
    await flush(() =>
      configurations()[0].resolve(json({ BANNER_TEXT: "initial" })),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reload configuration" }),
    );
    const old = configurations()[1];
    fireEvent.click(
      screen.getByRole("button", { name: "Reload configuration" }),
    );
    const current = configurations()[2];
    expect(old.signal.aborted).toBe(true);
    await flush(() => current.resolve(json({ BANNER_TEXT: "current reload" })));
    await flush(() => old.resolve(json({ BANNER_TEXT: "old reload" })));
    expect(screen.getByTestId("configuration")).toHaveTextContent(
      "current reload",
    );
  });

  test("active failure remains visible, preserves this owner's configuration and can be retried", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(tree(owner("same")));
    await flush(() =>
      configurations()[0].resolve(json({ BANNER_TEXT: "known configuration" })),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reload configuration" }),
    );
    const failure = new TypeError("Failed to fetch");
    await flush(() => configurations()[1].reject(failure));
    expect(error).toHaveBeenCalledWith(failure);
    expect(screen.getByTestId("configuration")).toHaveTextContent(
      "known configuration",
    );
    expect(screen.getByText(messages["app.session.error.title"])).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: messages["button.retry"] }),
    );
    await flush(() =>
      configurations()[2].resolve(json({ BANNER_TEXT: "recovered" })),
    );
    expect(screen.getByTestId("configuration")).toHaveTextContent("recovered");
    expect(
      screen.queryByText(messages["app.session.error.title"]),
    ).not.toBeInTheDocument();
  });

  test("pagehide cancels both reads and pageshow restores them; unmount also cancels the new reads", async () => {
    const view = render(tree(owner("same")));
    const original = [...requests];
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    expect(original.every((request) => request.signal.aborted)).toBe(true);
    await flush(() =>
      original.forEach((request) =>
        request.resolve(
          json(request.url.endsWith("/active") ? [] : { BANNER_TEXT: "stale" }),
        ),
      ),
    );
    expect(screen.getByTestId("configuration")).not.toHaveTextContent("stale");
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: true });
    await flush(() => window.dispatchEvent(event));
    expect(requests).toHaveLength(4);
    expect(requests[2].signal.aborted).toBe(false);
    await flush(() => view.unmount());
    expect(requests.slice(2).every((request) => request.signal.aborted)).toBe(
      true,
    );
  });
});
