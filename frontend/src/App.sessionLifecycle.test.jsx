import React, { useContext } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import UserSessionDetailsContext from "./UserSessionDetailsContext";
import { confirmAlert } from "react-confirm-alert";
import config from "./config.json";

vi.mock("react-confirm-alert", () => ({ confirmAlert: vi.fn() }));
vi.mock("./components/Login", () => ({
  default: () => <div>login route</div>,
}));
vi.mock("./components/layout/Layout", async () => ({
  ...(await vi.importActual("./components/layout/Layout")),
  default: ({ children }) => {
    const session = useContext(UserSessionDetailsContext);
    return (
      <>
        <output data-testid="session-value">
          {JSON.stringify(session.userSessionDetails)}
        </output>
        <output data-testid="session-error">
          {String(session.errorLoadingSessionDetails)}
        </output>
        <button onClick={() => session.refresh()}>Refresh session</button>
        <button onClick={session.logout}>End session</button>
        {children}
      </>
    );
  },
}));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let requests, brandingRequests, logoutRequests;
beforeEach(() => {
  vi.useFakeTimers();
  requests = [];
  brandingRequests = [];
  logoutRequests = [];
  localStorage.clear();
  window.history.replaceState({}, "", "/login");
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      if (String(url).endsWith("/session")) {
        const pending = deferred();
        requests.push({ ...pending, signal: options.signal });
        return pending.promise;
      }
      if (String(url).endsWith("/rest/site-branding")) {
        const pending = deferred();
        brandingRequests.push({ ...pending, signal: options.signal });
        return pending.promise;
      }
      if (/\/Logout(?:\?useSAML=true)?$/.test(String(url))) {
        const pending = deferred();
        logoutRequests.push({ ...pending, options, url });
        return pending.promise;
      }
      return Promise.resolve(json({}));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  vi.mocked(confirmAlert).mockClear();
  delete config.loginRedirect;
  window.history.replaceState({}, "", "/");
});
const flush = async (callback) => {
  await act(async () => {
    callback?.();
    await Promise.resolve();
  });
};

describe("App session lifetime", () => {
  test("a replaced successful read cannot overwrite newer identity or CSRF", async () => {
    render(<App />);
    expect(requests).toHaveLength(1);
    await flush(() =>
      fireEvent.click(screen.getByRole("button", { name: "Refresh session" })),
    );
    expect(requests).toHaveLength(2);
    expect(requests[0].signal.aborted).toBe(true);
    await flush(() =>
      requests[1].resolve(json({ authenticated: false, userId: "current" })),
    );
    await flush(() =>
      requests[0].resolve(
        json({ authenticated: true, userId: "stale", csrf: "stale-token" }),
      ),
    );
    expect(screen.getByTestId("session-value")).toHaveTextContent(
      '"userId":"current"',
    );
    expect(localStorage.getItem("CSRF")).toBeNull();
  });

  test("same-account professional-group changes replace the App branding lifetime", async () => {
    render(<App />);
    const current = {
      authenticated: true,
      userId: "same",
      sessionId: "same",
      loginLabUnit: "生化",
      roles: [],
      userLabRolesMap: { 1: ["Results"] },
    };
    await flush(() => requests[0].resolve(json(current)));
    const old = brandingRequests[1];
    expect(old).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    await flush(() =>
      requests[1].resolve(
        json({ ...current, userLabRolesMap: { 2: ["Validation"] } }),
      ),
    );
    expect(old.signal.aborted).toBe(true);
    expect(brandingRequests).toHaveLength(3);
    await flush(() => old.resolve(json({ headerColor: "#abcdef" })));
    expect(
      document.documentElement.style.getPropertyValue("--site-branding-header"),
    ).not.toBe("#abcdef");
  });

  test("logout immediately invalidates pending session and branding without changing its POST contract", async () => {
    render(<App />);
    await flush(() =>
      requests[0].resolve(
        json({
          authenticated: true,
          userId: "same",
          sessionId: "same",
          csrf: "current-token",
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    const oldRead = requests[1];
    const oldBrand = brandingRequests[1];
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(oldRead.signal.aborted).toBe(true);
    expect(oldBrand.signal.aborted).toBe(true);
    expect(logoutRequests).toHaveLength(1);
    expect(logoutRequests[0].options.method).toBe("POST");
    expect(logoutRequests[0].options.headers["X-CSRF-Token"]).toBe(
      "current-token",
    );
    await flush(() =>
      oldRead.resolve(
        json({ authenticated: true, csrf: "late-token", userId: "late" }),
      ),
    );
    await flush(() => oldBrand.resolve(json({ headerColor: "#fedcba" })));
    expect(localStorage.getItem("CSRF")).toBe("current-token");
    expect(screen.getByTestId("session-value")).not.toHaveTextContent("late");
    expect(
      document.documentElement.style.getPropertyValue("--site-branding-header"),
    ).not.toBe("#fedcba");
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    expect(requests).toHaveLength(2); // no fresh read while Logout is unresolved
  });

  test("pagehide aborts the owned signal and an old failure starts no retry or dialog", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    expect(requests[0].signal.aborted).toBe(true);
    await flush(() => requests[0].reject(new TypeError("Failed to fetch")));
    await act(async () => {
      vi.advanceTimersByTime(11000);
    });
    expect(requests).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
    expect(confirmAlert).not.toHaveBeenCalled();
  });

  test("unmount invalidates even a fetch implementation that resolves after abort", async () => {
    const view = render(<App />);
    await flush(() => view.unmount());
    expect(requests[0].signal.aborted).toBe(true);
    await flush(() =>
      requests[0].resolve(
        json({ authenticated: true, csrf: "stale-unmounted" }),
      ),
    );
    expect(localStorage.getItem("CSRF")).toBeNull();
  });

  test("canceling during the retry delay removes the timer and permits a fresh pageshow read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    const failure = new TypeError("current connection failure");
    await flush(() => requests[0].reject(failure));
    expect(error).toHaveBeenCalledWith(failure);
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    await act(async () => {
      vi.advanceTimersByTime(11000);
    });
    expect(requests).toHaveLength(1);
    const resume = new Event("pageshow");
    Object.defineProperty(resume, "persisted", { value: true });
    await flush(() => window.dispatchEvent(resume));
    expect(requests).toHaveLength(2);
    await flush(() =>
      requests[1].resolve(json({ authenticated: false, resumed: true })),
    );
    expect(screen.getByTestId("session-value")).toHaveTextContent(
      '"resumed":true',
    );
  });

  test("active HTTP failures preserve ten retries, visible errors and final recovery dialog", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    for (let attempt = 0; attempt < 10; attempt++) {
      await flush(() =>
        requests[attempt].resolve(json({ error: "current HTTP failure" }, 503)),
      );
      if (attempt < 9)
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
    }
    expect(requests).toHaveLength(10);
    expect(error).toHaveBeenCalledTimes(10);
    expect(confirmAlert).toHaveBeenCalledOnce();
    expect(screen.getByTestId("session-error")).toHaveTextContent("true");
  });
  test.each(["FORM", "SAML"])(
    "successful %s logout preserves the original session refresh when navigation remains on the mounted document",
    async (loginMethod) => {
      config.loginRedirect = window.location.href;
      render(<App />);
      await flush(() =>
        requests[0].resolve(
          json({
            authenticated: true,
            userId: "same",
            csrf: "current-token",
            loginMethod,
          }),
        ),
      );
      await flush(() =>
        fireEvent.click(screen.getByRole("button", { name: "End session" })),
      );
      expect(logoutRequests).toHaveLength(1);
      expect(logoutRequests[0].options.method).toBe("POST");
      expect(logoutRequests[0].options.headers["X-CSRF-Token"]).toBe(
        "current-token",
      );
      expect(String(logoutRequests[0].url)).toMatch(
        loginMethod === "SAML" ? /\/Logout\?useSAML=true$/ : /\/Logout$/,
      );
      await flush(() =>
        logoutRequests[0].resolve(
          loginMethod === "SAML" ? new Response("<html></html>") : json({}),
        ),
      );
      expect(requests).toHaveLength(2);
      expect(requests[1].signal.aborted).toBe(false);
      await flush(() => requests[1].resolve(json({ authenticated: false })));
      expect(screen.getByTestId("session-value")).toHaveTextContent(
        '"authenticated":false',
      );
      expect(logoutRequests).toHaveLength(1);
    },
  );

  test.each(["FORM", "SAML"])(
    "a failed %s logout remains visible and allows the mounted session to refresh",
    async (loginMethod) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      render(<App />);
      await flush(() =>
        requests[0].resolve(
          json({ authenticated: true, userId: "same", loginMethod }),
        ),
      );
      await flush(() =>
        fireEvent.click(screen.getByRole("button", { name: "End session" })),
      );
      const failure = new TypeError("Failed to fetch");
      await flush(() => logoutRequests[0].reject(failure));
      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
      await flush(() =>
        fireEvent.click(
          screen.getByRole("button", { name: "Refresh session" }),
        ),
      );
      expect(requests).toHaveLength(2);
      expect(requests[1].signal.aborted).toBe(false);
    },
  );

  test("beforeunload leaves the current session read active and preserves its real failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<App />);
    await flush(() => window.dispatchEvent(new Event("beforeunload")));
    expect(requests[0].signal.aborted).toBe(false);
    const failure = new TypeError("Failed to fetch");
    await flush(() => requests[0].reject(failure));
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    await act(async () => vi.advanceTimersByTime(1000));
    expect(requests).toHaveLength(2);
  });
});
