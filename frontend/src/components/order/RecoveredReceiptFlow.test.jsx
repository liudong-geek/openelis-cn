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
import {
  receiptFixture,
  receiptResponse,
  receivedFixture,
  twoTubeReceiptFixture,
} from "./specimenReceipt.fixtures";
import { readReceiptCheckpoint } from "./receiptCheckpoint";
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
  current = receiptFixture();
  readOpenElisResponse
    .mockReset()
    .mockImplementation(async () => response(current));
  postToOpenElisServerFullResponse.mockReset();
  putToOpenElisServer.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const command = JSON.parse(options.body);
      current = receivedFixture(command);
      return response(receiptResponse(command));
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
const preview = async () => {
  await query();
  fireEvent.click(screen.getByRole("button", { name: "登记标本签收" }));
  fireEvent.click(screen.getByLabelText("选择 SIM-COLLECTION-701.1"));
  fireEvent.click(screen.getByRole("button", { name: "核对签收信息" }));
};
const confirm = () =>
  fireEvent.click(screen.getByRole("button", { name: "确认签收所选标本" }));
it("选管、预览、取消均零POST；确认一次后逐管读回，不保存旧整单或QA", async () => {
  render(<View />);
  await preview();
  expect(screen.getByText("标本条码：SIM-COLLECTION-701.1").tagName).toBe(
    "STRONG",
  );
  expect(screen.getByText(/签收时间：.*中国标准时间/)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "返回选管" }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "核对签收信息" }));
  confirm();
  confirm();
  await screen.findByText("所选标本已签收，逐管状态核对一致。");
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/rest\/specimen-receipts$/);
  expect(options.headers["X-CSRF-Token"]).toBe("SIM-CSRF");
  expect(JSON.parse(options.body).tubes[0].collectionDate).toBe(
    "2026-09-13T06:10:00.123456Z",
  );
  expect(JSON.parse(options.body).tubes[0].sampleItemId).toBe("1001");
  expect(readReceiptCheckpoint()).toBeNull();
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(putToOpenElisServer).not.toHaveBeenCalled();
  expect(context.orderId).toBeNull();
  expect(context.stepProgress.qa).toBe(false);
});
it.each([400, 401, 403, 409, 500])(
  "HTTP %i 保留未知保护；刷新零重发",
  async (status) => {
    fetch.mockImplementation(async () => response({ success: false }, status));
    const view = render(<View />);
    await preview();
    confirm();
    await waitFor(() => expect(context.isSubmitting).toBe(false));
    expect(readReceiptCheckpoint()).not.toBeNull();
    view.unmount();
    render(<View />);
    fireEvent.click(
      screen.getByRole("button", { name: "查询当前状态", exact: true }),
    );
    await waitFor(() => expect(readOpenElisResponse).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("正在核对保存结果…")).not.toBeInTheDocument(),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(readReceiptCheckpoint()).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "登记标本签收" }),
    ).not.toBeInTheDocument();
  },
);
it.each(["bad200", "wrongTube", "readbackMissing", "network"])(
  "%s 不报成功，不放开重复提交",
  async (mode) => {
    fetch.mockImplementation(async (url, options) => {
      const command = JSON.parse(options.body);
      if (mode === "network") throw Error("SIM network failure");
      if (mode === "bad200") return response({ success: true });
      const data = receiptResponse(command);
      if (mode === "wrongTube") data.tubes[0].sampleItemId = "1002";
      return response(data);
    });
    render(<View />);
    await preview();
    confirm();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(context.isSubmitting).toBe(false));
    expect(readReceiptCheckpoint()).not.toBeNull();
    expect(
      screen.queryByText("所选标本已签收，逐管状态核对一致。"),
    ).not.toBeInTheDocument();
  },
);
it("结果未知后，只读重查完整匹配可恢复，不再POST", async () => {
  current = twoTubeReceiptFixture();
  fetch.mockImplementation(async (url, options) => {
    current.current.physicalSpecimens[0].receivedDate = JSON.parse(
      options.body,
    ).tubes[0].receivedDate;
    throw Error("SIM lost response");
  });
  render(<View />);
  await preview();
  confirm();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(context.isSubmitting).toBe(false));
  expect(readReceiptCheckpoint()).not.toBeNull();
  await query();
  expect(readReceiptCheckpoint()).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(context.receiptRecovery.checkpoint).toBeNull();
  expect(screen.getByRole("button", { name: "登记标本签收" })).toBeEnabled();
});
it("超时后的迟到成功不消解保护", async () => {
  const original = globalThis.setTimeout;
  let expire;
  vi.spyOn(globalThis, "setTimeout").mockImplementation((fn, ms, ...args) => {
    if (ms === 15000) {
      expire = fn;
      return original(() => {}, ms);
    }
    return original(fn, ms, ...args);
  });
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
  await act(async () => expire());
  await waitFor(() => expect(context.isSubmitting).toBe(false));
  await act(async () =>
    resolve(response(receiptResponse(JSON.parse(fetch.mock.calls[0][1].body)))),
  );
  expect(readReceiptCheckpoint()).not.toBeNull();
  expect(
    screen.queryByText("所选标本已签收，逐管状态核对一致。"),
  ).not.toBeInTheDocument();
});
it("会话短暂中断不能复活旧确认页", async () => {
  const view = render(<View />);
  await preview();
  view.rerender(<View checking />);
  view.rerender(<View />);
  if (screen.queryByRole("button", { name: "确认签收所选标本" })) confirm();
  expect(fetch).not.toHaveBeenCalled();
});
it("签收中阻止旧保存、采集、标签和新查询，旧成功不跨会话回写", async () => {
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
  await expect(context.saveOrderEntry()).rejects.toThrow();
  await expect(context.saveOrder()).rejects.toThrow();
  await expect(
    context.queryCurrentEntryRecovery(recoveryReference.submissionId),
  ).rejects.toThrow();
  expect(() => context.prepareRecoveredLabels(current)).toThrow();
  expect(() => context.adoptRecoveredCollection(current)).toThrow();
  view.rerender(<View sessionId="SIM-OTHER" />);
  await act(async () =>
    resolve(response(receiptResponse(JSON.parse(fetch.mock.calls[0][1].body)))),
  );
  expect(readReceiptCheckpoint()).not.toBeNull();
  expect(
    screen.queryByText("所选标本已签收，逐管状态核对一致。"),
  ).not.toBeInTheDocument();
});

it("确认快照不可被UI副本篡改；取消或重新查询后旧确认无效", async () => {
  render(<View />);
  let result, operation;
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  const forged = JSON.parse(JSON.stringify(result));
  forged.current.patient.id = "802";
  expect(() => context.prepareRecoveredReceipt(forged)).toThrow();
  act(() => {
    operation = context.prepareRecoveredReceipt(result);
  });
  const draft = operation.preview(["901"]);
  draft.tubes[0].sampleItemId = "9999";
  operation.cancelPreview();
  await expect(operation.confirm()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  operation.preview(["901"]);
  await act(async () => {
    await context.queryCurrentEntryRecovery(recoveryReference.submissionId);
  });
  await expect(operation.confirm()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("标签生成中不能抢占签收；旧签收确认也不得在标签结束后复活", async () => {
  let result, receiver, label, pending;
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        pending = resolve;
      }),
  );
  const view = render(<View />);
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  act(() => {
    receiver = context.prepareRecoveredReceipt(result);
    receiver.preview(["901"]);
    label = context.prepareRecoveredLabels(result);
  });
  let generation;
  act(() => {
    generation = label
      .generate({
        orderId: "701",
        labNumber: "SIM-COLLECTION-701",
        labels: [{ type: "specimen", sampleItemId: "1001", quantity: 1 }],
      })
      .catch(() => {});
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(() => context.prepareRecoveredReceipt(result)).toThrow();
  await expect(receiver.confirm()).rejects.toThrow();
  view.unmount();
  await act(async () => {
    pending(response({ success: false }, 409));
    await generation;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("采集写入中不能抢占签收", async () => {
  let result, resolve, saving;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<View />);
  await act(async () => {
    result = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  act(() => context.adoptRecoveredCollection(result));
  act(() => {
    saving = context
      .saveRecoveredCollection(result, [
        {
          requestId: "902",
          date: "2026-09-13",
          time: "14:10",
          quantity: 1,
          collector: "SIM采集员",
        },
      ])
      .catch(() => {});
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(() => context.prepareRecoveredReceipt(result)).toThrow();
  view.unmount();
  await act(async () => {
    resolve(response({ success: false }, 409));
    await saving;
  });
  expect(readReceiptCheckpoint()).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("签收后的迟到GET不消解原会话保护", async () => {
  let finish;
  const view = render(<View />);
  await preview();
  readOpenElisResponse.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  confirm();
  await waitFor(() => expect(readOpenElisResponse).toHaveBeenCalledTimes(2));
  view.rerender(<View failed />);
  view.rerender(<View />);
  await act(async () => finish(response(current)));
  expect(readReceiptCheckpoint()).not.toBeNull();
  expect(
    screen.queryByText("所选标本已签收，逐管状态核对一致。"),
  ).not.toBeInTheDocument();
});
