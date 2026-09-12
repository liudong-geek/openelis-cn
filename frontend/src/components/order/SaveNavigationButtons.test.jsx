import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, Route } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import messages from "../../languages/zh_CN.json";
import { OrderContext } from "./OrderContext";
import SaveNavigationButtons from "./SaveNavigationButtons";

const renderButtons = (props, context = {}, showPath = false) =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh-CN" messages={messages}>
        <OrderContext.Provider
          value={{
            isSubmitting: false,
            isReadOnly: false,
            isEditMode: false,
            saveOrder: vi.fn(),
            ...context,
          }}
        >
          <SaveNavigationButtons {...props} />
        </OrderContext.Provider>
      </IntlProvider>
      {showPath && (
        <Route
          render={({ location }) => (
            <output aria-label="模拟当前路径">{location.pathname}</output>
          )}
        />
      )}
    </MemoryRouter>,
  );

describe("SaveNavigationButtons", () => {
  test.each([
    {
      currentStep: 2,
      forwardLabel: "button.save.nextStep",
      previousPath: "/order/collect",
    },
    {
      currentStep: 3,
      forwardLabel: "button.completeStep",
      previousPath: "/order/label",
    },
  ])(
    "saveDisabled blocks progress and $forwardLabel actions but allows back at step $currentStep",
    ({ currentStep, forwardLabel, previousPath }) => {
      const onSave = vi.fn();
      const onSaveAndNext = vi.fn();
      const saveOrder = vi.fn();
      renderButtons(
        {
          currentStep,
          canProceed: true,
          saveDisabled: true,
          onSave,
          onSaveAndNext,
        },
        { saveOrder },
        true,
      );
      const save = screen.getByRole("button", {
        name: messages["button.save.currentStep"],
      });
      const forwardName = messages[forwardLabel].replace(
        "{step}",
        messages["order.step.qa"],
      );
      const forward = screen.getByRole("button", { name: forwardName });
      const back = screen.getByRole("button", {
        name: messages["back.action.button"],
      });
      expect(save).toBeDisabled();
      expect(forward).toBeDisabled();
      expect(back).toBeEnabled();
      fireEvent.click(save);
      fireEvent.click(forward);
      expect(onSave).not.toHaveBeenCalled();
      expect(onSaveAndNext).not.toHaveBeenCalled();
      expect(saveOrder).not.toHaveBeenCalled();
      fireEvent.click(back);
      expect(screen.getByLabelText("模拟当前路径")).toHaveTextContent(
        previousPath,
      );
      expect(onSave).not.toHaveBeenCalled();
      expect(onSaveAndNext).not.toHaveBeenCalled();
      expect(saveOrder).not.toHaveBeenCalled();
    },
  );

  test("unconfirmed submitted state disables save and continue while retaining back navigation", () => {
    const onSave = vi.fn();
    renderButtons(
      { currentStep: 2, canProceed: true, onSave },
      { isSaveUnconfirmed: true },
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeEnabled();
    buttons.slice(1).forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(
      screen.getByRole("button", { name: messages["button.save.currentStep"] }),
    );
    expect(onSave).not.toHaveBeenCalled();
  });
  test("checklist saving locks navigation even without a whole-order submission", () => {
    renderButtons({ currentStep: 3, canProceed: true, isSaving: true });
    screen
      .getAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());
  });

  test("final step runs the completion handler instead of an ordinary save", () => {
    const onSave = vi.fn();
    const onComplete = vi.fn();

    renderButtons({
      currentStep: 3,
      canProceed: true,
      onSave,
      onSaveAndNext: onComplete,
    });

    fireEvent.click(screen.getByRole("button", { name: /完成.*验收/ }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("secondary save on the final step remains a progress-only save", () => {
    const onSave = vi.fn();
    const onComplete = vi.fn();

    renderButtons({
      currentStep: 3,
      canProceed: true,
      onSave,
      onSaveAndNext: onComplete,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: messages["button.save.currentStep"],
      }),
    );

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
