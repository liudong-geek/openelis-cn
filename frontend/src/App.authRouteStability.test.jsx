import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Keep App, its router/session state, Layout, Formik and both Carbon forms real.
// Only the server is controlled so a session response can arrive during typing.
const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => "application/json" },
  json: async () => body,
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

let sessionResponses;
let sessionRequests;
let unexpectedRequests;
let protectedRequests;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionResponses = [];
  sessionRequests = 0;
  unexpectedRequests = [];
  protectedRequests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input) => {
      const url = new URL(String(input), window.location.origin);
      if (
        [
          "/rest/properties",
          "/rest/notification/pnconfig",
          "/rest/notifications",
        ].some((path) => url.pathname.endsWith(path))
      )
        protectedRequests.push(url.pathname);
      if (url.pathname.endsWith("/session")) {
        sessionRequests += 1;
        const response = sessionResponses.shift();
        if (!response) throw new Error("Unexpected session request");
        return response;
      }
      if (url.pathname.endsWith("/rest/open-configuration-properties")) {
        return Promise.resolve(
          jsonResponse({ useFormLogin: "true", NAVIGATION_PROFILE: "china" }),
        );
      }
      if (
        url.pathname.endsWith("/rest/supportedlocales/active") ||
        url.pathname.endsWith("/rest/notifications")
      ) {
        return Promise.resolve(jsonResponse([]));
      }
      if (
        url.pathname.endsWith("/rest/site-branding") ||
        url.pathname.endsWith("/rest/properties")
      ) {
        return Promise.resolve(jsonResponse({}));
      }
      if (url.pathname.endsWith("/rest/notification/pnconfig")) {
        return Promise.resolve(jsonResponse({ subscribed: false }));
      }
      unexpectedRequests.push(url.pathname);
      return Promise.resolve(jsonResponse({}));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

const renderRoute = async (pathname) => {
  window.history.replaceState({}, "", pathname);
  let view;
  await act(async () => {
    view = render(<App />);
  });
  return view;
};

const fillFields = async (view, values) => {
  const nodes = {};
  await act(async () => {
    Object.entries(values).forEach(([id, value]) => {
      const input = view.container.querySelector(`#${id}`);
      expect(
        input,
        `${id} is present before the session response`,
      ).not.toBeNull();
      expect(input).toBeVisible();
      fireEvent.change(input, { target: { value } });
      nodes[id] = input;
    });
  });
  return nodes;
};

const expectFieldsPreserved = (view, nodes, values) => {
  Object.entries(nodes).forEach(([id, originalInput]) => {
    const currentInput = view.container.querySelector(`#${id}`);
    expect(originalInput.isConnected, `${id} remains mounted`).toBe(true);
    expect(currentInput).toBe(originalInput);
    expect(currentInput).toHaveValue(values[id]);
  });
};

describe("authentication route session updates", () => {
  it.each([
    ["/login", { loginName: "SIM-login-draft", password: "SIM-password!" }],
    [
      "/ChangePasswordLogin",
      {
        loginName: "SIM-password-draft",
        "current-password": "SIM-old-pass!",
        "new-password": "SIM-new-pass!",
        "repeat-new-password": "SIM-new-pass!",
      },
    ],
  ])(
    "preserves the %s draft when an in-flight session resolves",
    async (pathname, values) => {
      const pendingSession = deferred();
      sessionResponses.push(pendingSession.promise);
      const view = await renderRoute(pathname);
      expect(sessionRequests).toBe(1);
      const originalNodes = await fillFields(view, values);

      await act(async () => {
        pendingSession.resolve(jsonResponse({ authenticated: false }));
      });

      expectFieldsPreserved(view, originalNodes, values);
      expect(window.location.pathname).toBe(pathname);
      expect(unexpectedRequests).toEqual([]);
      expect(protectedRequests).toEqual([]);
    },
  );

  it("keeps a login draft across the real session poll and still unmounts on navigation", async () => {
    const pendingPoll = deferred();
    sessionResponses.push(
      Promise.resolve(jsonResponse({ authenticated: false })),
      pendingPoll.promise,
    );
    const view = await renderRoute("/login");
    expect(sessionRequests).toBe(1);

    // Login's own interval begins the request, then the user starts typing.
    // Its activity guard cannot cancel a request that is already in flight.
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(sessionRequests).toBe(2);
    const values = {
      loginName: "SIM-poll-draft",
      password: "SIM-retained-password!",
    };
    const originalNodes = await fillFields(view, values);
    await act(async () => {
      pendingPoll.resolve(jsonResponse({ authenticated: false }));
    });
    expectFieldsPreserved(view, originalNodes, values);

    // Browser history navigation must still unmount the old route. The real
    // button uses a full document navigation, which jsdom does not implement.
    await act(async () => {
      window.history.pushState({}, "", "/ChangePasswordLogin");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(window.location.pathname).toBe("/ChangePasswordLogin");
    expect(originalNodes.loginName.isConnected).toBe(false);
    expect(view.container.querySelector("#current-password")).toBeVisible();
    expect(view.container.querySelector("#loginName")).toHaveValue("");
    expect(unexpectedRequests).toEqual([]);
    expect(protectedRequests).toEqual([]);
  });
});
