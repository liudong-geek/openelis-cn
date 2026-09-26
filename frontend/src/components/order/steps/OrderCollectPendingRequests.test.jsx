import React, { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import OrderCollect from "./OrderCollect";
import messages from "../../../languages/zh.json";

const api = vi.hoisted(() => ({
  context: null,
  setLoading: null,
  pending: vi.fn(),
}));

vi.mock("../OrderContext", () => ({ useOrderContext: () => api.context }));
vi.mock("../OrderWorkflowLayout", () => ({
  default: ({ children, saveDisabled, onSave }) => (
    <div>
      <button disabled={saveDisabled} onClick={onSave}>
        保存采集
      </button>
      {children}
    </div>
  ),
}));
vi.mock("../SpecimenLookupPanel", () => ({ default: () => null }));
vi.mock("./sections/RequestedTestsSection", () => ({ default: () => null }));
vi.mock("./sections/ConsentAccordionSection", () => ({ default: () => null }));
vi.mock("./sections/SamplesCollectionSection", () => ({
  default: ({ isReadOnly }) => (
    <input aria-label="采集编辑" disabled={isReadOnly} />
  ),
}));
vi.mock("../../layout/Layout", async () => {
  const React = await import("react");
  return {
    NotificationContext: React.createContext({
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
      addNotification: vi.fn(),
    }),
  };
});
vi.mock("../../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { error: "error", success: "success" },
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: (url, callback) => {
    if (url === "/rest/server-time")
      callback({
        date: "2026-09-26",
        time: "13:37",
        timezone: "Asia/Shanghai",
      });
    else callback([]);
  },
}));
vi.mock("../api/sampleTypeRequestApi", () => ({
  getPendingRequests: (...args) => api.pending(...args),
  convertRequestsToSamples: (requests) =>
    requests.map((request) => ({
      sampleTypeRequestId: request.id,
      sampleTypeId: request.typeOfSampleId,
      tests: [{ id: "WBC" }],
      collectionDate: "2026-09-26",
      collectionTime: "13:37",
      receivedDate: "2026-09-26",
      receivedTime: "13:37",
    })),
}));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

function Harness() {
  const [isLoading, setLoading] = useState(true);
  const [samples, setSamples] = useState([
    { sampleTypeId: "blood", tests: [{ id: "WBC" }] },
  ]);
  api.setLoading = setLoading;
  api.context = {
    orderId: "701",
    labNumber: "SIM-701",
    orderData: { sampleOrderItems: { labNo: "SIM-701" } },
    samples,
    setSamples,
    isLoading,
    saveOrder: vi.fn(),
    markStepComplete: vi.fn(),
    isReadOnly: false,
    isEditMode: false,
    testSampleAssignments: {},
    assignTestToSample: vi.fn(),
    removeTestFromSample: vi.fn(),
    updateSampleCollectionDetails: vi.fn(),
    setOrderData: vi.fn(),
  };
  return <OrderCollect />;
}

it("等待旧申请加载和待采映射；失败可重试，完成前不开放编辑或保存", async () => {
  const first = deferred();
  const retry = deferred();
  api.pending
    .mockReset()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(retry.promise);
  render(
    <MemoryRouter initialEntries={["/order/collect"]}>
      <IntlProvider locale="zh" messages={messages}>
        <Harness />
      </IntlProvider>
    </MemoryRouter>,
  );
  expect(api.pending).not.toHaveBeenCalled();
  expect(screen.getByLabelText("采集编辑")).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存采集" })).toBeDisabled();

  await act(async () => api.setLoading(false));
  await waitFor(() => expect(api.pending).toHaveBeenCalledWith("701"));
  expect(screen.getByLabelText("采集编辑")).toBeDisabled();

  await act(async () => first.reject(new Error("pending request unavailable")));
  expect(screen.getByRole("alert")).toHaveTextContent(
    messages["collect.requests.unavailable"],
  );
  expect(screen.getByLabelText("采集编辑")).toBeDisabled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: messages["button.retry"] }));
  await waitFor(() => expect(api.pending).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("采集编辑")).toBeDisabled();

  await act(async () =>
    retry.resolve([{ id: "request-11", typeOfSampleId: "blood" }]),
  );
  await waitFor(() => expect(screen.getByLabelText("采集编辑")).toBeEnabled());
  expect(api.context.samples[0].sampleTypeRequestId).toBe("request-11");
  expect(screen.getByRole("button", { name: "保存采集" })).toBeEnabled();
});
