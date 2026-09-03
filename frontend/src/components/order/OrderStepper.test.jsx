import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../languages/en.json";
import OrderStepper from "./OrderStepper";

const orderContextState = vi.hoisted(() => ({
  samples: [],
  storageSkipped: false,
  stepProgress: {
    enter: false,
    collect: false,
    label: false,
    qa: false,
  },
}));

vi.mock("./OrderContext", () => ({
  useOrderContext: () => orderContextState,
}));

const renderStepper = (props = {}) =>
  render(
    <MemoryRouter initialEntries={["/order/enter"]}>
      <IntlProvider locale="en" messages={messages}>
        <OrderStepper currentStep={0} {...props} />
      </IntlProvider>
    </MemoryRouter>,
  );

describe("OrderStepper", () => {
  beforeEach(() => {
    orderContextState.samples = [];
    orderContextState.storageSkipped = false;
    orderContextState.stepProgress = {
      enter: false,
      collect: false,
      label: false,
      qa: false,
    };
  });

  test("shows the current task and locks later work until entry is saved", () => {
    renderStepper();

    expect(
      screen.getByRole("button", { name: /Enter Order Current task/i }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      screen.getByRole("button", {
        name: /Collect Complete earlier steps first/i,
      }),
    ).toBeDisabled();
  });

  test("unlocks collection after order entry is complete", () => {
    orderContextState.stepProgress.enter = true;
    const onStepClick = vi.fn();
    renderStepper({ onStepClick });

    const collectButton = screen.getByRole("button", {
      name: /Collect Available/i,
    });
    expect(collectButton).toBeEnabled();

    fireEvent.click(collectButton);
    expect(onStepClick).toHaveBeenCalledWith(1);
  });
});
