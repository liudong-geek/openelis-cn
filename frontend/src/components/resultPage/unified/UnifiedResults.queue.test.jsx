import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import { groupResultSpecimens } from "./ResultSpecimenQueue";
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

// Synthetic fixtures only: two tubes in the same order, with independent
// analyses and optional component rows. No fixture is imported by the app.
const row = (analysisId, sampleItemId, extra = {}) => ({
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

let records;
let session;
const view = () => (
  <MemoryRouter>
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
  </MemoryRouter>
);
const open = (values = [row("101", "201"), row("102", "202")]) => {
  records = values;
  return render(view());
};
const queue = () => within(screen.getByRole("complementary"));
const tube = (id) =>
  queue().getByRole("button", { name: new RegExp(`SIM-TUBE-${id}`) });
const table = () => within(screen.getByRole("table"));
const resultRow = (id) =>
  within(table().getByText(`模拟项目${id}`).closest("tr"));
const enter = (id, value) =>
  fireEvent.change(resultRow(id).getByRole("spinbutton"), {
    target: { value },
  });

beforeEach(() => {
  io.read.mockReset();
  io.save.mockReset();
  io.signatures = [];
  localStorage.setItem("CSRF", "SIM-CSRF");
  window.history.replaceState({}, "", "/Results");
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM-SESSION",
      csrf: "SIM-CSRF",
      loginName: "SIM-USER",
    },
  };
  io.read.mockImplementation((url, callback) => {
    if (url.includes("lab-units")) callback([]);
    else if (url.includes("status-types"))
      callback([
        { id: "4", value: "待检验" },
        { id: "15", value: "待审核" },
      ]);
    else callback({ testResult: records });
  });
});

test("同申请的不同标本独立选择，同一项目的多组件留在一起", () => {
  open([
    row("101", "201", { testResultComponentId: "701" }),
    row("101", "201", { testResultComponentId: "702", testName: "模拟组件乙" }),
    row("102", "202"),
  ]);
  // A component is an editable row, not an additional laboratory task.
  expect(
    screen.getByText(
      zh["results.workbench.pendingCount"].replace("{count}", "2"),
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: /^全部 \(\s*2\s*\)$/ }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: /^未开始 \(\s*2\s*\)$/ }),
  ).toBeVisible();
  expect(table().getAllByRole("row")).toHaveLength(4);
  const requests = io.read.mock.calls.length;
  fireEvent.click(tube("201"));
  expect(tube("201")).toHaveAttribute("aria-pressed", "true");
  expect(table().getByText("模拟项目101")).toBeVisible();
  expect(table().getByText("模拟组件乙")).toBeVisible();
  expect(table().queryByText("模拟项目102")).toBeNull();
  expect(within(tube("201")).getByText("1 个检验项目")).toBeVisible();
  expect(table().getAllByRole("columnheader")).toHaveLength(5);
  fireEvent.click(tube("202"));
  expect(table().queryByText("模拟项目101")).toBeNull();
  expect(table().getByText("模拟项目102")).toBeVisible();
  expect(io.read).toHaveBeenCalledTimes(requests);
  expect(io.save).not.toHaveBeenCalled();
});

test("待办加载失败不显示为零，成功重试的空列表才显示零任务", () => {
  let complete;
  io.read.mockImplementation((url, callback) => {
    if (url.includes("lab-units") || url.includes("status-types")) callback([]);
    else complete = callback;
  });
  open();
  const emptyCount = zh["results.workbench.pendingCount"].replace(
    "{count}",
    "0",
  );
  expect(screen.queryByText(emptyCount)).toBeNull();
  expect(
    screen.getAllByText(zh["results.workbench.loading"]).length,
  ).toBeGreaterThan(0);
  act(() =>
    complete(undefined, { status: 500, errorKey: "common.api.networkError" }),
  );
  expect(
    screen.getByText(zh["results.workbench.countUnavailable"]),
  ).toBeVisible();
  expect(screen.queryByText(emptyCount)).toBeNull();
  expect(
    screen.queryByRole("button", { name: /^全部 \(\s*0\s*\)$/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));
  act(() => complete({ testResult: [] }));
  expect(screen.getByText(emptyCount)).toBeVisible();
  expect(
    screen.getByRole("button", { name: /^全部 \(\s*0\s*\)$/ }),
  ).toBeVisible();
  expect(io.save).not.toHaveBeenCalled();
});

test("切换标本保留包括0在内的输入且不自动保存，延迟签名仍绑定原项目", () => {
  open();
  fireEvent.click(tube("201"));
  enter("101", "0");
  fireEvent.click(resultRow("101").getByRole("button", { name: "保存" }));
  const completeOriginalSignature = io.signatures[0];
  fireEvent.click(tube("202"));
  enter("102", "8");
  expect(
    within(tube("201")).getByText(zh["results.workbench.drafts.unsaved"]),
  ).toBeVisible();
  fireEvent.click(tube("201"));
  expect(resultRow("101").getByRole("spinbutton")).toHaveValue(0);
  fireEvent.click(tube("202"));
  expect(resultRow("102").getByRole("spinbutton")).toHaveValue(8);
  expect(io.save).not.toHaveBeenCalled();
  act(() => completeOriginalSignature());
  expect(io.save).toHaveBeenCalledTimes(1);
  expect(io.save.mock.calls[0][0]).toBe(
    "/rest/results-entry/analysis/101/result",
  );
  expect(JSON.parse(io.save.mock.calls[0][1]).testResult.resultValue).toBe("0");
  expect(resultRow("102").getByRole("spinbutton")).toHaveValue(8);
  act(() =>
    io.save.mock.calls[0][2]({
      status: 0,
      errorKey: "common.api.networkError",
    }),
  );
  fireEvent.click(tube("201"));
  expect(resultRow("101").queryByRole("spinbutton")).toBeNull();
  expect(resultRow("101").queryByRole("button", { name: "保存" })).toBeNull();
  expect(
    within(tube("201")).getByText(zh["results.workbench.drafts.unconfirmed"]),
  ).toBeVisible();
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("状态筛选排除当前标本时队列和明细同步，恢复筛选后草稿仍在", () => {
  open([
    row("101", "201"),
    row("102", "202", { analysisStatusId: "15", resultValue: "5" }),
  ]);
  fireEvent.click(tube("201"));
  enter("101", "0");
  fireEvent.click(screen.getByRole("button", { name: /待审核 \(\s*1\s*\)/ }));
  expect(queue().getByRole("button", { name: /全部标本/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(table().queryByText("模拟项目101")).toBeNull();
  expect(table().getByText("模拟项目102")).toBeVisible();
  expect(
    document.querySelector(".result-specimen-detail__identity"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^全部 \(\s*2\s*\)$/ }));
  fireEvent.click(tube("201"));
  expect(resultRow("101").getByRole("spinbutton")).toHaveValue(0);
  expect(io.save).not.toHaveBeenCalled();
});

test("身份变化清除队列、选中摘要和旧患者输入", () => {
  const rendered = open();
  fireEvent.click(tube("201"));
  enter("101", "0");
  session = { userSessionDetails: { authenticated: false } };
  rendered.rerender(view());
  expect(screen.queryByText("模拟患者")).toBeNull();
  expect(screen.queryByText("SIM-ORDER-301")).toBeNull();
  expect(queue().queryByRole("button", { name: /SIM-TUBE/ })).toBeNull();
  expect(io.save).not.toHaveBeenCalled();
});

test("队列摘要与选中摘要遵循来源行的患者身份遮罩", () => {
  open([
    row("101", "201", { patientName: "不得泄露的姓名" }),
    row("102", "201", { patientInfo: "---", patientName: "不得泄露的姓名" }),
  ]);
  expect(queue().queryByText("不得泄露的姓名")).toBeNull();
  fireEvent.click(tube("201"));
  expect(screen.queryByText("不得泄露的姓名")).toBeNull();
});

test("不能用相同条码或姓名合并不同标本，缺标本ID时按分析隔离", () => {
  const values = [
    row("101", "201", { sampleItemExternalId: "SIM-DUPLICATE" }),
    row("102", "202", { sampleItemExternalId: "SIM-DUPLICATE" }),
    row("103", undefined, { sampleItemExternalId: "SIM-DUPLICATE" }),
    row("104", undefined, { sampleItemExternalId: "SIM-DUPLICATE" }),
  ];
  expect(groupResultSpecimens(values)).toHaveLength(4);
});
