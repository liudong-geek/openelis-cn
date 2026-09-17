import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router, Route, Switch } from "react-router-dom";
import { createBrowserHistory } from "history";

let context;
vi.mock("./OrderContext", () => ({ useOrderContext: () => context }));
vi.mock("../layout/Layout", () => ({
  ConfigurationContext: React.createContext({}),
}));
vi.mock("../resultPage/unified/UnifiedResults", () => ({
  default: () => null,
}));
import { ConfigurationContext } from "../layout/Layout";
import { LegacyResultsGate } from "../resultPage/unified/routeGates";
import RecoveredSpecimenDecision from "./RecoveredSpecimenDecision";
import { admissionFixture } from "./intakeAdmission.fixtures";
import { verifyCurrentEntry } from "./orderEntryCurrent";
import { recoveryReference } from "./collectionRecovery.fixtures";
import messages from "../../languages/zh.json";

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, "", "/order/enter");
  context = {
    isRecoveryCurrent: vi.fn(() => true),
    assertQaIdle: vi.fn(),
    isDirty: false,
    isSubmitting: false,
    isSaveUnconfirmed: false,
    prepareRecoveredIntake: vi.fn(),
  };
});
afterEach(() => sessionStorage.clear());
const verified = (raw = admissionFixture()) =>
  verifyCurrentEntry(raw, recoveryReference);
const open = () =>
  screen.getByRole("button", { name: messages["order.intakeAdmission.open"] });
const View = ({ history, result, unified = false }) => (
  <Router history={history}>
    <IntlProvider locale="zh" messages={messages}>
      <ConfigurationContext.Provider
        value={{
          configurationProperties: {
            RESULTS_ENTRY_UNIFIED_ROUTE: String(unified),
          },
        }}
      >
        <Switch>
          <Route path="/order/enter">
            <RecoveredSpecimenDecision result={result} onSaved={vi.fn()} />
          </Route>
          <Route path="/result" exact>
            <LegacyResultsGate>
              <p>SIM legacy entry</p>
            </LegacyResultsGate>
          </Route>
          <Route path="/Results" exact>
            <p>SIM unified entry</p>
          </Route>
        </Switch>
      </ConfigurationContext.Provider>
    </IntlProvider>
  </Router>
);
const mount = (result = verified(), unified = false) => {
  const history = createBrowserHistory();
  return {
    history,
    ...render(<View history={history} result={result} unified={unified} />),
  };
};

it.each([false, true])(
  "完整当前准入进入对应结果路由，保留完整编号，unified=%s",
  async (unified) => {
    const raw = admissionFixture();
    raw.current.labNo = raw.receipt.labNo = "20260916-SIM-001.02";
    const result = verified(raw);
    const original = JSON.stringify(result);
    const { history } = mount(result, unified);
    expect(
      screen.getByRole("columnheader", { name: "首次验收记录" }),
    ).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: "当前结果录入状态" }),
    ).toBeVisible();
    expect(screen.getAllByText("当前可录入")).toHaveLength(2);
    expect(
      screen.getByText(messages["order.intakeAdmission.boundary"]),
    ).toBeVisible();
    await userEvent.setup().click(open());
    await waitFor(() =>
      expect(history.location.pathname).toBe(unified ? "/Results" : "/result"),
    );
    expect(history.location.search).toBe(
      "?type=order&accessionNumber=20260916-SIM-001.02&doRange=false",
    );
    expect(JSON.stringify(result)).toBe(original);
    expect(context.prepareRecoveredIntake).not.toHaveBeenCalled();
  },
);

it("历史接收记录照常显示，但缺少当前准入不能开放结果入口", () => {
  const raw = admissionFixture();
  raw.current.specimenDecisions.forEach((row) => {
    delete row.resultEntryAdmission;
  });
  Object.assign(raw.current.specimenDecisions[0], {
    state: "RECORDED",
    recordedDecision: "ACCEPTED",
    operationId: "11111111-2222-4333-8444-555555555555",
    decidedAt: "2026-09-15T06:00:00Z",
    decidedBy: "7",
    evidenceDigest: "a".repeat(64),
  });
  mount(verified(raw));
  expect(screen.getByText("接收标本")).toBeVisible();
  expect(screen.getAllByText("尚未核实")).toHaveLength(2);
  expect(open()).toBeDisabled();
});

it("部分准入单独显示无权限原因，全部阻断后不再开放入口", () => {
  const raw = admissionFixture();
  const tube = raw.current.physicalSpecimens[0];
  tube.analyses.push({ ...tube.analyses[0], id: "1199" });
  const admission = raw.current.specimenDecisions[0].resultEntryAdmission;
  admission.state = "PARTIAL";
  admission.analyses.push({
    ...admission.analyses[0],
    analysisId: "1199",
    allowed: false,
    blockedReason: "order.intakeAdmission.permission",
  });
  raw.current.specimenDecisions[1].resultEntryAdmission = null;
  const { rerender, history } = mount(verified(raw));
  expect(screen.getByText("部分项目可录入")).toBeVisible();
  expect(screen.getByText("可录入 1 / 2 项")).toBeVisible();
  expect(screen.getByText(/当前账号无权录入该项目/)).toBeVisible();
  expect(open()).toBeEnabled();
  admission.state = "BLOCKED";
  admission.analyses[0].allowed = false;
  admission.analyses[0].blockedReason = "error.results.specimenIntakeChanged";
  rerender(<View history={history} result={verified(raw)} />);
  expect(screen.getByText("当前不可录入")).toBeVisible();
  expect(screen.getByText(/该管的患者、申请或验收依据已变化/)).toBeVisible();
  expect(open()).toBeDisabled();
});

it.each(["isDirty", "isSubmitting", "isLoading", "isSaveUnconfirmed"])(
  "%s 时保留查询显示但不能跳转",
  (flag) => {
    context[flag] = true;
    mount();
    expect(open()).toBeDisabled();
  },
);
it.each([
  "entryRecovery",
  "collectionRecovery",
  "receiptRecovery",
  "qaRecovery",
  "intakeRecovery",
])("%s 有待核对凭证不得跳转", (key) => {
  context[key] = {
    checkpoint: { submissionId: recoveryReference.submissionId },
  };
  mount();
  expect(open()).toBeDisabled();
});
it("标签生成仍待核实或权限守卫拒绝均不得跳转", () => {
  sessionStorage.setItem("lis.labels.pending.v1", "SIM");
  const { rerender, history } = mount();
  expect(open()).toBeDisabled();
  sessionStorage.clear();
  context.assertQaIdle.mockImplementation(() => {
    throw new Error("SIM denied");
  });
  rerender(<View history={history} result={verified()} />);
  expect(open()).toBeDisabled();
});

it("选择验收或准备预览期间不能离开到结果录入", async () => {
  const result = verified();
  const { history } = mount(result);
  expect(open()).toBeEnabled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "验收 SIM-COLLECTION-701.1" }));
  expect(open()).toBeDisabled();
  fireEvent.change(screen.getByLabelText("验收决定（必选）"), {
    target: { value: "ACCEPTED" },
  });
  let finish;
  const operation = {
    isCurrent: () => true,
    invalidate: vi.fn(),
    preview: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  context.prepareRecoveredIntake.mockReturnValue(operation);
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "核对无误，查看确认信息" }));
  expect(open()).toBeDisabled();
  // The route remains unchanged while this explicit operation owns the panel.
  expect(history.location.pathname).toBe("/order/enter");
  finish({ decision: "ACCEPTED", reason: null });
  await screen.findByText("确认本管验收决定");
  expect(open()).toBeDisabled();
});

it.each(["session", "version", "permission", "dirty", "pending"])(
  "点击前%s失效即使按钮尚未重绘也不跳转",
  async (change) => {
    const result = verified();
    const { history } = mount(result);
    const button = open();
    expect(button).toBeEnabled();
    if (change === "session") context.isRecoveryCurrent.mockReturnValue(false);
    if (change === "version")
      result.current.physicalSpecimens.forEach((tube) => {
        tube.analyses[0].lastUpdated = "2026-09-16T06:00:00Z";
      });
    if (change === "permission")
      context.assertQaIdle.mockImplementation(() => {
        throw new Error("SIM denied");
      });
    if (change === "dirty") context.isDirty = true;
    if (change === "pending")
      sessionStorage.setItem("lis.labels.pending.v1", "SIM");
    await userEvent.setup().click(button);
    expect(history.location.pathname).toBe("/order/enter");
  },
);
