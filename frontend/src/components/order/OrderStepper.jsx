import { pushWithListContext } from "../common/listWorkspace";
import React from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Checkmark, Locked } from "@carbon/icons-react";
import { useIntl } from "react-intl";
import { useOrderContext } from "./OrderContext";

/**
 * OrderStepper - Progress indicator for the 4-step sample collection workflow.
 *
 * Shows completed/in-progress/pending states for:
 * - Step 0: Enter Order
 * - Step 1: Collect Sample
 * - Step 2: Label & Store
 * - Step 3: QA Review
 *
 * Step completion is based on:
 * - Enter: order has labNumber
 * - Collect: samples have sampleItemId
 * - Label: all samples have storage assigned OR storageSkipped is true
 * - QA: order is finalized
 */

const ORDER_STEPS = [
  { label: "order.step.enter", path: "/order/enter", key: "enter" },
  { label: "order.step.collect", path: "/order/collect", key: "collect" },
  { label: "order.step.label", path: "/order/label", key: "label" },
  { label: "order.step.qa", path: "/order/qa", key: "qa" },
];

const OrderStepper = ({ currentStep, onStepClick, className = "" }) => {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const { samples, storageSkipped, stepProgress } = useOrderContext();

  // Determine current step from URL if not provided
  const activeStep =
    currentStep !== undefined
      ? currentStep
      : ORDER_STEPS.findIndex((step) => location.pathname === step.path);

  // Calculate step completion based on actual data state
  const isStepComplete = (stepIndex) => {
    const stepKey = ORDER_STEPS[stepIndex]?.key;

    switch (stepKey) {
      case "enter":
        // A generated lab number alone is not enough. The step is complete
        // only after the validated order entry has been saved.
        return stepProgress?.enter || false;

      case "collect":
        // Collect is complete if all samples have sampleItemId
        return samples.length > 0 && samples.every((s) => s.sampleItemId);

      case "label": {
        // Label is complete if all samples have storage OR storage is skipped
        const allHaveStorage =
          samples.length > 0 && samples.every((s) => s.storageLocationId);
        return allHaveStorage || storageSkipped;
      }

      case "qa":
        // QA is complete based on stepProgress (set when order is finalized)
        return stepProgress?.qa || false;

      default:
        return false;
    }
  };

  const handleStepClick = (stepIndex) => {
    if (onStepClick) {
      onStepClick(stepIndex);
    } else {
      // Default behavior: navigate to the step's path
      pushWithListContext(history, ORDER_STEPS[stepIndex].path);
    }
  };

  const completionState = ORDER_STEPS.map((_, index) => isStepComplete(index));

  const canNavigateTo = (stepIndex) => {
    if (stepIndex <= activeStep) return true;
    return completionState.slice(0, stepIndex).every(Boolean);
  };

  return (
    <nav
      className={`order-stepper ${className}`}
      aria-label={intl.formatMessage({ id: "order.workflow.navigation" })}
    >
      <ol className="order-step-list">
        {ORDER_STEPS.map((step, index) => {
          const complete = completionState[index];
          const current = index === activeStep;
          const enabled = canNavigateTo(index);
          const statusId = current
            ? "order.step.status.current"
            : complete
              ? "order.step.status.complete"
              : enabled
                ? "order.step.status.pending"
                : "order.step.status.locked";

          return (
            <li
              key={step.path}
              className={`order-step-item ${complete ? "is-complete" : ""} ${current ? "is-current" : ""} ${!enabled ? "is-locked" : ""}`}
            >
              <button
                type="button"
                className="order-step-button"
                onClick={() => handleStepClick(index)}
                disabled={!enabled}
                aria-current={current ? "step" : undefined}
              >
                <span className="order-step-marker" aria-hidden="true">
                  {complete ? (
                    <Checkmark size={16} />
                  ) : !enabled ? (
                    <Locked size={14} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="order-step-copy">
                  <strong>{intl.formatMessage({ id: step.label })}</strong>
                  <small>{intl.formatMessage({ id: statusId })}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export { ORDER_STEPS };
export default OrderStepper;
