import React from "react";
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
import Dashboard from "./Dashboard";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { NotificationContext } from "../layout/Layout";
import messages from "../../languages/en.json";
import { Roles } from "../utils/Utils";

// The verified workflow-summary hooks retain their separate original tests.
// Here metrics/sections/detail GETs remain real, including Response and Signal.
vi.mock("./usePendingResultSummary", () => ({
  usePendingResultSummary: () => ({
    summary: null,
    state: "loading",
    refresh: vi.fn(),
  }),
}));
vi.mock("./usePendingReviewSummary", () => ({
  usePendingReviewSummary: () => ({
    summary: null,
    state: "loading",
    refresh: vi.fn(),
  }),
}));
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
  roles: [Roles.RECEPTION],
});
let requests, addNotification, setNotificationVisible;
const tree = (user) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider value={{ userSessionDetails: user }}>
        <NotificationContext.Provider
          value={{
            notificationVisible: false,
            addNotification,
            setNotificationVisible,
          }}
        >
          <Dashboard />
        </NotificationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
beforeEach(() => {
  requests = [];
  addNotification = vi.fn();
  setNotificationVisible = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      const pending = deferred();
      requests.push({ ...pending, url: String(url), signal: options.signal });
      return pending.promise;
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const metrics = () =>
  requests.filter((request) => request.url.endsWith("/metrics"));
const sections = () =>
  requests.filter((request) => request.url.endsWith("/ALL"));
const flush = async (callback) => {
  await act(async () => {
    callback();
  });
};
const metricTile = () =>
  screen
    .getByRole("heading", { name: messages["dashboard.complete.orders.label"] })
    .closest('[role="button"]');

describe("Dashboard legacy read lifetimes", () => {
  test("refresh replaces the owned metric signal and ignores the old success", async () => {
    render(tree(owner("same")));
    await flush(() => metrics()[0].resolve(json({ ordersCompletedToday: 1 })));
    await flush(() => sections()[0].resolve(json([])));
    fireEvent.click(
      screen.getByRole("button", { name: messages["dashboard.refresh"] }),
    );
    const old = metrics()[1];
    // A real page resume triggers a replacement independently of the disabled refresh button.
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    const resume = new Event("pageshow");
    Object.defineProperty(resume, "persisted", { value: true });
    await flush(() => window.dispatchEvent(resume));
    const current = metrics()[2];
    expect(old.signal.aborted).toBe(true);
    await flush(() => current.resolve(json({ ordersCompletedToday: 9 })));
    await flush(() => old.resolve(json({ ordersCompletedToday: 777 })));
    expect(
      metricTile().querySelector(".dashboard-tile__value"),
    ).toHaveTextContent("9");
    expect(metricTile()).not.toHaveTextContent("777");
  });

  test("leaving a selected detail view aborts its request before the next tile is loaded", async () => {
    render(tree({ ...owner("same"), roles: ["Global Administrator"] }));
    await flush(() => metrics()[0].resolve(json({ ordersCompletedToday: 3 })));
    await flush(() => sections()[0].resolve(json([])));
    fireEvent.click(metricTile());
    const oldDetail = requests.find((request) =>
      request.url.endsWith("/ORDERS_COMPLETED_TODAY"),
    );
    expect(oldDetail).toBeDefined();
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["dashboard.back.to.overview"],
      }),
    );
    expect(oldDetail.signal.aborted).toBe(true);
    const rejectedTile = screen
      .getByRole("heading", { name: messages["dashboard.rejected.orders"] })
      .closest('[role="button"]');
    fireEvent.click(rejectedTile);
    const currentDetail = requests.find((request) =>
      request.url.endsWith("/ORDERS_REJECTED_TODAY"),
    );
    expect(currentDetail).toBeDefined();
    await flush(() =>
      currentDetail.resolve(json({ displayItems: [], paging: null })),
    );
    await flush(() =>
      oldDetail.resolve(
        json({
          displayItems: [
            { id: "stale-row", labNumber: "DEV01263000000000003" },
          ],
          paging: { totalPages: 7, currentPage: 1 },
        }),
      ),
    );
    expect(screen.queryByText("DEV01263000000000003")).not.toBeInTheDocument();
    expect(document.querySelector("#loadnextresults")).toBeNull();
  });

  test("identity changes invalidate all owned reads and old failures create no new notification", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(
      tree({
        ...owner("same"),
        loginLabUnit: "生化",
        userLabRolesMap: { 1: ["Results"] },
      }),
    );
    const old = [...requests];
    view.rerender(
      tree({
        ...owner("same"),
        loginLabUnit: "生化",
        userLabRolesMap: { 2: ["Validation"] },
      }),
    );
    expect(
      old.every(
        (request) =>
          request.signal instanceof AbortSignal && request.signal.aborted,
      ),
    ).toBe(true);
    await flush(() => metrics()[1].resolve(json({ ordersCompletedToday: 5 })));
    await flush(() => sections()[1].resolve(json([])));
    await flush(() =>
      old.forEach((request) =>
        request.reject(new TypeError("old identity failure")),
      ),
    );
    expect(error).not.toHaveBeenCalled();
    expect(addNotification).not.toHaveBeenCalled();
    expect(
      metricTile().querySelector(".dashboard-tile__value"),
    ).toHaveTextContent("5");
  });

  test("identity scope changes clear old counts, section names and selected rows before new reads finish", async () => {
    const first = {
      ...owner("same"),
      roles: ["Global Administrator"],
      loginLabUnit: "生化",
      userLabRolesMap: { 1: ["Results"] },
    };
    const view = render(tree(first));
    await flush(() =>
      metrics()[0].resolve(json({ ordersCompletedToday: 777 })),
    );
    await flush(() =>
      sections()[0].resolve(json([{ id: "1", value: "OLD-SECTION" }])),
    );
    fireEvent.click(metricTile());
    const detail = requests.find((request) =>
      request.url.endsWith("/ORDERS_COMPLETED_TODAY"),
    );
    await flush(() =>
      detail.resolve(
        json({
          displayItems: [
            { id: "old", labNumber: "DEV01263000000000001", testSection: "1" },
          ],
          paging: null,
        }),
      ),
    );
    expect(screen.getByText("DEV01263000000000001")).toBeVisible();
    view.rerender(tree({ ...first, userLabRolesMap: { 2: ["Validation"] } }));
    expect(
      requests.filter((request) =>
        request.url.endsWith("/ORDERS_COMPLETED_TODAY"),
      ),
    ).toHaveLength(1);
    expect(screen.queryByText("DEV01263000000000001")).not.toBeInTheDocument();
    expect(screen.queryByText("OLD-SECTION")).not.toBeInTheDocument();
    expect(metricTile()).not.toHaveTextContent("777");
  });

  test("active detail page failure preserves the previously loaded row and shows retry", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(tree({ ...owner("same"), roles: ["Global Administrator"] }));
    await flush(() => metrics()[0].resolve(json({ ordersCompletedToday: 3 })));
    await flush(() => sections()[0].resolve(json([])));
    fireEvent.click(metricTile());
    const detail = requests.find((request) =>
      request.url.endsWith("/ORDERS_COMPLETED_TODAY"),
    );
    await flush(() =>
      detail.resolve(
        json({
          displayItems: [{ id: "kept", labNumber: "DEV01263000000000002" }],
          paging: { totalPages: 2, currentPage: 1 },
        }),
      ),
    );
    fireEvent.click(document.querySelector("#loadnextresults"));
    const next = requests.find((request) => request.url.endsWith("?page=2"));
    const failure = new TypeError("current page failure");
    await flush(() => next.reject(failure));
    expect(error).toHaveBeenCalledWith(failure);
    expect(screen.getByText("DEV01263000000000002")).toBeVisible();
    expect(screen.getByText(messages["dashboard.error.load"])).toBeVisible();
    expect(
      screen.getByRole("button", { name: messages["dashboard.refresh"] }),
    ).toBeVisible();
  });

  test("active time metric failure preserves this query's last values and is visibly failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(tree({ ...owner("same"), roles: ["Global Administrator"] }));
    await flush(() => metrics()[0].resolve(json({ averageTurnAroudTime: 4 })));
    await flush(() => sections()[0].resolve(json([])));
    const tile = screen
      .getByRole("heading", {
        name: messages["dashboard.avg.turn.around.label"],
      })
      .closest('[role="button"]');
    fireEvent.click(tile);
    const reads = () =>
      requests.filter((request) =>
        request.url.endsWith("/turn-around-time-metrics"),
      );
    await flush(() =>
      reads()[0].resolve(
        json({
          receptionToResult: 42,
          resultToValidation: 43,
          receptionToValidation: 44,
        }),
      ),
    );
    expect(screen.getByText("42")).toBeVisible();
    await flush(() => window.dispatchEvent(new Event("pagehide")));
    const resume = new Event("pageshow");
    Object.defineProperty(resume, "persisted", { value: true });
    await flush(() => window.dispatchEvent(resume));
    const failure = new TypeError("current time failure");
    await flush(() => reads()[1].reject(failure));
    expect(error).toHaveBeenCalledWith(failure);
    expect(screen.getByText("42")).toBeVisible();
    expect(screen.getByText(messages["dashboard.error.load"])).toBeVisible();
  });

  test("user drill-down and return failures cannot retain rows from a different query", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(tree({ ...owner("same"), roles: ["Global Administrator"] }));
    await flush(() =>
      metrics()[0].resolve(json({ orderEnterdByUserToday: 2 })),
    );
    await flush(() => sections()[0].resolve(json([])));
    const tile = screen
      .getByRole("heading", { name: messages["dashboard.user.orders.label"] })
      .closest('[role="button"]');
    fireEvent.click(tile);
    const userStats = () =>
      requests.filter((request) =>
        request.url.endsWith("/ORDERS_ENTERED_BY_USER_TODAY"),
      );
    await flush(() =>
      userStats()[0].resolve(
        json({
          displayItems: [
            {
              id: "old-user-id",
              userFirstName: "BEFORE-USER",
              userLastName: "ROW",
              countOfOrdersEntered: 7,
            },
          ],
          paging: null,
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    const drill = requests.find((request) =>
      request.url.endsWith("/ORDERS_FOR_USER?systemUserId=old-user-id"),
    );
    expect(drill).toBeDefined();
    await flush(() =>
      drill.reject(new TypeError("current drill-down failure")),
    );
    expect(
      screen.queryByRole("cell", { name: "BEFORE-USER" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(messages["dashboard.error.load"])).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["dashboard.back.to.overview"],
      }),
    );
    await flush(() =>
      userStats()[1].reject(new TypeError("current return failure")),
    );
    expect(
      screen.queryByRole("cell", { name: "BEFORE-USER" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(messages["dashboard.error.load"])).toBeVisible();
    expect(error).toHaveBeenCalledTimes(2);
  });

  test("current metric failure remains visible and uses the original dashboard error callback", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(tree(owner("current")));
    const failure = new TypeError("Failed to fetch");
    await flush(() => sections()[0].resolve(json([])));
    await flush(() => metrics()[0].reject(failure));
    expect(error).toHaveBeenCalledWith(failure);
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: messages["dashboard.error.title"],
        message: messages["dashboard.error.load"],
      }),
    );
    expect(setNotificationVisible).toHaveBeenCalledWith(true);
  });

  test("unmount cancels metrics and sections even if their server responses finish later", async () => {
    const view = render(tree(owner("old")));
    const old = [...requests];
    await flush(() => view.unmount());
    expect(old.every((request) => request.signal.aborted)).toBe(true);
    await flush(() =>
      old.forEach((request) =>
        request.resolve(
          json(
            request.url.endsWith("/ALL") ? [] : { ordersCompletedToday: 777 },
          ),
        ),
      ),
    );
    expect(addNotification).not.toHaveBeenCalled();
    render(tree(owner("new")));
    await flush(() => metrics()[1].resolve(json({ ordersCompletedToday: 2 })));
    await flush(() => sections()[1].resolve(json([])));
    expect(
      metricTile().querySelector(".dashboard-tile__value"),
    ).toHaveTextContent("2");
  });
});
