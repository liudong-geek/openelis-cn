import React from "react";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

let context, reads, writes;
const initial = (labNo = "SIM-ENTRY-A") => ({
  patientProperties: {
    lastName: "SIM患者",
    patientPK: "801",
    patientUpdateStatus: "NO_ACTION",
  },
  sampleOrderItems: { labNo, referringSiteId: "SIM-SITE" },
});
const record = (labNumber = "SIM-ENTRY-A", id = "701") => ({
  id,
  labNumber,
  ...initial(labNumber),
  samples: [],
  stepProgress: { enter: true, collect: false, label: false, qa: false },
});
function Probe() {
  context = useOrderContext();
  return (
    <>
      <output aria-label="保存状态">{context.saveStatus}</output>
      <output aria-label="患者">
        {context.orderData.patientProperties?.patientPK}
      </output>
      <output aria-label="待核实编号">{context.unconfirmedLabNumber}</output>
    </>
  );
}
function View({ generation = 0 }) {
  return (
    <MemoryRouter initialEntries={["/order/enter"]}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            authenticated: true,
            userId: "SIM-USER",
            sessionId: "SIM-SESSION",
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
  act(() => {
    context.setOrderData(initial());
    context.setSamples([{ sampleTypeId: "1", tests: [{ id: "11" }] }]);
  });
  return view;
};
const tracked = (promise) => {
  const outcome = {};
  promise.then(
    (value) => {
      outcome.value = value;
    },
    (error) => {
      outcome.error = error;
    },
  );
  return outcome;
};
const start = () => {
  let result;
  act(() => {
    result = tracked(context.saveOrderEntry());
  });
  return result;
};
const respond = async (request, ...args) =>
  act(async () => {
    request.finish(...args);
    await Promise.resolve();
  });
const lookup = () =>
  reads.filter(({ url }) => url.includes("/rest/order/search?")).at(-1);
const load = async (number, id) => {
  let outcome;
  act(() => {
    outcome = tracked(context.loadOrder(number, false));
  });
  await respond(lookup(), record(number, id));
  expect(outcome.error).toBeUndefined();
};
beforeEach(() => {
  reads = [];
  writes = [];
  getFromOpenElisServer.mockReset().mockImplementation((url, finish) => {
    reads.push({ url, finish });
  });
  postToOpenElisServerFullResponse
    .mockReset()
    .mockImplementation((url, body, finish) => {
      writes.push({ url, body, finish });
    });
  createRequestsForSamples.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("开单提交的共享生命周期（仅SIM接口）", () => {
  it.each(["post", "readback", "requests"])(
    "%s超时在Provider保留未知，重挂子页和迟到回执不得续链",
    async (phase) => {
      vi.useFakeTimers();
      let releaseRequests;
      if (phase === "requests")
        createRequestsForSamples.mockImplementation(
          () =>
            new Promise((resolve) => {
              releaseRequests = resolve;
            }),
        );
      const view = mount();
      const outcome = start();
      if (phase !== "post") await respond(writes[0], { status: 200 });
      const lateRead = lookup();
      if (phase === "requests") await respond(lateRead, record());
      await act(async () => {
        vi.advanceTimersByTime(30001);
      });
      expect(screen.getByLabelText("保存状态")).toHaveTextContent(
        "unconfirmed",
      );
      expect(outcome.error?.errorKey).toBe("order.save.readbackUnconfirmed");
      view.rerender(<View generation={1} />);
      expect(screen.getByLabelText("待核实编号")).toHaveTextContent(
        "SIM-ENTRY-A",
      );
      let duplicate;
      await act(async () => {
        duplicate = tracked(context.saveOrderEntry());
      });
      expect(duplicate.error?.errorKey).toBe("order.save.readbackUnconfirmed");
      expect(writes).toHaveLength(1);
      const readCount = reads.length;
      if (phase === "post") await respond(writes[0], { status: 200 });
      if (phase === "readback") await respond(lateRead, record());
      if (phase === "requests") await act(async () => releaseRequests([]));
      expect(reads).toHaveLength(readCount);
      expect(context.saveStatus).toBe("unconfirmed");
      expect(context.orderData.patientProperties.patientPK).toBe("801");
    },
  );

  it.each(["network", "malformed", "read-error", "partial-write"])(
    "%s后不能用普通查询、重置或编辑解除原申请未知",
    async (failure) => {
      mount();
      if (failure === "partial-write")
        createRequestsForSamples.mockRejectedValue(
          Object.assign(new Error("SIM局部失败"), { status: 400 }),
        );
      const outcome = start();
      if (failure === "network")
        await respond(
          writes[0],
          undefined,
          undefined,
          Object.assign(new Error("SIM断网"), { status: 0 }),
        );
      else {
        await respond(writes[0], { status: 200 });
        await respond(
          lookup(),
          failure === "malformed" ? { labNumber: "SIM-ENTRY-A" } : record(),
          failure === "read-error" ? new Error("SIM读取失败") : undefined,
        );
      }
      expect(outcome.error?.errorKey).toBe("order.save.readbackUnconfirmed");
      expect(context.isSaveUnconfirmed).toBe(true);
      await load("SIM-ENTRY-A", "701");
      expect(context.isSaveUnconfirmed).toBe(true);
      act(() => context.resetOrder());
      act(() => context.setOrderData(initial()));
      expect(context.isSaveUnconfirmed).toBe(true);
      let duplicate;
      await act(async () => {
        duplicate = tracked(context.saveOrder(true));
      });
      expect(duplicate.error?.errorKey).toBe("order.save.readbackUnconfirmed");
      expect(writes).toHaveLength(1);
    },
  );

  it.each(["post", "readback", "requests"])(
    "切换申请后旧%s完成不能回填患者或继续写入，回到A仍待核实",
    async (phase) => {
      mount();
      let releaseRequests;
      if (phase === "requests")
        createRequestsForSamples.mockImplementation(
          () =>
            new Promise((resolve) => {
              releaseRequests = resolve;
            }),
        );
      const outcome = start();
      if (phase !== "post") await respond(writes[0], { status: 200 });
      const lateRead = lookup();
      if (phase === "requests") await respond(lateRead, record());
      await load("SIM-ENTRY-B", "702");
      const before = JSON.stringify(context.orderData);
      const readCount = reads.length;
      if (phase === "post") await respond(writes[0], { status: 200 });
      if (phase === "readback") await respond(lateRead, record());
      if (phase === "requests") await act(async () => releaseRequests([]));
      expect(context.orderId).toBe("702");
      expect(JSON.stringify(context.orderData)).toBe(before);
      expect(reads).toHaveLength(readCount);
      expect(outcome.error?.message).toBe("order.progress.requestChanged");
      await load("SIM-ENTRY-A", "701");
      expect(context.isSaveUnconfirmed).toBe(true);
    },
  );

  it("同申请换患者后旧回执不能覆写患者主键或清除待保存内容", async () => {
    mount();
    const outcome = start();
    await respond(writes[0], { status: 200 });
    const oldRead = lookup();
    act(() =>
      context.setOrderData((prev) => ({
        ...prev,
        patientProperties: {
          ...prev.patientProperties,
          patientPK: "802",
          lastName: "SIM新患者",
        },
      })),
    );
    await respond(oldRead, record());
    expect(context.orderData.patientProperties.patientPK).toBe("802");
    expect(context.isDirty).toBe(true);
    expect(context.isSaveUnconfirmed).toBe(true);
    expect(outcome.error).toBeDefined();
    expect(createRequestsForSamples).not.toHaveBeenCalled();
  });

  it.each([{}, { id: 0 }, { id: {} }, { id: "702" }])(
    "更新申请时无效或错误主键%j不能触发标本创建",
    async (partial) => {
      mount();
      await load("SIM-ENTRY-A", "701");
      const outcome = start();
      await respond(writes[0], { status: 200 });
      await respond(lookup(), { ...record(), ...partial, id: partial.id });
      expect(outcome.error?.errorKey).toBe("order.save.readbackUnconfirmed");
      expect(context.orderId).toBe("701");
      expect(createRequestsForSamples).not.toHaveBeenCalled();
    },
  );

  it("明确400拒绝保留输入但允许用户修正后重试", async () => {
    mount();
    const failed = start();
    await respond(writes[0], {
      status: 400,
      json: async () => ({ error: "SIM校验失败" }),
    });
    expect(failed.error?.status).toBe(400);
    expect(context.isSaveUnconfirmed).toBeFalsy();
    const next = start();
    await respond(writes[1], { status: 200 });
    await respond(lookup(), record());
    expect(next.value).toEqual({ success: true, sampleId: "701" });
    expect(context.orderId).toBe("701");
    expect(context.saveStatus).toBe("saved");
  });

  it.each(["saveOrderEntry", "saveOrder"])(
    "%s与另一保存入口互斥，静默保存也不能绕过",
    async (first) => {
      mount();
      let firstResult;
      act(() => {
        firstResult = tracked(context[first](true));
      });
      let secondResult;
      await act(async () => {
        secondResult = tracked(
          context[
            first === "saveOrderEntry" ? "saveOrder" : "saveOrderEntry"
          ](),
        );
      });
      expect(writes).toHaveLength(1);
      expect(secondResult.error?.message).toBe("order.progress.saveInProgress");
      await respond(writes[0], { status: 200 });
      await respond(lookup(), record());
      expect(firstResult.value?.success).toBe(true);
    },
  );

  it("重复POST及查询回调只创建一次标本请求", async () => {
    mount();
    const outcome = start();
    await respond(writes[0], { status: 200 });
    const firstRead = lookup();
    await respond(writes[0], { status: 200 });
    await respond(firstRead, record());
    await respond(firstRead, record());
    expect(outcome.value?.success).toBe(true);
    expect(
      reads.filter(({ url }) => url.includes("/rest/order/search?")),
    ).toHaveLength(1);
    expect(createRequestsForSamples).toHaveBeenCalledTimes(1);
  });
  it("保留旧保存函数不能把旧患者数据发送为当前申请", async () => {
    mount();
    const oldSave = context.saveOrderEntry;
    act(() =>
      context.setOrderData((previous) => ({
        ...previous,
        patientProperties: { ...previous.patientProperties, patientPK: "802" },
      })),
    );
    let result;
    await act(async () => {
      result = tracked(oldSave());
    });
    expect(writes).toHaveLength(0);
    expect(result.error?.message).toBe("order.progress.requestChanged");
    expect(context.orderData.patientProperties.patientPK).toBe("802");
  });
  it("查询失败不能丢掉原申请的未知状态，另一申请完成也不能解锁它", async () => {
    mount();
    const old = start();
    let failedLoad;
    act(() => {
      failedLoad = tracked(context.loadOrder("SIM-MISSING", false));
    });
    await respond(lookup(), undefined, new Error("SIM没有读取到申请"));
    expect(failedLoad.error).toBeDefined();
    expect(context.isSaveUnconfirmed).toBe(true);
    expect(context.unconfirmedLabNumber).toBe("SIM-ENTRY-A");
    await load("SIM-ENTRY-B", "702");
    expect(context.isSaveUnconfirmed).toBeFalsy();
    const next = start();
    await respond(writes[1], { status: 200 });
    await respond(lookup(), record("SIM-ENTRY-B", "702"));
    expect(next.value?.sampleId).toBe("702");
    await load("SIM-ENTRY-A", "701");
    expect(context.isSaveUnconfirmed).toBe(true);
    await respond(writes[0], { status: 200 });
    expect(old.error?.message).toBe("order.progress.requestChanged");
    expect(context.isSaveUnconfirmed).toBe(true);
  });
  it.each([false, true])(
    "新患者主键缺失时，仅环境采样允许无患者（environmental=%s）",
    async (environmental) => {
      mount();
      act(() =>
        context.setOrderData((previous) => ({
          ...previous,
          patientProperties: {
            lastName: "SIM新建",
            patientUpdateStatus: "ADD",
          },
          sampleOrderItems: {
            ...previous.sampleOrderItems,
            environmentalFields: {
              workflowType: environmental ? "environmental" : "clinical",
            },
          },
        })),
      );
      const result = start();
      await respond(writes[0], { status: 200 });
      await respond(lookup(), { ...record(), patientProperties: {} });
      if (environmental) expect(result.value?.success).toBe(true);
      else {
        expect(result.error?.errorKey).toBe("order.save.readbackUnconfirmed");
        expect(createRequestsForSamples).not.toHaveBeenCalled();
        expect(context.orderData.patientProperties.patientUpdateStatus).toBe(
          "ADD",
        );
      }
    },
  );
});
