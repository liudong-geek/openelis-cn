import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../languages/en.json";
import zhMessages from "../../languages/zh.json";
import zhCnMessages from "../../languages/zh_CN.json";
import OrderWorkflowLayout from "./OrderWorkflowLayout";

const orderContextState = vi.hoisted(() => ({
  isReadOnly: true,
  isEditMode: false,
  enableEditMode: vi.fn(),
  labNumber: "DEV-001",
  orderId: 1,
  orderData: {},
  saveStatus: "SAVED",
  isDirty: false,
  stepProgress: {
    enter: true,
    collect: true,
    label: true,
    qa: true,
  },
}));

vi.mock("./OrderContext", () => ({
  SaveStatus: {
    SAVING: "SAVING",
    ERROR: "ERROR",
    UNSAVED: "UNSAVED",
    SAVED: "SAVED",
  },
  useOrderContext: () => orderContextState,
}));

vi.mock("../common/PageBreadCrumb", () => ({ default: () => null }));
vi.mock("./OrderStepper", () => ({
  ORDER_STEPS: [
    { key: "enter", label: "order.step.enter", path: "/order/enter" },
    { key: "collect", label: "order.step.collect", path: "/order/collect" },
    { key: "label", label: "order.step.label", path: "/order/label" },
    { key: "qa", label: "order.step.qa", path: "/order/qa" },
  ],
  default: () => <div data-testid="order-stepper" />,
}));
vi.mock("./OrderContextCard", () => ({ default: () => null }));
vi.mock("./BarcodeScannerBar", () => ({
  default: () => <div data-testid="order-scanner" />,
}));
vi.mock("./SaveNavigationButtons", () => ({ default: () => null }));

const renderLayout = (props = {}) =>
  render(
    <MemoryRouter initialEntries={["/order/label"]}>
      <IntlProvider locale="en" messages={messages}>
        <OrderWorkflowLayout
          currentStep={2}
          title="order.step.label"
          canProceed={false}
          showSaveButtons={false}
          {...props}
        >
          <div>Label content</div>
        </OrderWorkflowLayout>
      </IntlProvider>
    </MemoryRouter>,
  );

describe("OrderWorkflowLayout guidance", () => {
  beforeEach(() => {
    orderContextState.isDirty = false;
    orderContextState.orderId = 1;
    orderContextState.labNumber = "DEV-001";
    orderContextState.orderData = {};
    orderContextState.saveStatus = "SAVED";
    orderContextState.stepProgress.label = true;
  });

  test("does not claim that a blank new request has already been saved", () => {
    orderContextState.orderId = null;
    orderContextState.labNumber = null;
    orderContextState.orderData = { sampleOrderItems: {} };

    renderLayout();

    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  test("standalone task entry keeps search but removes irrelevant wizard chrome", () => {
    renderLayout({ showWorkflowProgress: false });

    expect(screen.getByTestId("order-scanner")).toBeInTheDocument();
    expect(screen.queryByTestId("order-stepper")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Step guidance")).not.toBeInTheDocument();
  });

  test("new request can keep progress while removing the existing-request scanner", () => {
    renderLayout({ showBarcodeScanner: false });

    expect(screen.queryByTestId("order-scanner")).not.toBeInTheDocument();
    expect(screen.getByTestId("order-stepper")).toBeInTheDocument();
  });

  test("shows completed guidance for a saved completed step even when transient controls are empty", () => {
    renderLayout();

    expect(screen.getByText("This step is complete")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The saved order already meets the requirements for this step.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Required information is missing"),
    ).not.toBeInTheDocument();
  });

  test("keeps blocking guidance for an incomplete step", () => {
    orderContextState.stepProgress.label = false;
    renderLayout({ blockingReasons: ["order.requirement.test"] });

    expect(
      screen.getByText("Required information is missing"),
    ).toBeInTheDocument();
    expect(screen.queryByText("This step is complete")).not.toBeInTheDocument();
  });

  test("does not mark the current unsaved step complete from transient controls", () => {
    orderContextState.isDirty = true;
    orderContextState.stepProgress.label = false;
    renderLayout({ canProceed: true });

    expect(screen.getByText("Ready for the next step")).toBeInTheDocument();
    expect(
      screen.getByText("Saving will continue the order to QA Review."),
    ).toBeInTheDocument();
    expect(screen.queryByText("This step is complete")).not.toBeInTheDocument();
  });

  test("keeps completed guidance resources aligned in English and Chinese", () => {
    const guidanceKeys = [
      "order.guidance.title",
      "order.guidance.currentTask",
      "order.guidance.requirements",
      "order.guidance.ready",
      "order.guidance.completed",
      "order.guidance.completed.detail",
      "order.guidance.blocked",
      "order.guidance.ready.next",
    ];

    guidanceKeys.forEach((key) => {
      expect(messages[key]).toEqual(expect.any(String));
      expect(zhMessages[key]).toEqual(expect.any(String));
      expect(zhCnMessages[key]).toBe(zhMessages[key]);
      expect(zhMessages[key]).not.toBe(messages[key]);
    });

    const placeholders = (message) => message.match(/\{[^}]+\}/g) || [];
    expect(placeholders(zhMessages["order.guidance.ready.next"])).toEqual(
      placeholders(messages["order.guidance.ready.next"]),
    );
  });
});
