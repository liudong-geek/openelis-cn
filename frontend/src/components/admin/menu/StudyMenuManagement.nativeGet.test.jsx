import React from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { NotificationContext } from "../../layout/Layout";
import StudyMenuManagement from "./StudyMenuManagement";

// The read helper is real: only the native transport is controlled below.
vi.unmock("../../utils/Utils");
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return { NotificationContext: createContext({}) };
});
const owner = (id = "study-native-owner", authenticated = true) => ({
  authenticated,
  userId: id,
  sessionId: `${id}-session`,
  roles: authenticated ? ["Global Administrator"] : [],
  loginLabUnit: "生化",
  userLabRolesMap: { 生化: ["Reception"] },
});
const notification = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};
const page = (details = owner()) => (
  <MemoryRouter>
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{ userSessionDetails: details }}
      >
        <NotificationContext.Provider value={notification}>
          <StudyMenuManagement />
        </NotificationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const dto = (url, active = false) => ({
  menu: {
    elementId: url.split("/").at(-1),
    displayKey: "menu.study.title",
    actionURL: `/original/${url.split("/").at(-1)}`,
    isActive: active,
  },
  childMenus: [],
});
const jsonResponse = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
let requests;
let errors;
beforeEach(() => {
  requests = [];
  notification.addNotification.mockClear();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      let resolve;
      let reject;
      const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      requests.push({ url, options, resolve, reject });
      return promise;
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const deliver = async (selected, active = false) => {
  await act(async () => {
    selected.forEach((request) =>
      request.resolve(jsonResponse(dto(request.url, active))),
    );
  });
};

test("real Utils issues all twelve owned native GETs and waits for the last parsed menu", async () => {
  render(page());
  expect(requests).toHaveLength(12);
  expect(new Set(requests.map((request) => request.url)).size).toBe(12);
  requests.forEach(({ url, options }) => {
    expect(url).toMatch(/\/rest\/admin\/menu\//);
    expect(options.method).toBe("GET");
    expect(options.credentials).toBe("include");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });
  await deliver(requests.slice(1).reverse());
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  await deliver(requests.slice(0, 1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled(),
  );
  expect(errors).not.toHaveBeenCalled();
});

test("a real current native TypeError is reported and leaves study menus unsavable", async () => {
  render(page());
  const failure = new TypeError("Failed to fetch");
  await deliver(requests.slice(1));
  await act(async () => requests[0].reject(failure));
  await waitFor(() =>
    expect(screen.getByText(messages["server.error.msg"])).toBeVisible(),
  );
  expect(errors).toHaveBeenCalledExactlyOnceWith(failure);
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  expect(requests.every(({ options }) => options.method === "GET")).toBe(true);
});

test("a real current malformed JSON body remains visible and cannot enable save", async () => {
  render(page());
  await deliver(requests.slice(1));
  await act(async () =>
    requests[0].resolve(
      new Response("{broken", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
  await waitFor(() => expect(errors).toHaveBeenCalledTimes(1));
  expect(errors.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
  expect(screen.getByText(messages["server.error.msg"])).toBeVisible();
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
});

test("a real parsed wrong menu identity is rejected without saving", async () => {
  render(page());
  await deliver(requests.slice(1));
  await act(async () =>
    requests[0].resolve(
      jsonResponse({
        menu: { elementId: "wrong", isActive: true },
        childMenus: [],
      }),
    ),
  );
  await waitFor(() =>
    expect(screen.getByText(messages["server.error.msg"])).toBeVisible(),
  );
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  expect(errors).not.toHaveBeenCalled();
});

test("replacing the authenticated owner aborts all real old signals and rejects late old data", async () => {
  const rendered = render(page());
  const old = [...requests];
  rendered.rerender(page(owner("next-study-owner")));
  expect(requests).toHaveLength(24);
  expect(old.every(({ options }) => options.signal.aborted)).toBe(true);
  await deliver(old, true);
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  await deliver(requests.slice(12), false);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled(),
  );
  expect(
    rendered.container.querySelector("#menu_study_checkbox"),
  ).not.toBeChecked();
  expect(errors).not.toHaveBeenCalled();
});

test("pagehide cancels the native read generation and persisted pageshow refetches complete data", async () => {
  render(page());
  const old = [...requests];
  await deliver(old.slice(0, 3));
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(old.slice(0, 3).every(({ options }) => !options.signal.aborted)).toBe(
    true,
  );
  expect(old.slice(3).every(({ options }) => options.signal.aborted)).toBe(
    true,
  );
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  await act(async () => window.dispatchEvent(event));
  expect(requests).toHaveLength(24);
  await deliver(old.slice(3), true);
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  await deliver(requests.slice(12), false);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled(),
  );
  expect(errors).not.toHaveBeenCalled();
});

test("real unmount aborts its twelve native GET signals and delivers no late update", async () => {
  const rendered = render(page());
  expect(requests).toHaveLength(12);
  expect(requests.every(({ options }) => !options.signal.aborted)).toBe(true);
  await act(async () => rendered.unmount());
  expect(rendered.container).toBeEmptyDOMElement();
  expect(requests).toHaveLength(12);
  expect(requests.every(({ options }) => options.signal.aborted)).toBe(true);
  await deliver(requests, true);
  expect(notification.addNotification).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
});

test("an anonymous owner starts no study GET and cannot submit", () => {
  render(page(owner("anonymous-study", false)));
  expect(requests).toHaveLength(0);
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  expect(errors).not.toHaveBeenCalled();
});
