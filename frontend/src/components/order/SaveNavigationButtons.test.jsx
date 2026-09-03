import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import messages from "../../languages/zh_CN.json";
import { OrderContext } from "./OrderContext";
import SaveNavigationButtons from "./SaveNavigationButtons";

const renderButtons = (props) =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh-CN" messages={messages}>
        <OrderContext.Provider
          value={{
            isSubmitting: false,
            isReadOnly: false,
            isEditMode: false,
            saveOrder: vi.fn(),
          }}
        >
          <SaveNavigationButtons {...props} />
        </OrderContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

describe("SaveNavigationButtons", () => {
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
