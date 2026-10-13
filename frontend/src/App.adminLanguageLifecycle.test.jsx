import React, { useContext } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import UserSessionDetailsContext from "./UserSessionDetailsContext";
import { AdminCurrentObjectProvider } from "./components/layout/AdminCurrentObjectContext";

// This leaf has no identity hook: its lifetime must be owned by the real
// App -> SecureRoute -> Admin route, including administration pages outside
// the two editors that also have their own request guards.
vi.mock(
  "./components/admin/systemOperationsWorkspace/SystemOperationsWorkspace",
  async () => {
    const { useState } = await import("react");
    const { FormattedMessage } = await import("react-intl");
    return {
      default: function SystemOperationsFixture() {
        const [draft, setDraft] = useState("");
        return (
          <>
            <input
              aria-label="Fixture administration draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <FormattedMessage id="home.label" />
          </>
        );
      },
    };
  },
);

// The China edition exposes only Chinese. Make a second bundled locale
// available in this fixture to exercise App's actual language transition.
vi.mock("./languages", async () => {
  const actual = await vi.importActual("./languages");
  return {
    ...actual,
    defaultLanguages: {
      ...actual.defaultLanguages,
      en: { label: "English", messages: actual.languageMessages.en },
    },
  };
});
vi.mock("./components/layout/Layout", async () => {
  const actual = await vi.importActual("./components/layout/Layout");
  return {
    ...actual,
    default: function LayoutFixture({ children, onChangeLanguage }) {
      const session = useContext(UserSessionDetailsContext);
      return (
        <actual.ConfigurationContext.Provider
          value={{ configurationProperties: {} }}
        >
          <actual.NotificationContext.Provider
            value={{
              notificationVisible: false,
              addNotification: () => {},
              setNotificationVisible: () => {},
            }}
          >
            <AdminCurrentObjectProvider>
              <button onClick={() => onChangeLanguage("en")}>
                Fixture language
              </button>
              <button onClick={() => session.refresh()}>
                Fixture account refresh
              </button>
              {children}
            </AdminCurrentObjectProvider>
          </actual.NotificationContext.Provider>
        </actual.ConfigurationContext.Provider>
      );
    },
  };
});
const detail = {
  id: "5",
  name: "血清",
  description: "Serum-internal",
  domain: "CLINICAL",
  isActive: true,
  testCount: 0,
  abbreviation: "SR",
  sortOrder: 7,
  whonetCode: "SER",
  disposalInstructions: "",
  translations: { zh: "血清", en: "Serum", fr: "Sérum" },
};
let identity, calls;
const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  identity = {
    authenticated: true,
    userId: "admin",
    sessionId: "one",
    roles: ["Global Administrator"],
    userLabRolesMap: {},
  };
  calls = [];
  localStorage.clear();
  window.history.replaceState(
    {},
    "",
    "/MasterListsPage/SampleTypeManagement/5/basic-info",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, options) => {
      const path = new URL(String(input), window.location.origin).pathname;
      calls.push({ path, options });
      if (path.endsWith("/session")) return json(identity);
      if (path.endsWith("/rest/domains"))
        return json([{ id: "CLINICAL", labelKey: "label.domain.CLINICAL" }]);
      if (path.endsWith("/rest/sample-types"))
        return json({ success: true, data: [detail] });
      if (path.endsWith("/rest/sample-types/5"))
        return json({ success: true, data: detail });
      return json({});
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

it("updates messages without remounting the actual admin editor, but resets it for a different session", async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  const original = await screen.findByLabelText("中文显示名称");
  const dialog = original.closest('[role="dialog"]');
  expect(dialog).toBeVisible();
  fireEvent.change(original, { target: { value: "未保存的草稿" } });
  const readCount = calls.filter(({ path }) =>
    path.endsWith("/rest/sample-types/5"),
  ).length;
  await act(async () => fireEvent.click(screen.getByText("Fixture language")));
  expect(original.isConnected).toBe(true);
  expect(original).toHaveValue("未保存的草稿");
  expect(within(dialog).getByRole("button", { name: "Save" })).toBeVisible();
  expect(localStorage.getItem("locale")).toBe("en");
  expect(
    calls.filter(({ path }) => path.endsWith("/rest/sample-types/5")),
  ).toHaveLength(readCount);
  expect(
    calls.filter(({ options }) => options.method && options.method !== "GET"),
  ).toHaveLength(0);

  identity = { ...identity, sessionId: "two" };
  await act(async () =>
    fireEvent.click(screen.getByText("Fixture account refresh")),
  );
  expect(original.isConnected).toBe(false);
  expect(screen.queryByDisplayValue("未保存的草稿")).toBeNull();
  expect(
    calls.filter(({ path }) => path.endsWith("/rest/sample-types/5")),
  ).toHaveLength(readCount + 1);
});

it("owns every administration page by account/session while keeping language changes in place", async () => {
  window.history.replaceState({}, "", "/admin/systemOperations");
  render(<App />);
  const original = await screen.findByLabelText("Fixture administration draft");
  fireEvent.change(original, { target: { value: "administration draft" } });
  await act(async () => fireEvent.click(screen.getByText("Fixture language")));
  expect(original.isConnected).toBe(true);
  expect(original).toHaveValue("administration draft");
  expect(screen.getByText("Home")).toBeVisible();
  identity = {
    ...identity,
    userId: "different-admin",
    sessionId: "different-session",
  };
  await act(async () =>
    fireEvent.click(screen.getByText("Fixture account refresh")),
  );
  expect(original.isConnected).toBe(false);
  expect(screen.getByLabelText("Fixture administration draft")).toHaveValue("");
});
