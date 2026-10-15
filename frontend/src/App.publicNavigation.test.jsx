import { waitFor } from "@testing-library/dom";
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";
import config from "./config.json";

// Actual App, Layout, Header, Login, ChangePassword, SecureRoute and GET helper.
// Only transport responses are controlled; navigation uses BrowserRouter history.
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const publicConfiguration = {
  useFormLogin: "true",
  useSaml: "false",
  NAVIGATION_PROFILE: "china",
};
let requests;
const reads = (suffix) =>
  requests.filter((request) => request.url.endsWith(suffix));
const current = (suffix) =>
  reads(suffix).find((request) => !request.signal?.aborted);
const flush = async (callback) =>
  act(async () => {
    callback?.();
    await Promise.resolve();
  });
beforeEach(() => {
  requests = [];
  localStorage.clear();
  localStorage.setItem("locale", "zh");
  config.loginRedirect = "/login";
  window.history.replaceState({}, "", "/login");
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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete config.loginRedirect;
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});
const showLogin = async () => {
  render(<App />);
  await flush(() =>
    current("/rest/open-configuration-properties").resolve(
      json(publicConfiguration),
    ),
  );
  expect(document.querySelector("#loginName")).toBeVisible();
};
const enterPasswordRoute = async () => {
  await showLogin();
  await flush(() =>
    fireEvent.click(document.querySelector("[data-cy='changePassword']")),
  );
  expect(window.location.pathname).toBe("/ChangePasswordLogin");
  expect(document.querySelector("#current-password")).toBeVisible();
};

describe("public application navigation preserves current document reads", () => {
  test("entering change password preserves the pending App session and common reads instead of creating another document", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await showLogin();
    const session = current("/session");
    const pending = requests.filter(
      (request) =>
        request.signal &&
        request !== current("/rest/open-configuration-properties"),
    );
    const documentBefore = document;
    const hide = vi.fn();
    window.addEventListener("pagehide", hide);
    try {
      await flush(() =>
        fireEvent.click(document.querySelector("[data-cy='changePassword']")),
      );
      expect(window.location.pathname).toBe("/ChangePasswordLogin");
      expect(document).toBe(documentBefore);
      expect(hide).not.toHaveBeenCalled();
      expect(reads("/session")).toHaveLength(1);
      expect(reads("/rest/open-configuration-properties")).toHaveLength(1);
      expect(pending.every((request) => !request.signal.aborted)).toBe(true);
      await flush(() => session.resolve(json({ authenticated: false })));
      expect(error).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("pagehide", hide);
    }
  });

  test("anonymous password exit resolves root security in the same document while config, locales and branding remain usable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    window.history.replaceState({}, "", "/ChangePasswordLogin");
    render(<App />);
    const configRead = current("/rest/open-configuration-properties");
    const locales = current("/rest/supportedlocales/active");
    const documentBefore = document;
    await flush(() =>
      current("/session").resolve(json({ authenticated: false })),
    );
    const brands = reads("/rest/site-branding").filter(
      (request) => !request.signal.aborted,
    );
    await flush(() =>
      fireEvent.click(document.querySelector("[data-cy='exitPasswordReset']")),
    );
    expect(window.location.pathname).toBe("/login");
    expect(document).toBe(documentBefore);
    expect(configRead.signal.aborted).toBe(false);
    expect(locales.signal.aborted).toBe(false);
    expect(brands.every((request) => !request.signal.aborted)).toBe(true);
    expect(reads("/session")).toHaveLength(1);
    expect(reads("/rest/open-configuration-properties")).toHaveLength(1);
    expect(
      requests.filter((request) => request.options.method === "POST"),
    ).toHaveLength(0);
    await flush(() => configRead.resolve(json(publicConfiguration)));
    await flush(() =>
      locales.resolve(json([{ localeCode: "zh", displayName: "简体中文" }])),
    );
    await flush(() =>
      reads("/rest/site-branding").forEach((request) =>
        request.resolve(json({ headerColor: "#aabbcc" })),
      ),
    );
    expect(document.querySelector("#loginName")).toBeVisible();
    expect(document.querySelector("#password")).toBeVisible();
    expect(error).not.toHaveBeenCalled();
  });

  test.each([
    "/session",
    "/rest/open-configuration-properties",
    "/rest/supportedlocales/active",
    "/rest/site-branding",
  ])(
    "the current real TypeError remains visible after public navigation for %s",
    async (endpoint) => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      window.history.replaceState({}, "", "/ChangePasswordLogin");
      render(<App />);
      if (endpoint !== "/session") {
        await flush(() =>
          current("/session").resolve(json({ authenticated: false })),
        );
      }
      await flush(() =>
        fireEvent.click(
          document.querySelector("[data-cy='exitPasswordReset']"),
        ),
      );
      const request = current(endpoint);
      const failure = new TypeError("Failed to fetch");
      expect(request.signal?.aborted).not.toBe(true);
      await flush(() => request.reject(failure));
      await waitFor(() =>
        expect(error).toHaveBeenCalledExactlyOnceWith(failure),
      );
    },
  );

  test("an anonymous protected root redirects only to the configured public login path and retains query and hash", async () => {
    config.loginRedirect = `${window.location.origin}/login?return=work#form`;
    window.history.replaceState({}, "", "/");
    render(<App />);
    await flush(() =>
      current("/session").resolve(json({ authenticated: false })),
    );
    expect(window.location.pathname).toBe("/login");
    expect(window.location.search).toBe("?return=work");
    expect(window.location.hash).toBe("#form");
    expect(reads("/session")).toHaveLength(1);
    expect(reads("/rest/home-dashboard/metrics")).toHaveLength(0);
  });

  test("successful anonymous password change preserves its POST and notification before returning within the same document", async () => {
    await enterPasswordRoute();
    await flush(() =>
      current("/session").resolve(json({ authenticated: false })),
    );
    const values = {
      "#loginName": "synthetic-account",
      "#current-password": "Current!234",
      "#new-password": "Changed!567",
      "#repeat-new-password": "Changed!567",
    };
    for (const [selector, value] of Object.entries(values)) {
      await flush(() =>
        fireEvent.change(document.querySelector(selector), {
          target: { value },
        }),
      );
    }
    const documentBefore = document;
    await flush(() =>
      fireEvent.submit(
        document.querySelector("#current-password").closest("form"),
      ),
    );
    const write = reads("/ChangePasswordLogin?apiCall=true")[0];
    expect(write.options.method).toBe("POST");
    const submitted = new URLSearchParams(write.options.body);
    expect(submitted.get("loginName")).toBe("synthetic-account");
    expect(submitted.get("newPassword")).toBe("Changed!567");
    vi.useFakeTimers();
    await flush(() => write.resolve(json({ success: true })));
    const notification = document.querySelector(
      "[role='status'].cds--toast-notification--success",
    );
    expect(notification).toBeVisible();
    expect(notification).toHaveTextContent("密码更改成功");
    await act(async () => vi.advanceTimersByTime(2000));
    expect(window.location.pathname).toBe("/login");
    expect(document).toBe(documentBefore);
    expect(reads("/session")).toHaveLength(1);
    expect(reads("/ChangePasswordLogin?apiCall=true")).toHaveLength(1);
    expect(document.querySelector("#loginName")).toBeVisible();
  });
});
