import React from "react";
import { Stack, Button, Tag, InlineLoading } from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import { useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ListReturnButton from "../common/ListReturnButton";
import OrderStepper, { ORDER_STEPS } from "./OrderStepper";
import OrderContextCard from "./OrderContextCard";
import BarcodeScannerBar from "./BarcodeScannerBar";
import SaveNavigationButtons from "./SaveNavigationButtons";
import { useOrderContext, SaveStatus } from "./OrderContext";
import "./order-workflow.scss";

/**
 * OrderWorkflowLayout - Shared layout wrapper for all 4 workflow steps.
 *
 * Provides consistent layout with:
 * - Breadcrumb navigation
 * - Barcode scanner bar (NAV-6)
 * - Progress stepper (NAV-3)
 * - Persistent order context card (Lab Number, Patient, Tests, Status)
 * - Save status indicator (Saved, Saving..., Unsaved changes)
 * - Edit mode toggle for read-only orders
 * - Main content area
 * - Save navigation buttons (NAV-4)
 */

const SaveStatusIndicator = () => {
  const intl = useIntl();
  const { saveStatus, isDirty, orderId, labNumber, orderData } =
    useOrderContext();
  const hasPersistedOrder = Boolean(
    orderId || labNumber || orderData?.sampleOrderItems?.labNo,
  );

  if (!hasPersistedOrder && !isDirty && saveStatus === SaveStatus.SAVED) {
    return null;
  }

  if (saveStatus === SaveStatus.SAVING) {
    return (
      <InlineLoading
        status="active"
        description={intl.formatMessage({
          id: "order.saveStatus.saving",
          defaultMessage: "Saving...",
        })}
        className="save-status-indicator"
      />
    );
  }

  if (saveStatus === SaveStatus.ERROR) {
    return (
      <Tag type="red" size="sm" className="save-status-indicator">
        <FormattedMessage
          id="order.saveStatus.error"
          defaultMessage="Save failed"
        />
      </Tag>
    );
  }

  if (isDirty || saveStatus === SaveStatus.UNSAVED) {
    return (
      <Tag type="gray" size="sm" className="save-status-indicator">
        <FormattedMessage
          id="order.saveStatus.unsaved"
          defaultMessage="Unsaved changes"
        />
      </Tag>
    );
  }

  return (
    <Tag type="green" size="sm" className="save-status-indicator">
      <FormattedMessage id="order.saveStatus.saved" defaultMessage="Saved" />
    </Tag>
  );
};

const OrderWorkflowLayout = ({
  children,
  currentStep,
  title,
  canProceed = true,
  onSave,
  onSaveAndNext,
  extraButtons,
  showSaveButtons = true,
  blockingReasons = [],
  showWorkflowProgress = true,
  showBarcodeScanner = true,
}) => {
  const intl = useIntl();
  const location = useLocation();
  const {
    isReadOnly,
    isEditMode,
    enableEditMode,
    labNumber,
    orderData,
    stepProgress,
    isDirty,
  } = useOrderContext();

  // Determine current step from URL if not provided
  const activeStep =
    currentStep !== undefined
      ? currentStep
      : ORDER_STEPS.findIndex((step) => location.pathname === step.path);

  const breadcrumbs = [
    { label: "home.label", link: "/" },
    { label: "sidenav.label.order.active", link: "/order" },
    {
      label: ORDER_STEPS[activeStep]?.label || "order.step.enter",
      link: ORDER_STEPS[activeStep]?.path || "/order/enter",
    },
  ];

  const handleOrderLoaded = () => {
    // Order loaded via barcode scan - context is already updated
  };

  const canEdit = isReadOnly && !isEditMode;
  const activeStepKey = ORDER_STEPS[activeStep]?.key;
  const isCurrentStepComplete = Boolean(
    activeStepKey && stepProgress?.[activeStepKey],
  );
  const isGuidanceReady = isCurrentStepComplete || canProceed;

  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <Stack gap={5}>
        <div className="order-workflow-container">
          {/* Header with title, save status, and edit button */}
          <div className="workflow-header">
            <div className="workflow-title-section">
              <div className="workflow-title-copy">
                {title && (
                  <h2 className="order-step-title">
                    {typeof title === "string" ? (
                      <FormattedMessage id={title} />
                    ) : (
                      title
                    )}
                  </h2>
                )}
                {showWorkflowProgress && (
                  <p className="order-step-subtitle">
                    <FormattedMessage
                      id={`order.step.${ORDER_STEPS[activeStep]?.key || "enter"}.description`}
                    />
                  </p>
                )}
              </div>
              <SaveStatusIndicator />
            </div>
            <div className="workflow-actions-section">
              <ListReturnButton
                fallback="/order"
                confirmLeave={isDirty && (!isReadOnly || isEditMode)}
              />
              {canEdit && (
                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={Edit}
                  onClick={enableEditMode}
                >
                  <FormattedMessage id="button.edit" defaultMessage="Edit" />
                </Button>
              )}
            </div>
          </div>

          {/* Read-only indicator banner */}
          {isReadOnly && !isEditMode && (
            <div className="readonly-banner">
              <FormattedMessage
                id="order.readonly.message"
                defaultMessage="This order is in read-only mode. Click Edit to make changes."
              />
            </div>
          )}

          {(showBarcodeScanner || showWorkflowProgress) && (
            <div
              className={`order-workflow-toolbar ${
                showBarcodeScanner && showWorkflowProgress
                  ? "order-workflow-toolbar--with-progress"
                  : showWorkflowProgress
                    ? "order-workflow-toolbar--progress-only"
                    : "order-workflow-toolbar--search-only"
              }`}
            >
              {showBarcodeScanner && (
                <BarcodeScannerBar
                  onOrderLoaded={handleOrderLoaded}
                  className="order-barcode-section"
                />
              )}
              {showWorkflowProgress && (
                <OrderStepper
                  currentStep={activeStep}
                  className="order-stepper-section"
                />
              )}
            </div>
          )}

          {showWorkflowProgress && (
            <section
              className={`order-step-guidance ${isGuidanceReady ? "is-ready" : "is-blocked"}`}
              aria-label={intl.formatMessage({ id: "order.guidance.title" })}
            >
              <div className="order-guidance-summary">
                <span className="order-guidance-eyebrow">
                  <FormattedMessage id="order.guidance.currentTask" />
                </span>
                <h3>
                  <FormattedMessage
                    id={ORDER_STEPS[activeStep]?.label || "order.step.enter"}
                  />
                </h3>
                <p>
                  <FormattedMessage
                    id={`order.step.${ORDER_STEPS[activeStep]?.key || "enter"}.description`}
                  />
                </p>
              </div>

              <div className="order-guidance-status" role="status">
                <strong>
                  <FormattedMessage
                    id={
                      isCurrentStepComplete
                        ? "order.guidance.completed"
                        : canProceed
                          ? "order.guidance.ready"
                          : "order.guidance.blocked"
                    }
                  />
                </strong>
                {isCurrentStepComplete ? (
                  <p>
                    <FormattedMessage id="order.guidance.completed.detail" />
                  </p>
                ) : canProceed ? (
                  <p>
                    <FormattedMessage
                      id="order.guidance.ready.next"
                      values={{
                        step: intl.formatMessage({
                          id:
                            ORDER_STEPS[activeStep + 1]?.label ||
                            "order.step.complete",
                        }),
                      }}
                    />
                  </p>
                ) : (
                  <ul>
                    {blockingReasons.map((reason) => (
                      <li key={reason}>
                        <FormattedMessage id={reason} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* Persistent Order Context Card */}
          {(labNumber || orderData?.sampleOrderItems?.labNo) && (
            <OrderContextCard className="order-context-section" />
          )}

          {/* Main Content Area */}
          <div
            className={`order-content-section ${isReadOnly && !isEditMode ? "readonly-mode" : ""}`}
          >
            {children}
          </div>

          {/* Save Navigation Buttons - NAV-4 */}
          {showSaveButtons && (
            <div className="order-navigation-section">
              {extraButtons && (
                <div className="order-extra-buttons">{extraButtons}</div>
              )}
              <SaveNavigationButtons
                currentStep={activeStep}
                canProceed={canProceed}
                onSave={onSave}
                onSaveAndNext={onSaveAndNext}
              />
            </div>
          )}
        </div>
      </Stack>
    </>
  );
};

export default OrderWorkflowLayout;
