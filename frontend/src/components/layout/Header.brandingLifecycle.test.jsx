import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import Header from "./Header";
import { ConfigurationContext, NotificationContext } from "./Layout";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/en.json";

const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
let brandingReads, menuReads, statusReads, controlMenu;
beforeEach(() => {
  brandingReads = [];
  menuReads = [];
  statusReads = [];
  controlMenu = false;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      const path = String(url);
      if (path.endsWith("/rest/site-branding")) {
        const pending = deferred();
        brandingReads.push({ ...pending, signal: options.signal });
        return pending.promise;
      }
      if (path.endsWith("/rest/menu")) {
        const pending = deferred();
        menuReads.push({ ...pending, signal: options.signal });
        if (!controlMenu)
          pending.resolve(
            json([
              {
                menu: {
                  elementId: "menu_home",
                  displayKey: "banner.menu.home",
                  actionURL: "/Dashboard",
                  isActive: true,
                },
                childMenus: [],
              },
            ]),
          );
        return pending.promise;
      }
      if (path.endsWith("/rest/database-cleaning/status")) {
        const pending = deferred();
        statusReads.push({ ...pending, signal: options.signal });
        return pending.promise;
      }
      return Promise.resolve(
        json(path.endsWith("/rest/notifications") ? [] : {}),
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const tree = (session) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{ userSessionDetails: session, logout: vi.fn() }}
      >
        <ConfigurationContext.Provider
          value={{
            configurationProperties: { NAVIGATION_PROFILE: "global" },
            enabledLanguages: { en: { messages } },
            reloadConfiguration: vi.fn(),
          }}
        >
          <NotificationContext.Provider
            value={{
              notificationVisible: false,
              setNotificationVisible: vi.fn(),
              notifications: [],
              addNotification: vi.fn(),
              removeNotification: vi.fn(),
            }}
          >
            <Header
              navContext="main"
              onChangeLanguage={vi.fn()}
              navOpen={false}
              navPersistent={false}
              closeSideNav={vi.fn()}
              showSideNav={false}
            />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const flush = async (callback) => {
  await act(async () => {
    callback();
  });
};

describe("Header logo read ownership", () => {
  test("branding updates cancel the old actual signal and cannot overwrite the current logo", async () => {
    render(tree({ authenticated: false }));
    expect(brandingReads).toHaveLength(1);
    await flush(() => window.dispatchEvent(new Event("branding-updated")));
    expect(brandingReads).toHaveLength(2);
    expect(brandingReads[0].signal.aborted).toBe(true);
    await flush(() =>
      brandingReads[1].resolve(json({ headerLogoUrl: "/current.png" })),
    );
    await flush(() =>
      brandingReads[0].resolve(json({ headerLogoUrl: "/stale.png" })),
    );
    expect(
      screen
        .getByRole("img", { name: messages["header.logo.alt"] })
        .getAttribute("src"),
    ).toContain("/current.png");
  });

  test("authentication changes cancel the anonymous logo read and pagehide cancels the new one", async () => {
    const view = render(tree({ authenticated: false }));
    view.rerender(
      tree({
        authenticated: true,
        userId: "current",
        sessionId: "current-session",
        roles: [],
      }),
    );
    expect(brandingReads[0].signal.aborted).toBe(true);
    expect(brandingReads).toHaveLength(2);
    await flush(() =>
      brandingReads[0].resolve(json({ headerLogoUrl: "/stale-anonymous.png" })),
    );
    expect(
      screen
        .getByRole("img", { name: messages["header.logo.alt"] })
        .getAttribute("src"),
    ).not.toContain("stale-anonymous");
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    expect(brandingReads[1].signal.aborted).toBe(true);
    view.unmount();
  });

  test("unmount invalidates the logo response even when the mock server ignores cancellation", async () => {
    const view = render(tree({ authenticated: false }));
    view.unmount();
    expect(brandingReads[0].signal).toBeInstanceOf(AbortSignal);
    expect(brandingReads[0].signal.aborted).toBe(true);
    await flush(() =>
      brandingReads[0].resolve(json({ headerLogoUrl: "/stale.png" })),
    );
    expect(
      screen.queryByRole("img", { name: messages["header.logo.alt"] }),
    ).not.toBeInTheDocument();
  });
  test("same-account professional-group changes invalidate logo, training and menu reads", async () => {
    controlMenu = true;
    const first = {
      authenticated: true,
      userId: "same",
      sessionId: "same",
      loginLabUnit: "生化",
      roles: [],
      userLabRolesMap: { 1: ["Results"] },
    };
    const view = render(tree(first));
    const oldBrand = brandingReads[0],
      oldStatus = statusReads[0],
      oldMenu = menuReads[0];
    view.rerender(tree({ ...first, userLabRolesMap: { 2: ["Validation"] } }));
    expect(
      [oldBrand, oldStatus, oldMenu].every((request) => request.signal.aborted),
    ).toBe(true);
    expect(brandingReads).toHaveLength(2);
    expect(statusReads).toHaveLength(2);
    expect(menuReads).toHaveLength(2);
    await flush(() => oldMenu.resolve(json([])));
    await flush(() =>
      oldBrand.resolve(json({ headerLogoUrl: "/stale-scope.png" })),
    );
    await flush(() => oldStatus.resolve(json({ trainingInstallation: true })));
    expect(
      screen
        .getByRole("img", { name: messages["header.logo.alt"] })
        .getAttribute("src"),
    ).not.toContain("stale-scope");
  });
  test("pagehide cancels the menu timeout/retry and BFCache resumes status and menu exactly once", async () => {
    vi.useFakeTimers();
    controlMenu = true;
    render(
      tree({
        authenticated: true,
        userId: "same",
        sessionId: "same",
        roles: [],
      }),
    );
    expect(menuReads).toHaveLength(1);
    expect(statusReads).toHaveLength(1);
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    expect(menuReads[0].signal.aborted).toBe(true);
    expect(statusReads[0].signal.aborted).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });
    expect(menuReads).toHaveLength(1);
    const resume = new Event("pageshow");
    Object.defineProperty(resume, "persisted", { value: true });
    await flush(() => window.dispatchEvent(resume));
    expect(menuReads).toHaveLength(2);
    expect(statusReads).toHaveLength(2);
    expect(menuReads[1].signal.aborted).toBe(false);
    expect(statusReads[1].signal.aborted).toBe(false);
  });
});
