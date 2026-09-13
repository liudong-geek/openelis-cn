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
import { OrderProvider, useOrderContext } from "./OrderContext";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../utils/Utils";
import { createRequestsForSamples } from "./api/sampleTypeRequestApi";

let context, writes;
function Probe() {
  context = useOrderContext();
  return null;
}
function View({ generation = 0, session = "SIM-SESSION" }) {
  return (
    <MemoryRouter initialEntries={["/order/enter"]}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            authenticated: true,
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
  vi.stubGlobal("crypto", webcrypto);
  writes = [];
  getFromOpenElisServer.mockReset();
  postToOpenElisServerFullResponse
    .mockReset()
    .mockImplementation((url, body, finish, extra, headers) =>
      writes.push({ url, body, finish, extra, headers }),
    );
  createRequestsForSamples.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
