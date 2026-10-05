import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import zhMessages from "../../../languages/zh_CN.json";
import ReferredOutTests from "./ReferredOutTests";
import { getFromOpenElisServer } from "../../utils/Utils";
import { ConfigurationContext } from "../../layout/Layout";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { referralHistoryOwner } from "./referralQuery";
import { pendingSummarySessionKey } from "../../home/pendingSummarySession";

vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({}),
    NotificationContext: createContext({
      notificationVisible: false,
      setNotificationVisible: () => {},
      addNotification: () => {},
    }),
  };
});
vi.mock("../../utils/Utils", async () => ({
  ...(await vi.importActual("../../utils/Utils")),
  getFromOpenElisServer: vi.fn(),
}));
vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));
// This suite tests the referral parent's selected patient and restored search
// contract. The real shared child runs separately in its selection/history suites.
const patientBoundary = vi.hoisted(() => ({ real: false, calls: [] }));
vi.mock("../../patient/SearchPatientForm", async () => {
  const actual = await vi.importActual("../../patient/SearchPatientForm");
  return {
    default: (props) => {
      patientBoundary.calls.push(props);
      if (patientBoundary.real)
        return React.createElement(actual.SearchPatientForm, props);
      const { getSelectedPatient, initialState, onStateChange, compactSearch } =
        props;
      return (
        <div data-testid="patient-search" data-compact={String(compactSearch)}>
          <label>
            患者查询草稿
            <input
              value={initialState?.quick || ""}
              onChange={(event) => onStateChange({ quick: event.target.value })}
            />
          </label>
          <button
            onClick={() =>
              getSelectedPatient({
                patientPK: "41",
                lastName: "李",
                firstName: "明",
              })
            }
          >
            选择李明
          </button>
          <button
            onClick={() =>
              getSelectedPatient({
                patientPK: "42",
                lastName: "王",
                firstName: "华",
              })
            }
          >
            选择王华
          </button>
        </div>
      );
    },
  };
});

const actor = {
  authenticated: true,
  userId: "17",
  sessionId: "synthetic-referral-session",
  roles: ["Results", "Reception"],
  loginLabUnit: "化学组",
  userLabRolesMap: { 化学组: ["Results", "Reception"] },
};
const json = (
  value,
  status = 200,
  contentType = "application/json; charset=utf-8",
) =>
  new Response(value === undefined ? "" : JSON.stringify(value), {
    status,
    headers: { "content-type": contentType },
  });
const makeReferral = (index) => ({
  analysisId: String(index),
  accessionNumber: `LN-${String(index).padStart(3, "0")}`,
  referralStatus: "SENT",
  referralStatusDisplay: "SENT",
  patientLastName: `患者${index}`,
  patientFirstName: "测试",
  referringTestName: "血常规",
  referralResultsDisplay: "正常",
  referenceLabDisplay: "中心实验室",
  notes: "",
  disabled: false,
});
const tests = [
  { id: "31", value: "血常规" },
  { id: "42", value: "肝功能" },
];
const sections = [
  { id: "7", value: "血液组" },
  { id: "8", value: "化学组" },
];
let queries;
let optionRequests;
let serverActor;
const configure = ({ rows, deferOptions = false } = {}) => {
  queries = [];
  optionRequests = [];
  serverActor = actor;
  getFromOpenElisServer.mockImplementation((url, callback, signal) => {
    if (
      url === "/rest/test-list" ||
      String(url).startsWith("/rest/user-test-sections/")
    ) {
      optionRequests.push({ url, callback, signal });
      if (!deferOptions) callback(url === "/rest/test-list" ? tests : sections);
    } else if (String(url).startsWith("/rest/patient-details")) {
      optionRequests.push({ url, callback, signal });
      callback({
        patientPK: "41",
        patientID: "41",
        lastName: "李",
        firstName: "明",
        gender: "M",
        dataSourceName: "OpenElis",
      });
    } else if (String(url).startsWith("/rest/patient-photos")) callback({});
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      if (String(url).endsWith("/session"))
        return Promise.resolve(json(serverActor));
      if (!String(url).includes("/rest/ReferredOutTests?"))
        throw new Error(`Unexpected URL: ${url}`);
      if (rows !== undefined) {
        queries.push({ url, options });
        return Promise.resolve(json({ referralDisplayItems: rows }));
      }
      return new Promise((resolve, reject) =>
        queries.push({ url, options, resolve, reject }),
      );
    }),
  );
};
const page = (history, user = actor, locale = "zh-CN") => (
  <Router history={history}>
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <ConfigurationContext.Provider
        value={{
          configurationProperties: locale
            ? {
                DEFAULT_DATE_LOCALE: locale,
                FIRST_NAME_REGEX: ".*",
                LAST_NAME_REGEX: ".*",
                AccessionFormat: "NUMERIC",
                UseExternalPatientInfo: "false",
                ENABLE_CLIENT_REGISTRY: "false",
              }
            : {},
        }}
      >
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: user }}
        >
          <Route path="/ReferredOutTests">
            <ReferredOutTests />
          </Route>
          <Route path="/Other">
            <span>其他工作区</span>
          </Route>
        </UserSessionDetailsContext.Provider>
      </ConfigurationContext.Provider>
    </IntlProvider>
  </Router>
);
const renderPage = ({
  entry = "/ReferredOutTests",
  user = actor,
  locale = "zh-CN",
} = {}) => {
  const history = createMemoryHistory({ initialEntries: [entry] });
  const view = render(page(history, user, locale));
  return {
    ...view,
    history,
    changeContext: (nextActor = user, nextLocale = locale) =>
      view.rerender(page(history, nextActor, nextLocale)),
  };
};
const resolveQuery = async (index, rows = []) => {
  await act(async () => {
    queries[index].resolve(json({ referralDisplayItems: rows }));
  });
};
const selectMode = async (user, mode) =>
  user.selectOptions(screen.getByLabelText("查询类别"), mode);
const goLab = async (user, number = "LAB/71") => {
  await selectMode(user, "LAB_NUMBER");
  await user.type(screen.getByLabelText("实验室编号"), number);
  await user.click(screen.getByRole("button", { name: "搜索" }));
};
const queryParams = (index) =>
  new URL(queries[index].url, "http://openelis.local").searchParams;
const openTests = async (user) =>
  user.click(
    within(
      screen.getByLabelText("选择检验项目").closest(".cds--multi-select"),
    ).getByRole("button", { name: "展开选项" }),
  );
const printButton = () =>
  screen.queryByRole("button", { name: "打印选定的患者报告" });

beforeEach(() => {
  vi.clearAllMocks();
  patientBoundary.real = false;
  patientBoundary.calls = [];
  window.history.replaceState({}, "", "/ReferredOutTests");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("referral controlled query and request lifecycle", () => {
  test("default seven-day request waits for date configuration and both option lists", async () => {
    configure({ deferOptions: true });
    const { changeContext } = renderPage({ locale: null });
    expect(queries).toHaveLength(0);
    await waitFor(() => expect(optionRequests).toHaveLength(2));
    act(() => optionRequests[0].callback(tests));
    expect(queries).toHaveLength(0);
    act(() => optionRequests[1].callback(sections));
    expect(queries).toHaveLength(0);
    changeContext(actor, "zh-CN");
    await waitFor(() => expect(queries).toHaveLength(1));
    const params = queryParams(0);
    const today = new Date();
    const start = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 6,
    );
    const formatted = (date) =>
      `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
    expect(Object.fromEntries(params)).toEqual({
      searchType: "TEST_AND_DATES",
      dateType: "SENT",
      startDate: formatted(start),
      endDate: formatted(today),
      testIds: "",
      testUnitIds: "",
    });
    await resolveQuery(0);
    expect(await screen.findByText("未找到匹配的外送记录")).toBeInTheDocument();
  });
  test("first authentication readiness resumes the default query without reporting an account switch", async () => {
    configure({ rows: [] });
    const { changeContext } = renderPage({ user: {} });
    expect(queries).toHaveLength(0);
    changeContext(actor);
    expect(await screen.findByText("未找到匹配的外送记录")).toBeInTheDocument();
    expect(queries).toHaveLength(1);
    expect(queryParams(0).get("searchType")).toBe("TEST_AND_DATES");
    expect(
      screen.queryByText("登录账号或权限范围已变化，请重新查询。"),
    ).not.toBeInTheDocument();
  });
  test.each(["CSRF", "userSessionDetails", null])(
    "storage %s boundary discards patient, search draft and reports and rejects an old child callback",
    async (key) => {
      configure({ rows: [makeReferral(1)] });
      const { history } = renderPage();
      const user = userEvent.setup();
      await screen.findByText("LN-001");
      await selectMode(user, "PATIENT");
      await user.type(screen.getByLabelText("患者查询草稿"), "私有患者草稿");
      await user.click(screen.getByRole("button", { name: "选择李明" }));
      await screen.findByText(/当前查询患者： 李明 · 41/);
      await screen.findByText("LN-001");
      await user.click(
        within(screen.getByRole("row", { name: /LN-001/ })).getByRole(
          "checkbox",
        ),
      );
      expect(printButton()).toBeEnabled();
      const oldSelection = patientBoundary.calls.at(-1).getSelectedPatient;
      const previousQueries = queries.length;
      const oldStateChange = patientBoundary.calls.at(-1).onStateChange;
      act(() => {
        window.dispatchEvent(new StorageEvent("storage", { key }));
        oldSelection({ patientPK: "42", lastName: "王", firstName: "华" });
        oldStateChange({ quick: "过期患者草稿" });
      });
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(printButton()).toBeNull();
      expect(
        screen.getByText("登录账号或权限范围已变化，请重新查询。"),
      ).toBeInTheDocument();
      expect(queries).toHaveLength(previousQueries);
      expect(history.location.state.referralQuery.draft).toMatchObject({
        mode: "TEST_AND_DATES",
        patientId: "",
        labNumber: "",
      });
      expect(history.location.state.referralQuery.patient).toBeNull();
      expect(
        history.location.state.referralQuery.patientSearch,
      ).toBeUndefined();
      await selectMode(user, "PATIENT");
      expect(screen.getByLabelText("患者查询草稿")).toHaveValue("");
    },
  );
  test("unrelated storage changes preserve the current selection and query", async () => {
    configure({ rows: [makeReferral(1)] });
    renderPage();
    const user = userEvent.setup();
    const row = await screen.findByRole("row", { name: /LN-001/ });
    await user.click(within(row).getByRole("checkbox"));
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "unrelated-preference" }),
      );
    });
    expect(screen.getByText("LN-001")).toBeInTheDocument();
    expect(printButton()).toBeEnabled();
  });
  test("history stores an opaque owner without the raw session, CSRF credential or clinical response rows", async () => {
    configure({ rows: [makeReferral(1)] });
    const { history } = renderPage({
      user: { ...actor, csrf: "synthetic-credential" },
    });
    await screen.findByText("LN-001");
    const saved = history.location.state.referralQuery;
    expect(saved.owner).toMatch(/^[0-9a-f]{32}$/);
    expect(saved).not.toHaveProperty("actor");
    expect(saved).not.toHaveProperty("rows");
    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain(actor.sessionId);
    expect(serialized).not.toContain("synthetic-credential");
    expect(serialized).not.toContain("LN-001");
  });
  test("changing a mode aborts its request and ignores its late successful rows", async () => {
    configure();
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => expect(queries).toHaveLength(1));
    await selectMode(user, "LAB_NUMBER");
    expect(queries[0].options.signal.aborted).toBe(true);
    await resolveQuery(0, [makeReferral(1)]);
    expect(screen.queryByText("LN-001")).not.toBeInTheDocument();
    expect(
      screen.getByText("查询条件已变更，请点击搜索。"),
    ).toBeInTheDocument();
    expect(printButton()).toBeNull();
  });
  test("editing a submitted number ignores late success and a later query alone owns selection", async () => {
    configure();
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => expect(queries).toHaveLength(1));
    await goLab(user, "FIRST");
    await waitFor(() => expect(queries).toHaveLength(2));
    await user.clear(screen.getByLabelText("实验室编号"));
    await user.type(screen.getByLabelText("实验室编号"), "SECOND");
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(queries).toHaveLength(3));
    await resolveQuery(2, [makeReferral(2)]);
    await resolveQuery(1, [makeReferral(1)]);
    await resolveQuery(0, [makeReferral(3)]);
    expect(await screen.findByText("LN-002")).toBeInTheDocument();
    expect(screen.queryByText("LN-001")).not.toBeInTheDocument();
    expect(screen.queryByText("LN-003")).not.toBeInTheDocument();
    expect(printButton()).toBeDisabled();
  });
  test("changing conditions clears selected reports before another request can succeed", async () => {
    configure({ rows: [makeReferral(1)] });
    renderPage();
    const user = userEvent.setup();
    const row = await screen.findByRole("row", { name: /LN-001/ });
    await user.click(within(row).getByRole("checkbox"));
    expect(printButton()).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "高级搜索" }));
    await user.clear(screen.getByLabelText("开始日期"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(printButton()).toBeNull();
    expect(
      screen.getByText("查询条件已变更，请点击搜索。"),
    ).toBeInTheDocument();
  });
  test("late failures from obsolete requests cannot replace the newest result", async () => {
    configure();
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => expect(queries).toHaveLength(1));
    await goLab(user);
    await waitFor(() => expect(queries).toHaveLength(2));
    await resolveQuery(1, [makeReferral(2)]);
    await act(async () => queries[0].reject(new Error("old request failed")));
    expect(screen.getByText("LN-002")).toBeInTheDocument();
    expect(screen.queryByText("外送记录查询失败")).not.toBeInTheDocument();
  });
  test("account changes discard loaded rows, selected reports, patient and pending requests", async () => {
    configure();
    const { changeContext } = renderPage();
    const user = userEvent.setup();
    await waitFor(() => expect(queries).toHaveLength(1));
    await resolveQuery(0, [makeReferral(1)]);
    await user.click(
      within(screen.getByRole("row", { name: /LN-001/ })).getByRole("checkbox"),
    );
    expect(printButton()).toBeEnabled();
    await selectMode(user, "PATIENT");
    await user.click(screen.getByRole("button", { name: "选择李明" }));
    await waitFor(() => expect(queries).toHaveLength(2));
    changeContext({ ...actor, userId: "18" });
    expect(queries[1].options.signal.aborted).toBe(true);
    await resolveQuery(1, [makeReferral(2)]);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(printButton()).toBeNull();
    expect(
      screen.getByText("登录账号或权限范围已变化，请重新查询。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("查询类别")).toHaveValue("TEST_AND_DATES");
  });
  test("a stable but different server account is rejected before any referral rows are read", async () => {
    configure({ rows: [makeReferral(1)] });
    serverActor = { ...actor, userId: "18" };
    renderPage();
    expect(
      await screen.findByText("登录账号或权限范围已变化，请重新查询。"),
    ).toBeInTheDocument();
    expect(queries).toHaveLength(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  test("equivalent role ordering and refreshed CSRF mask do not invalidate a result", async () => {
    configure({ rows: [makeReferral(1)] });
    const { changeContext } = renderPage();
    await screen.findByText("LN-001");
    changeContext({
      ...actor,
      csrf: "synthetic-new-mask",
      roles: ["Reception", "Results"],
      userLabRolesMap: { 化学组: ["Reception", "Results"] },
    });
    expect(screen.getByText("LN-001")).toBeInTheDocument();
    expect(
      screen.queryByText("登录账号或权限范围已变化，请重新查询。"),
    ).not.toBeInTheDocument();
  });
  test("patient mode shows the selected person and sends no date/test/number parameters", async () => {
    configure({ rows: [] });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText("未找到匹配的外送记录");
    await selectMode(user, "PATIENT");
    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "选择李明" }));
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(Object.fromEntries(queryParams(1))).toEqual({
      searchType: "PATIENT",
      selPatient: "41",
    });
    expect(screen.getByText(/当前查询患者： 李明 · 41/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "选择王华" }));
    await waitFor(() => expect(queries).toHaveLength(3));
    expect(Object.fromEntries(queryParams(2))).toEqual({
      searchType: "PATIENT",
      selPatient: "42",
    });
    expect(screen.getByText(/当前查询患者： 王华 · 42/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "移除" }));
    expect(screen.queryByText(/当前查询患者：/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
  });
  test("clearing a deep-linked patient prevents reentering patient mode from consuming the old URL", async () => {
    configure({ rows: [] });
    renderPage({ entry: "/ReferredOutTests?patientId=41" });
    const user = userEvent.setup();
    await screen.findByText("未找到匹配的外送记录");
    expect(
      patientBoundary.calls.some(
        (props) => props.initialSearch === "patientId=41",
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "移除" }));
    await selectMode(user, "LAB_NUMBER");
    await selectMode(user, "PATIENT");
    expect(patientBoundary.calls.at(-1).initialSearch).toBe("");
    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
    expect(screen.queryByText(/当前查询患者：/)).not.toBeInTheDocument();
  });
  test.each([
    [{ ...actor, userId: "18" }, "登录账号或权限范围已变化，请重新查询。"],
    [{ authenticated: false }, "登录已失效，请重新登录后查询。"],
    [{ ...actor, roles: ["Reception"] }, "当前账号没有外送记录查询权限。"],
  ])(
    "authoritative session change %# clears the selected patient and private search state without a storage event",
    async (nextServer, detail) => {
      configure({ rows: [] });
      const { history } = renderPage();
      const user = userEvent.setup();
      await screen.findByText("未找到匹配的外送记录");
      await selectMode(user, "PATIENT");
      await user.type(screen.getByLabelText("患者查询草稿"), "私有患者草稿");
      await user.click(screen.getByRole("button", { name: "选择李明" }));
      await screen.findByText(/当前查询患者： 李明 · 41/);
      await screen.findByText("未找到匹配的外送记录");
      serverActor = nextServer;
      await user.click(screen.getByRole("button", { name: "搜索" }));
      expect(await screen.findByText(detail)).toBeInTheDocument();
      expect(screen.queryByText(/当前查询患者：/)).not.toBeInTheDocument();
      expect(history.location.state.referralQuery.patient).toBeNull();
      expect(
        history.location.state.referralQuery.patientSearch,
      ).toBeUndefined();
      expect(history.location.state.referralQuery.draft.patientId).toBe("");
    },
  );
  test("timeout ends loading and cannot revive after its delayed response", async () => {
    vi.useFakeTimers();
    configure();
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(queries).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(screen.getByText("外送记录查询失败")).toBeInTheDocument();
    expect(screen.queryByText("正在查询外送记录…")).not.toBeInTheDocument();
    expect(queries[0].options.signal.aborted).toBe(true);
    await resolveQuery(0, [makeReferral(1)]);
    expect(screen.queryByText("LN-001")).not.toBeInTheDocument();
  });
  test("successful option lists remain ready after the former load timeout", async () => {
    vi.useFakeTimers();
    configure({ rows: [] });
    renderPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("未找到匹配的外送记录")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(21000));
    vi.useRealTimers();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "高级搜索" }));
    expect(
      screen.queryByText("检验项目或专业组加载失败"),
    ).not.toBeInTheDocument();
    await openTests(user);
    expect(
      await screen.findByRole("option", { name: "血常规" }),
    ).toBeInTheDocument();
  });
  test("option requests that never return fail within the bounded timeout and offer retry", async () => {
    vi.useFakeTimers();
    configure({ deferOptions: true });
    renderPage();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(optionRequests).toHaveLength(2);
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(screen.getByText("检验项目或专业组加载失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新加载" })).toBeEnabled();
    expect(queries).toHaveLength(0);
    expect(optionRequests.every((request) => request.signal.aborted)).toBe(
      true,
    );
  });
  test("failed options show retry and keep a delayed prior options response isolated", async () => {
    configure({ rows: [], deferOptions: true });
    renderPage();
    const user = userEvent.setup();
    await waitFor(() => expect(optionRequests).toHaveLength(2));
    act(() => {
      optionRequests[0].callback(null);
      optionRequests[1].callback(sections);
    });
    expect(
      await screen.findByText("检验项目或专业组加载失败"),
    ).toBeInTheDocument();
    expect(queries).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(optionRequests).toHaveLength(4));
    const current = optionRequests.slice(2);
    act(() => {
      current[0].callback(tests);
      current[1].callback(sections);
    });
    await screen.findByText("未找到匹配的外送记录");
    act(() => {
      optionRequests[0].callback(undefined);
      optionRequests[1].callback(undefined);
    });
    expect(
      screen.queryByText("检验项目或专业组加载失败"),
    ).not.toBeInTheDocument();
  });
  test("restores URL test selection in real controlled Carbon multi-select and updates submitted values", async () => {
    configure({ rows: [] });
    renderPage({ entry: "/ReferredOutTests?selectedTest=31&testSectionId=7" });
    const user = userEvent.setup();
    await screen.findByText("未找到匹配的外送记录");
    expect(Object.fromEntries(queryParams(0))).toMatchObject({
      startDate: "",
      endDate: "",
      testIds: "31",
      testUnitIds: "7",
    });
    await user.click(screen.getByRole("button", { name: "高级搜索" }));
    await openTests(user);
    const initialOption = await screen.findByRole("option", { name: "血常规" });
    expect(initialOption).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("option", { name: "肝功能" }));
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queryParams(1).get("testIds").split(",").sort()).toEqual([
      "31",
      "42",
    ]);
    await openTests(user);
    await user.click(screen.getByRole("option", { name: "血常规" }));
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(queries).toHaveLength(3));
    expect(queryParams(2).get("testIds")).toBe("42");
  });
  test("a stale URL selection absent from loaded options reports invalid conditions", async () => {
    configure({ rows: [] });
    renderPage({ entry: "/ReferredOutTests?selectedTest=999" });
    expect(
      await screen.findByText("查询条件无效，请核对后重新查询。"),
    ).toBeInTheDocument();
    expect(queries).toHaveLength(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  test("history restores independent draft, advanced expansion and page without stale URL overriding edits", async () => {
    configure({
      rows: Array.from({ length: 11 }, (_, index) => makeReferral(index + 1)),
    });
    const { history } = renderPage({
      entry: "/ReferredOutTests?selectedTest=31",
    });
    const user = userEvent.setup();
    await screen.findByText("LN-001");
    await goLab(user, "SECOND/QUERY");
    await screen.findByText("LN-001");
    await user.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("LN-011");
    act(() => history.push("/Other"));
    expect(screen.getByText("其他工作区")).toBeInTheDocument();
    act(() => history.goBack());
    expect(screen.getByLabelText("查询类别")).toHaveValue("LAB_NUMBER");
    expect(screen.getByLabelText("实验室编号")).toHaveValue("SECOND/QUERY");
    await screen.findByText("LN-011");
    expect(screen.queryByText("LN-001")).not.toBeInTheDocument();
    expect(queryParams(queries.length - 1).get("searchType")).toBe(
      "LAB_NUMBER",
    );
    expect(queryParams(queries.length - 1).get("labNumber")).toBe(
      "SECOND/QUERY",
    );
    expect(printButton()).toBeDisabled();
  });
  test("advanced expansion and record conditions return together without reloading a different draft", async () => {
    configure({ rows: [] });
    const { history } = renderPage();
    const user = userEvent.setup();
    await screen.findByText("未找到匹配的外送记录");
    await user.click(screen.getByRole("button", { name: "高级搜索" }));
    await user.selectOptions(screen.getByLabelText("日期依据"), "RESULT");
    await user.clear(screen.getByLabelText("开始日期"));
    await user.click(screen.getByRole("button", { name: "搜索" }));
    await screen.findByText("未找到匹配的外送记录");
    act(() => history.push("/Other"));
    act(() => history.goBack());
    await screen.findByText("未找到匹配的外送记录");
    expect(screen.getByRole("button", { name: "收起条件" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("日期依据")).toHaveValue("RESULT");
    expect(screen.getByLabelText("开始日期")).toHaveValue("");
    expect(queryParams(queries.length - 1).get("dateType")).toBe("RESULT");
    expect(queryParams(queries.length - 1).get("startDate")).toBe("");
  });
  test("patient search state survives leaving and returning to the same account", async () => {
    configure({ rows: [] });
    const { history } = renderPage();
    const user = userEvent.setup();
    await screen.findByText("未找到匹配的外送记录");
    await selectMode(user, "PATIENT");
    await user.type(screen.getByLabelText("患者查询草稿"), "李明");
    await user.click(screen.getByRole("button", { name: "选择李明" }));
    await screen.findByText(/当前查询患者： 李明 · 41/);
    act(() => history.push("/Other"));
    act(() => history.goBack());
    expect(screen.getByLabelText("患者查询草稿")).toHaveValue("李明");
    expect(screen.getByText(/当前查询患者： 李明 · 41/)).toBeInTheDocument();
    await waitFor(() =>
      expect(queryParams(queries.length - 1).get("selPatient")).toBe("41"),
    );
  });
  test("real shared patient form cannot reinterpret an old URL patient after restoring a different patient", async () => {
    configure({ rows: [] });
    window.history.replaceState({}, "", "/ReferredOutTests?patientId=41");
    const { history } = renderPage({ entry: "/ReferredOutTests?patientId=41" });
    const user = userEvent.setup();
    await screen.findByText("未找到匹配的外送记录");
    await user.click(screen.getByRole("button", { name: "选择王华" }));
    await screen.findByText(/当前查询患者： 王华 · 42/);
    const previousQueries = queries.length;
    act(() => history.push("/Other"));
    patientBoundary.real = true;
    act(() => history.goBack());
    await screen.findByText("未找到匹配的外送记录");
    expect(screen.getByText(/当前查询患者： 王华 · 42/)).toBeInTheDocument();
    expect(patientBoundary.calls.at(-1).initialSearch).toBe("");
    expect(
      optionRequests.filter((request) =>
        String(request.url).startsWith("/rest/patient-details"),
      ),
    ).toHaveLength(0);
    expect(
      queries
        .slice(previousQueries)
        .map((request) =>
          new URL(request.url, "http://openelis.local").searchParams.get(
            "selPatient",
          ),
        ),
    ).toEqual(["42"]);
  });
  test("a different account cannot restore the previous account's saved patient or number", async () => {
    configure({ rows: [] });
    const saved = {
      owner: referralHistoryOwner(pendingSummarySessionKey(actor)),
      draft: {
        mode: "PATIENT",
        patientId: "41",
        testIds: [],
        testUnitIds: [],
        labNumber: "PRIVATE",
        startDate: "",
        endDate: "",
        dateType: "SENT",
      },
      patient: { patientPK: "41", lastName: "李", firstName: "明" },
      patientSearch: { quick: "李明" },
      page: 2,
      pageSize: 10,
    };
    const next = { ...actor, userId: "18" };
    serverActor = next;
    renderPage({
      entry: { pathname: "/ReferredOutTests", state: { referralQuery: saved } },
      user: next,
    });
    await screen.findByText("未找到匹配的外送记录");
    expect(screen.getByLabelText("查询类别")).toHaveValue("TEST_AND_DATES");
    expect(screen.queryByText(/当前查询患者：/)).not.toBeInTheDocument();
    expect(queryParams(0).get("selPatient")).toBeNull();
  });
  test.each([
    [401, "登录已失效，请重新登录后查询。"],
    [403, "当前账号没有外送记录查询权限。"],
    [400, "查询条件无效，请核对后重新查询。"],
    [500, "请检查查询条件或服务连接后重试。"],
  ])(
    "HTTP %s feedback never becomes an empty table",
    async (status, detail) => {
      configure();
      renderPage();
      await waitFor(() => expect(queries).toHaveLength(1));
      await act(async () =>
        queries[0].resolve(json({ referralDisplayItems: [] }, status)),
      );
      expect(await screen.findByText(detail)).toBeInTheDocument();
      expect(
        screen.queryByText("未找到匹配的外送记录"),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    },
  );
  test("unmount aborts a pending request and its delayed completion cannot update another workspace", async () => {
    configure();
    const { history } = renderPage();
    await waitFor(() => expect(queries).toHaveLength(1));
    act(() => history.push("/Other"));
    expect(queries[0].options.signal.aborted).toBe(true);
    await resolveQuery(0, [makeReferral(1)]);
    expect(screen.getByText("其他工作区")).toBeInTheDocument();
    expect(screen.queryByText("LN-001")).not.toBeInTheDocument();
  });
});
