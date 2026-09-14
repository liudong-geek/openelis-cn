import React from "react";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { MemoryRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import { webcrypto } from "node:crypto";
vi.mock("../layout/Layout", () => ({
  ConfigurationContext: React.createContext({}),
}));
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServer: vi.fn(),
}));
vi.mock("../utils/readOpenElisResponse", () => ({
  readOpenElisResponse: vi.fn(),
}));
import messages from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { OrderProvider, useOrderContext } from "./OrderContext";
import EntryRecoveryPanel from "./EntryRecoveryPanel";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";
import {
  postToOpenElisServerFullResponse,
  putToOpenElisServer,
} from "../utils/Utils";
import { rememberEntryCheckpoint } from "./orderEntryRecovery";
import { recoveryReference } from "./collectionRecovery.fixtures";
import {
  intakeFixture,
  intakeRecorded,
  intakeAck,
  SIM_ACTOR,
} from "./intakeDecision.fixtures";
import { readIntakeCheckpoint } from "./intakeCheckpoint";
import { verifyCurrentEntry } from "./orderEntryCurrent";
let context, current;
function Probe() {
  context = useOrderContext();
  return <EntryRecoveryPanel />;
}
function View({
  checking = false,
  sessionId = "SIM-SESSION",
  csrf = "SIM-CSRF",
  actor = SIM_ACTOR,
}) {
  return (
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: actor,
              sessionId,
              csrf,
            },
            isCheckingLogin: () => checking,
            errorLoadingSessionDetails: false,
          }}
        >
          <OrderProvider>
            <Probe />
          </OrderProvider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>
  );
}
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  rememberEntryCheckpoint(recoveryReference);
  current = intakeFixture();
  readOpenElisResponse
    .mockReset()
    .mockImplementation(async () => response(current));
  postToOpenElisServerFullResponse.mockReset();
  putToOpenElisServer.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_, options) => {
      const c = JSON.parse(options.body);
      current = intakeRecorded(c, current);
      return response(intakeAck(c));
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const region = () =>
  screen.getByRole("region", { name: "逐管标本验收", exact: true });
const query = async () => {
  fireEvent.click(
    screen.getByRole("button", { name: "查询当前状态", exact: true }),
  );
  await screen.findByRole("region", { name: "逐管标本验收", exact: true });
};
const choose = (decision = "ACCEPTED", id = "1") => {
  fireEvent.click(
    within(region()).getByRole("button", {
      name: `验收 SIM-COLLECTION-701.${id}`,
      exact: true,
    }),
  );
  fireEvent.change(screen.getByLabelText("验收决定（必选）"), {
    target: { value: decision },
  });
  if (decision === "REJECTED")
    fireEvent.change(screen.getByLabelText("拒收原因（必选）"), {
      target: { value: "41" },
    });
};
const preview = async (decision = "ACCEPTED") => {
  await query();
  choose(decision);
  fireEvent.click(
    screen.getByRole("button", { name: "核对无误，查看确认信息" }),
  );
  await screen.findByText("确认本管验收决定");
};
const confirm = () =>
  fireEvent.click(screen.getByRole("button", { name: "确认并记录本管决定" }));
it.each(["ACCEPTED", "REJECTED"])(
  "原Provider只写所选单管 %s，明确预览/确认且独立回读",
  async (decision) => {
    render(<View />);
    await query();
    expect(screen.queryByLabelText("验收决定（必选）")).not.toBeInTheDocument();
    choose(decision);
    fireEvent.click(
      screen.getByRole("button", { name: "核对无误，查看确认信息" }),
    );
    await screen.findByText("确认本管验收决定");
    expect(fetch).not.toHaveBeenCalled();
    expect(within(region()).getByText("模拟患者 · 801")).toBeInTheDocument();
    confirm();
    await waitFor(() =>
      expect(within(region()).getAllByText("已记录（只读）")).toHaveLength(1),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readOpenElisResponse).toHaveBeenCalledTimes(2);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toMatch(/\/rest\/specimen-intake-decisions$/);
    expect(options.headers["X-CSRF-Token"]).toBe("SIM-CSRF");
    expect(JSON.parse(options.body)).toMatchObject({
      sampleItemId: "1001",
      requestId: "901",
      decision,
      patientId: "801",
    });
    expect(readIntakeCheckpoint()).toBeNull();
    expect(current.current.specimenDecisions[1].state).toBe("NOT_RECORDED");
    expect(context.stepProgress.qa).toBe(false);
    expect(context.orderId).toBeNull();
    expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
    expect(putToOpenElisServer).not.toHaveBeenCalled();
  },
);
it("取消预览零写入；修改决定后必须重新核对", async () => {
  render(<View />);
  await preview();
  fireEvent.click(screen.getByRole("button", { name: "返回修改" }));
  fireEvent.change(screen.getByLabelText("验收决定（必选）"), {
    target: { value: "REJECTED" },
  });
  expect(
    screen.getByRole("button", { name: "核对无误，查看确认信息" }),
  ).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});
it("收录第一管后可明确选第二管，不串用原决定", async () => {
  render(<View />);
  await preview();
  confirm();
  await waitFor(() =>
    expect(within(region()).getAllByText("已记录（只读）")).toHaveLength(1),
  );
  choose("REJECTED", "2");
  expect(screen.getByLabelText("拒收原因（必选）")).toHaveValue("41");
  fireEvent.click(
    screen.getByRole("button", { name: "核对无误，查看确认信息" }),
  );
  await screen.findByText("确认本管验收决定");
  confirm();
  await waitFor(() =>
    expect(within(region()).getAllByText("已记录（只读）")).toHaveLength(2),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
it.each([400, 409, 500])(
  "HTTP %i不伪报成功、不允许盲重发，独立查不到也不解除",
  async (status) => {
    fetch.mockImplementation(async () => response({}, status));
    render(<View />);
    await preview();
    confirm();
    await waitFor(() =>
      expect(context.intakeRecovery.checkpoint).not.toBeNull(),
    );
    expect(
      screen.getByRole("button", { name: "确认并记录本管决定" }),
    ).toBeDisabled();
    await act(async () => {
      await expect(
        context.queryCurrentEntryRecovery(recoveryReference.submissionId),
      ).rejects.toThrow();
    });
    expect(readIntakeCheckpoint()).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([401, 403])("独立GET %i清患者内容但不清未知凭证", async (status) => {
  render(<View />);
  await preview();
  readOpenElisResponse.mockImplementation(async () => response({}, status));
  confirm();
  await waitFor(() =>
    expect(screen.queryByText("模拟患者")).not.toBeInTheDocument(),
  );
  expect(context.isRecoveryCurrent()).toBe(false);
  expect(readIntakeCheckpoint()).not.toBeNull();
});
it.each([401, 403])("POST %i按固定凭证清当前视图", async (status) => {
  fetch.mockImplementation(async () => response({}, status));
  render(<View />);
  await preview();
  confirm();
  await waitFor(() => expect(context.isRecoveryCurrent()).toBe(false));
  expect(screen.queryByText("模拟患者")).not.toBeInTheDocument();
  expect(readIntakeCheckpoint()).not.toBeNull();
});
it("视图变化后迟到成功不恢复旧视图或清保护；显式独立查询可核实", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<View />);
  await preview();
  confirm();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  const c = JSON.parse(fetch.mock.calls[0][1].body);
  // Fake timers start before the operation in the dedicated late-denial test;
  // here an interrupted view is sufficient to prove late-success non-revival.
  await act(async () => {
    context.setOrderData({ ...context.orderData, SIM: true });
  });
  await act(async () => {
    current = intakeRecorded(c);
    resolve(response(intakeAck(c)));
  });
  expect(readIntakeCheckpoint()).not.toBeNull();
  expect(context.isRecoveryCurrent()).toBe(false);
  await act(async () => {
    await context.queryCurrentEntryRecovery(recoveryReference.submissionId);
  });
  expect(readIntakeCheckpoint()).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("过期界面同凭证迟到403仍失效；新账号不受旧403影响", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<View />);
  await preview();
  confirm();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  view.rerender(<View sessionId="SIM-NEW" actor="8" csrf="SIM-NEW-CSRF" />);
  await act(async () => {
    resolve(response({}, 403));
  });
  expect(readIntakeCheckpoint()).not.toBeNull();
  expect(context.intakeRecovery.checkpoint).not.toBeNull();
  // New account is still allowed a read; unresolved old write remains locked.
  await act(async () => {
    await expect(
      context.queryCurrentEntryRecovery(recoveryReference.submissionId),
    ).rejects.toThrow();
  });
  expect(readOpenElisResponse).toHaveBeenCalledTimes(2);
});
it("预览期间登录核实中断，恢复同账号也不能复活旧预览", async () => {
  const view = render(<View />);
  await preview();
  view.rerender(<View checking />);
  view.rerender(<View />);
  expect(context.isRecoveryCurrent()).toBe(false);
  expect(
    screen.queryByRole("button", { name: "确认并记录本管决定" }),
  ).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("逐管验收与整单核对、签收、采集、标签互斥", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<View />);
  await query();
  const visible = verifyCurrentEntry(current, recoveryReference),
    qa = context.prepareRecoveredQa(visible);
  qa.preview(current.current.qaReview.checklistItems.map((i) => i.key));
  choose();
  fireEvent.click(
    screen.getByRole("button", { name: "核对无误，查看确认信息" }),
  );
  await screen.findByText("确认本管验收决定");
  confirm();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await expect(qa.confirm()).rejects.toThrow();
  expect(() => context.prepareRecoveredLabels(visible)).toThrow();
  expect(() => context.prepareRecoveredReceipt(visible)).toThrow();
  expect(() => context.adoptRecoveredCollection(visible)).toThrow();
  await expect(context.runLegacyQaWrite(vi.fn())).rejects.toThrow();
  await act(async () => resolve(response({}, 500)));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("同账号仅更换CSRF令牌，旧预览失效且零提交", async () => {
  const view = render(<View />);
  await preview();
  view.rerender(<View csrf="SIM-NEW-CSRF" />);
  expect(
    screen.getByRole("button", { name: "确认并记录本管决定" }),
  ).toBeDisabled();
  confirm();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["token", "unmount"])(
  "提交摘要等待期间%s变化，永不发送旧命令",
  async (kind) => {
    const view = render(<View />);
    await preview();
    let resolve;
    const digest = vi.spyOn(webcrypto.subtle, "digest").mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    confirm();
    expect(digest).toHaveBeenCalledTimes(1);
    if (kind === "token") view.rerender(<View csrf="SIM-NEW-CSRF" />);
    else view.unmount();
    await act(async () => resolve(new Uint8Array(32).buffer));
    expect(fetch).not.toHaveBeenCalled();
    expect(readIntakeCheckpoint()).toBeNull();
  },
);
it.each([false, true])(
  "查询B先完成、A迟到403；仅撤销相同凭证，新凭证=%s",
  async (changed) => {
    const view = render(<View />);
    await query();
    let resolve;
    readOpenElisResponse.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    let first;
    act(() => {
      first = context
        .queryCurrentEntryRecovery(recoveryReference.submissionId)
        .catch((e) => e);
    });
    if (changed) view.rerender(<View csrf="SIM-NEW-CSRF" />);
    await act(async () => {
      await context.queryCurrentEntryRecovery(recoveryReference.submissionId);
    });
    expect(context.isRecoveryCurrent()).toBe(true);
    await act(async () => {
      resolve(response({}, 403));
      await first;
    });
    expect(context.isRecoveryCurrent()).toBe(changed);
    if (!changed) expect(() => context.assertQaIdle()).toThrow();
    else expect(() => context.assertQaIdle()).not.toThrow();
  },
);
