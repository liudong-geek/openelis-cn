import React, { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { webcrypto, createHash } from "node:crypto";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  notify: vi.fn(),
  createRequests: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerFullResponse: api.post,
  putToOpenElisServer: vi.fn(),
}));
vi.mock("../api/sampleTypeRequestApi", () => ({
  createRequestsForSamples: api.createRequests,
  getRequestsBySample: vi.fn().mockResolvedValue([]),
  convertRequestsToSamples: (data) => data,
}));
vi.mock("../OrderContext", async (importOriginal) => {
  const actual = await importOriginal();
  const React = await import("react");
  const TestContext = React.createContext(null);
  return {
    ...actual,
    TestContext,
    useOrderContext: () =>
      React.useContext(TestContext) || actual.useOrderContext(),
  };
});
vi.mock("../../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: () => {},
    addNotification: api.notify,
  }),
  ConfigurationContext: React.createContext({ configurationProperties: {} }),
}));
vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));
vi.mock("../../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));
vi.mock("../BarcodeScannerBar", () => ({ default: () => null }));
// The real parent, workflow layout, stepper and navigation buttons are under
// test. Patient selection/Formik has its own real-component regression suite;
// these peripheral editors only supply explicit SIM draft inputs here.
vi.mock("./sections/PatientSearchSection", () => ({
  default: ({ orderData, setOrderData, setPhoneValidation, isReadOnly }) => (
    <div>
      <input
        aria-label="SIM患者"
        value={orderData.patientProperties.lastName || ""}
        disabled={isReadOnly}
        onChange={(event) =>
          setOrderData((prev) => ({
            ...prev,
            patientProperties: {
              ...prev.patientProperties,
              lastName: event.target.value,
            },
          }))
        }
      />
      <button
        disabled={isReadOnly}
        onClick={() => setPhoneValidation({ primaryPhone: { status: false } })}
      >
        SIM无效电话
      </button>
    </div>
  ),
}));
vi.mock("./sections/LocationSection", () => ({ default: () => null }));
vi.mock("./sections/ProgramSection", () => ({ default: () => null }));
vi.mock("./sections/ClinicalInfoSection", () => ({ default: () => null }));
vi.mock("./sections/RequesterSection", () => ({ default: () => null }));
vi.mock("./sections/SampleTestSection", () => ({ default: () => null }));

import OrderEnter from "./OrderEnter";
import { TestContext, OrderProvider, useOrderContext } from "../OrderContext";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import messages from "../../../languages/zh.json";

const draft = (labNo = "", patient = "SIM患者A") => ({
  orderId: null,
  labNumber: "",
  orderData: {
    patientUpdateStatus: "ADD",
    patientProperties: { lastName: patient, patientUpdateStatus: "ADD" },
    sampleOrderItems: { labNo, referringSiteId: "SIM-SITE" },
  },
  samples: [{ id: "SIM-TUBE", sampleTypeId: "11", tests: [{ id: "31" }] }],
});
let changeState;
let currentState;
let history;
let requests;
let save;
let markComplete;
function Harness({ initial }) {
  const [state, setState] = useState(initial);
  changeState = setState;
  currentState = state;
  return (
    <TestContext.Provider
      value={{
        stepProgress: { enter: false, collect: false, label: false, qa: false },
        isDirty: false,
        isReadOnly: false,
        isEditMode: false,
        ...state,
        setOrderData: (update) =>
          setState((prev) => ({
            ...prev,
            orderData:
              typeof update === "function" ? update(prev.orderData) : update,
          })),
        setSamples: (samples) => setState((prev) => ({ ...prev, samples })),
        saveOrderEntry: save,
        markStepComplete: markComplete,
      }}
    >
      <OrderEnter />
    </TestContext.Provider>
  );
}
const mount = (initial = draft()) => {
  history = createMemoryHistory({ initialEntries: ["/order/enter"] });
  return render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={messages}>
        <Harness initial={initial} />
      </IntlProvider>
    </Router>,
  );
};
const button = (kind = "save") =>
  screen.getByRole("button", {
    name:
      kind === "draft"
        ? messages["button.save.draft"]
        : kind === "next"
          ? messages["button.save.nextStep"].replace(
              "{step}",
              messages["order.step.collect"],
            )
          : messages["button.save.currentStep"],
  });
const reply = async (request, value) =>
  act(async () => request.callback(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  requests = [];
  api.notify.mockReset();
  api.post.mockReset();
  api.createRequests.mockReset().mockResolvedValue([]);
  markComplete = vi.fn();
  save = vi.fn().mockResolvedValue({ success: true, sampleId: "701" });
  api.get.mockReset().mockImplementation((url, callback, signal) => {
    if (url === "/rest/labUnit/config") callback({ workflowType: "Clinical" });
    else requests.push({ url, callback, signal });
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("申请首次保存与采集入口：SIM父级交互", () => {
  it.each(["patient", "eqa"])(
    "%s已关联时不能静默切成环境标本，说明原因并保留临床输入",
    async (kind) => {
      api.get.mockImplementation((url, callback) => {
        if (url === "/rest/labUnit/config") callback({ workflowType: "Both" });
      });
      const initial = draft(
        "SIM-WORKFLOW",
        kind === "patient" ? "SIM患者" : "",
      );
      initial.orderData.patientProperties.patientPK =
        kind === "patient" ? "801" : "";
      initial.orderData.sampleOrderItems.isEQASample = kind === "eqa";
      mount(initial);
      const toggle = screen.getByRole("tab", {
        name: messages["workflow.environmental"],
      });
      expect(toggle).toBeDisabled();
      expect(
        screen.getByText(messages["order.entry.workflowPatientConflict"]),
      ).toBeVisible();
      await userEvent.setup().click(toggle);
      expect(currentState.orderData.patientProperties.patientPK).toBe(
        kind === "patient" ? "801" : "",
      );
      expect(
        currentState.orderData.sampleOrderItems.environmentalFields
          ?.workflowType,
      ).not.toBe("environmental");
    },
  );
  it("空表单不分配编号、不提交", async () => {
    const user = userEvent.setup();
    mount({ ...draft("", ""), samples: [] });
    await user.click(button());
    expect(requests).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe("/order/enter");
  });
  it("编号与保存全程禁止重复点击，确认回执后才能进入采集", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    save.mockReturnValue(pending.promise);
    mount();
    await user.dblClick(button("next"));
    expect(requests).toHaveLength(1);
    expect(button()).toBeDisabled();
    expect(button("draft")).toBeDisabled();
    expect(
      screen.queryByText(messages["order.guidance.blocked"]),
    ).not.toBeInTheDocument();
    await reply(requests[0], { body: "SIM-GENERATED" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(false, "SIM-GENERATED");
    expect(button("next")).toBeDisabled();
    expect(history.location.pathname).toBe("/order/enter");
    await act(async () => pending.resolve({ success: true, sampleId: "701" }));
    expect(history.location.pathname).toBe("/order/collect");
    expect(markComplete).toHaveBeenCalledWith("enter");
  });
  it.each([undefined, { body: " " }, { body: {} }, { body: 701 }])(
    "非法编号回执%j保留输入且不提交",
    async (response) => {
      const user = userEvent.setup();
      mount();
      await user.click(button("next"));
      await reply(requests[0], response);
      expect(save).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "SIM患者" })).toHaveValue(
        "SIM患者A",
      );
      expect(button()).toBeEnabled();
      expect(api.notify).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "error" }),
      );
      expect(history.location.pathname).toBe("/order/enter");
    },
  );
  it("清空上份申请后不复用旧编号", async () => {
    const user = userEvent.setup();
    mount(draft("SIM-OLD"));
    act(() => changeState(draft("", "SIM患者B")));
    await user.click(button());
    expect(requests).toHaveLength(1);
    expect(save).not.toHaveBeenCalled();
    await reply(requests[0], { body: "SIM-NEW" });
    expect(save).toHaveBeenCalledWith(false, "SIM-NEW");
    expect(currentState.orderData.patientProperties.lastName).toBe("SIM患者B");
  });
  it("同路由换申请后旧编号回调不能写进新申请或触发提交", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(button("next"));
    const oldRequest = requests[0];
    act(() => changeState(draft("", "SIM患者B")));
    await reply(oldRequest, { body: "SIM-OLD-LATE" });
    expect(currentState.orderData.sampleOrderItems.labNo).toBe("");
    expect(screen.getByRole("textbox", { name: "SIM患者" })).toHaveValue(
      "SIM患者B",
    );
    expect(save).not.toHaveBeenCalled();
    expect(markComplete).not.toHaveBeenCalled();
    expect(button()).toBeEnabled();
    expect(oldRequest.signal.aborted).toBe(true);
  });
  it("离开页面终止编号等待，迟到回调不能提交", async () => {
    const user = userEvent.setup();
    const view = mount();
    await user.click(button());
    view.unmount();
    await reply(requests[0], { body: "SIM-AFTER-LEAVE" });
    expect(save).not.toHaveBeenCalled();
    expect(requests[0].signal.aborted).toBe(true);
    expect(api.notify).not.toHaveBeenCalled();
  });
  it("编号超时可明确重试，旧回调不覆盖第二次编号", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount();
    await user.click(button());
    await act(async () => vi.advanceTimersByTimeAsync(15001));
    expect(button()).toBeEnabled();
    expect(api.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "error" }),
    );
    await user.click(button());
    await reply(requests[0], { body: "SIM-EXPIRED" });
    expect(save).not.toHaveBeenCalled();
    await reply(requests[1], { body: "SIM-RETRY" });
    expect(save).toHaveBeenCalledWith(false, "SIM-RETRY");
    expect(currentState.orderData.sampleOrderItems.labNo).toBe("SIM-RETRY");
  });
  it.each([
    undefined,
    { success: true },
    { success: false, sampleId: "701" },
    { success: true, sampleId: {} },
  ])("不完整保存回执%j不标成功、不跳转、禁止盲重发", async (receipt) => {
    const user = userEvent.setup();
    save.mockResolvedValue(receipt);
    mount(draft("SIM-SUBMITTED"));
    await user.click(button("next"));
    expect(history.location.pathname).toBe("/order/enter");
    expect(markComplete).not.toHaveBeenCalled();
    expect(
      screen.getByText(messages["order.save.readbackUnconfirmed"]),
    ).toBeVisible();
    expect(button()).toBeDisabled();
    expect(button("draft")).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "SIM患者" })).toHaveValue(
      "SIM患者A",
    );
    await user.click(button());
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("保存失败保留输入及已生成编号，不进入采集", async () => {
    const user = userEvent.setup();
    save.mockRejectedValue({ errorKey: "order.save.incomplete" });
    mount();
    await user.click(button("next"));
    await reply(requests[0], { body: "SIM-RETAIN" });
    expect(history.location.pathname).toBe("/order/enter");
    expect(currentState.orderData.sampleOrderItems.labNo).toBe("SIM-RETAIN");
    expect(api.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "error",
        message: messages["order.save.incomplete"],
      }),
    );
    expect(markComplete).not.toHaveBeenCalled();
  });
  it("已知电话错误不允许保存或草稿绕过校验", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "SIM无效电话" }));
    await user.click(button());
    await user.click(button("draft"));
    expect(save).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });
  it("保存期间切换申请，旧成功回执不推进新申请", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    save.mockReturnValue(pending.promise);
    mount(draft("SIM-A"));
    await user.click(button("next"));
    act(() => changeState(draft("SIM-B", "SIM患者B")));
    await act(async () => pending.resolve({ success: true, sampleId: "701" }));
    expect(history.location.pathname).toBe("/order/enter");
    expect(markComplete).not.toHaveBeenCalled();
    expect(api.notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "success" }),
    );
    expect(screen.getByRole("textbox", { name: "SIM患者" })).toHaveValue(
      "SIM患者B",
    );
  });
  it.each(["save", "draft", "next"])(
    "%s在保存超时后保留编号并锁定重复提交，迟到成功不跳转",
    async (mode) => {
      vi.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const pending = deferred();
      save.mockReturnValue(pending.promise);
      mount(draft("SIM-TIMEOUT"));
      await user.click(button(mode));
      expect(button()).toBeDisabled();
      expect(button("draft")).toBeDisabled();
      await act(async () => vi.advanceTimersByTimeAsync(30001));
      expect(
        screen.getByText(messages["order.save.readbackUnconfirmed"]),
      ).toBeVisible();
      expect(button()).toBeDisabled();
      await act(async () =>
        pending.resolve({ success: true, sampleId: "701" }),
      );
      expect(markComplete).not.toHaveBeenCalled();
      expect(history.location.pathname).toBe("/order/enter");
      expect(currentState.orderData.sampleOrderItems.labNo).toBe("SIM-TIMEOUT");
      expect(api.notify).not.toHaveBeenCalledWith(
        expect.objectContaining({ kind: "success" }),
      );
    },
  );
  it.each(["save", "draft"])(
    "%s确认完整回执后留在当前页且提示成功",
    async (mode) => {
      const user = userEvent.setup();
      mount();
      await user.click(button(mode));
      await reply(requests[0], { body: "SIM-SAVED" });
      expect(save).toHaveBeenCalledWith(mode === "draft", "SIM-SAVED");
      expect(api.notify).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "success" }),
      );
      expect(history.location.pathname).toBe("/order/enter");
      expect(button()).toBeEnabled();
    },
  );
  it("返回原申请也不能重新激活已失效编号请求", async () => {
    const user = userEvent.setup();
    const original = draft();
    mount(original);
    await user.click(button());
    act(() => changeState(draft("", "SIM患者B")));
    act(() => changeState(original));
    await reply(requests[0], { body: "SIM-STALE" });
    expect(save).not.toHaveBeenCalled();
    expect(currentState.orderData.sampleOrderItems.labNo).toBe("");
  });
  it("编号等待时切换为只读，禁止后续提交", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(button());
    act(() => changeState((prev) => ({ ...prev, isReadOnly: true })));
    await reply(requests[0], { body: "SIM-LOCKED" });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "SIM患者" })).toBeDisabled();
    expect(button("draft")).toBeDisabled();
  });
  it("外部编号为空白时不能提交，填写后不调用编号分配", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("checkbox", {
        name: messages["order.labNumber.useExternal"],
      }),
    );
    const input = document.getElementById("labNumber");
    await user.type(input, "   ");
    await user.click(button());
    expect(save).not.toHaveBeenCalled();
    await user.type(input, "SIM-EXTERNAL");
    await user.click(button());
    expect(save).toHaveBeenCalledWith(false, "SIM-EXTERNAL");
    expect(requests).toHaveLength(0);
  });
  it("自身保存回填编号及患者/申请主键仍能进入采集", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    save.mockReturnValue(pending.promise);
    mount();
    await user.click(button("next"));
    await reply(requests[0], { body: "SIM-OWN" });
    act(() =>
      changeState((prev) => ({
        ...prev,
        orderId: "701",
        labNumber: "SIM-OWN",
      })),
    );
    act(() =>
      changeState((prev) => ({
        ...prev,
        orderData: {
          ...prev.orderData,
          patientProperties: {
            ...prev.orderData.patientProperties,
            patientPK: "801",
            patientUpdateStatus: "NO_ACTION",
          },
        },
      })),
    );
    await act(async () => pending.resolve({ success: true, sampleId: "701" }));
    expect(history.location.pathname).toBe("/order/collect");
    expect(markComplete).toHaveBeenCalledWith("enter");
  });
  it("回执与当前持久申请ID不一致时拒绝继续", async () => {
    const user = userEvent.setup();
    mount({ ...draft("SIM-EXISTING"), orderId: "702" });
    await user.click(button("next"));
    expect(
      screen.getByText(messages["order.save.readbackUnconfirmed"]),
    ).toBeVisible();
    expect(markComplete).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe("/order/enter");
  });
  it.each([
    ["next", false],
    ["draft", false],
    ["next", true],
    ["draft", true],
  ])(
    "真实Provider单次整单保存%s/EQA=%s及未修改继续采集（SIM接口）",
    async (mode, eqa) => {
      vi.stubGlobal("crypto", webcrypto);
      const user = userEvent.setup();
      let context;
      const Probe = () => {
        context = useOrderContext();
        return null;
      };
      history = createMemoryHistory({ initialEntries: ["/order/enter"] });
      api.get.mockImplementation((url, callback) => {
        if (url === "/rest/labUnit/config")
          callback({ workflowType: "Clinical" });
        else if (url === "/rest/SampleEntryGenerateScanProvider")
          callback({ body: "SIM-PROVIDER" });
        else if (url.startsWith("/rest/order/search?"))
          callback({
            id: "701",
            labNumber: "SIM-PROVIDER",
            patientProperties: { patientPK: "801" },
          });
      });
      api.post.mockImplementation((_url, body, callback, _extra, headers) => {
        const sent = JSON.parse(body);
        callback({
          status: 200,
          json: async () => ({
            success: true,
            replayed: false,
            receipt: {
              version: 1,
              submissionId: headers["Idempotency-Key"],
              hashVersion: "raw-json-v1",
              requestHash: createHash("sha256")
                .update("raw-json-v1\n" + body)
                .digest("hex"),
              createdAt: "2026-09-13T02:00:00Z",
              sampleId: "701",
              labNo: "SIM-PROVIDER",
              patientId: "801",
              workflowType: "clinical",
              requestedSpecimens: sent.requestedSpecimens.map(
                (tube, index) => ({
                  ...tube,
                  id: String(901 + index),
                  sampleId: "701",
                  status: "REQUESTED",
                  sampleItemId: null,
                }),
              ),
              labelRequests: [],
            },
          }),
        });
      });
      render(
        <Router history={history}>
          <IntlProvider locale="zh" messages={messages}>
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
                <OrderEnter />
              </OrderProvider>
            </UserSessionDetailsContext.Provider>
          </IntlProvider>
        </Router>,
      );
      act(() => {
        const data = draft().orderData;
        if (eqa) {
          data.sampleOrderItems.isEQASample = true;
          data.patientProperties.patientPK = "802";
          data.patientProperties.patientUpdateStatus = "NO_ACTION";
        }
        context.setOrderData(data);
        context.setSamples(draft().samples);
      });
      await user.click(button(mode));
      await waitFor(() => expect(context.orderId).toBe("701"));
      if (mode === "draft") {
        await waitFor(() => expect(button("next")).toBeEnabled());
        await user.click(button("next"));
      }
      await waitFor(() =>
        expect(history.location.pathname).toBe("/order/collect"),
      );
      expect(context.orderId).toBe("701");
      expect(context.orderData.patientProperties.patientPK).toBe("801");
      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.createRequests).not.toHaveBeenCalled();
      expect(
        api.get.mock.calls.some(([url]) =>
          url.startsWith("/rest/order/search?"),
        ),
      ).toBe(false);
      const payload = JSON.parse(api.post.mock.calls[0][1]);
      expect(payload.sampleOrderItems.labNo).toBe("SIM-PROVIDER");
      expect(payload.patientProperties.lastName).toBe("SIM患者A");
      expect(payload.orderEntryOnly).toBe(true);
      expect(payload.requestedSpecimens).toHaveLength(1);
      vi.unstubAllGlobals();
    },
  );
  it("保存中附加信息迟到不得静默解锁并重复提交", async () => {
    const user = userEvent.setup();
    const pending = deferred();
    save.mockReturnValue(pending.promise);
    mount(draft("SIM-METADATA"));
    await user.click(button());
    act(() =>
      changeState((prev) => ({
        ...prev,
        orderData: {
          ...prev.orderData,
          sampleOrderItems: {
            ...prev.orderData.sampleOrderItems,
            questionnaire: { id: "SIM-LATE-METADATA" },
          },
        },
      })),
    );
    await user.click(button("draft"));
    expect(save).toHaveBeenCalledTimes(1);
    expect(button()).toBeDisabled();
    await act(async () => pending.resolve({ success: true, sampleId: "701" }));
    expect(button()).toBeDisabled();
    expect(
      screen.getByText(messages["order.save.readbackUnconfirmed"]),
    ).toBeVisible();
  });
  it("离开开单页后返回，Provider仍保留待核实编号并阻止再次保存", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const user = userEvent.setup();
    history = createMemoryHistory({ initialEntries: ["/order/enter"] });
    let context;
    function Probe() {
      context = useOrderContext();
      return null;
    }
    render(
      <Router history={history}>
        <IntlProvider locale="zh" messages={messages}>
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
              <Route path="/order/enter" component={OrderEnter} />
            </OrderProvider>
          </UserSessionDetailsContext.Provider>
        </IntlProvider>
      </Router>,
    );
    act(() => {
      context.setOrderData(draft("SIM-REENTER").orderData);
      context.setSamples(draft().samples);
    });
    await user.click(button("next"));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    act(() => history.push("/order/collect"));
    act(() => history.push("/order/enter"));
    expect(
      screen.getByText(messages["order.saveStatus.unconfirmed"]),
    ).toBeVisible();
    expect(screen.getByText(/SIM-REENTER/, { selector: "p" })).toBeVisible();
    expect(button()).toBeDisabled();
    expect(button("draft")).toBeDisabled();
    await user.click(button("next"));
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => api.post.mock.calls[0][2]({ status: 200 }));
    expect(history.location.pathname).toBe("/order/enter");
    expect(api.createRequests).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
