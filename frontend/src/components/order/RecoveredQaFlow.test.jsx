import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
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
import { qaFixture, qaMatched, qaAck } from "./qaConfirmation.fixtures";
import { QA_CHECKPOINT_KEY, readQaCheckpoint } from "./qaCheckpoint";
let context, current;
function Probe() {
  context = useOrderContext();
  return <EntryRecoveryPanel />;
}
function View({ checking = false, failed = false, sessionId = "SIM-SESSION" }) {
  return (
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: "SIM-USER",
              sessionId,
              csrf: "SIM-CSRF",
            },
            isCheckingLogin: () => checking,
            errorLoadingSessionDetails: failed,
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
  current = qaFixture();
  readOpenElisResponse
    .mockReset()
    .mockImplementation(async () => response(current));
  postToOpenElisServerFullResponse.mockReset();
  putToOpenElisServer.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const command = JSON.parse(options.body);
      current = qaMatched(command, current);
      return response(qaAck(command));
    }),
  );
});
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const query = async () => {
  fireEvent.click(
    screen.getByRole("button", { name: "查询当前状态", exact: true }),
  );
  await screen.findByText("模拟患者");
};
const checks = () => {
  for (const item of qaFixture().current.qaReview.checklistItems)
    fireEvent.click(screen.getByLabelText(item.label));
};
const preview = async () => {
  await query();
  checks();
  fireEvent.click(
    screen.getByRole("button", { name: "核对完成，查看确认信息" }),
  );
};
const confirm = () =>
  fireEvent.click(screen.getByRole("button", { name: "确认本次核对" }));
it("全部实管只读、清单初始空选，明确确认一次并独立读回，不放行检验", async () => {
  render(<View />);
  await query();
  expect(
    screen.getByRole("button", { name: "核对完成，查看确认信息" }),
  ).toBeDisabled();
  expect(screen.getByText("SIM-COLLECTION-701.1")).toBeInTheDocument();
  expect(screen.getByText("SIM-COLLECTION-701.2")).toBeInTheDocument();
  for (const item of qaFixture().current.qaReview.checklistItems)
    expect(screen.getByLabelText(item.label)).not.toBeChecked();
  checks();
  fireEvent.click(
    screen.getByRole("button", { name: "核对完成，查看确认信息" }),
  );
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "返回核对" }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "核对完成，查看确认信息" }),
  );
  confirm();
  await screen.findByText("核对记录已保存并核实");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(readOpenElisResponse).toHaveBeenCalledTimes(2);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/rest\/qa-checklist\/confirm-current$/);
  expect(options.headers["X-CSRF-Token"]).toBe("SIM-CSRF");
  expect(JSON.parse(options.body)).toMatchObject({
    sampleId: "701",
    specimenIds: ["1001", "1002"],
    expectedChecklistVersion: null,
    expectedFactsDigest: "b".repeat(64),
    verifiedItems: { identity: true, integrity: true },
  });
  expect(readQaCheckpoint()).toBeNull();
  expect(context.qaRecovery.checkpoint).toBeNull();
  expect(context.stepProgress.qa).toBe(false);
  expect(context.orderId).toBeNull();
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(putToOpenElisServer).not.toHaveBeenCalled();
});
it.each([400, 401, 403, 409, 500])(
  "HTTP %i 保护不清，刷新只查原code，不重发",
  async (status) => {
    fetch.mockImplementation(async () => response({ success: false }, status));
    const view = render(<View />);
    await preview();
    confirm();
    await waitFor(() => expect(context.isSubmitting).toBe(false));
    expect(readQaCheckpoint()).not.toBeNull();
    view.unmount();
    render(<View />);
    fireEvent.click(
      screen.getByRole("button", { name: "查询当前状态", exact: true }),
    );
    await waitFor(() => expect(readOpenElisResponse).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readQaCheckpoint()).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "确认本次核对" }),
    ).not.toBeInTheDocument();
  },
);
it.each(["badAck", "otherId", "stale", "otherDigest", "missing", "network"])(
  "%s 不假成功，不释放保护",
  async (mode) => {
    fetch.mockImplementation(async (url, options) => {
      const command = JSON.parse(options.body);
      if (mode === "network") throw Error("SIM network");
      if (mode === "badAck") return response({ success: true });
      if (mode !== "missing") current = qaMatched(command, current);
      if (mode === "otherId")
        current.current.qaReview.confirmationId = crypto.randomUUID();
      if (mode === "stale")
        current.current.qaReview.state = "STALE_CONFIRMATION";
      if (mode === "otherDigest")
        current.current.qaReview.currentFactsDigest = "c".repeat(64);
      return response(qaAck(command));
    });
    render(<View />);
    await preview();
    confirm();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(context.isSubmitting).toBe(false));
    expect(readQaCheckpoint()).not.toBeNull();
    expect(screen.queryByText("核对记录已保存并核实")).not.toBeInTheDocument();
  },
);
it("丢ACK后原current精确匹配可恢复，不再POST", async () => {
  fetch.mockImplementation(async (url, options) => {
    current = qaMatched(JSON.parse(options.body), current);
    throw Error("SIM lost ACK");
  });
  render(<View />);
  await preview();
  confirm();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(context.isSubmitting).toBe(false));
  expect(readQaCheckpoint()).not.toBeNull();
  await query();
  await screen.findByText("核对记录已保存并核实");
  expect(readQaCheckpoint()).toBeNull();
  expect(context.qaRecovery.checkpoint).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([{ checking: true }, { failed: true }, { sessionId: "SIM-OTHER" }])(
  "会话中断再恢复不能复活旧确认 %j",
  async (props) => {
    const view = render(<View />);
    await preview();
    view.rerender(<View {...props} />);
    view.rerender(<View />);
    if (screen.queryByRole("button", { name: "确认本次核对" })) confirm();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("进行中双击/直接重复能力只POST一次，阻断新旧各入口，迟到跨会话不回写", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<View />);
  let result, op;
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
    op = context.prepareRecoveredQa(result);
    op.preview(["identity", "integrity"]);
  });
  let pending;
  act(() => {
    pending = op.confirm().catch((e) => e);
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await expect(op.confirm()).rejects.toThrow();
  await expect(context.saveOrderEntry()).rejects.toThrow();
  await expect(context.saveOrder()).rejects.toThrow();
  await expect(context.loadOrder("SIM-COLLECTION-701")).rejects.toThrow();
  expect(() => context.prepareRecoveredLabels(result)).toThrow();
  expect(() => context.prepareRecoveredReceipt(result)).toThrow();
  expect(() => context.adoptRecoveredCollection(result)).toThrow();
  await expect(
    context.queryCurrentEntryRecovery(recoveryReference.submissionId),
  ).rejects.toThrow();
  const legacy = vi.fn();
  await expect(context.runLegacyQaWrite(legacy)).rejects.toThrow();
  expect(legacy).not.toHaveBeenCalled();
  view.rerender(<View sessionId="SIM-OTHER" />);
  await act(async () => {
    resolve(response(qaAck(JSON.parse(fetch.mock.calls[0][1].body))));
    await pending;
  });
  expect(readQaCheckpoint()).not.toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(readOpenElisResponse).toHaveBeenCalledTimes(1);
});
it("旧验收保存进行中不能开启新确认", async () => {
  render(<View />);
  let result;
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  let release, pending;
  act(() => {
    pending = context.runLegacyQaWrite(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
  });
  expect(() => context.prepareRecoveredQa(result)).toThrow();
  await act(async () => {
    release();
    await pending;
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(() => context.prepareRecoveredQa(result)).toThrow();
  expect(context.isRecoveryCurrent()).toBe(false);
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  expect(() => context.prepareRecoveredQa(result)).not.toThrow();
});
it("旧QA写作废先前仍在途的current查询，迟到响应不能重新授权", async () => {
  render(<View />);
  let resolve, queryPromise;
  readOpenElisResponse.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  act(() => {
    queryPromise = context
      .queryCurrentEntryRecovery(recoveryReference.submissionId)
      .catch((e) => e);
  });
  await act(async () => {
    await context.runLegacyQaWrite(async () => {});
  });
  let outcome;
  await act(async () => {
    resolve(response(current));
    outcome = await queryPromise;
  });
  expect(outcome.errorKey).toBeDefined();
  expect(context.isRecoveryCurrent()).toBe(false);
  let fresh;
  await act(async () => {
    fresh = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  expect(() => context.prepareRecoveredQa(fresh)).not.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("界面副本不能替换管集合、配置或事实；重新查询让旧能力失效", async () => {
  render(<View />);
  let result, op;
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  const forged = JSON.parse(JSON.stringify(result));
  forged.current.qaReview.specimenIds.pop();
  expect(() => context.prepareRecoveredQa(forged)).toThrow();
  act(() => {
    op = context.prepareRecoveredQa(result);
    op.preview(["identity", "integrity"]);
  });
  await act(async () => {
    await context.queryCurrentEntryRecovery(recoveryReference.submissionId);
  });
  await expect(op.confirm()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("不可靠storage不发送，损坏marker不忽略", async () => {
  render(<View />);
  await preview();
  const original = sessionStorage;
  vi.stubGlobal("sessionStorage", {
    getItem: (key) => original.getItem(key),
    setItem: () => {
      throw Error("SIM storage");
    },
    removeItem: (key) => original.removeItem(key),
  });
  confirm();
  await waitFor(() => expect(context.isSubmitting).toBe(false));
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal("sessionStorage", original);
  sessionStorage.setItem(QA_CHECKPOINT_KEY, "broken");
  await expect(context.saveOrderEntry()).rejects.toThrow();
  await expect(
    context.queryCurrentEntryRecovery(recoveryReference.submissionId),
  ).rejects.toThrow();
});
it("15秒超时后的迟到成功不清保护、不回填", async () => {
  const original = globalThis.setTimeout;
  let expire, resolve;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms, ...args) => {
    if (ms === 15000) {
      expire = fn;
      return original(() => {}, ms);
    }
    return original(fn, ms, ...args);
  });
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
  await act(async () => expire());
  await waitFor(() => expect(context.isSubmitting).toBe(false));
  await act(async () =>
    resolve(response(qaAck(JSON.parse(fetch.mock.calls[0][1].body)))),
  );
  expect(readQaCheckpoint()).not.toBeNull();
  expect(readOpenElisResponse).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("核对记录已保存并核实")).not.toBeInTheDocument();
});
it("卸载后迟到响应不能清保护；重开同码仅GET恢复", async () => {
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
  const command = JSON.parse(fetch.mock.calls[0][1].body);
  view.unmount();
  current = qaMatched(command, current);
  await act(async () => resolve(response(qaAck(command))));
  expect(readQaCheckpoint()).not.toBeNull();
  render(<View />);
  await query();
  await screen.findByText("核对记录已保存并核实");
  expect(readQaCheckpoint()).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
