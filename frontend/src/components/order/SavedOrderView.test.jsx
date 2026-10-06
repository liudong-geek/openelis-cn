import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import chinese from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import SavedOrderView from "./SavedOrderView";
import {
  session,
  rawNumber,
  savedOrder,
  jsonResponse,
  deferred,
} from "./savedOrderView.testData";
let fetcher;
let detail;
const mount = (
  search = `?labNumber=${encodeURIComponent(rawNumber)}`,
  initialSession = session,
) => {
  const history = createMemoryHistory({
    initialEntries: [
      {
        pathname: "/order/view",
        search,
        state: {
          listOrigin: {
            pathname: "/order",
            state: {
              listState: {
                page: 3,
                pageSize: 25,
                searchQuery: rawNumber,
                statusFilter: "in_progress",
              },
            },
          },
        },
      },
    ],
  });
  const tree = (current) => (
    <Router history={history}>
      <IntlProvider locale="zh" messages={chinese}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: current,
            errorLoadingSessionDetails: false,
            isCheckingLogin: () => !current || !("authenticated" in current),
          }}
        >
          <SavedOrderView />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>
  );
  const rendered = render(tree(initialSession));
  return {
    history,
    ...rendered,
    session: (current) => rendered.rerender(tree(current)),
  };
};
beforeEach(() => {
  detail = savedOrder();
  fetcher = vi.fn(async (url) =>
    url.endsWith("/session") ? jsonResponse(session) : jsonResponse(detail),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const loaded = () => screen.findByText("刘洋");
const modify = () =>
  screen.getByRole("button", { name: chinese["workspace.order.edit"] });
const detailCalls = () =>
  fetcher.mock.calls.filter(([url]) => url.includes("/rest/order/saved?"));
test("direct refresh reads exact saved data and Chinese names without a new-form workflow", async () => {
  const { history } = mount();
  await loaded();
  expect(
    screen.getByRole("heading", { level: 1, name: "已保存申请" }),
  ).toBeVisible();
  expect(screen.getByText("李雅宁")).toBeVisible();
  expect(screen.getByText(rawNumber)).toBeVisible();
  expect(screen.getAllByText("白细胞计数")).toHaveLength(2);
  expect(screen.getByText("TUBE-REAL-31")).toBeVisible();
  expect(screen.getByText("待采集")).toBeVisible();
  expect(screen.getAllByText("未维护").length).toBeGreaterThan(0);
  expect(
    screen.queryByText(chinese["workspace.leave.helper"]),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /保存|采集|编辑模式/ }),
  ).not.toBeInTheDocument();
  expect(history.location.pathname).toBe("/order/view");
  const [url, options] = detailCalls()[0];
  expect(Object.fromEntries(new URLSearchParams(url.split("?")[1]))).toEqual({
    queryVersion: "2",
    labNumber: rawNumber,
  });
  expect(options).toMatchObject({
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    credentials: "include",
  });
  expect(fetcher.mock.calls.every(([, o]) => o.method === "GET")).toBe(true);
});
test("uncollected requests remain visible without a collected tube", async () => {
  detail.samples = [];
  mount();
  await loaded();
  expect(screen.getByText(chinese["order.saved.noSpecimens"])).toBeVisible();
  expect(screen.getByText("总蛋白")).toBeVisible();
  expect(screen.getByText("待采集")).toBeVisible();
});
test.each([
  [404, "notFound"],
  [403, "forbidden"],
  [500, "unavailable"],
])("HTTP %s stays an explicit error on saved view", async (status, kind) => {
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session") ? jsonResponse(session) : jsonResponse({}, status),
  );
  const { history } = mount();
  expect(
    await screen.findByText(chinese[`order.saved.error.${kind}`]),
  ).toBeVisible();
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
  expect(history.location.pathname).toBe("/order/view");
  expect(modify()).toBeDisabled();
});
test("malformed link never queries and returns the exact list state", async () => {
  const { history } = mount("?labNumber=bad&labNumber=other");
  expect(
    await screen.findByText(chinese["order.saved.error.invalid"]),
  ).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: chinese["button.back"] }));
  expect(history.location.pathname).toBe("/order");
  expect(history.location.state.listState).toEqual({
    page: 3,
    pageSize: 25,
    searchQuery: rawNumber,
    statusFilter: "in_progress",
  });
});
test("modification repeats fresh read and preserves original number and list state", async () => {
  const { history } = mount();
  await loaded();
  fireEvent.click(modify());
  fireEvent.click(modify());
  await waitFor(() => expect(history.location.pathname).toBe("/ModifyOrder"));
  expect(detailCalls()).toHaveLength(2);
  expect(
    new URLSearchParams(history.location.search).get("accessionNumber"),
  ).toBe(rawNumber);
  expect(history.location.state.listOrigin.state.listState.page).toBe(3);
});
test("fresh permission revocation blocks modification with a read-only reason", async () => {
  const { history } = mount();
  await loaded();
  detail = {
    ...detail,
    canModify: false,
    isEditable: false,
    modifyUnavailableReason: "MODIFY_PERMISSION_DENIED",
  };
  fireEvent.click(modify());
  expect(
    await screen.findByText(
      chinese["order.saved.modifyReason.MODIFY_PERMISSION_DENIED"],
    ),
  ).toBeVisible();
  expect(modify()).toBeDisabled();
  expect(history.location.pathname).toBe("/order/view");
});
test("changed saved identity during modification clears content and blocks navigation", async () => {
  const { history } = mount();
  await loaded();
  detail.orderId = "99";
  fireEvent.click(modify());
  expect(
    await screen.findByText(chinese["order.saved.error.conflict"]),
  ).toBeVisible();
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
  expect(history.location.pathname).toBe("/order/view");
});
test("late old number cannot replace a new original number", async () => {
  const old = deferred();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session")
      ? jsonResponse(session)
      : new URLSearchParams(url.split("?")[1]).get("labNumber") === rawNumber
        ? old.promise
        : jsonResponse(savedOrder("NEW-5")),
  );
  const { history } = mount();
  await waitFor(() => expect(detailCalls()).toHaveLength(1));
  act(() => history.push("/order/view?labNumber=NEW-5"));
  expect(await screen.findByText("NEW-5")).toBeVisible();
  await act(async () => old.resolve(jsonResponse(savedOrder())));
  expect(screen.queryByText(rawNumber)).not.toBeInTheDocument();
});
test.each([
  ["no-session", null],
  ["other-account", { ...session, userId: "8", sessionId: "unit-session-b" }],
])(
  "A to %s to A cannot revive an old same-key response",
  async (_kind, other) => {
    const old = deferred();
    let reads = 0;
    fetcher.mockImplementation(async (url) =>
      url.endsWith("/session")
        ? jsonResponse(session)
        : ++reads === 1
          ? old.promise
          : jsonResponse({
              ...savedOrder(),
              patient: { ...savedOrder().patient, firstName: "新" },
            }),
    );
    const view = mount();
    await waitFor(() => expect(detailCalls()).toHaveLength(1));
    view.session(other);
    expect(modify()).toBeDisabled();
    view.session(session);
    expect(await screen.findByText("刘新")).toBeVisible();
    await act(async () => old.resolve(jsonResponse(savedOrder())));
    expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
  },
);
test("storage clears content and a late modify response cannot navigate", async () => {
  const { history } = mount();
  await loaded();
  const old = deferred();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session") ? jsonResponse(session) : old.promise,
  );
  fireEvent.click(modify());
  act(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "userSessionDetails" }),
    ),
  );
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
  expect(modify()).toBeDisabled();
  await act(async () => old.resolve(jsonResponse(savedOrder())));
  expect(history.location.pathname).toBe("/order/view");
});
test("20-second timeout aborts and ignores a late body", async () => {
  const old = deferred();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session") ? jsonResponse(session) : old.promise,
  );
  mount();
  await waitFor(() => expect(detailCalls()).toHaveLength(1));
  vi.useFakeTimers();
  fireEvent.click(
    screen.getByRole("button", { name: chinese["order.saved.reload"] }),
  );
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => vi.advanceTimersByTime(20000));
  expect(screen.getByText(chinese["order.saved.error.timeout"])).toBeVisible();
  expect(detailCalls().at(-1)[1].signal.aborted).toBe(true);
  await act(async () => old.resolve(jsonResponse(savedOrder())));
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
});
test("unmount aborts an outstanding read without late navigation", async () => {
  const old = deferred();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session") ? jsonResponse(session) : old.promise,
  );
  const view = mount();
  await waitFor(() => expect(detailCalls()).toHaveLength(1));
  const signal = detailCalls()[0][1].signal;
  act(() => view.unmount());
  expect(signal.aborted).toBe(true);
  await act(async () => old.resolve(jsonResponse(savedOrder())));
  expect(view.history.location.pathname).toBe("/order/view");
});
test("redacted patient and unknown statuses remain explicit without inventing details", async () => {
  detail.patient = { patientId: "4", firstName: null, lastName: null };
  detail.warningCodes = ["PATIENT_DATA_REDACTED"];
  detail.canModify = false;
  detail.isEditable = false;
  detail.modifyUnavailableReason = "INCOMPLETE_ORDER_DATA";
  detail.samples[0].statusName = null;
  detail.samples[0].statusCode = null;
  detail.samples[0].warningCodes = ["STATUS_UNAVAILABLE"];
  mount();
  expect(
    await screen.findByText(
      chinese["order.saved.warning.PATIENT_DATA_REDACTED"],
    ),
  ).toBeVisible();
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
  expect(screen.getByText(chinese["order.saved.unknownStatus"])).toBeVisible();
  expect(modify()).toBeDisabled();
  expect(screen.getByRole("heading", { name: "标本记录 31" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "标本记录 32" })).toBeVisible();
});
test("fresh modify HTTP 403 clears clinical details and cannot reuse stale permission", async () => {
  const { history } = mount();
  await loaded();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session") ? jsonResponse(session) : jsonResponse({}, 403),
  );
  fireEvent.click(modify());
  expect(
    await screen.findByText(chinese["order.saved.error.forbidden"]),
  ).toBeVisible();
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
  expect(modify()).toBeDisabled();
  expect(history.location.pathname).toBe("/order/view");
});
test("modify preflight hanging during session check is bounded and late permission cannot navigate", async () => {
  const { history } = mount();
  await loaded();
  const old = deferred();
  fetcher.mockImplementation(async (url) =>
    url.endsWith("/session") ? old.promise : jsonResponse(savedOrder()),
  );
  vi.useFakeTimers();
  fireEvent.click(modify());
  expect(modify()).toBeDisabled();
  await act(async () => vi.advanceTimersByTime(20000));
  expect(screen.getByText(chinese["order.saved.error.timeout"])).toBeVisible();
  expect(fetcher.mock.calls.at(-1)[1].signal.aborted).toBe(true);
  await act(async () => old.resolve(jsonResponse(session)));
  expect(history.location.pathname).toBe("/order/view");
  expect(screen.queryByText("刘洋")).not.toBeInTheDocument();
});
