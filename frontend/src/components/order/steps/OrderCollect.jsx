import { pushWithListContext } from "../../common/listWorkspace";
import React, {
  useCallback,
  useContext,
  useState,
  useEffect,
  useRef,
} from "react";
import { useHistory } from "react-router-dom";
import { useIntl } from "react-intl";
import { Stack, Button, RadioButton, RadioButtonGroup } from "@carbon/react";
import { ArrowLeft, WarningAlt } from "@carbon/icons-react";
import OrderWorkflowLayout from "../OrderWorkflowLayout";
import SpecimenLookupPanel from "../SpecimenLookupPanel";
import { useOrderContext } from "../OrderContext";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { getFromOpenElisServer } from "../../utils/Utils";
import { getVerifiedServerClock } from "../api/serverClockApi";
import {
  getPendingRequests,
  convertRequestsToSamples,
} from "../api/sampleTypeRequestApi";
import RequestedTestsSection from "./sections/RequestedTestsSection";
import SamplesCollectionSection from "./sections/SamplesCollectionSection";
import ConsentAccordionSection from "./sections/ConsentAccordionSection";
import {
  hasPendingClockDefaults,
  hasInvalidReceiptPair,
  isFutureCollectionTimestamp,
  mergePendingCollectionSamples,
  refreshUntouchedCollectionClock,
} from "./collectionClock";
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

export { isFutureCollectionTimestamp } from "./collectionClock";

const OrderCollect = () => {
  const intl = useIntl();
  const history = useHistory();
  const componentMounted = useRef(true);
  const [lookupView, setLookupView] = useState(null);
  const [receiptMode, setReceiptMode] = useState("now");
  const [clockSnapshot, setClockSnapshot] = useState(null);
  const [clockLoading, setClockLoading] = useState(true);
  const clockRequest = useRef(0);
  const lastFormVisit = useRef(null);

  const {
    orderId,
    labNumber,
    orderData,
    samples,
    setSamples,
    saveOrder,
    isLoading,
    markStepComplete,
    isReadOnly,
    isEditMode,
    testSampleAssignments,
    assignTestToSample,
    removeTestFromSample,
    updateSampleCollectionDetails,
    setOrderData,
  } = useOrderContext();
  const formKey = `${orderId || ""}|${labNumber || orderData?.sampleOrderItems?.labNo || ""}`;
  const currentFormKey = useRef(formKey);
  currentFormKey.current = formKey;
  const serverClock =
    clockSnapshot?.formKey === formKey ? clockSnapshot.clock : null;
  const latestSamples = useRef(samples);
  latestSamples.current = samples;
  const latestSaveOrder = useRef(saveOrder);
  latestSaveOrder.current = saveOrder;

  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const refreshServerClock = useCallback(async () => {
    const request = ++clockRequest.current;
    setClockLoading(true);
    const clock = await getVerifiedServerClock();
    if (
      !componentMounted.current ||
      request !== clockRequest.current ||
      formKey !== currentFormKey.current
    )
      return null;
    setClockSnapshot({ formKey, clock });
    setClockLoading(false);
    return clock;
  }, [formKey]);

  useEffect(() => {
    return () => {
      clockRequest.current += 1;
    };
  }, []);

  // Sample types from API
  const [sampleTypes, setSampleTypes] = useState([]);
  const [isLoadingSampleTypes, setIsLoadingSampleTypes] = useState(true);

  // Units of measure for sample collection
  const [unitOfMeasures, setUnitOfMeasures] = useState([]);

  // Pending sample type requests from Step 1
  const [requestMapping, setRequestMapping] = useState({
    orderId: null,
    status: "idle",
  });
  const [requestRetry, setRequestRetry] = useState(0);

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
    let cancelled = false;
    const loadPendingRequests = async () => {
      if (!orderId || isLoading || !componentMounted.current) return;

      // Only load if samples don't already have sampleItemIds (not yet collected)
      const hasSampleItemIds = latestSamples.current.some(
        (s) => s.sampleItemId,
      );
      if (hasSampleItemIds) return;

      setRequestMapping({ orderId: String(orderId), status: "loading" });
      try {
        const requests = await getPendingRequests(orderId);
        if (!cancelled && componentMounted.current) {
          if (requests.length > 0) {
            const samplesFromRequests = convertRequestsToSamples(requests);
            setSamples((currentSamples) =>
              currentSamples.some((sample) => sample.sampleItemId)
                ? currentSamples
                : mergePendingCollectionSamples(
                    samplesFromRequests,
                    currentSamples,
                  ),
            );
          }
          setRequestMapping({ orderId: String(orderId), status: "ready" });
        }
      } catch {
        if (!cancelled && componentMounted.current)
          setRequestMapping({ orderId: String(orderId), status: "error" });
      }
    };

    loadPendingRequests();
    return () => {
      cancelled = true;
    };
  }, [orderId, isLoading, requestRetry]);

  const requestMappingNeeded =
    Boolean(orderId) && !samples.some((sample) => sample.sampleItemId);
  const requestMappingReady =
    !isLoading &&
    (!requestMappingNeeded ||
      (requestMapping.orderId === String(orderId) &&
        requestMapping.status === "ready"));
  const requestMappingFailed =
    requestMappingNeeded &&
    requestMapping.orderId === String(orderId) &&
    requestMapping.status === "error";

  // Check if we have any tests ordered
  const hasOrderedTests = samples.some(
    (s) => (s.tests && s.tests.length > 0) || (s.panels && s.panels.length > 0),
  );

  const pendingClockDefaults = hasPendingClockDefaults(samples, receiptMode);
  const invalidReceiptPair = hasInvalidReceiptPair(samples, receiptMode);

  // A collection cannot move forward without both an ordered test and a typed
  // specimen. Informed consent remains advisory (FRS FR-5-001/FR-5-002).
  const canProceed =
    hasOrderedTests &&
    samples?.length > 0 &&
    samples.some((s) => s.sampleTypeId) &&
    Boolean(serverClock) &&
    !clockLoading &&
    !pendingClockDefaults &&
    !invalidReceiptPair &&
    requestMappingReady;

  const hasLoadedOrder = Boolean(orderId);
  const showLookup = lookupView === null ? !hasLoadedOrder : lookupView;

  useEffect(() => {
    if (!hasLoadedOrder || showLookup) {
      lastFormVisit.current = null;
      return;
    }
    if (lastFormVisit.current === formKey) return;
    lastFormVisit.current = formKey;
    refreshServerClock();
  }, [formKey, hasLoadedOrder, refreshServerClock, showLookup]);

  const lookupPanel = (
    <SpecimenLookupPanel
      active={showLookup}
      canReturn={hasLoadedOrder}
      originalLabNo={labNumber || orderData?.sampleOrderItems?.labNo || ""}
      onViewChange={(nextView) => {
        if (nextView) {
          clockRequest.current += 1;
          setClockSnapshot(null);
          setClockLoading(false);
        }
        setLookupView(nextView);
      }}
    />
  );

  if (!hasLoadedOrder) {
    return (
      <OrderWorkflowLayout
        currentStep={1}
        title="order.step.collect"
        showSaveButtons={false}
        showWorkflowProgress={false}
        showBarcodeScanner={false}
      >
        {lookupPanel}
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

  const showServerClockError = () => {
    addNotification({
      kind: NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({
        id: "collect.sample.serverTimeUnavailable",
      }),
    });
    setNotificationVisible(true);
  };

  const confirmCollectionTime = async () => {
    if (!requestMappingReady) return null;
    const clock = await refreshServerClock();
    if (!clock) {
      showServerClockError();
      return null;
    }
    const frozenSamples = refreshUntouchedCollectionClock(
      latestSamples.current,
      clock,
      receiptMode,
    );
    if (
      hasPendingClockDefaults(frozenSamples, receiptMode) ||
      hasInvalidReceiptPair(frozenSamples, receiptMode)
    ) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "collect.sample.receiptPairRequired",
        }),
      });
      setNotificationVisible(true);
      return null;
    }
    if (
      frozenSamples.some((sample) => isFutureCollectionTimestamp(sample, clock))
    ) {
      showFutureCollectionError();
      return null;
    }
    return frozenSamples;
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
    const frozenSamples = await confirmCollectionTime();
    if (!frozenSamples) return;
    try {
      await latestSaveOrder.current(false, false, frozenSamples);
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
    const frozenSamples = await confirmCollectionTime();
    if (!frozenSamples) return;
    try {
      await latestSaveOrder.current(false, false, frozenSamples);
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
      saveDisabled={
        !serverClock ||
        clockLoading ||
        pendingClockDefaults ||
        invalidReceiptPair ||
        !requestMappingReady
      }
      showBarcodeScanner={false}
      showWorkflowProgress={!showLookup}
      showGuidance={!showLookup}
      showOrderContextCard={!showLookup}
      showEditAction={!showLookup}
      showReadOnlyBanner={!showLookup}
      showSaveStatus={!showLookup}
      showSaveButtons={!showLookup}
      onSave={handleSave}
      onSaveAndNext={handleSaveAndNext}
      blockingReasons={[
        ...(!hasOrderedTests ? ["collect.noTestsWarning.title"] : []),
        ...(!serverClock && !clockLoading
          ? ["collect.sample.serverTimeUnavailable"]
          : []),
        ...(serverClock && pendingClockDefaults
          ? ["collect.sample.timeDefaultsPending"]
          : []),
        ...(invalidReceiptPair ? ["collect.sample.receiptPairRequired"] : []),
        ...(!requestMappingReady
          ? [
              requestMappingFailed
                ? "collect.requests.unavailable"
                : "collect.requests.loading",
            ]
          : []),
      ]}
    >
      {lookupPanel}
      {!showLookup && (
        <>
          {notificationVisible && <AlertDialog />}

          {!requestMappingReady && (
            <div role={requestMappingFailed ? "alert" : "status"}>
              {intl.formatMessage({
                id: requestMappingFailed
                  ? "collect.requests.unavailable"
                  : "collect.requests.loading",
              })}
              {requestMappingFailed && (
                <Button
                  kind="ghost"
                  size="sm"
                  onClick={() => setRequestRetry((value) => value + 1)}
                >
                  {intl.formatMessage({ id: "button.retry" })}
                </Button>
              )}
            </div>
          )}

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
                  {intl.formatMessage({
                    id: "collect.noTestsWarning.subtitle",
                  })}
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
              {!serverClock && (
                <div role={clockLoading ? "status" : "alert"}>
                  {intl.formatMessage({
                    id: clockLoading
                      ? "collect.sample.serverTimeLoading"
                      : "collect.sample.serverTimeUnavailable",
                  })}
                  {!clockLoading && (
                    <Button kind="ghost" size="sm" onClick={refreshServerClock}>
                      {intl.formatMessage({ id: "button.retry" })}
                    </Button>
                  )}
                </div>
              )}
              <RequestedTestsSection
                samples={samples}
                setSamples={setSamples}
                testSampleAssignments={testSampleAssignments}
                assignTestToSample={assignTestToSample}
                removeTestFromSample={removeTestFromSample}
                sampleTypes={sampleTypes}
                isReadOnly={(isReadOnly && !isEditMode) || !requestMappingReady}
              />

              <ConsentAccordionSection
                consentData={consentData}
                onConsentChange={handleConsentChange}
                isReadOnly={(isReadOnly && !isEditMode) || !requestMappingReady}
              />

              <RadioButtonGroup
                name="collection-receipt-mode"
                legendText={intl.formatMessage({
                  id: "collect.sample.receiptMode",
                })}
                valueSelected={receiptMode}
                onChange={(value) => {
                  if (value !== "now" && value !== "later") return;
                  setReceiptMode(value);
                  if (value === "later")
                    setSamples((current) =>
                      current.map((sample) =>
                        sample.sampleItemId
                          ? sample
                          : { ...sample, receivedDate: "", receivedTime: "" },
                      ),
                    );
                }}
                disabled={(isReadOnly && !isEditMode) || !requestMappingReady}
              >
                <RadioButton
                  id="collection-receipt-now"
                  value="now"
                  labelText={intl.formatMessage({
                    id: "collect.sample.receiptNow",
                  })}
                />
                <RadioButton
                  id="collection-receipt-later"
                  value="later"
                  labelText={intl.formatMessage({
                    id: "collect.sample.receiptLater",
                  })}
                />
              </RadioButtonGroup>
              {requestMappingReady &&
                !pendingClockDefaults &&
                invalidReceiptPair && (
                  <p role="alert">
                    {intl.formatMessage({
                      id: "collect.sample.receiptPairRequired",
                    })}
                  </p>
                )}

              <SamplesCollectionSection
                samples={samples}
                setSamples={setSamples}
                sampleTypes={sampleTypes}
                unitOfMeasures={unitOfMeasures}
                updateSampleCollectionDetails={updateSampleCollectionDetails}
                serverClock={serverClock}
                refreshServerClock={refreshServerClock}
                clockLoading={clockLoading}
                receiptMode={receiptMode}
                isReadOnly={(isReadOnly && !isEditMode) || !requestMappingReady}
              />
            </Stack>
          )}
        </>
      )}
    </OrderWorkflowLayout>
  );
};

export default OrderCollect;
