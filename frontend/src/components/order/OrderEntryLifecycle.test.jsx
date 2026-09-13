import React from "react";
import { act, render } from "@testing-library/react";
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

// The removed edit POST -> read -> recreate-every-request path is now tested as
// zero-dispatch. First-entry lifecycle and late receipts stay in the atomic suites.
let context;
const form = () => ({
  patientProperties: {
    patientPK: "801",
    patientUpdateStatus: "NO_ACTION",
    lastName: "SIM患者",
  },
  sampleOrderItems: {
    labNo: "SIM-EDIT-701",
    sampleId: "701",
    modified: true,
    referringSiteId: "21",
  },
});
function Probe() {
  context = useOrderContext();
  return null;
}
function mount() {
  render(
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
          <Probe />
        </OrderProvider>
      </UserSessionDetailsContext.Provider>
    </MemoryRouter>,
  );
  act(() => {
    context.setOrderData(form());
    context.setSamples([
      { sampleTypeId: "11", tests: [{ id: "31" }], quantity: "1" },
    ]);
  });
}
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  getFromOpenElisServer.mockImplementation((url, done) => {
    if (url.includes("/rest/order/search?"))
      done({
        id: "701",
        labNumber: "SIM-EDIT-701",
        ...form(),
        samples: [],
        stepProgress: { enter: true, collect: false, label: false, qa: false },
      });
  });
});
afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});
it.each([false, true])(
  "已保存表单 silent=%s 不再重复创建管",
  async (silent) => {
    mount();
    await act(async () => {
      await expect(context.saveOrderEntry(silent)).rejects.toMatchObject({
        errorKey: "order.entry.editUnavailable",
      });
    });
    expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
    expect(createRequestsForSamples).not.toHaveBeenCalled();
    expect(context.isSubmitting).toBe(false);
    expect(context.isSaveUnconfirmed).toBe(false);
    expect(context.samples).toHaveLength(1);
  },
);
it("从列表加载后即使启用编辑也不能调用旧开单保存链", async () => {
  mount();
  await act(async () => context.loadOrder("SIM-EDIT-701"));
  expect(context.isReadOnly).toBe(true);
  act(() => context.enableEditMode());
  await act(async () => {
    await expect(context.saveOrderEntry()).rejects.toMatchObject({
      errorKey: "order.entry.editUnavailable",
    });
  });
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(createRequestsForSamples).not.toHaveBeenCalled();
});
it("保留的旧保存函数在患者切换后不能提交旧患者", async () => {
  mount();
  const retained = context.saveOrderEntry;
  act(() =>
    context.setOrderData((previous) => ({
      ...previous,
      patientProperties: { ...previous.patientProperties, patientPK: "802" },
    })),
  );
  await act(async () => {
    await expect(retained()).rejects.toThrow("order.progress.requestChanged");
  });
  expect(context.orderData.patientProperties.patientPK).toBe("802");
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
});
it.each(["bad", "0", "", null])(
  "缺失或畸形已保存ID %s 不能绕回首次新增",
  async (sampleId) => {
    mount();
    act(() =>
      context.setOrderData((previous) => ({
        ...previous,
        sampleOrderItems: { ...previous.sampleOrderItems, sampleId },
      })),
    );
    await act(async () => {
      await expect(context.saveOrderEntry()).rejects.toMatchObject({
        errorKey: "order.save.incomplete",
      });
    });
    expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  },
);
