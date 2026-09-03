import { pushWithListContext } from "../../common/listWorkspace";
import React, { useContext, useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import { useIntl } from "react-intl";
import { Stack, Button } from "@carbon/react";
import { ArrowLeft, WarningAlt } from "@carbon/icons-react";
import OrderWorkflowLayout from "../OrderWorkflowLayout";
import OrderTaskStartState from "../OrderTaskStartState";
import { useOrderContext } from "../OrderContext";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { getFromOpenElisServer } from "../../utils/Utils";
import {
  getPendingRequests,
  convertRequestsToSamples,
} from "../api/sampleTypeRequestApi";
import RequestedTestsSection from "./sections/RequestedTestsSection";
import SamplesCollectionSection from "./sections/SamplesCollectionSection";
import ConsentAccordionSection from "./sections/ConsentAccordionSection";
import "../order-workflow.scss";

/**
 * OrderCollect - Step 2: Collect Sample
 *
 * Full implementation based on FRS and UI mockups.
 *
 * Sections:
 * 1. Requested Tests - Shows ordered tests with sample type assignment
 * 2. Samples - Collection details for each sample
 */

export const isFutureCollectionTimestamp = (sample, now = new Date()) => {
  if (!sample.collectionDate || !sample.collectionTime) return false;
  const collectionTime = new Date(
    `${sample.collectionDate}T${sample.collectionTime}:00`,
  );
  return !Number.isNaN(collectionTime.getTime()) && collectionTime > now;
};

const OrderCollect = () => {
  const intl = useIntl();
  const history = useHistory();
  const componentMounted = useRef(true);

  const {
    orderId,
    orderData,
    samples,
    setSamples,
    saveOrder,
    loadOrder,
    markStepComplete,
    isReadOnly,
    isEditMode,
    testSampleAssignments,
    assignTestToSample,
    removeTestFromSample,
    updateSampleCollectionDetails,
    setOrderData,
  } = useOrderContext();

  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  // Sample types from API
  const [sampleTypes, setSampleTypes] = useState([]);
  const [isLoadingSampleTypes, setIsLoadingSampleTypes] = useState(true);

  // Units of measure for sample collection
  const [unitOfMeasures, setUnitOfMeasures] = useState([]);

  // Pending sample type requests from Step 1
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Informed consent data
  const [consentData, setConsentData] = useState({
    consentGiven: false,
    consentFormReference: "",
    consentRecordedAt: "",
    consentRecordedBy: "",
  });

  // Initialize consent data from orderData (for edit scenarios)
  useEffect(() => {
    if (orderData?.sampleOrderItems) {
      const {
        consentGiven,
        consentFormReference,
        consentRecordedAt,
        consentRecordedBy,
      } = orderData.sampleOrderItems;
      if (consentGiven !== undefined) {
        setConsentData({
          consentGiven: consentGiven || false,
          consentFormReference: consentFormReference || "",
          consentRecordedAt: consentRecordedAt || "",
          consentRecordedBy: consentRecordedBy || "",
        });
      }
    }
  }, [
    orderData?.sampleOrderItems?.consentGiven,
    orderData?.sampleOrderItems?.consentFormReference,
    orderData?.sampleOrderItems?.consentRecordedAt,
    orderData?.sampleOrderItems?.consentRecordedBy,
  ]);

  // Fetch sample types and UOMs on mount
  useEffect(() => {
    componentMounted.current = true;
    setIsLoadingSampleTypes(true);

    getFromOpenElisServer("/rest/user-sample-types", (response) => {
      if (componentMounted.current && response) {
        setSampleTypes(response);
        setIsLoadingSampleTypes(false);
      }
    });

    // Fetch sample collection UOMs (type=SAMPLE_COLLECTION)
    getFromOpenElisServer("/rest/uom?type=SAMPLE_COLLECTION", (response) => {
      if (componentMounted.current && response) {
        setUnitOfMeasures(response);
      }
    });

    return () => {
      componentMounted.current = false;
    };
  }, []);

  // Load pending sample type requests when orderId is available
  useEffect(() => {
    const loadPendingRequests = async () => {
      if (!orderId || !componentMounted.current) return;

      // Only load if samples don't already have sampleItemIds (not yet collected)
      const hasSampleItemIds = samples.some((s) => s.sampleItemId);
      if (hasSampleItemIds) return;

      setIsLoadingRequests(true);
      try {
        const requests = await getPendingRequests(orderId);
        if (componentMounted.current && requests && requests.length > 0) {
          setPendingRequests(requests);
          // Convert pending requests to samples array for the UI
          const samplesFromRequests = convertRequestsToSamples(requests);
          // Merge with any existing sample data.
          // collectionDate/Time are intentionally NOT preserved from existing:
          // the backend stores the order entry date there, not an actual
          // collection date. SampleCollectionCard will auto-fill them to
          // today when they are empty. Only Step-2-specific fields (collector,
          // conditions, receivedDate/Time) are preserved.
          const mergedSamples = samplesFromRequests.map((reqSample, idx) => {
            const existing = samples[idx];
            if (existing && existing.sampleTypeId === reqSample.sampleTypeId) {
              return {
                ...reqSample,
                collectorId: existing.collectorId || reqSample.collectorId,
                collectionConditions:
                  existing.collectionConditions ||
                  reqSample.collectionConditions,
                receivedDate: existing.receivedDate || reqSample.receivedDate,
                receivedTime: existing.receivedTime || reqSample.receivedTime,
              };
            }
            return reqSample;
          });
          setSamples(mergedSamples);
        }
      } catch {
        // Failed to load pending requests
      } finally {
        if (componentMounted.current) {
          setIsLoadingRequests(false);
        }
      }
    };

    loadPendingRequests();
  }, [orderId]);

  // Track if we've already attempted to reload samples
  const hasAttemptedReload = useRef(false);

  // Reload order if samples don't have sampleItemId (needed for updates)
  // This handles the case where user navigates directly to this step
  useEffect(() => {
    const labNo = orderData?.sampleOrderItems?.labNo;
    const hasSampleItemIds = samples.some((s) => s.sampleItemId);
    const hasSamplesWithTypes = samples.some((s) => s.sampleTypeId);

    if (
      labNo &&
      !hasSampleItemIds &&
      hasSamplesWithTypes &&
      !hasAttemptedReload.current
    ) {
      // Samples exist but don't have sampleItemId - reload to get them
      hasAttemptedReload.current = true;
      loadOrder(labNo, false);
    }
  }, [orderData?.sampleOrderItems?.labNo, samples, loadOrder]);

  // Check if we have any tests ordered
  const hasOrderedTests = samples.some(
    (s) => (s.tests && s.tests.length > 0) || (s.panels && s.panels.length > 0),
  );

  const hasFutureCollectionTime = samples.some((sample) =>
    isFutureCollectionTimestamp(sample),
  );

  // A collection cannot move forward without both an ordered test and a typed
  // specimen. Informed consent remains advisory (FRS FR-5-001/FR-5-002).
  const canProceed =
    hasOrderedTests &&
    samples?.length > 0 &&
    samples.some((s) => s.sampleTypeId) &&
    !hasFutureCollectionTime;

  const hasLoadedOrder = Boolean(orderId || orderData?.sampleOrderItems?.labNo);

  if (!hasLoadedOrder) {
    return (
      <OrderWorkflowLayout
        currentStep={1}
        title="order.step.collect"
        showSaveButtons={false}
        showWorkflowProgress={false}
      >
        <OrderTaskStartState taskLabel="order.step.collect" />
      </OrderWorkflowLayout>
    );
  }

  const showFutureCollectionError = () => {
    addNotification({
      kind: NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "collect.sample.futureTime" }),
    });
    setNotificationVisible(true);
  };

  const getSaveErrorMessage = (error) => {
    const backendMessage = error?.message || "";
    if (/future/i.test(backendMessage)) {
      return intl.formatMessage({ id: "collect.sample.futureTime" });
    }
    if (/date.*valid|valid date/i.test(backendMessage)) {
      return intl.formatMessage({ id: "collect.sample.invalidDate" });
    }
    return backendMessage && backendMessage !== "Failed to save order"
      ? backendMessage
      : intl.formatMessage({ id: "server.error.msg" });
  };

  const handleSave = async () => {
    if (hasFutureCollectionTime) {
      showFutureCollectionError();
      return;
    }
    try {
      await saveOrder();
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "save.order.success.msg" }),
      });
      setNotificationVisible(true);
    } catch (error) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: getSaveErrorMessage(error),
      });
      setNotificationVisible(true);
    }
  };

  const handleSaveAndNext = async () => {
    if (hasFutureCollectionTime) {
      showFutureCollectionError();
      return;
    }
    try {
      await saveOrder();
      markStepComplete("collect");
      pushWithListContext(history, "/order/label");
    } catch (error) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: getSaveErrorMessage(error),
      });
      setNotificationVisible(true);
    }
  };

  const handleConsentChange = (updatedConsent) => {
    setConsentData(updatedConsent);

    // Sync consent data with orderData.sampleOrderItems for backend persistence
    setOrderData({
      ...orderData,
      sampleOrderItems: {
        ...orderData.sampleOrderItems,
        consentGiven: updatedConsent.consentGiven,
        consentFormReference: updatedConsent.consentFormReference,
        consentRecordedAt: updatedConsent.consentRecordedAt,
        consentRecordedBy: updatedConsent.consentRecordedBy,
      },
    });
  };

  return (
    <OrderWorkflowLayout
      currentStep={1}
      title="order.step.collect"
      canProceed={canProceed}
      onSave={handleSave}
      onSaveAndNext={handleSaveAndNext}
      blockingReasons={[
        ...(!hasOrderedTests ? ["collect.noTestsWarning.title"] : []),
        ...(hasFutureCollectionTime ? ["collect.sample.futureTime"] : []),
      ]}
    >
      {notificationVisible && <AlertDialog />}

      {!hasOrderedTests ? (
        <section className="order-blocked-state" role="status">
          <span className="order-blocked-state__icon" aria-hidden="true">
            <WarningAlt size={28} />
          </span>
          <div className="order-blocked-state__copy">
            <h3>
              {intl.formatMessage({ id: "collect.noTestsWarning.title" })}
            </h3>
            <p>
              {intl.formatMessage({ id: "collect.noTestsWarning.subtitle" })}
            </p>
          </div>
          <Button
            kind="primary"
            renderIcon={ArrowLeft}
            onClick={() => pushWithListContext(history, "/order/enter")}
          >
            {intl.formatMessage({ id: "order.step.enter" })}
          </Button>
        </section>
      ) : (
        <Stack gap={6} className="order-collect-sections">
          <RequestedTestsSection
            samples={samples}
            setSamples={setSamples}
            testSampleAssignments={testSampleAssignments}
            assignTestToSample={assignTestToSample}
            removeTestFromSample={removeTestFromSample}
            sampleTypes={sampleTypes}
            isReadOnly={isReadOnly && !isEditMode}
          />

          <ConsentAccordionSection
            consentData={consentData}
            onConsentChange={handleConsentChange}
            isReadOnly={isReadOnly && !isEditMode}
          />

          <SamplesCollectionSection
            samples={samples}
            setSamples={setSamples}
            sampleTypes={sampleTypes}
            unitOfMeasures={unitOfMeasures}
            updateSampleCollectionDetails={updateSampleCollectionDetails}
            isReadOnly={isReadOnly && !isEditMode}
          />
        </Stack>
      )}
    </OrderWorkflowLayout>
  );
};

export default OrderCollect;
