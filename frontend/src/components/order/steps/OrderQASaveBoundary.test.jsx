import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";

const { context, request } = vi.hoisted(() => ({
  context: {
    orderData: {
      sampleOrderItems: { labNo: "LAB-100" },
      patientProperties: {},
    },
    samples: [
      { sampleTypeId: "21", sampleItemId: "7", sampleTypeName: "Blood" },
    ],
    saveOrder: vi.fn(),
    resetOrder: vi.fn(),
    labNumber: "LAB-100",
    markStepComplete: vi.fn(),
    runLegacyQaWrite: null,
  },
  request: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("react-router-dom", () => ({
  useHistory: () => ({ push: vi.fn() }),
}));

vi.mock("../OrderContext", () => ({
  useOrderContext: () => context,
  hasUncollectedTypedSample: (samples) =>
    samples?.some((sample) => sample.sampleTypeId && !sample.sampleItemId) ||
    false,
}));

vi.mock("../../layout/Layout", () => ({
  NotificationContext: React.createContext({
    notificationVisible: false,
    setNotificationVisible: vi.fn(),
    addNotification: vi.fn(),
  }),
}));

vi.mock("../../common/CustomNotification", () => ({
  AlertDialog: () => null,
  NotificationKinds: { success: "success", error: "error" },
}));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: (...args) => request.get(...args),
  postToOpenElisServerJsonResponse: (...args) => request.post(...args),
}));

vi.mock("../OrderWorkflowLayout", () => ({
  default: ({
    children,
    onSave,
    onSaveAndNext,
    saveDisabled,
    showSaveButtons = true,
  }) => (
    <div>
      {children}
      {showSaveButtons && (
        <>
          <button onClick={onSave} disabled={saveDisabled}>
            Save QA step
          </button>
          <button onClick={onSaveAndNext} disabled={saveDisabled}>
            Confirm QA step
          </button>
        </>
      )}
    </div>
  ),
}));

import OrderQA from "./OrderQA";

const renderPage = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <OrderQA />
    </IntlProvider>,
  );

beforeEach(() => {
  context.samples = [
    { sampleTypeId: "21", sampleItemId: "7", sampleTypeName: "Blood" },
  ];
  context.saveOrder.mockClear();
  context.markStepComplete.mockClear();
  request.get.mockReset();
  request.post.mockReset();
  request.get.mockImplementation((_url, callback) =>
    callback({
      checklistItems: [{ itemKey: "identity", label: "Identity checked" }],
      verifiedItems: { identity: true },
    }),
  );
  request.post.mockImplementation((_url, _body, callback) =>
    callback({ success: true, allRequiredVerified: true }),
  );
});

test("QA cannot write while a typed request lacks a physical tube", async () => {
  context.samples = [{ sampleTypeId: "21", sampleItemId: "" }];
  renderPage();

  expect(
    await screen.findByRole("button", { name: "Save QA step" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Confirm QA step" }),
  ).toBeDisabled();
  expect(request.post).not.toHaveBeenCalled();
  expect(context.saveOrder).not.toHaveBeenCalled();
});

test("QA saves its checklist without rewriting an already collected tube", async () => {
  renderPage();

  fireEvent.click(await screen.findByRole("button", { name: "Save QA step" }));

  await vi.waitFor(() => expect(request.post).toHaveBeenCalledTimes(1));
  expect(request.post.mock.calls[0][0]).toBe("/rest/qa-checklist");
  expect(context.saveOrder).not.toHaveBeenCalled();
  await vi.waitFor(() =>
    expect(context.markStepComplete).toHaveBeenCalledWith("qa"),
  );
});
