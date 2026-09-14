import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";

const io = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  signatures: [],
  notify: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: (...a) => io.read(...a),
  postToOpenElisServerJsonResponse: (...a) => io.save(...a),
  postToOpenElisServer: vi.fn(),
}));
vi.mock("./resultEntryTransport", () => ({
  readResultWorkbench: (...a) => io.read(...a),
  saveResultWorkbench: (...a) => io.save(...a),
}));
vi.mock("./usePresence", () => ({ usePresence: () => ({}) }));
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

const row = (analysisId = "101", sampleItemId = "201", extra = {}) => ({
  id: "0",
  analysisId,
  sampleItemId,
  sampleId: "301",
  testId: "401",
  patientId: "501",
  analysisLastupdated: "1000",
  analysisStatusId: "4",
  accessionNumber: "SIM-RESULT-301",
  sampleItemExternalId: "SIM-TUBE-" + sampleItemId,
  testName: "模拟检验" + analysisId,
  resultType: "N",
  resultValue: "",
  reportable: "Y",
  ...extra,
});
let records, reads, responses, session;
const view = () => (
  <MemoryRouter>
    <IntlProvider locale="zh" messages={zh}>
      <UserSessionDetailsContext.Provider value={session}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" } }}
        >
          <NotificationContext.Provider
            value={{
              addNotification: io.notify,
              setNotificationVisible: vi.fn(),
              notificationVisible: false,
            }}
          >
            <UnifiedResults />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const open = (list = [row()]) => {
  records = list;
  return render(view());
};
const tableRow = (id = "101") =>
  screen.getByText("模拟检验" + id).closest("tr");
const enter = (value, id = "101") =>
  fireEvent.change(within(tableRow(id)).getByRole("spinbutton"), {
    target: { value },
  });
const sign = (id = "101") => {
  fireEvent.click(within(tableRow(id)).getByRole("button", { name: "保存" }));
  return io.signatures.at(-1);
};
const reload = () =>
  fireEvent.click(
    screen.getByRole("button", { name: zh["results.workbench.applyFilters"] }),
  );

beforeEach(() => {
  io.read.mockReset();
  io.save.mockReset();
  io.notify.mockReset();
  io.signatures = [];
  reads = [];
  responses = [];
  localStorage.setItem("CSRF", "SIM-CSRF");
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM-SESSION",
      csrf: "SIM-CSRF",
      loginName: "SIM-USER",
    },
  };
  window.history.replaceState({}, "", "/Results");
  io.read.mockImplementation((url, callback) => {
    if (url.includes("lab-units") || url.includes("status-types")) callback([]);
    else {
      reads.push(callback);
      callback({ testResult: records });
    }
  });
  io.save.mockImplementation((_url, _body, callback) => {
    responses.push(callback);
  });
});

test("普通录入完成的待审核状态不显示为已审核通过", () => {
  open([row("101", "201", { analysisStatusId: "15", resultValue: "5" })]);
  expect(within(tableRow()).getByText("待审核")).toBeInTheDocument();
  expect(within(tableRow()).queryByText("技术审核通过")).toBeNull();
});

test.each([
  ["error.results.specimenRejected", "标本已拒收"],
  ["error.results.specimenVoided", "标本已作废"],
  ["error.results.specimenCanceled", "标本已取消"],
  ["error.results.specimenDisposed", "标本已处置"],
  ["error.results.specimenNotEligible", "标本状态不允许录入结果"],
])("真实原因中文显示并禁止同管录入：%s", (reason, copy) => {
  open([
    row("101", "201", { resultEntryBlockedReason: reason }),
    row("102", "201"),
    row("103", "202"),
  ]);
  expect(screen.getAllByText(new RegExp(copy)).length).toBeGreaterThan(0);
  expect(within(tableRow("101")).queryByRole("spinbutton")).toBeNull();
  expect(within(tableRow("102")).queryByRole("spinbutton")).toBeNull();
  expect(within(tableRow("103")).getByRole("spinbutton")).toBeEnabled();
  expect(io.save).not.toHaveBeenCalled();
});

test.each([
  "error.results.specimenIntakeMissing",
  "error.results.specimenIntakeChanged",
  "error.results.testIntakeChanged",
  "error.results.reviewedResultLocked",
  "error.results.analysisEntryUnavailable",
])("%s 显示中文原因并保留已填结果", (reason) => {
  open([row(), row("102", "202")]);
  enter("0");
  enter("8", "102");
  act(() => sign()());
  act(() => responses[0]({ status: 409, error: reason }));
  expect(within(tableRow()).getByText("0")).toBeInTheDocument();
  expect(io.notify.mock.calls.at(-1)[0].message).toContain(zh[reason]);
  expect(within(tableRow("102")).getByRole("spinbutton")).toHaveValue(8);
  expect(io.save).toHaveBeenCalledTimes(1);
});

test.each([
  "error.results.reviewedResultLocked",
  "error.results.analysisEntryUnavailable",
])("%s 锁同项目组件但不影响同管其他项目", (reason) => {
  const component = row("101", "201", {
    testName: "模拟组件",
    testResultComponentId: "702",
  });
  open([
    row("101", "201", { testResultComponentId: "701" }),
    component,
    row("102", "201"),
  ]);
  enter("0");
  enter("8", "102");
  act(() => sign()());
  act(() => responses[0]({ status: 409, error: reason }));
  expect(within(tableRow()).getByText("0")).toBeInTheDocument();
  expect(
    within(screen.getByText("模拟组件").closest("tr")).queryByRole(
      "spinbutton",
    ),
  ).toBeNull();
  expect(within(tableRow("102")).getByRole("spinbutton")).toHaveValue(8);
  expect(io.notify.mock.calls.at(-1)[0].message).toContain(zh[reason]);
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("拒绝保存后锁同管而非同申请，保留未提交的0", () => {
  open([row(), row("102", "201"), row("103", "202")]);
  enter("0");
  enter("7", "102");
  enter("8", "103");
  const staleOther = sign("102");
  act(() => sign()());
  expect(io.save.mock.calls[0][0]).toBe(
    "/rest/results-entry/analysis/101/result",
  );
  expect(JSON.parse(io.save.mock.calls[0][1]).testResult.resultValue).toBe("0");
  act(() =>
    responses[0]({ status: 409, error: "error.results.specimenNotEligible" }),
  );
  act(() => staleOther());
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(within(tableRow()).getByText("0")).toBeInTheDocument();
  expect(within(tableRow("102")).queryByRole("spinbutton")).toBeNull();
  expect(within(tableRow("103")).getByRole("spinbutton")).toHaveValue(8);
  expect(io.notify.mock.calls.at(-1)[0].message).toMatch(/标本状态不允许/);
  expect(io.notify.mock.calls.at(-1)[0].message).not.toMatch(/其他用户|定义/);
});

test("签名等待期间重新编辑，旧回调零POST", () => {
  open();
  enter("1");
  const old = sign();
  enter("2");
  act(() => old());
  expect(io.save).not.toHaveBeenCalled();
  act(() => sign()());
  expect(JSON.parse(io.save.mock.calls[0][1]).testResult.resultValue).toBe("2");
});

test("重新查询保留0为独立本页输入，不把它误称已保存", () => {
  open();
  enter("0");
  records = [
    row("101", "201", { resultValue: "9", analysisLastupdated: "2000" }),
  ];
  reload();
  const drafts = screen.getByRole("region", { name: "本页输入核对" });
  expect(within(drafts).getByText("0")).toBeInTheDocument();
  expect(within(tableRow()).getByText("9")).toBeInTheDocument();
  expect(
    within(drafts).queryByRole("button", { name: "继续填写本页输入" }),
  ).toBeNull();
  expect(io.save).not.toHaveBeenCalled();
});

test("change和重新查询处于同一事件批次也保留最新输入", () => {
  open();
  act(() => {
    enter("12");
    reload();
  });
  expect(
    within(screen.getByRole("region", { name: "本页输入核对" })).getByText(
      "12",
    ),
  ).toBeInTheDocument();
  expect(io.save).not.toHaveBeenCalled();
});

test("刷新看到相同值不证明未知保存成功，不允许重发", () => {
  open();
  enter("8");
  act(() => sign()());
  act(() => responses[0]({ status: 0, errorKey: "common.api.networkError" }));
  records = [
    row("101", "201", { resultValue: "8", analysisLastupdated: "2000" }),
  ];
  reload();
  expect(
    screen.getByRole("region", { name: "本页输入核对" }),
  ).toHaveTextContent("保存结果待核实");
  expect(within(tableRow()).queryByRole("button", { name: "保存" })).toBeNull();
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("换会话清除旧患者输入，迟到签名不得保存", () => {
  const ui = open();
  enter("3");
  const old = sign();
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "702",
      sessionId: "SIM-NEXT",
      csrf: "SIM-CSRF",
    },
  };
  ui.rerender(view());
  act(() => old());
  expect(io.save).not.toHaveBeenCalled();
  expect(screen.queryByText("SIM-RESULT-301")).toBeNull();
  expect(screen.queryByRole("region", { name: "本页输入核对" })).toBeNull();
});

test("原版本和定义未变，明确继续才恢复本页输入，仍不自动保存", () => {
  open();
  enter("0");
  const old = sign();
  reload();
  expect(within(tableRow()).queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "继续填写本页输入" }));
  expect(within(tableRow()).getByRole("spinbutton")).toHaveValue(0);
  act(() => old());
  expect(io.save).not.toHaveBeenCalled();
  act(() => sign()());
  expect(JSON.parse(io.save.mock.calls[0][1]).testResult.resultValue).toBe("0");
});

test("版本变化后可取消或明确放弃本页输入，不删除服务器记录", () => {
  open();
  enter("0");
  records = [
    row("101", "201", { resultValue: "9", analysisLastupdated: "2000" }),
  ];
  reload();
  fireEvent.click(screen.getByRole("button", { name: "放弃本页输入" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }),
  );
  expect(
    screen.getByRole("region", { name: "本页输入核对" }),
  ).toHaveTextContent("0");
  fireEvent.click(screen.getByRole("button", { name: "放弃本页输入" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "放弃本页输入",
    }),
  );
  expect(screen.queryByRole("region", { name: "本页输入核对" })).toBeNull();
  expect(within(tableRow()).getByText("9")).toBeInTheDocument();
  expect(io.save).not.toHaveBeenCalled();
});

test("未知结果不能通过放弃输入或刷新绕过防重复保存", () => {
  open();
  enter("8");
  const callback = sign();
  act(() => callback());
  act(() => responses[0]({ status: 0, errorKey: "common.api.networkError" }));
  reload();
  expect(screen.queryByRole("button", { name: "放弃本页输入" })).toBeNull();
  expect(screen.queryByRole("button", { name: "继续填写本页输入" })).toBeNull();
  act(() => callback());
  expect(io.save).toHaveBeenCalledTimes(1);
});

test.each(["unitsOfMeasure", "testName", "normalRange"])(
  "版本未变但%s变化，不能直接恢复输入",
  (field) => {
    open();
    enter("8");
    records = [row("101", "201", { [field]: "模拟变化" })];
    reload();
    expect(
      screen.getByRole("region", { name: "本页输入核对" }),
    ).toHaveTextContent("8");
    expect(
      screen.queryByRole("button", { name: "继续填写本页输入" }),
    ).toBeNull();
  },
);

test("分析版本未变但服务器结果变化，必须核对不可直接恢复输入", () => {
  open();
  enter("0");
  records = [row("101", "201", { resultValue: "9" })];
  reload();
  expect(screen.queryByRole("button", { name: "继续填写本页输入" })).toBeNull();
  expect(within(tableRow()).getByText("9")).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "本页输入核对" }),
  ).toHaveTextContent("0");
});

test("换会话清除申请查询和目录，旧查询应答不回填", () => {
  window.history.replaceState(
    {},
    "",
    "/Results?accessionNumber=SIM-PRIVATE&testSectionId=31",
  );
  const ui = open();
  const old = reads[0];
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "702",
      sessionId: "SIM-NEXT",
      csrf: "SIM-CSRF",
    },
  };
  ui.rerender(view());
  act(() => old({ testResult: [row("999")] }));
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(window.location.search).not.toContain("SIM-PRIVATE");
  expect(screen.queryByText("模拟检验999")).toBeNull();
});

test("明确撤权清除患者数据，不触发新写入", () => {
  open();
  enter("5");
  act(() => sign()());
  act(() => responses[0]({ status: 403, errorKey: "security.accessDenied" }));
  expect(screen.queryByRole("region", { name: "本页输入核对" })).toBeNull();
  expect(screen.queryByText("模拟检验101")).toBeNull();
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("加载失败保留输入，不把错误显示成空列表", () => {
  open();
  enter("5");
  io.read.mockImplementation((_url, callback) =>
    callback(undefined, { status: 500, errorKey: "common.api.requestFailed" }),
  );
  reload();
  expect(within(tableRow()).getByRole("spinbutton")).toHaveValue(5);
  expect(screen.queryByText(zh["results.workbench.empty.title"])).toBeNull();
  expect(screen.getByText(zh["common.api.requestFailed"])).toBeInTheDocument();
});

test("较早查询的迟到应答不得覆盖最新列表和本页输入", () => {
  open();
  enter("5");
  const callbacks = [];
  io.read.mockImplementation((_url, callback) => callbacks.push(callback));
  reload();
  act(() => callbacks[0]({ testResult: [row("102")] }));
  reload();
  act(() => callbacks[1]({ testResult: [row("103")] }));
  act(() => callbacks[0]({ testResult: [row("999")] }));
  expect(screen.queryByText("模拟检验999")).toBeNull();
  expect(screen.getByText("模拟检验103")).toBeInTheDocument();
  expect(
    screen.getByRole("region", { name: "本页输入核对" }),
  ).toHaveTextContent("5");
});

test("保存后收到严格回执才显示成功并移除本页输入", () => {
  open();
  enter("5");
  act(() => sign()());
  io.read.mockImplementation((_url, callback) =>
    callback({
      testResult: [
        {
          ...row("101", "201"),
          resultValue: "5",
          rawResultValue: "5",
          resultId: "601",
          analysisLastupdated: "2000",
          analysisStatusId: "6",
        },
      ],
    }),
  );
  act(() =>
    responses[0]({
      status: 200,
      analysisLastupdated: "2000",
      analysisStatusId: "6",
      reflex: [],
      calculated: [],
    }),
  );
  expect(io.notify.mock.calls.at(-1)[0].message).toBe(zh["success.save.msg"]);
  expect(screen.queryByRole("region", { name: "本页输入核对" })).toBeNull();
  expect(
    within(tableRow()).getByRole("button", { name: "编辑" }),
  ).toBeInTheDocument();
});

test("同分析不同组件在保存未核实期间也不可提交旧版本", () => {
  open([
    row("101", "201", { testResultComponentId: "1", testName: "模拟检验101" }),
    row("101", "201", { testResultComponentId: "2", testName: "模拟检验102" }),
  ]);
  enter("5");
  enter("6", "102");
  const sibling = sign("102");
  act(() => sign()());
  act(() => sibling());
  expect(io.save).toHaveBeenCalledTimes(1);
  act(() => responses[0]({ status: 0 }));
  expect(
    within(tableRow("102")).queryByRole("button", { name: "保存" }),
  ).toBeNull();
});

test("重复复合行标识不接受为可编辑列表", () => {
  open([row(), row()]);
  expect(screen.queryByText("模拟检验101")).toBeNull();
  expect(
    screen.getByText(zh["common.api.invalidResponse"]),
  ).toBeInTheDocument();
});

test("未知后台原因只显示固定中文，不回显异常或患者敏感文本", () => {
  open([row("101", "201", { resultEntryBlockedReason: "SIM-PRIVATE-STACK" })]);
  expect(screen.queryByText(/SIM-PRIVATE-STACK/)).toBeNull();
  expect(
    screen.getByText(zh["results.workbench.entryUnavailable"]),
  ).toBeInTheDocument();
  expect(within(tableRow()).queryByRole("spinbutton")).toBeNull();
});

test.each([undefined, " ", "x".repeat(256)])(
  "无效登录名明确提示且不创建签名能力",
  (loginName) => {
    session.userSessionDetails.loginName = loginName;
    open();
    enter("0");
    expect(
      screen.getByText("登录信息不完整，暂不能保存结果，请重新登录。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    expect(io.save).not.toHaveBeenCalled();
  },
);

test("异常凭证不导致渲染错误或签名入口", () => {
  session.userSessionDetails.csrf = "SIM\r\nTOKEN";
  localStorage.setItem("CSRF", "SIM\r\nTOKEN");
  open();
  enter("0");
  expect(
    screen.getByText("登录信息不完整，暂不能保存结果，请重新登录。"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
});

test("旧查询迟到403仍撤销同凭证，但不能把旧名单回填", () => {
  open();
  const old = reads[0];
  records = [row("102", "202")];
  reload();
  expect(screen.getByText("模拟检验102")).toBeInTheDocument();
  act(() => old(undefined, { status: 403, errorKey: "security.accessDenied" }));
  expect(screen.queryByText("模拟检验102")).toBeNull();
  expect(screen.getByText(zh["security.accessDenied"])).toBeInTheDocument();
});

test("刷新后的旧保存403仍撤销同凭证，不能继续保存其它管", () => {
  open();
  enter("0");
  act(() => sign()());
  records = [row("102", "202")];
  reload();
  act(() => responses[0]({ status: 403, errorKey: "security.accessDenied" }));
  expect(screen.queryByText("模拟检验102")).toBeNull();
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("旧凭证迟到403不能撤销新凭证的查询", () => {
  const ui = open();
  const old = reads[0];
  session = {
    userSessionDetails: { ...session.userSessionDetails, csrf: "SIM-NEW-CSRF" },
  };
  localStorage.setItem("CSRF", "SIM-NEW-CSRF");
  ui.rerender(view());
  records = [row("102", "202")];
  reload();
  act(() => old(undefined, { status: 403, errorKey: "security.accessDenied" }));
  expect(screen.getByText("模拟检验102")).toBeInTheDocument();
  expect(screen.queryByText(zh["security.accessDenied"])).toBeNull();
});

test("直接卸载后不等待副作用清理，旧签名也不能写入", () => {
  const ui = open();
  enter("0");
  const old = sign();
  ui.unmount();
  old();
  expect(io.save).not.toHaveBeenCalled();
});

test("版本冲突有实际可点击的重新查询入口且保留输入", () => {
  open();
  enter("0");
  act(() => sign()());
  act(() => responses[0]({ status: 409, error: "error.results.staleSave" }));
  fireEvent.click(
    screen.getByRole("button", { name: zh["label.results.refresh"] }),
  );
  expect(reads).toHaveLength(2);
  expect(
    screen.getByRole("region", { name: "本页输入核对" }),
  ).toHaveTextContent("0");
});
