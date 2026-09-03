import { pushWithListContext } from "../../common/listWorkspace";
import React, { useContext, useState, useEffect, useCallback } from "react";
import { useHistory } from "react-router-dom";
import { useIntl, FormattedMessage } from "react-intl";
import {
  Tile,
  Accordion,
  AccordionItem,
  StructuredListWrapper,
  StructuredListBody,
  StructuredListRow,
  StructuredListCell,
  Checkbox,
  InlineNotification,
  Tag,
  Loading,
} from "@carbon/react";
import { Checkmark } from "@carbon/icons-react";
import OrderWorkflowLayout from "../OrderWorkflowLayout";
import OrderTaskStartState from "../OrderTaskStartState";
import { useOrderContext } from "../OrderContext";
import { localizeSampleType } from "../sampleTypeIntl";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";

/**
 * OrderQA - Step 4: QA Review
 *
 * Final quality assurance review before order submission.
 * Shows complete order summary and QA checklist.
 * Checklist items are configured via Dictionary (category: QAChecklistItem).
 */

export const isQaChecklistComplete = (checklistItems, verifiedItems) =>
  checklistItems.length > 0 &&
  checklistItems.every((item) => verifiedItems[item.itemKey] === true);

const OrderQA = () => {
  const intl = useIntl();
  const history = useHistory();
  const {
    orderData,
    samples,
    saveOrder,
    resetOrder,
    labNumber,
    markStepComplete,
  } = useOrderContext();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  // Checklist items from Dictionary
  const [checklistItems, setChecklistItems] = useState([]);
  // Map of itemKey -> boolean for verification status
  const [verifiedItems, setVerifiedItems] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const displayLabNumber =
    labNumber || orderData?.sampleOrderItems?.labNo || "";

  // Load QA checklist config and status from backend on mount
  const loadChecklist = useCallback(() => {
    if (!displayLabNumber) {
      setIsLoading(false);
      return;
    }

    getFromOpenElisServer(
      `/rest/qa-checklist/by-lab-number/${displayLabNumber}`,
      (response) => {
        if (response && !response.error) {
          // Set checklist items from config
          if (
            response.checklistItems &&
            Array.isArray(response.checklistItems)
          ) {
            setChecklistItems(response.checklistItems);
          }
          // Set verified items state
          if (response.verifiedItems) {
            setVerifiedItems(response.verifiedItems);
          } else {
            // Initialize all items as unchecked
            const initialState = {};
            (response.checklistItems || []).forEach((item) => {
              initialState[item.itemKey] = false;
            });
            setVerifiedItems(initialState);
          }
        }
        setIsLoading(false);
      },
    );
  }, [displayLabNumber]);

  useEffect(() => {
    loadChecklist();
  }, [loadChecklist]);

  const handleChecklistChange = (itemKey) => {
    setVerifiedItems((prev) => ({
      ...prev,
      [itemKey]: !prev[itemKey],
    }));
  };

  // Check if all items are verified
  const isChecklistConfigured = checklistItems.length > 0;
  const allItemsComplete = isQaChecklistComplete(checklistItems, verifiedItems);

  // Save checklist to backend
  const saveChecklist = async () => {
    if (!displayLabNumber) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      postToOpenElisServerJsonResponse(
        "/rest/qa-checklist",
        JSON.stringify({
          labNumber: displayLabNumber,
          verifiedItems: verifiedItems,
        }),
        (response) => {
          if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || "Failed to save checklist"));
          }
        },
      );
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save order data first
      await saveOrder();
      // Then save checklist
      const checklistResponse = await saveChecklist();
      // Mark QA step complete if all checks are done
      if (allItemsComplete && checklistResponse?.allRequiredVerified === true) {
        markStepComplete("qa");
      }
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "save.order.success.msg" }),
      });
      setNotificationVisible(true);
    } catch (error) {
      console.error("Error saving QA checklist:", error);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
      setNotificationVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    try {
      if (!isChecklistConfigured) {
        throw new Error("QA_CHECKLIST_NOT_CONFIGURED");
      }
      if (!allItemsComplete) {
        throw new Error("QA_CHECKLIST_INCOMPLETE");
      }
      await saveOrder();
      const checklistResponse = await saveChecklist();
      if (checklistResponse?.allRequiredVerified !== true) {
        throw new Error("QA_CHECKLIST_INCOMPLETE");
      }
      markStepComplete("qa");
      setIsSubmitted(true);
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "order.submitted.success.msg",
          defaultMessage: "Order submitted successfully",
        }),
      });
      setNotificationVisible(true);
    } catch (error) {
      console.error("Error submitting order:", error);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
      setNotificationVisible(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartNewOrder = () => {
    resetOrder();
    pushWithListContext(history, "/order/enter");
  };

  const patientName = orderData?.patientProperties
    ? `${orderData.patientProperties.firstName || ""} ${orderData.patientProperties.lastName || ""}`.trim()
    : "---";
  const patientGender = orderData?.patientProperties?.gender;
  const patientGenderDisplay =
    patientGender === "M"
      ? intl.formatMessage({ id: "patient.male" })
      : patientGender === "F"
        ? intl.formatMessage({ id: "patient.female" })
        : patientGender || "---";

  // Get label for checklist item - use localizedName or label from dictionary
  const getItemLabel = (item) => {
    // China delivery seeds a localized operator label in localAbbreviation.
    // Keep localizedName as the fallback for installations using DB localization.
    return item.label || item.localizedName || item.itemKey;
  };

  if (!displayLabNumber) {
    return (
      <OrderWorkflowLayout
        currentStep={3}
        title="order.step.qa"
        showSaveButtons={false}
        showWorkflowProgress={false}
      >
        <OrderTaskStartState taskLabel="order.step.qa" />
      </OrderWorkflowLayout>
    );
  }

  if (isLoading) {
    return (
      <OrderWorkflowLayout
        currentStep={3}
        title="order.step.qa"
        showSaveButtons={false}
      >
        <Loading
          withOverlay={false}
          description={intl.formatMessage({ id: "loading.description" })}
        />
      </OrderWorkflowLayout>
    );
  }

  if (isSubmitted) {
    return (
      <OrderWorkflowLayout
        currentStep={3}
        title="order.step.qa"
        showSaveButtons={false}
      >
        <Tile className="qa-success-tile">
          <div className="success-content">
            <Checkmark size={48} className="success-icon" />
            <h3>
              <FormattedMessage
                id="order.submit.success"
                defaultMessage="Order Submitted Successfully"
              />
            </h3>
            <p>
              <FormattedMessage
                id="order.submit.success.labNumber"
                defaultMessage="Lab Number: {labNumber}"
                values={{ labNumber: displayLabNumber || "---" }}
              />
            </p>
            <button
              className="cds--btn cds--btn--primary"
              onClick={handleStartNewOrder}
            >
              <FormattedMessage
                id="order.start.new"
                defaultMessage="Start New Order"
              />
            </button>
          </div>
        </Tile>
      </OrderWorkflowLayout>
    );
  }

  return (
    <OrderWorkflowLayout
      currentStep={3}
      title="order.step.qa"
      canProceed={allItemsComplete}
      onSave={handleSave}
      onSaveAndNext={handleSubmit}
    >
      {notificationVisible && <AlertDialog />}
      {isSaving && (
        <Loading
          withOverlay
          description={intl.formatMessage({ id: "label.button.saving" })}
        />
      )}

      <div className="qa-review-container">
        {/* QA Checklist */}
        <Tile className="qa-checklist-tile">
          <h4>
            <FormattedMessage
              id="qa.checklist.title"
              defaultMessage="QA Checklist"
            />
          </h4>
          <p className="qa-checklist-instructions">
            <FormattedMessage
              id="qa.checklist.instructions"
              defaultMessage="Verify all items before submitting the order"
            />
          </p>

          <div className="qa-checklist-items">
            {!isChecklistConfigured && (
              <InlineNotification
                kind="error"
                title={intl.formatMessage({
                  id: "qa.checklist.notConfigured.title",
                  defaultMessage: "QA checklist is not configured",
                })}
                subtitle={intl.formatMessage({
                  id: "qa.checklist.notConfigured",
                  defaultMessage:
                    "Configure at least one QA control before this order can be submitted.",
                })}
                hideCloseButton
                lowContrast
              />
            )}
            {checklistItems.map((item) => (
              <Checkbox
                key={item.itemKey}
                id={`qa-${item.itemKey}`}
                labelText={getItemLabel(item)}
                checked={verifiedItems[item.itemKey] || false}
                onChange={() => handleChecklistChange(item.itemKey)}
                disabled={isSaving}
              />
            ))}
          </div>

          {isChecklistConfigured && !allItemsComplete && (
            <InlineNotification
              kind="warning"
              title={intl.formatMessage({
                id: "qa.checklist.incomplete",
                defaultMessage:
                  "Please complete all QA checks before submitting",
              })}
              hideCloseButton
              lowContrast
            />
          )}
        </Tile>

        {/* Order Summary */}
        <Accordion>
          <AccordionItem
            title={intl.formatMessage({
              id: "qa.summary.patient",
              defaultMessage: "Patient Information",
            })}
            open
          >
            <StructuredListWrapper isCondensed>
              <StructuredListBody>
                <StructuredListRow>
                  <StructuredListCell>
                    <FormattedMessage id="order.summary.patientName" />
                  </StructuredListCell>
                  <StructuredListCell>{patientName}</StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>
                    <FormattedMessage
                      id="patient.dob"
                      defaultMessage="Date of Birth"
                    />
                  </StructuredListCell>
                  <StructuredListCell>
                    {orderData?.patientProperties?.birthDateForDisplay || "---"}
                  </StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>
                    <FormattedMessage
                      id="patient.gender"
                      defaultMessage="Gender"
                    />
                  </StructuredListCell>
                  <StructuredListCell>
                    {patientGenderDisplay}
                  </StructuredListCell>
                </StructuredListRow>
              </StructuredListBody>
            </StructuredListWrapper>
          </AccordionItem>

          <AccordionItem
            title={intl.formatMessage({
              id: "qa.summary.samples",
              defaultMessage: "Samples & Tests",
            })}
            open
          >
            {samples && samples.length > 0 ? (
              samples.map((sample, index) => (
                <div key={index} className="qa-sample-item">
                  <Tag type="blue" size="sm">
                    {localizeSampleType(
                      intl,
                      sample.name || sample.sampleTypeName,
                    ) ||
                      intl.formatMessage(
                        {
                          id: "sample.number",
                          defaultMessage: "Sample {number}",
                        },
                        { number: index + 1 },
                      )}
                  </Tag>
                  <ul className="qa-test-list">
                    {sample.tests?.map((test, testIndex) => (
                      <li key={testIndex}>{test.name}</li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p>
                <FormattedMessage
                  id="qa.summary.noSamples"
                  defaultMessage="No samples added"
                />
              </p>
            )}
          </AccordionItem>

          <AccordionItem
            title={intl.formatMessage({
              id: "qa.summary.order",
              defaultMessage: "Order Details",
            })}
          >
            <StructuredListWrapper isCondensed>
              <StructuredListBody>
                <StructuredListRow>
                  <StructuredListCell>
                    <FormattedMessage id="order.summary.accessionNumber" />
                  </StructuredListCell>
                  <StructuredListCell>
                    {displayLabNumber || "---"}
                  </StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>
                    <FormattedMessage
                      id="sample.collection.date"
                      defaultMessage="Collection Date"
                    />
                  </StructuredListCell>
                  <StructuredListCell>
                    {samples?.[0]?.sampleXML?.collectionDate ||
                      orderData?.sampleOrderItems?.collectionDate ||
                      "---"}
                  </StructuredListCell>
                </StructuredListRow>
                <StructuredListRow>
                  <StructuredListCell>
                    <FormattedMessage
                      id="order.requester"
                      defaultMessage="Requester"
                    />
                  </StructuredListCell>
                  <StructuredListCell>
                    {orderData?.sampleOrderItems?.providerFirstName || ""}{" "}
                    {orderData?.sampleOrderItems?.providerLastName || "---"}
                  </StructuredListCell>
                </StructuredListRow>
              </StructuredListBody>
            </StructuredListWrapper>
          </AccordionItem>
        </Accordion>
      </div>
    </OrderWorkflowLayout>
  );
};

export default OrderQA;
