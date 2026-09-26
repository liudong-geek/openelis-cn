import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../languages/en.json";
import OrderStepper from "./OrderStepper";

const orderContextState = vi.hoisted(() => ({
  samples: [],
  labNumber: "LAB-100",
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

const CurrentRoute = () => {
  const location = useLocation();
  return (
    <output data-testid="intake-destination">
      {JSON.stringify({ pathname: location.pathname, state: location.state })}
    </output>
  );
};

const renderStepper = (props = {}) =>
  render(
    <MemoryRouter initialEntries={["/order/enter"]}>
      <IntlProvider locale="en" messages={messages}>
        <OrderStepper currentStep={0} {...props} />
        <CurrentRoute />
      </IntlProvider>
    </MemoryRouter>,
  );

describe("OrderStepper", () => {
  beforeEach(() => {
    orderContextState.samples = [];
    orderContextState.labNumber = "LAB-100";
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

  test.each([
    [[{ sampleItemId: "1", sortOrder: 1 }], "LAB-100.1"],
    [
      [
        { sampleItemId: "1", sortOrder: 1 },
        { sampleItemId: "2", sortOrder: 2 },
      ],
      "LAB-100",
    ],
    [[{ sampleItemId: "1" }], "LAB-100"],
  ])(
    "acceptance navigates to the scan workspace without guessing a tube",
    (samples, code) => {
      orderContextState.samples = samples;
      orderContextState.stepProgress.enter = true;
      orderContextState.storageSkipped = true;
      renderStepper({ currentStep: 2 });
      fireEvent.click(screen.getAllByRole("button")[3]);
      expect(
        JSON.parse(screen.getByTestId("intake-destination").textContent),
      ).toEqual({
        pathname: "/order/collect",
        state: { specimenIntakeCode: code },
      });
    },
  );

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
