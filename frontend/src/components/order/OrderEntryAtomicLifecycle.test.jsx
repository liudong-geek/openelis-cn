import React from "react";
import { act, render } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { MemoryRouter } from "react-router-dom";
import { webcrypto, createHash } from "node:crypto";

vi.mock("../layout/Layout", () => ({
  ConfigurationContext: React.createContext({}),
}));
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServer: vi.fn(),
}));
vi.mock("./api/sampleTypeRequestApi", () => ({
  createRequestsForSamples: vi.fn(),
  getRequestsBySample: vi.fn().mockResolvedValue([]),
  convertRequestsToSamples: (value) => value,
}));
vi.mock("../utils/readOpenElisResponse", () => ({
  readOpenElisResponse: vi.fn(),
}));
import { OrderProvider, useOrderContext } from "./OrderContext";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../utils/Utils";
import { createRequestsForSamples } from "./api/sampleTypeRequestApi";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";

let context, writes;
function Probe() {
  context = useOrderContext();
  return null;
}
function View({
  generation = 0,
  session = "SIM-SESSION",
  authenticated = true,
}) {
  return (
    <MemoryRouter initialEntries={["/order/enter"]}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            authenticated,
            userId: "SIM-USER",
            sessionId: session,
            csrf: "SIM-CSRF",
          },
        }}
      >
        <OrderProvider>
          <Probe key={generation} />
        </OrderProvider>
      </UserSessionDetailsContext.Provider>
    </MemoryRouter>
  );
}
const mount = () => {
  const view = render(<View />);
  // Use the real new-workspace defaults, not a hand-written modified flag.
  expect(context.orderData.sampleOrderItems.modified).toBe(false);
  act(() => {
    context.setOrderData((previous) => ({
      ...previous,
      patientProperties: {
        patientPK: "801",
        patientUpdateStatus: "NO_ACTION",
        lastName: "SIM申请测试",
      },
      sampleOrderItems: {
        ...previous.sampleOrderItems,
        labNo: "SIM-ATOMIC-701",
        referringSiteId: "21",
      },
    }));
    context.setSamples([
      { sampleTypeId: "11", quantity: "1", tests: [{ id: "31" }] },
      { sampleTypeId: "11", quantity: "2", tests: [{ id: "32" }] },
    ]);
  });
  return view;
};
const begin = () => {
  const outcome = {};
  act(() => {
    context.saveOrderEntry().then(
      (value) => {
        outcome.value = value;
      },
      (error) => {
        outcome.error = error;
      },
    );
  });
  return outcome;
};
const response = (write) => {
  const sent = JSON.parse(write.body);
  return {
    status: 200,
    json: async () => ({
      success: true,
      replayed: false,
      receipt: {
        version: 1,
        submissionId: write.headers["Idempotency-Key"],
        requestHash: createHash("sha256")
          .update("raw-json-v1\n" + write.body)
          .digest("hex"),
        hashVersion: "raw-json-v1",
        createdAt: "2026-09-13T02:00:00Z",
        sampleId: "701",
        labNo: sent.sampleOrderItems.labNo,
        workflowType: "clinical",
        patientId: "801",
        labelRequests: [],
        requestedSpecimens: sent.requestedSpecimens.map((tube, i) => ({
          ...tube,
          id: String(901 + i),
          sampleId: "701",
          status: "REQUESTED",
          sampleItemId: null,
        })),
      },
    }),
  };
};
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  writes = [];
  getFromOpenElisServer.mockReset();
  postToOpenElisServerFullResponse
    .mockReset()
    .mockImplementation((url, body, finish, extra, headers) =>
      writes.push({ url, body, finish, extra, headers }),
    );
  createRequestsForSamples.mockReset();
  readOpenElisResponse.mockReset();
});
afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("首单发送前保存无患者信息核对凭证；刷新工作区仍阻止重复开单", async () => {
  const view = mount();
  const outcome = begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  const marker = JSON.parse(sessionStorage.getItem("lis.entry.pending.v1"));
  expect(marker).toEqual({
    version: 1,
    submissionId: writes[0].headers["Idempotency-Key"],
    requestHash: createHash("sha256")
      .update("raw-json-v1\n" + writes[0].body)
      .digest("hex"),
  });
  view.unmount();
  mount();
  const duplicate = begin();
  await act(async () => {});
  expect(duplicate.error?.errorKey).toBe("order.save.readbackUnconfirmed");
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(writes).toHaveLength(1);
  expect(outcome.value).toBeUndefined();
});

it("浏览器不能保留恢复凭证时不得发送首单", async () => {
  mount();
  const originalStorage = sessionStorage;
  vi.stubGlobal("sessionStorage", {
    getItem: originalStorage.getItem.bind(originalStorage),
    clear: originalStorage.clear.bind(originalStorage),
    setItem: () => {
      throw new Error("SIM storage unavailable");
    },
  });
  const result = begin();
  await waitFor(() => expect(result.error).toBeDefined());
  expect(writes).toHaveLength(0);
  expect(context.isSaveUnconfirmed).toBe(false);
  vi.unstubAllGlobals();
});

it("已保存草稿改动后不得再走旧编辑链追加全部标本", async () => {
  mount();
  const first = begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  await act(async () => writes[0].finish(response(writes[0])));
  expect(first.value?.success).toBe(true);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toBeNull();
  act(() =>
    context.setSamples([{ sampleTypeId: "11", tests: [{ id: "33" }] }]),
  );
  const edit = begin();
  await act(async () => {});
  expect(edit.error?.errorKey).toBe("order.entry.editUnavailable");
  expect(writes).toHaveLength(1);
  expect(createRequestsForSamples).not.toHaveBeenCalled();
});

const makeUnknown = async () => {
  const view = mount();
  begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  const original = writes[0];
  await act(async () =>
    context.markEntrySubmissionUnconfirmed("SIM-ATOMIC-701"),
  );
  return { view, original, code: original.headers["Idempotency-Key"] };
};
const recoveryResponse = async (original) => ({
  status: 200,
  redirected: false,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => ({ ...(await response(original).json()), replayed: true }),
});
it("404后仍锁定；刷新后重新核对成功只展示回执，不覆盖当前草稿", async () => {
  const { view, original, code } = await makeUnknown();
  readOpenElisResponse.mockResolvedValue({ status: 404 });
  await expect(context.queryEntryRecovery(code)).rejects.toMatchObject({
    errorKey: "order.recovery.notFound",
  });
  expect(context.isSaveUnconfirmed).toBe(true);
  view.unmount();
  mount();
  act(() =>
    context.setOrderData((prev) => ({
      ...prev,
      patientProperties: {
        ...prev.patientProperties,
        lastName: "SIM-未保存草稿",
      },
    })),
  );
  const before = JSON.stringify(context.orderData);
  readOpenElisResponse.mockResolvedValue(await recoveryResponse(original));
  const recovered = await context.queryEntryRecovery(code);
  expect(recovered.labNo).toBe("SIM-ATOMIC-701");
  expect(JSON.stringify(context.orderData)).toBe(before);
  expect(context.orderId).toBeNull();
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toContain(code);
  expect(writes).toHaveLength(1);
});
it("历史核对成功没有回填或跳步骤入口，原核对码保留", async () => {
  const { original, code } = await makeUnknown();
  readOpenElisResponse.mockResolvedValue(await recoveryResponse(original));
  await context.queryEntryRecovery(code);
  const before = JSON.stringify(context.orderData);
  expect(context.openRecoveredEntry).toBeUndefined();
  expect(context.orderId).toBeNull();
  expect(JSON.stringify(context.orderData)).toBe(before);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toContain(code);
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(
    getFromOpenElisServer.mock.calls.filter(([url]) =>
      url.includes("order/search"),
    ),
  ).toHaveLength(0);
  expect(writes).toHaveLength(1);
  expect(createRequestsForSamples).not.toHaveBeenCalled();
});
it("换会话后旧查询回执不能展示，原提交账号重新授权后可再次查询", async () => {
  const { view, original, code } = await makeUnknown();
  let finish;
  readOpenElisResponse.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = context.queryEntryRecovery(code).catch((e) => e);
  view.rerender(<View session="SIM-SESSION-B" />);
  finish(await recoveryResponse(original));
  expect(await pending).toMatchObject({
    errorKey: "order.progress.requestChanged",
  });
  expect(context.isRecoveryCurrent()).toBe(false);
  readOpenElisResponse.mockResolvedValue(await recoveryResponse(original));
  expect((await context.queryEntryRecovery(code)).sampleId).toBe("701");
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(context.orderId).toBeNull();
});
it("查询完成后编辑草稿或查询中离开工作区，不能迟到覆盖", async () => {
  const { original, code } = await makeUnknown();
  readOpenElisResponse.mockResolvedValue(await recoveryResponse(original));
  await context.queryEntryRecovery(code);
  act(() =>
    context.setSamples([{ sampleTypeId: "11", tests: [{ id: "33" }] }]),
  );
  expect(context.isRecoveryCurrent()).toBe(false);
  expect(
    getFromOpenElisServer.mock.calls.filter(([url]) =>
      url.includes("order/search"),
    ),
  ).toHaveLength(0);
  expect(writes).toHaveLength(1);
});

it("手工查询无待核对标记时仅查历史，不占用当前草稿或授予写权限", async () => {
  const { view, original, code } = await makeUnknown();
  view.unmount();
  sessionStorage.clear();
  mount();
  const before = JSON.stringify({
    orderData: context.orderData,
    samples: context.samples,
    steps: context.stepProgress,
  });
  readOpenElisResponse.mockResolvedValue(await recoveryResponse(original));
  expect((await context.queryEntryRecovery(code)).sampleId).toBe("701");
  expect(
    JSON.stringify({
      orderData: context.orderData,
      samples: context.samples,
      steps: context.stepProgress,
    }),
  ).toBe(before);
  expect(context.orderId).toBeNull();
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toBeNull();
  expect(writes).toHaveLength(1);
});

it("同身份会话短暂失效再恢复，旧查询永久失效，只有显式新查询可展示", async () => {
  const { view, original, code } = await makeUnknown();
  let finish;
  readOpenElisResponse.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = context.queryEntryRecovery(code).catch((error) => error);
  view.rerender(<View authenticated={false} />);
  view.rerender(<View />);
  finish(await recoveryResponse(original));
  expect(await pending).toMatchObject({
    errorKey: "order.progress.requestChanged",
  });
  expect(context.isRecoveryCurrent()).toBe(false);
  readOpenElisResponse.mockResolvedValue(await recoveryResponse(original));
  await context.queryEntryRecovery(code);
  expect(context.isRecoveryCurrent()).toBe(true);
  view.rerender(<View authenticated={false} />);
  view.rerender(<View />);
  expect(context.isRecoveryCurrent()).toBe(false);
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(writes).toHaveLength(1);
});

it("显式输入拒绝清除本次标记；普通400不能证明未保存", async () => {
  mount();
  const first = begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  await act(async () =>
    writes[0].finish({
      status: 400,
      json: async () => ({
        success: false,
        code: "ENTRY_SUBMISSION_INVALID",
        message: "SIM invalid input",
      }),
    }),
  );
  expect(first.error?.errorKey).toBe("order.save.incomplete");
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toBeNull();
  expect(context.isSaveUnconfirmed).toBe(false);
  const next = begin();
  await waitFor(() => expect(writes).toHaveLength(2));
  await act(async () =>
    writes[1].finish({
      status: 400,
      json: async () => ({ error: "SIM unspecified error" }),
    }),
  );
  expect(next.error?.errorKey).toBe("order.save.readbackUnconfirmed");
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toContain(
    writes[1].headers["Idempotency-Key"],
  );
  expect(context.isSaveUnconfirmed).toBe(true);
});

it("核对中工作区重置再回同一申请也不得接收早先查询", async () => {
  const { original, code } = await makeUnknown();
  let finish;
  readOpenElisResponse.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = context.queryEntryRecovery(code).catch((error) => error);
  act(() => context.resetOrder());
  finish(await recoveryResponse(original));
  expect(await pending).toMatchObject({
    errorKey: "order.progress.requestChanged",
  });
  expect(context.isRecoveryCurrent()).toBe(false);
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toContain(code);
  expect(writes).toHaveLength(1);
});

it("自动编号仅回填编号，保留的首单处理函数仍发送完整原子命令", async () => {
  mount();
  act(() =>
    context.setOrderData((previous) => ({
      ...previous,
      sampleOrderItems: { ...previous.sampleOrderItems, labNo: "" },
    })),
  );
  const retained = context.saveOrderEntry;
  act(() =>
    context.setOrderData((previous) => ({
      ...previous,
      sampleOrderItems: {
        ...previous.sampleOrderItems,
        labNo: "SIM-ATOMIC-701",
      },
    })),
  );
  let result;
  await act(async () => {
    result = retained(false, "SIM-ATOMIC-701");
  });
  await waitFor(() => expect(writes).toHaveLength(1));
  await act(async () => {
    await writes[0].finish(response(writes[0]));
    await result;
  });
  expect(context.orderId).toBe("701");
  expect(JSON.parse(writes[0].body).requestedSpecimens).toHaveLength(2);
  expect(createRequestsForSamples).not.toHaveBeenCalled();
});
it("发送后超时及finally仍保留同一核对码；子页重入和迟到回执不能解锁", async () => {
  const view = mount();
  const outcome = begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  const original = writes[0];
  // Explicitly trigger the same shared timeout handler without waiting 30s.
  await act(async () =>
    context.markEntrySubmissionUnconfirmed("SIM-ATOMIC-701"),
  );
  expect(outcome.error?.errorKey).toBe("order.save.readbackUnconfirmed");
  expect(context.isSubmitting).toBe(false);
  expect(context.unconfirmedSubmissionId).toBe(
    original.headers["Idempotency-Key"],
  );
  view.rerender(<View generation={1} />);
  const duplicate = begin();
  await act(async () => {
    await original.finish(response(original));
  });
  expect(duplicate.error?.errorKey).toBe("order.save.readbackUnconfirmed");
  expect(context.orderId).toBeNull();
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(context.unconfirmedSubmissionId).toBe(
    original.headers["Idempotency-Key"],
  );
  expect(writes).toHaveLength(1);
  expect(createRequestsForSamples).not.toHaveBeenCalled();
});
it("派发报文不随表单变化；错患者迟到响应不得回填", async () => {
  mount();
  const outcome = begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  const originalBody = writes[0].body;
  act(() =>
    context.setOrderData((previous) => ({
      ...previous,
      patientProperties: { ...previous.patientProperties, patientPK: "802" },
    })),
  );
  await act(async () => writes[0].finish(response(writes[0])));
  expect(outcome.error?.errorKey).toBe("order.progress.requestChanged");
  expect(context.orderData.patientProperties.patientPK).toBe("802");
  expect(context.orderId).toBeNull();
  expect(context.isSaveUnconfirmed).toBe(true);
  expect(writes[0].body).toBe(originalBody);
  expect(context.unconfirmedSubmissionId).toBe(
    writes[0].headers["Idempotency-Key"],
  );
});
it("新会话不能接收旧回执、患者或原核对码", async () => {
  const view = mount();
  const outcome = begin();
  await waitFor(() => expect(writes).toHaveLength(1));
  view.rerender(<View session="SIM-SESSION-B" />);
  await act(async () => writes[0].finish(response(writes[0])));
  expect(outcome.error?.errorKey).toBe("order.progress.requestChanged");
  expect(context.orderId).toBeNull();
  expect(context.orderData.patientProperties.patientPK).not.toBe("801");
  expect(context.unconfirmedSubmissionId).toBe("");
  expect(createRequestsForSamples).not.toHaveBeenCalled();
});
it("发送前摘要挂起只报未保存，不生成未知锁；迟到摘要无写入", async () => {
  vi.useFakeTimers();
  let release;
  vi.stubGlobal("crypto", {
    randomUUID: () => webcrypto.randomUUID(),
    subtle: {
      digest: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
  });
  mount();
  const outcome = begin();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10001);
  });
  expect(outcome.error?.errorKey).toBe("order.save.incomplete");
  expect(context.saveStatus).toBe("error");
  expect(context.isSaveUnconfirmed).toBe(false);
  await act(async () => release(new Uint8Array(32).buffer));
  expect(writes).toHaveLength(0);
  expect(context.unconfirmedSubmissionId).toBe("");
});
