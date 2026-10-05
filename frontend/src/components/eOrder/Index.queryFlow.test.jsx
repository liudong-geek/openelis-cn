import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import messages from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";

vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});

import { ConfigurationContext } from "../layout/Layout";
import EOrderPage from "./Index";

const actor = {
  authenticated: true,
  userId: "7",
  sessionId: "synthetic-index-session",
  roles: ["Reception", "Results"],
  loginLabUnit: "化学组",
  userLabRolesMap: { 化学组: ["Reception", "Results"] },
  csrfToken: "masked-A",
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const makeRow = (id, label = `患者-${id}`) => ({
  electronicOrderId: String(id),
  externalOrderId: `SIM-EXT-${id}`,
  patientLastName: label,
  patientFirstName: "模拟",
  statusId: "21",
  statusCode: "ENTERED",
  status: "Entered",
  canReceive: true,
  actionUnavailableReason: null,
  warningCodes: [],
  priority: "ROUTINE",
});
const queryFor = (url) =>
  new URL(String(url), "http://sim.invalid").searchParams;
const makeBody = (url, total = 1, label = "默认患者", extra = {}) => {
  const query = queryFor(url);
  const page = Number(query.get("page"));
  const pageSize = Number(query.get("pageSize"));
  const offset = (page - 1) * pageSize;
  const length = Math.min(pageSize, Math.max(0, total - offset));
  return {
    queryVersion: "2",
    currentUserId: "7",
    pendingOnly: query.get("pendingOnly") === "true",
    canReceive: true,
    eOrders: Array.from({ length }, (_, index) =>
      makeRow(
        101 + offset + index,
        length === 1 ? label : `患者-${101 + offset + index}`,
      ),
    ),
    paging: {
      currentPage: String(page),
      totalPages: String(Math.max(1, Math.ceil(total / pageSize))),
      totalResults: total,
      pageSize,
    },
    statusSelectionList: [
      { id: "21", value: "Entered" },
      { id: "23", value: "Realized" },
    ],
    warningCodes: [],
    ...extra,
  };
};
const queryCalls = () =>
  fetch.mock.calls.filter(([url]) =>
    String(url).includes("/rest/ElectronicOrders?"),
  );
const allocationCalls = () =>
  fetch.mock.calls.filter(([url]) =>
    String(url).includes("/rest/SampleEntryGenerateScanProvider"),
  );
const failureFeedback = () =>
  screen.queryByText(messages["eorder.query.error.capability"]) ||
  screen.queryByText(messages["eorder.query.error.unavailable"]) ||
  screen.queryByText(messages["eorder.query.error.forbidden"]) ||
  screen.queryByText(messages["eorder.action.reviewFailed"]) ||
  screen.queryByText(messages["eorder.number.generateFailed"]);
let serverActor;
let queryResponder;
let sessionResponder;

function setup({
  initialEntries = ["/ElectronicOrders"],
  configuration = { DEFAULT_DATE_LOCALE: "zh-CN", AccessionFormat: "ALPHANUM" },
} = {}) {
  const history = createMemoryHistory({ initialEntries });
  const tree = (currentActor) => (
    <IntlProvider locale="zh-CN" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{ userSessionDetails: currentActor }}
      >
        <ConfigurationContext.Provider
          value={{ configurationProperties: configuration }}
        >
          <Router history={history}>
            <Route path="/ElectronicOrders" exact>
              <EOrderPage />
            </Route>
            <Route path="/SamplePatientEntry" exact>
              <div data-testid="manual-entry-target">
                既有申请录入页测试目标
              </div>
            </Route>
          </Router>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
  const view = render(tree(actor));
  return {
    ...view,
    history,
    setActor(next) {
      view.rerender(tree(next));
    },
  };
}
const loaded = async (label = "默认患者") =>
  waitFor(() =>
    expect(screen.getByRole("cell", { name: label + "模拟" })).toBeVisible(),
  );
const keyword = () => screen.getByLabelText(messages["eorder.query.keyword"]);
const search = () =>
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
const expandConditions = () =>
  fireEvent.click(screen.getByRole("button", { name: "展开查询条件" }));
const changeKeyword = (value) =>
  fireEvent.change(keyword(), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("locale", "zh_CN");
  serverActor = actor;
  sessionResponder = null;
  queryResponder = (url) => json(makeBody(url));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (String(url).endsWith("/session"))
        return sessionResponder
          ? sessionResponder(url, options)
          : json(serverActor);
      if (String(url).includes("/rest/ElectronicOrders?"))
        return queryResponder(url, options);
      if (String(url).endsWith("/rest/SampleEntryGenerateScanProvider"))
        return json({ status: true, body: "LAB A&extra=2" });
      throw new Error("Unexpected endpoint: " + url);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("expands and collapses real advanced controls without changing the loaded queue", async () => {
  setup();
  await loaded();
  expect(screen.getByLabelText("开始日期")).not.toBeVisible();
  const toggle = screen.getByRole("button", { name: "展开查询条件" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expandConditions();
  expect(screen.getByLabelText("开始日期")).toHaveAttribute("type", "date");
  expect(screen.getByLabelText("处理状态")).toHaveValue("PENDING");
  expect(screen.getByRole("button", { name: "收起查询条件" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "收起查询条件" }));
  expect(screen.getByLabelText("开始日期")).not.toBeVisible();
  expect(queryCalls()).toHaveLength(1);
  expect(screen.getByRole("cell", { name: "默认患者模拟" })).toBeVisible();
});

test("sends keyword, native date range, explicit status and details as one query", async () => {
  setup();
  await loaded();
  expandConditions();
  changeKeyword("  姓名 A/B &x=2  ");
  fireEvent.input(screen.getByLabelText("开始日期"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(screen.getByLabelText("结束日期"), {
    target: { value: "2026-10-06" },
  });
  fireEvent.change(screen.getByLabelText("处理状态"), {
    target: { value: "23" },
  });
  fireEvent.click(
    screen.getByLabelText(messages["eorder.query.includeDetails"]),
  );
  expect(screen.queryByRole("cell", { name: "默认患者模拟" })).toBeNull();
  search();
  await loaded();
  const query = queryFor(queryCalls()[1][0]);
  expect(Object.fromEntries(query)).toEqual({
    queryVersion: "2",
    searchType: "IDENTIFIER",
    searchValue: "姓名 A/B &x=2",
    pendingOnly: "false",
    statusId: "23",
    startDate: "2026/10/01",
    endDate: "2026/10/06",
    useAllInfo: "true",
    page: "1",
    pageSize: "50",
  });
});

test("requeries every server page with all applied conditions and renders only that page", async () => {
  queryResponder = (url) => json(makeBody(url, 11));
  setup();
  await loaded("患者-101");
  expandConditions();
  fireEvent.input(screen.getByLabelText("开始日期"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.change(screen.getByLabelText("处理状态"), {
    target: { value: "ALL" },
  });
  search();
  await loaded("患者-101");
  fireEvent.change(
    screen.getByLabelText(messages["pagination.items-per-page"]),
    { target: { value: "10" } },
  );
  await waitFor(() =>
    expect(queryFor(queryCalls().at(-1)[0]).get("pageSize")).toBe("10"),
  );
  await loaded("患者-101");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await loaded("默认患者");
  expect(screen.queryByRole("cell", { name: "患者-101模拟" })).toBeNull();
  expect(screen.getByText("共 11 份申请")).toBeVisible();
  const query = queryFor(queryCalls().at(-1)[0]);
  expect(query.get("page")).toBe("2");
  expect(query.get("pageSize")).toBe("10");
  expect(query.get("queryVersion")).toBe("2");
  expect(query.get("searchType")).toBe("DATE_STATUS");
  expect(query.get("startDate")).toBe("2026/10/01");
  expect(query.get("endDate")).toBe("");
  expect(query.get("pendingOnly")).toBe("false");
  expect(query.get("statusId")).toBe("");
  expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled();
});

test("rejects reversed dates before sending a clinical request", async () => {
  setup();
  await loaded();
  expandConditions();
  fireEvent.input(screen.getByLabelText("开始日期"), {
    target: { value: "2026-10-07" },
  });
  fireEvent.input(screen.getByLabelText("结束日期"), {
    target: { value: "2026-10-06" },
  });
  search();
  expect(screen.getByText(messages["eorder.query.error.date"])).toBeVisible();
  expect(queryCalls()).toHaveLength(1);
  expect(screen.queryByRole("cell", { name: "默认患者模拟" })).toBeNull();
  expect(screen.queryByText("未找到电子检验申请")).toBeNull();
});

test("separates service failure from a legitimate empty list and lets the current query retry", async () => {
  setup();
  await loaded();
  queryResponder = () => json({ error: "synthetic failure" }, 500);
  search();
  await waitFor(() =>
    expect(
      screen.getByText(messages["eorder.query.error.unavailable"]),
    ).toBeVisible(),
  );
  expect(screen.queryByRole("cell", { name: "默认患者模拟" })).toBeNull();
  expect(screen.queryByText("未找到电子检验申请")).toBeNull();
  queryResponder = (url) => json(makeBody(url, 0));
  search();
  await waitFor(() =>
    expect(screen.getByText("未找到电子检验申请")).toBeVisible(),
  );
  expect(
    screen.queryByText(messages["eorder.query.error.unavailable"]),
  ).toBeNull();
  expect(screen.getByRole("table")).toBeVisible();
  expect(queryCalls()).toHaveLength(3);
});

test("does not let the first A response overwrite B or a new A query", async () => {
  const oldA = deferred(),
    newA = deferred();
  let aReads = 0;
  queryResponder = (url) => {
    const value = queryFor(url).get("searchValue");
    if (value === "A") return ++aReads === 1 ? oldA.promise : newA.promise;
    return json(makeBody(url, 1, value === "B" ? "B患者" : "默认患者"));
  };
  setup();
  await loaded();
  changeKeyword("A");
  search();
  await waitFor(() => expect(queryCalls()).toHaveLength(2));
  const [oldUrl, oldOptions] = queryCalls()[1];
  changeKeyword("B");
  search();
  expect(oldOptions.signal.aborted).toBe(true);
  await loaded("B患者");
  changeKeyword("A");
  search();
  await waitFor(() => expect(queryCalls()).toHaveLength(4));
  await act(async () => oldA.resolve(json(makeBody(oldUrl, 1, "旧A患者"))));
  expect(screen.queryByRole("cell", { name: "旧A患者模拟" })).toBeNull();
  expect(screen.queryByRole("cell", { name: "B患者模拟" })).toBeNull();
  expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
  await act(async () =>
    newA.resolve(json(makeBody(queryCalls()[3][0], 1, "新A患者"))),
  );
  await loaded("新A患者");
  expect(screen.queryByRole("cell", { name: "旧A患者模拟" })).toBeNull();
});

test("clears the previous actor and ignores pending data when current context identity changes", async () => {
  const pending = deferred();
  const view = setup();
  await loaded();
  queryResponder = () => pending.promise;
  search();
  await waitFor(() => expect(queryCalls()).toHaveLength(2));
  const [url, options] = queryCalls()[1];
  serverActor = { ...actor, userId: "8", sessionId: "synthetic-other-session" };
  view.setActor(serverActor);
  expect(options.signal.aborted).toBe(true);
  await act(async () => pending.resolve(json(makeBody(url, 1, "旧身份患者"))));
  expect(screen.queryByRole("cell", { name: "旧身份患者模拟" })).toBeNull();
  expect(screen.getByText(messages["eorder.query.error.scope"])).toBeVisible();
});

test("a cross-tab masked credential refresh verifies stable identity and preserves current criteria", async () => {
  setup();
  await loaded();
  expandConditions();
  changeKeyword("当前条件");
  fireEvent.input(screen.getByLabelText("开始日期"), {
    target: { value: "2026-10-01" },
  });
  search();
  await loaded();
  serverActor = { ...actor, csrfToken: "masked-B" };
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "CSRF",
        oldValue: "masked-A",
        newValue: "masked-B",
      }),
    ),
  );
  await waitFor(() => expect(queryCalls()).toHaveLength(3));
  await loaded();
  expect(keyword()).toHaveValue("当前条件");
  expect(screen.getByLabelText("开始日期")).toHaveValue("2026-10-01");
  expect(screen.queryByText(messages["eorder.query.error.scope"])).toBeNull();
  expect(queryFor(queryCalls()[2][0]).get("searchValue")).toBe("当前条件");
  expect(queryFor(queryCalls()[2][0]).get("startDate")).toBe("2026/10/01");
});

test("a cross-tab actual identity change clears private criteria and does not read with the old actor", async () => {
  setup();
  await loaded();
  changeKeyword("旧账号查询");
  serverActor = { ...actor, userId: "8", sessionId: "synthetic-new-session" };
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "userSessionDetails" }),
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByText(messages["eorder.query.error.scope"]),
    ).toBeVisible(),
  );
  expect(keyword()).toHaveValue("");
  expect(screen.queryByRole("cell", { name: "默认患者模拟" })).toBeNull();
  expect(queryCalls()).toHaveLength(1);
});

test("bounds loading at 20 seconds and discards data arriving after timeout", async () => {
  setup();
  await loaded();
  vi.useFakeTimers();
  const pending = deferred();
  queryResponder = () => pending.promise;
  await act(async () => search());
  expect(queryCalls()).toHaveLength(2);
  const [url, options] = queryCalls()[1];
  await act(async () => vi.advanceTimersByTimeAsync(20001));
  expect(options.signal.aborted).toBe(true);
  expect(
    screen.getByText(messages["eorder.query.error.unavailable"]),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "搜索" })).toBeEnabled();
  await act(async () => pending.resolve(json(makeBody(url, 1, "超时旧患者"))));
  expect(screen.queryByRole("cell", { name: "超时旧患者模拟" })).toBeNull();
  expect(screen.queryByText("未找到电子检验申请")).toBeNull();
});

test("navigates in the same tab with encoded exact identities and rechecks saved criteria on return", async () => {
  const external = "EXT A&order=2/中";
  queryResponder = (url) =>
    json(
      makeBody(url, 1, "核对患者", {
        eOrders: [{ ...makeRow(101, "核对患者"), externalOrderId: external }],
      }),
    );
  const view = setup();
  await loaded("核对患者");
  expandConditions();
  changeKeyword("姓名 &原机构");
  fireEvent.input(screen.getByLabelText("开始日期"), {
    target: { value: "2026-10-01" },
  });
  search();
  await loaded("核对患者");
  const saved = view.history.location.state.electronicOrderQuery;
  expect(saved.draft.searchValue).toBe("姓名 &原机构");
  expect(saved.owner).not.toContain(actor.sessionId);
  expect(JSON.stringify(saved)).not.toContain("核对患者");
  expect(JSON.stringify(saved)).not.toContain("csrfToken");
  fireEvent.click(screen.getByRole("button", { name: "展开当前行" }));
  fireEvent.click(screen.getByRole("button", { name: "生成" }));
  await waitFor(() =>
    expect(
      screen.getByLabelText(messages["sample.label.labnumber"]),
    ).toHaveValue("LAB A&extra=2"),
  );
  const opened = vi.spyOn(window, "open");
  fireEvent.click(screen.getByRole("button", { name: "核对并接收" }));
  await waitFor(() =>
    expect(screen.getByTestId("manual-entry-target")).toBeVisible(),
  );
  const target = new URLSearchParams(view.history.location.search);
  expect(view.history.location.pathname).toBe("/SamplePatientEntry");
  expect(target.get("ID")).toBe(external);
  expect(target.get("labNumber")).toBe("LAB A&extra=2");
  expect(target.has("attemptAutoSave")).toBe(false);
  expect(opened).not.toHaveBeenCalled();
  await act(async () => view.history.goBack());
  await loaded("核对患者");
  expect(keyword()).toHaveValue("姓名 &原机构");
  expect(screen.getByLabelText("开始日期")).toHaveValue("2026-10-01");
  expect(queryFor(queryCalls().at(-1)[0]).get("searchValue")).toBe(
    "姓名 &原机构",
  );
});

test("rechecks current identity before entering the existing manual form", async () => {
  const view = setup();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "展开当前行" }));
  serverActor = { ...actor, roles: ["Results"] };
  fireEvent.click(screen.getByRole("button", { name: "核对并接收" }));
  await waitFor(() =>
    expect(
      screen.getByText(messages["eorder.query.error.forbidden"]),
    ).toBeVisible(),
  );
  expect(view.history.location.pathname).toBe("/ElectronicOrders");
  expect(screen.queryByTestId("manual-entry-target")).toBeNull();
  expect(screen.queryByRole("cell", { name: "默认患者模拟" })).toBeNull();
});

test.each([true, false])(
  "bounds a hanging review preflight and late identity response, abort-aware transport=%s",
  async (abortAware) => {
    const view = setup();
    await loaded();
    vi.useFakeTimers();
    let realSignal;
    let resolveSession;
    sessionResponder = (_url, options) =>
      new Promise((resolve, reject) => {
        resolveSession = resolve;
        realSignal = options.signal;
        if (abortAware)
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("Synthetic timeout", "AbortError")),
            { once: true },
          );
      });
    fireEvent.click(screen.getByRole("button", { name: "展开当前行" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "核对并接收" })),
    );
    expect(screen.getByRole("button", { name: "核对并接收" })).toBeDisabled();
    expect(realSignal.aborted).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(20001));
    expect(realSignal.aborted).toBe(true);
    // The row and query each bound their own request. Either may finish first,
    // but the operator must see a failure and the late read must stay inert.
    expect(failureFeedback()).toBeVisible();
    expect(screen.queryByText(messages["eorder.action.reviewing"])).toBeNull();
    expect(view.history.location.pathname).toBe("/ElectronicOrders");
    expect(screen.queryByTestId("manual-entry-target")).toBeNull();
    await act(async () => resolveSession(json(actor)));
    expect(view.history.location.pathname).toBe("/ElectronicOrders");
    expect(screen.queryByTestId("manual-entry-target")).toBeNull();
  },
);

const changedCapabilities = [
  ...["patientNationalId", "passportNumber", "subjectNumber"].map((key) => [
    `patient identity ${key} changed`,
    (body) => ({
      ...body,
      eOrders: body.eOrders.map((row) => ({
        ...row,
        [key]: "SIM-OTHER-PATIENT",
      })),
    }),
  ]),
  [
    "permission withdrawn",
    (body) => ({
      ...body,
      canReceive: false,
      eOrders: body.eOrders.map((row) => ({
        ...row,
        canReceive: false,
        actionUnavailableReason: "NO_RECEIVE_PERMISSION",
      })),
    }),
  ],
  [
    "status changed",
    (body) => ({
      ...body,
      eOrders: body.eOrders.map((row) => ({
        ...row,
        statusId: "23",
        statusCode: "REALIZED",
        status: "Realized",
        canReceive: false,
        actionUnavailableReason: "NOT_PENDING",
      })),
    }),
  ],
  [
    "external identity replaced",
    (body) => ({
      ...body,
      eOrders: body.eOrders.map((row) => ({
        ...row,
        externalOrderId: "SIM-OTHER-EXTERNAL-ID",
      })),
    }),
  ],
  [
    "request no longer in this queue",
    (body) => ({
      ...body,
      eOrders: [],
      paging: { ...body.paging, totalPages: "1", totalResults: 0 },
    }),
  ],
];

test.each(changedCapabilities)(
  "rechecks current capability before navigation with the same session: %s",
  async (_label, changeBody) => {
    const view = setup();
    await loaded();
    expandConditions();
    fireEvent.change(screen.getByLabelText("处理状态"), {
      target: { value: "ALL" },
    });
    search();
    await loaded();
    const appliedQuery = Object.fromEntries(queryFor(queryCalls().at(-1)[0]));
    const readsBefore = queryCalls().length;
    queryResponder = (url) => json(changeBody(makeBody(url)));
    fireEvent.click(screen.getByRole("button", { name: "核对并接收" }));
    await waitFor(() => expect(failureFeedback()).toBeVisible());
    expect(queryCalls()).toHaveLength(readsBefore + 1);
    expect(Object.fromEntries(queryFor(queryCalls().at(-1)[0]))).toEqual(
      appliedQuery,
    );
    expect(serverActor).toBe(actor);
    expect(view.history.location.pathname).toBe("/ElectronicOrders");
    expect(screen.queryByTestId("manual-entry-target")).toBeNull();
    expect(allocationCalls()).toHaveLength(0);
  },
);

test.each(changedCapabilities)(
  "does not allocate a number after same-session live capability changes: %s",
  async (_label, changeBody) => {
    const view = setup();
    await loaded();
    expandConditions();
    fireEvent.change(screen.getByLabelText("处理状态"), {
      target: { value: "ALL" },
    });
    search();
    await loaded();
    const appliedQuery = Object.fromEntries(queryFor(queryCalls().at(-1)[0]));
    const readsBefore = queryCalls().length;
    queryResponder = (url) => json(changeBody(makeBody(url)));
    fireEvent.click(screen.getByRole("button", { name: "展开当前行" }));
    fireEvent.click(screen.getByRole("button", { name: "生成" }));
    await waitFor(() => expect(failureFeedback()).toBeVisible());
    expect(queryCalls()).toHaveLength(readsBefore + 1);
    expect(Object.fromEntries(queryFor(queryCalls().at(-1)[0]))).toEqual(
      appliedQuery,
    );
    expect(serverActor).toBe(actor);
    expect(allocationCalls()).toHaveLength(0);
    expect(view.history.location.pathname).toBe("/ElectronicOrders");
    expect(screen.queryByDisplayValue("LAB A&extra=2")).toBeNull();
  },
);

test("keeps every applied criterion and server page during live capability preflight", async () => {
  queryResponder = (url) => json(makeBody(url, 11));
  const view = setup();
  await loaded("患者-101");
  expandConditions();
  changeKeyword("姓名 &机构");
  fireEvent.input(screen.getByLabelText("开始日期"), {
    target: { value: "2026-10-01" },
  });
  fireEvent.input(screen.getByLabelText("结束日期"), {
    target: { value: "2026-10-06" },
  });
  fireEvent.change(screen.getByLabelText("处理状态"), {
    target: { value: "ALL" },
  });
  fireEvent.click(
    screen.getByLabelText(messages["eorder.query.includeDetails"]),
  );
  search();
  await loaded("患者-101");
  fireEvent.change(
    screen.getByLabelText(messages["pagination.items-per-page"]),
    {
      target: { value: "10" },
    },
  );
  await waitFor(() =>
    expect(queryFor(queryCalls().at(-1)[0]).get("pageSize")).toBe("10"),
  );
  await loaded("患者-101");
  fireEvent.click(screen.getByRole("button", { name: "下一页" }));
  await loaded();
  const appliedQuery = Object.fromEntries(queryFor(queryCalls().at(-1)[0]));
  expect(appliedQuery).toMatchObject({
    searchValue: "姓名 &机构",
    startDate: "2026/10/01",
    endDate: "2026/10/06",
    pendingOnly: "false",
    useAllInfo: "true",
    page: "2",
    pageSize: "10",
  });
  fireEvent.click(screen.getByRole("button", { name: "核对并接收" }));
  await waitFor(() =>
    expect(screen.getByTestId("manual-entry-target")).toBeVisible(),
  );
  expect(Object.fromEntries(queryFor(queryCalls().at(-1)[0]))).toEqual(
    appliedQuery,
  );
  expect(new URLSearchParams(view.history.location.search).get("ID")).toBe(
    "SIM-EXT-111",
  );
});

test.each(["核对并接收", "生成"])(
  "discards a late live-capability response after query criteria change: %s",
  async (action) => {
    const view = setup();
    await loaded();
    const pending = deferred();
    queryResponder = () => pending.promise;
    if (action === "生成")
      fireEvent.click(screen.getByRole("button", { name: "展开当前行" }));
    fireEvent.click(screen.getByRole("button", { name: action }));
    await waitFor(() => expect(queryCalls()).toHaveLength(2));
    const [url, options] = queryCalls()[1];
    changeKeyword("新条件");
    expect(options.signal.aborted).toBe(true);
    await act(async () => pending.resolve(json(makeBody(url))));
    expect(view.history.location.pathname).toBe("/ElectronicOrders");
    expect(screen.queryByTestId("manual-entry-target")).toBeNull();
    expect(allocationCalls()).toHaveLength(0);
    expect(screen.queryByDisplayValue("LAB A&extra=2")).toBeNull();
    expect(keyword()).toHaveValue("新条件");
  },
);

test("ignores foreign history state and starts the current pending queue", async () => {
  setup({
    initialEntries: [
      {
        pathname: "/ElectronicOrders",
        state: {
          electronicOrderQuery: {
            owner: "foreign-owner",
            draft: {
              searchValue: "foreign patient",
              startDate: "2026-10-01",
              endDate: "",
              statusFilter: "ALL",
              useAllInfo: true,
            },
            advanced: true,
            page: 2,
            pageSize: 10,
          },
        },
      },
    ],
  });
  await loaded();
  expect(keyword()).toHaveValue("");
  expect(screen.getByLabelText("开始日期")).not.toBeVisible();
  const query = queryFor(queryCalls()[0][0]);
  expect(query.get("page")).toBe("1");
  expect(query.get("pageSize")).toBe("50");
  expect(query.get("pendingOnly")).toBe("true");
  expect(query.get("searchValue")).toBe("");
});
