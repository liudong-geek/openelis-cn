import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";

const io = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), signatures: [] }));
vi.mock("./resultEntryTransport", () => ({
  readResultWorkbench: (...args) => io.read(...args),
  saveResultWorkbench: (...args) => io.save(...args),
}));
vi.mock("./useResultPresence", () => ({
  useResultPresence: () => ({ presence: {}, unavailable: false }),
}));
vi.mock("../../esignature/ESignatureButton", () => ({
  default: ({ onSign, children, disabled }) => (
    <button disabled={disabled} onClick={() => io.signatures.push(onSign)}>
      {children}
    </button>
  ),
  SignatureMeaning: { AUTHORED: "AUTHORED" },
}));

const reason = "error.results.specimenIntakeMissing";
const row = (analysisId, sampleItemId = "201", extra = {}) => ({
  id: "0",
  analysisId,
  sampleItemId,
  testId: "401",
  accessionNumber: "SIM-ORDER-301",
  sampleItemExternalId: `SIM-TUBE-${sampleItemId}`,
  patientName: "模拟患者",
  patientInfo: "SIM-PATIENT",
  analysisLastupdated: "1000",
  analysisStatusId: "4",
  testName: `模拟项目${analysisId}`,
  resultType: "N",
  resultValue: "",
  reportable: "Y",
  ...extra,
});
const blocked = (analysisId, sampleItemId = "201", extra = {}) =>
  row(analysisId, sampleItemId, {
    readOnly: true,
    resultEntryBlockedReason: reason,
    ...extra,
  });
let records;
let session;
let history;
let confirmations;
const view = () => (
  <Router history={history}>
    <IntlProvider locale="zh" messages={zh}>
      <UserSessionDetailsContext.Provider value={session}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" } }}
        >
          <NotificationContext.Provider
            value={{
              addNotification: vi.fn(),
              setNotificationVisible: vi.fn(),
            }}
          >
            <UnifiedResults />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </Router>
);
const open = (values) => {
  records = values;
  return render(view());
};
const blockRegion = () =>
  screen.getByRole("region", { name: zh["results.workbench.blocked.title"] });
const resultRow = (name) =>
  within(within(screen.getByRole("table")).getByText(name).closest("tr"));
const lookupButton = () =>
  screen.queryByRole("button", {
    name: zh["results.workbench.blocked.openOrders"],
  });
const expandReasons = () =>
  fireEvent.click(
    screen.getByRole("button", {
      name: zh["results.workbench.blocked.expand"],
    }),
  );

beforeEach(() => {
  io.read.mockReset();
  io.save.mockReset();
  io.signatures = [];
  localStorage.setItem("CSRF", "SIM-CSRF");
  window.history.replaceState({}, "", "/Results");
  confirmations = [];
  history = createMemoryHistory({
    initialEntries: ["/Results"],
    getUserConfirmation: (message, callback) => {
      confirmations.push(message);
      callback(false);
    },
  });
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM-SESSION",
      csrf: "SIM-CSRF",
      loginName: "SIM-USER",
      roles: ["Results", "Reception"],
    },
  };
  io.read.mockImplementation((url, callback) => {
    if (url.includes("lab-units")) callback([]);
    else if (url.includes("status-types"))
      callback([{ id: "4", value: "待检验" }]);
    else callback({ testResult: records });
  });
});

test("all-specimen view explains a shared restriction once, counts analyses and links every restricted row", () => {
  open([
    blocked("101", "201", { testResultComponentId: "701" }),
    blocked("101", "201", {
      testResultComponentId: "702",
      testName: "模拟组件乙",
    }),
    blocked("102"),
    row("103", "202"),
  ]);
  expect(screen.getAllByText(zh[reason])).toHaveLength(1);
  expect(screen.getByText(zh[reason])).not.toBeVisible();
  expandReasons();
  expect(within(blockRegion()).getByText("SIM-TUBE-201")).toBeVisible();
  expect(
    within(blockRegion()).getByText("当前筛选内受影响 2 项检验任务"),
  ).toBeVisible();
  const references = screen.getAllByText(
    zh["results.workbench.blocked.rowReference"],
  );
  expect(references).toHaveLength(3);
  for (const reference of references) {
    expect(reference.closest("td")).toHaveClass(
      "results-workbench__cell--actions",
    );
    const description = document.getElementById(
      reference.getAttribute("aria-describedby"),
    );
    expect(within(description).getByText("SIM-TUBE-201")).toBeVisible();
    expect(description).toHaveTextContent(zh[reason]);
    expect(reference.closest("tr")).toHaveAttribute(
      "aria-describedby",
      description.id,
    );
  }
  expect(resultRow("模拟项目101").queryByRole("spinbutton")).toBeNull();
  expect(resultRow("模拟项目103").getByRole("spinbutton")).toBeEnabled();
  expect(io.save).not.toHaveBeenCalled();
});

test("analysis-only and unknown restrictions do not block editable neighbours in the same tube", () => {
  open([
    blocked("101", "201", {
      resultEntryBlockedReason: "error.results.testIntakeChanged",
    }),
    blocked("102", "201", { resultEntryBlockedReason: "future.unknown" }),
    row("103"),
  ]);
  expect(
    screen.queryByRole("region", {
      name: zh["results.workbench.blocked.title"],
    }),
  ).toBeNull();
  expect(screen.getByText(zh["error.results.testIntakeChanged"])).toBeVisible();
  expect(
    screen.getByText(zh["results.workbench.entryUnavailable"]),
  ).toBeVisible();
  expect(resultRow("模拟项目101").queryByRole("spinbutton")).toBeNull();
  expect(resultRow("模拟项目102").queryByRole("spinbutton")).toBeNull();
  fireEvent.change(resultRow("模拟项目103").getByRole("spinbutton"), {
    target: { value: "0" },
  });
  expect(resultRow("模拟项目103").getByRole("spinbutton")).toHaveValue(0);
  fireEvent.click(
    resultRow("模拟项目103").getByRole("button", { name: "保存" }),
  );
  act(() => io.signatures[0]());
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(io.save.mock.calls[0][0]).toBe(
    "/rest/results-entry/analysis/103/result",
  );
  expect(JSON.parse(io.save.mock.calls[0][1]).testResult.resultValue).toBe("0");
});

test("missing real tube identity keeps explicit row warnings rather than merging by printed identifiers", () => {
  open([
    blocked("101", undefined, { sampleItemId: undefined }),
    blocked("102", undefined, { sampleItemId: undefined }),
  ]);
  expect(screen.getAllByText(zh[reason])).toHaveLength(2);
  expect(
    screen.queryByRole("region", {
      name: zh["results.workbench.blocked.title"],
    }),
  ).toBeNull();
  expect(lookupButton()).toBeNull();
});

test("selected specimen explanations stay with their subject and apply the strictest identity mask", () => {
  open([
    blocked("101", "201", { patientName: "不可出现在摘要的姓名" }),
    blocked("102", "201", {
      patientInfo: "---",
      patientName: "不可出现在摘要的姓名",
    }),
    row("103", "202"),
  ]);
  expect(within(blockRegion()).queryByText("不可出现在摘要的姓名")).toBeNull();
  const queue = within(screen.getByRole("complementary"));
  fireEvent.click(queue.getByRole("button", { name: /SIM-TUBE-201/ }));
  expect(within(blockRegion()).queryByText("SIM-TUBE-201")).toBeNull();
  const identity = within(
    document.querySelector(".result-specimen-detail__identity"),
  );
  expect(identity.getByText("SIM-TUBE-201")).toBeVisible();
  expect(identity.queryByText("不可出现在摘要的姓名")).toBeNull();
  expect(screen.getByText(zh[reason])).toBeVisible();
  expect(screen.getAllByText(zh[reason])).toHaveLength(1);
  fireEvent.click(queue.getByRole("button", { name: /SIM-TUBE-202/ }));
  expect(
    screen.queryByRole("region", {
      name: zh["results.workbench.blocked.title"],
    }),
  ).toBeNull();
});

test("Reception lookup opens only the original order list without invented object parameters", () => {
  open([blocked("101")]);
  expandReasons();
  expect(
    within(blockRegion()).getByText(
      zh["results.workbench.blocked.orderLookupHelp"],
    ),
  ).toBeVisible();
  fireEvent.click(lookupButton());
  expect(history.location.pathname).toBe("/order");
  expect(history.location.search).toBe("");
  expect(io.save).not.toHaveBeenCalled();
});

test("a Results-only role receives a permission explanation without a handoff button", () => {
  session.userSessionDetails.roles = ["Results"];
  open([blocked("101")]);
  expandReasons();
  expect(lookupButton()).toBeNull();
  expect(
    within(blockRegion()).getByText(
      zh["results.workbench.blocked.receptionNeeded"],
    ),
  ).toBeVisible();
});

test("an unsaved result hides lookup and retains the existing route and browser leave guards", () => {
  open([blocked("101"), row("103", "202")]);
  expandReasons();
  expect(lookupButton()).toBeVisible();
  fireEvent.change(resultRow("模拟项目103").getByRole("spinbutton"), {
    target: { value: "8" },
  });
  expect(lookupButton()).toBeNull();
  expect(
    screen.getByText(zh["results.workbench.blocked.preserveDrafts"]),
  ).toBeVisible();
  act(() => history.push("/order"));
  expect(confirmations).toEqual([zh["security.loginUnsavedWarning"]]);
  expect(history.location.pathname).toBe("/Results");
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  expect(leave.defaultPrevented).toBe(true);
  expect(resultRow("模拟项目103").getByRole("spinbutton")).toHaveValue(8);
  expect(io.save).not.toHaveBeenCalled();
});

test("unknown submission keeps the lookup unavailable and does not replay the write", () => {
  open([blocked("101"), row("103", "202")]);
  expandReasons();
  fireEvent.change(resultRow("模拟项目103").getByRole("spinbutton"), {
    target: { value: "8" },
  });
  fireEvent.click(
    resultRow("模拟项目103").getByRole("button", { name: "保存" }),
  );
  act(() => io.signatures[0]());
  act(() =>
    io.save.mock.calls[0][2]({
      status: 0,
      errorKey: "common.api.networkError",
    }),
  );
  expect(lookupButton()).toBeNull();
  expect(
    screen.getByText(zh["results.workbench.blocked.preserveDrafts"]),
  ).toBeVisible();
  expect(
    resultRow("模拟项目103").queryByRole("button", { name: "保存" }),
  ).toBeNull();
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("revoking Reception removes lookup while the original result restriction remains", () => {
  const rendered = open([blocked("101")]);
  expandReasons();
  expect(lookupButton()).toBeVisible();
  session = {
    userSessionDetails: { ...session.userSessionDetails, roles: ["Results"] },
  };
  rendered.rerender(view());
  expect(lookupButton()).toBeNull();
  // The changed permission scope must be queried before old clinical details
  // can reappear; a fresh query still preserves the server's restriction.
  expect(screen.queryByText(zh[reason])).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));
  const expand = screen.queryByRole("button", {
    name: zh["results.workbench.blocked.expand"],
  });
  if (expand) fireEvent.click(expand);
  expect(lookupButton()).toBeNull();
  expect(screen.getByText(zh[reason])).toBeVisible();
  expect(history.location.pathname).toBe("/Results");
});

test("only a new successful worklist read removes the explanation and restores normal input", () => {
  open([blocked("101")]);
  expandReasons();
  expect(resultRow("模拟项目101").queryByRole("spinbutton")).toBeNull();
  records = [row("101")];
  expect(screen.getByText(zh[reason])).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: zh["results.workbench.applyFilters"] }),
  );
  expect(
    screen.queryByRole("region", {
      name: zh["results.workbench.blocked.title"],
    }),
  ).toBeNull();
  expect(resultRow("模拟项目101").getByRole("spinbutton")).toBeEnabled();
  expect(io.save).not.toHaveBeenCalled();
});

test("queue counters stay unknown through loading and failure, and show zero only after a successful empty response", () => {
  const requests = [];
  const readOptions = io.read.getMockImplementation();
  io.read.mockImplementation((url, callback) => {
    if (url === "/rest/results-entry/pending") requests.push(callback);
    else readOptions(url, callback);
  });
  open([]);
  const allSpecimens = () =>
    within(screen.getByRole("complementary")).getByRole("button", {
      name: new RegExp(`^${zh["results.workbench.queue.all"]}`),
    });
  expect(allSpecimens()).toHaveTextContent(
    new RegExp(`^${zh["results.workbench.queue.all"]}$`),
  );
  expect(
    screen.queryByText(
      zh["results.workbench.queue.count"].replace("{count}", "0"),
    ),
  ).toBeNull();
  act(() =>
    requests.shift()(undefined, {
      status: 500,
      errorKey: "common.api.networkError",
    }),
  );
  expect(screen.getByText(zh["results.workbench.loadFailed"])).toBeVisible();
  expect(allSpecimens()).toHaveTextContent(
    new RegExp(`^${zh["results.workbench.queue.all"]}$`),
  );
  expect(
    screen.queryByText(
      zh["results.workbench.queue.count"].replace("{count}", "0"),
    ),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole("button", {
      name: zh["results.workbench.applyFilters"],
    }),
  );
  expect(allSpecimens()).toHaveTextContent(
    new RegExp(`^${zh["results.workbench.queue.all"]}$`),
  );
  act(() => requests.shift()({ testResult: [] }));
  expect(within(allSpecimens()).getByText("0")).toBeVisible();
  expect(
    screen.getByText(
      zh["results.workbench.queue.count"].replace("{count}", "0"),
    ),
  ).toBeVisible();
  expect(screen.getByText(zh["results.workbench.empty.title"])).toBeVisible();
});

test("refresh loading and failure preserve specimen identity without showing its old task counts", () => {
  open([blocked("101")]);
  const queue = within(screen.getByRole("complementary"));
  fireEvent.click(queue.getByRole("button", { name: /SIM-TUBE-201/ }));
  const identity = () =>
    within(document.querySelector(".result-specimen-detail__identity"));
  expect(identity().getByText("1 个检验项目")).toBeVisible();
  expect(
    within(blockRegion()).getByText("当前筛选内受影响 1 项检验任务"),
  ).toBeVisible();
  let complete;
  const readOptions = io.read.getMockImplementation();
  io.read.mockImplementation((url, callback) => {
    if (url === "/rest/results-entry/pending") complete = callback;
    else readOptions(url, callback);
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: zh["results.workbench.applyFilters"],
    }),
  );
  expect(identity().getByText("SIM-TUBE-201")).toBeVisible();
  expect(identity().queryByText("1 个检验项目")).toBeNull();
  expect(queue.queryByText("1 个检验项目")).toBeNull();
  expect(
    within(blockRegion()).queryByText("当前筛选内受影响 1 项检验任务"),
  ).toBeNull();
  act(() =>
    complete(undefined, { status: 500, errorKey: "common.api.networkError" }),
  );
  expect(identity().getByText("SIM-TUBE-201")).toBeVisible();
  expect(identity().queryByText("1 个检验项目")).toBeNull();
  expect(queue.queryByText("1 个检验项目")).toBeNull();
  expect(
    within(blockRegion()).queryByText("当前筛选内受影响 1 项检验任务"),
  ).toBeNull();
  expect(lookupButton()).toBeNull();
});

test("eight restricted specimen records start compact and expose their full explanations through the keyboard", async () => {
  const user = userEvent.setup();
  open(
    Array.from({ length: 8 }, (_, index) =>
      blocked(String(101 + index), String(201 + index)),
    ),
  );
  const expand = screen.getByRole("button", {
    name: zh["results.workbench.blocked.expand"],
  });
  const details = document.getElementById(expand.getAttribute("aria-controls"));
  expect(expand).toHaveAttribute("aria-expanded", "false");
  expect(details).toHaveAttribute("hidden");
  expect(screen.getAllByText(zh[reason])).toHaveLength(8);
  for (const explanation of screen.getAllByText(zh[reason]))
    expect(explanation).not.toBeVisible();
  expect(lookupButton()).toBeNull();
  expand.focus();
  await user.tab();
  expect(document.activeElement).toBe(
    resultRow("模拟项目101").getByRole("button", {
      name: zh["results.workbench.blocked.rowReference"],
    }),
  );
  expand.focus();
  await user.keyboard("{Enter}");
  expect(expand).toHaveAttribute("aria-expanded", "true");
  expect(details).not.toHaveAttribute("hidden");
  expect(details).toHaveClass("result-specimen-blocks__details--all");
  expect(
    screen.getByText(zh["results.workbench.blocked.scrollHint"]),
  ).toBeVisible();
  await user.tab();
  expect(details).toHaveFocus();
  for (const explanation of screen.getAllByText(zh[reason]))
    expect(explanation).toBeVisible();
  expand.focus();
  await user.keyboard(" ");
  expect(details).toHaveAttribute("hidden");
  expect(expand).toHaveAttribute("aria-expanded", "false");
});

test("a row action selects its specimen and focuses the matching reason without losing another specimen's draft", async () => {
  const user = userEvent.setup();
  const otherReason = "error.results.specimenDisposed";
  open([
    blocked("101"),
    blocked("102", "202", { resultEntryBlockedReason: otherReason }),
    row("103", "203"),
  ]);
  fireEvent.change(resultRow("模拟项目103").getByRole("spinbutton"), {
    target: { value: "8" },
  });
  const rowAction = resultRow("模拟项目102").getByRole("button", {
    name: zh["results.workbench.blocked.rowReference"],
  });
  const oldId = rowAction.getAttribute("aria-describedby");
  expect(document.getElementById(oldId)).not.toBeVisible();
  rowAction.focus();
  await user.keyboard("{Enter}");
  const selectedAction = resultRow("模拟项目102").getByRole("button", {
    name: zh["results.workbench.blocked.rowReference"],
  });
  const explanation = document.getElementById(
    selectedAction.getAttribute("aria-describedby"),
  );
  expect(explanation.id).not.toBe(oldId);
  expect(explanation).toHaveTextContent(zh[otherReason]);
  expect(explanation).toBeVisible();
  expect(explanation).toHaveFocus();
  expect(within(blockRegion()).queryByText("SIM-TUBE-202")).toBeNull();
  expect(lookupButton()).toBeNull();
  expect(confirmations).toEqual([]);
  fireEvent.click(
    within(screen.getByRole("complementary")).getByRole("button", {
      name: /SIM-TUBE-203/,
    }),
  );
  expect(resultRow("模拟项目103").getByRole("spinbutton")).toHaveValue(8);
  expect(io.save).not.toHaveBeenCalled();
  expect(history.location.pathname).toBe("/Results");
});
