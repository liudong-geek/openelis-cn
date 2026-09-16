import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import chineseMessages from "../../languages/zh.json";
import OrderDashboard from "./OrderDashboard";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  load: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mocks.get }));
vi.mock("./OrderContext", () => ({
  useOrderContext: () => ({ loadOrder: mocks.load, resetOrder: mocks.reset }),
}));
vi.mock("./BarcodeScannerBar", () => ({ default: () => null }));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({ configurationProperties: {} }),
    NotificationContext: createContext({
      notificationVisible: false,
      addNotification: vi.fn(),
      setNotificationVisible: vi.fn(),
    }),
  };
});

const order = {
  id: "12",
  labNumber: "DEMO-12",
  patientName: "Demo patient",
  facilityName: "Demo lab",
  priority: "routine",
  stepProgress: { enter: true },
  samples: [],
};
const mount = (state, locale = "en") => {
  const history = createMemoryHistory({
    initialEntries: [{ pathname: "/order", state }],
  });
  render(
    <Router history={history}>
      <IntlProvider
        locale={locale}
        messages={locale === "zh" ? chineseMessages : messages}
      >
        <OrderDashboard />
      </IntlProvider>
    </Router>,
  );
  return history;
};
beforeEach(() => {
  mocks.get.mockReset();
  mocks.load.mockReset();
  mocks.reset.mockReset();
  mocks.load.mockResolvedValue({});
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [order], totalCount: 200 }),
  );
});

test("restores the list filters and page and opens an identified request for editing", async () => {
  const history = mount({
    listState: {
      page: 2,
      pageSize: 25,
      searchQuery: "DEMO-12",
      statusFilter: "in_progress",
    },
  });
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringMatching(
      /page=2&pageSize=25.*search=DEMO-12.*status=in_progress/,
    ),
    expect.any(Function),
  );
  fireEvent.click(within(row).getByRole("button", { name: "Edit request" }));
  expect(history.location.pathname).toBe("/ModifyOrder");
  expect(history.location.search).toBe("?accessionNumber=DEMO-12");
  expect(history.location.state.listOrigin.state.listState.page).toBe(2);
  history.goBack();
  expect(history.location.pathname).toBe("/order");
  expect(history.location.state.listState.page).toBe(2);
  expect(history.location.state.listState.searchQuery).toBe("DEMO-12");
});

test("opens reprinting from a list row with its request number", async () => {
  const history = mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  fireEvent.click(within(row).getByRole("button", { name: "Reprint labels" }));
  expect(history.location.pathname).toBe("/PrintBarcode");
  expect(history.location.search).toBe("?labNumber=DEMO-12");
});

test("view loads a request read-only instead of silently enabling editing", async () => {
  const history = mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  fireEvent.click(
    within(row).getByRole("button", { name: "View", exact: true }),
  );
  await waitFor(() => expect(history.location.pathname).toBe("/order/enter"));
  expect(mocks.load).toHaveBeenCalledWith("DEMO-12", true);
});

test("does not expose internal editing or printing for unaccepted external requests", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [{ ...order, isExternal: true }], totalCount: 1 }),
  );
  mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(
    within(row).queryByRole("button", { name: "Edit request" }),
  ).toBeNull();
  expect(
    within(row).queryByRole("button", { name: "Reprint labels" }),
  ).toBeNull();
  expect(
    within(row).getByRole("button", { name: messages["order.accept"] }),
  ).toBeVisible();
});

test("restores the completed filter as historical checklist evidence, not current acceptance", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [], totalCount: 0 }),
  );
  mount({ listState: { statusFilter: "completed" } }, "zh");

  expect(await screen.findByText("清单已记录")).toBeVisible();
  expect(screen.getByText("标本准备状态")).toBeVisible();
  expect(
    screen.getByText(/清单已记录不代表当前验收、检验、审核或报告已完成/),
  ).toBeVisible();
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringContaining("specimenIntakeStatus=checklist_complete"),
    expect.any(Function),
  );
});

test("finishing intake no longer offers an editable Continue loop back to acceptance", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          status: "completed",
          stepProgress: { enter: true, collect: true, label: true, qa: true },
        },
      ],
      totalCount: 1,
    }),
  );
  const history = mount(undefined, "zh");
  const row = await screen.findByRole("row", { name: /DEMO-12/ });

  expect(
    screen.getByRole("columnheader", { name: /标本准备进度/ }),
  ).toBeVisible();
  expect(within(row).getByText("清单已记录")).toBeVisible();
  expect(
    within(row).queryByRole("button", {
      name: chineseMessages["order.continue"],
    }),
  ).toBeNull();
  fireEvent.click(
    within(row).getByRole("button", {
      name: chineseMessages["label.button.view"],
      exact: true,
    }),
  );
  await waitFor(() => expect(history.location.pathname).toBe("/order/enter"));
  expect(mocks.load).toHaveBeenCalledWith("DEMO-12", true);
});

test("a legacy completed status cannot hide remaining preparation work", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [{ ...order, status: "completed" }], totalCount: 1 }),
  );
  const history = mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  fireEvent.click(
    within(row).getByRole("button", { name: messages["order.continue"] }),
  );
  await waitFor(() => expect(history.location.pathname).toBe("/order/collect"));
  expect(mocks.load).toHaveBeenCalledWith("DEMO-12", false);
});

test("a returned request keeps its correction action even when previous preparation flags are complete", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          returnedFromQA: true,
          returnedToStep: "collect",
          stepProgress: { enter: true, collect: true, label: true, qa: true },
        },
      ],
      totalCount: 1,
    }),
  );
  const history = mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  fireEvent.click(
    within(row).getByRole("button", {
      name: new RegExp(messages["order.fixIssue"]),
    }),
  );
  await waitFor(() => expect(history.location.pathname).toBe("/order/collect"));
});

test("server stage drives the next task even when legacy flags conflict", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          specimenIntakeStatus: "label_pending",
          statusScope: "preanalytic_progress",
          reportStatus: "not_tracked",
          stepProgress: { enter: true, collect: true, label: true, qa: true },
        },
      ],
      totalCount: 1,
    }),
  );
  const history = mount(undefined, "zh");
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(within(row).getByText("待生成标签")).toBeVisible();
  expect(within(row).getByText("2/4")).toBeVisible();
  fireEvent.click(
    within(row).getByRole("button", {
      name: chineseMessages["order.continue"],
    }),
  );
  await waitFor(() => expect(history.location.pathname).toBe("/order/label"));
});

test("unknown server stage remains viewable but cannot continue to a guessed task", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        { ...order, specimenIntakeStatus: "unexpected", returnedFromQA: true },
      ],
      totalCount: 1,
    }),
  );
  mount(undefined, "zh");
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(within(row).getByText("标本状态暂不可用")).toBeVisible();
  expect(within(row).getAllByRole("button")).toHaveLength(1);
  expect(
    within(row).queryByRole("button", {
      name: chineseMessages["order.continue"],
    }),
  ).toBeNull();
  expect(
    within(row).getByRole("button", {
      name: chineseMessages["label.button.view"],
      exact: true,
    }),
  ).toBeVisible();
});

test("canonical filters use the scoped query parameter", async () => {
  mount({ listState: { statusFilter: "collection_pending" } }, "zh");
  expect(
    screen.getByRole("combobox", { name: "标本准备状态" }),
  ).toHaveTextContent("待采集签收");
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringContaining("specimenIntakeStatus=collection_pending"),
    expect.any(Function),
  );
});

test.each([
  undefined,
  {},
  { orders: [], totalCount: -1 },
  { orders: null, totalCount: 0 },
])(
  "failed or malformed results are not shown as an empty successful list",
  async (response) => {
    mocks.get.mockImplementation((_url, callback) => callback(response));
    mount(undefined, "zh");
    expect(await screen.findByText("检验申请加载失败")).toBeVisible();
    expect(screen.queryByText("暂无检验申请")).toBeNull();
  },
);

test("a successful empty response is distinguished from a load failure", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [], totalCount: 0 }),
  );
  mount(undefined, "zh");
  expect(await screen.findByText("暂无检验申请")).toBeVisible();
  expect(screen.queryByText("检验申请加载失败")).toBeNull();
});

test("an expired remembered page loads the last available page instead of claiming there are no requests", async () => {
  mocks.get.mockImplementation((url, callback) =>
    callback({
      orders: url.includes("page=9&") ? [] : [order],
      totalCount: 51,
    }),
  );
  const history = mount({ listState: { page: 9, pageSize: 25 } }, "zh");
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(mocks.get).toHaveBeenLastCalledWith(
    expect.stringContaining("page=3&pageSize=25"),
    expect.any(Function),
  );
  expect(screen.queryByText("暂无检验申请")).toBeNull();
  fireEvent.click(
    within(row).getByRole("button", {
      name: chineseMessages["workspace.order.edit"],
    }),
  );
  expect(history.location.state.listOrigin.state.listState.page).toBe(3);
});

test("a positive count without any records on a valid page is retryable, not a successful empty list", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [], totalCount: 51 }),
  );
  mount(undefined, "zh");
  expect(await screen.findByText("检验申请加载失败")).toBeVisible();
  expect(screen.queryByText("暂无检验申请")).toBeNull();
});

test("a request with disposed specimens stays read-only instead of offering another storage or correction task", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          hasDisposedSpecimens: true,
          specimenIntakeStatus: "label_pending",
          returnedFromQA: true,
        },
      ],
      totalCount: 1,
    }),
  );
  mount(undefined, "zh");
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(within(row).getByText("含已处置标本，请查看详情")).toBeVisible();
  expect(within(row).getAllByRole("button")).toHaveLength(1);
  expect(
    within(row).getByRole("button", {
      name: chineseMessages["label.button.view"],
      exact: true,
    }),
  ).toBeVisible();
});

test("does not offer misleading client-only sorting on a server-paginated list", async () => {
  mount();
  const headers = await screen.findAllByRole("columnheader");
  headers.forEach((header) =>
    expect(within(header).queryByRole("button")).toBeNull(),
  );
});

test.each(
  [
    ["hasRejectedSpecimens", "order.intake.rejected"],
    ["hasIntakeStatusConflict", "order.intake.statusConflict"],
    ["hasNoActiveTests", "order.intake.noActiveTests"],
  ].flatMap(([flag, messageId]) => [
    [flag, messageId, "normal", {}],
    [
      flag,
      messageId,
      "returned",
      { returnedFromQA: true, returnedToStep: "collect" },
    ],
    [flag, messageId, "external", { isExternal: true }],
  ]),
)(
  "%s keeps a %s %s request read-only despite completed preparation",
  async (flag, messageId, _kind, extra) => {
    mocks.get.mockImplementation((_url, callback) =>
      callback({
        orders: [
          {
            ...order,
            ...extra,
            [flag]: true,
            specimenIntakeStatus: "checklist_complete",
            stepProgress: { enter: true, collect: true, label: true, qa: true },
          },
        ],
        totalCount: 1,
      }),
    );
    const history = mount();
    const row = await screen.findByRole("row", { name: /DEMO-12/ });
    expect(within(row).getByText(messages[messageId])).toBeVisible();
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(within(row).queryByText("4/4")).toBeNull();
    expect(within(row).getAllByRole("button")).toHaveLength(1);
    expect(mocks.load).not.toHaveBeenCalled();
    fireEvent.click(
      within(row).getByRole("button", { name: "View", exact: true }),
    );
    await waitFor(() => expect(history.location.pathname).toBe("/order/enter"));
    expect(mocks.load).toHaveBeenCalledWith("DEMO-12", true);
  },
);

test.each([
  "security.authRequired",
  "security.accessDenied",
  "security.csrfInvalid",
  "common.api.invalidResponse",
])(
  "list read errors show %s, not a legitimate empty list",
  async (errorKey) => {
    mocks.get.mockImplementation((_url, callback) =>
      callback(undefined, { errorKey }),
    );
    const history = mount(undefined, "zh");
    expect(await screen.findByText(chineseMessages[errorKey])).toBeVisible();
    expect(history.location.pathname).toBe("/order");
    expect(
      screen.queryByText(chineseMessages["order.dashboard.empty"]),
    ).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  },
);

test("malformed exception flags fail closed instead of opening workflow actions", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          hasNoActiveTests: "false",
          specimenIntakeStatus: "qa_pending",
          returnedFromQA: true,
        },
      ],
      totalCount: 1,
    }),
  );
  mount(undefined, "zh");
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(within(row).getByText("标本状态暂不可用")).toBeVisible();
  expect(within(row).getAllByRole("button")).toHaveLength(1);
  expect(within(row).queryByRole("progressbar")).toBeNull();
});

test("storage and skipped storage cannot mark labels complete", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          storageSkipped: true,
          samples: [{ storageLocationId: "1" }],
          stepProgress: { enter: true, collect: true, label: false, qa: false },
        },
      ],
      totalCount: 1,
    }),
  );
  mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(within(row).getByText("2/4")).toBeVisible();
});

test("shows recorded decisions without claiming current acceptance", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({
      orders: [
        {
          ...order,
          labelEvidenceScope: "generated_counter_not_physical_print",
          specimenDecisions: {
            acceptedRecorded: 1,
            rejectedRecorded: 1,
            notRecorded: 2,
            reviewRequired: 1,
            currentAcceptanceVerified: false,
          },
        },
      ],
      totalCount: 1,
    }),
  );
  mount();
  expect(await screen.findByTestId("decisions-12")).toHaveTextContent(
    "Acceptance records 1",
  );
  expect(screen.getByTestId("decisions-12")).toHaveTextContent(
    "Current acceptance is not verified",
  );
});

test("an explicit read error cannot be hidden by a plausible stale payload", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback(
      { orders: [order], totalCount: 1 },
      { errorKey: "security.accessDenied" },
    ),
  );
  mount(undefined, "zh");
  expect(
    await screen.findByText(chineseMessages["security.accessDenied"]),
  ).toBeVisible();
  expect(screen.queryByRole("row", { name: /DEMO-12/ })).toBeNull();
  expect(mocks.load).not.toHaveBeenCalled();
});

test("new request clears old actions and discards older callbacks", async () => {
  const callbacks = [];
  mocks.get.mockImplementation((_url, callback) => callbacks.push(callback));
  mount();
  act(() => callbacks[0]({ orders: [order], totalCount: 201 }));
  expect(await screen.findByRole("row", { name: /DEMO-12/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /next page/i }));
  expect(screen.queryByRole("row", { name: /DEMO-12/ })).toBeNull();
  act(() => callbacks[0]({ orders: [order], totalCount: 201 }));
  expect(screen.queryByRole("row", { name: /DEMO-12/ })).toBeNull();
});

test("session change removes existing rows and rejects old callbacks", async () => {
  const callbacks = [];
  mocks.get.mockImplementation((_url, callback) => callbacks.push(callback));
  const history = createMemoryHistory({ initialEntries: ["/order"] });
  const tree = (authenticated, userId) => (
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { authenticated, userId } }}
        >
          <OrderDashboard />
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>
  );
  const rendered = render(tree(true, "1"));
  act(() => callbacks[0]({ orders: [order], totalCount: 201 }));
  expect(await screen.findByRole("row", { name: /DEMO-12/ })).toBeVisible();
  rendered.rerender(tree(false, "1"));
  expect(screen.queryByRole("row", { name: /DEMO-12/ })).toBeNull();
  act(() => callbacks[0]({ orders: [order], totalCount: 201 }));
  expect(screen.queryByRole("row", { name: /DEMO-12/ })).toBeNull();
});
