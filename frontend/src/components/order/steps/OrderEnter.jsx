import { pushWithListContext } from "../../common/listWorkspace";
import React, {
  useContext,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useHistory } from "react-router-dom";
import { useIntl, FormattedMessage } from "react-intl";
import {
  Grid,
  Column,
  Stack,
  TextInput,
  Button,
  Tile,
  ContentSwitcher,
  Switch,
  Accordion,
  AccordionItem,
  Checkbox,
  Tag,
  InlineNotification,
  InlineLoading,
} from "@carbon/react";
import { Printer } from "@carbon/icons-react";
import OrderWorkflowLayout from "../OrderWorkflowLayout";
import EntryRecoveryPanel from "../EntryRecoveryPanel";
import { useOrderContext } from "../OrderContext";
import { NotificationContext, ConfigurationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { getFromOpenElisServer } from "../../utils/Utils";
import PatientSearchSection from "./sections/PatientSearchSection";
import LocationSection from "./sections/LocationSection";
import ProgramSection from "./sections/ProgramSection";
import ClinicalInfoSection from "./sections/ClinicalInfoSection";
import RequesterSection from "./sections/RequesterSection";
import SampleTestSection from "./sections/SampleTestSection";
import "../order-workflow.scss";

const entryError = (errorKey) =>
  Object.assign(new Error(errorKey), { errorKey });
const validId = (value) =>
  (typeof value === "string" && /^[1-9]\d*$/.test(value)) ||
  (Number.isSafeInteger(value) && value > 0);

// Saving may fill the generated number and the newly created patient's ID.
// Everything else remains the user's submitted draft, not a new application.
const entryFingerprint = (data, samples) => {
  const {
    patientUpdateStatus,
    patientProperties = {},
    sampleOrderItems = {},
    ...rest
  } = data || {};
  const {
    patientPK,
    patientUpdateStatus: patientStatus,
    ...patient
  } = patientProperties;
  const { labNo, ...items } = sampleOrderItems;
  return JSON.stringify({
    ...rest,
    patientProperties: patient,
    sampleOrderItems: items,
    samples,
  });
};

/**
 * OrderEnter - Step 1: Enter Order (Clinical Workflow)
 *
 * Full implementation based on FRS v1.0 and UI mockups.
 *
 * Sections:
 * 1. Lab Number (auto-generate or manual) + Print Labels
 * 2. Sample Category Toggle (Clinical / Environmental)
 * 3. Patient Search (clinical) / Location (environmental)
 * 4. Program Selection with dynamic additional fields
 * 5. Clinical Information (diagnosis, payment status)
 * 6. Requester / Ordering Provider (site + provider search)
 * 7. Sample & Test Selection
 */

const OrderEnter = () => {
  const intl = useIntl();
  const history = useHistory();
  const componentMounted = useRef(true);
  const {
    orderData,
    setOrderData,
    samples,
    setSamples,
    labNumber,
    orderId,
    isSubmitting,
    isSaveUnconfirmed,
    unconfirmedLabNumber,
    markEntrySubmissionUnconfirmed,
    isEntryPatientReceipt,
    unconfirmedSubmissionId,
    saveOrderEntry, // Step 1 uses saveOrderEntry (creates sample_type_requests, not sample_items)
    markStepComplete,
    isReadOnly,
    isEditMode,
    entryRecovery,
  } = useOrderContext();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties } = useContext(ConfigurationContext);

  // Local state
  const localLabNumber = labNumber || orderData?.sampleOrderItems?.labNo || "";
  const [workflowType, setWorkflowType] = useState(
    orderData?.sampleOrderItems?.environmentalFields?.workflowType ||
      "clinical",
  ); // "clinical" | "environmental"
  const [labUnitConfig, setLabUnitConfig] = useState(null);
  const [isGeneratingLabNo, setIsGeneratingLabNo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [unconfirmedNumber, setUnconfirmedNumber] = useState("");
  const operation = useRef(null);
  const currentEntry = useRef(null);
  const [usesExternalLabNumber, setUsesExternalLabNumber] = useState(false);
  const [printLabelsExpanded, setPrintLabelsExpanded] = useState(false);
  const [errors, setErrors] = useState({});

  // Phone validation state for patient form
  const [phoneValidation, setPhoneValidation] = useState({
    primaryPhone: { body: "", status: true },
    contactPhone: { body: "", status: true },
  });

  currentEntry.current = {
    orderData,
    samples,
    orderId,
    localLabNumber,
    route: history.location,
    writable: !isReadOnly || isEditMode,
  };
  const ownsEntry = (pending) => {
    if (
      !componentMounted.current ||
      operation.current !== pending ||
      pending.cancelled
    )
      return false;
    const current = currentEntry.current;
    if (current.route !== pending.route || !current.writable) return false;
    if (pending.phase === "number") {
      return (
        current.orderData === pending.orderData &&
        current.samples === pending.samples &&
        current.orderId === pending.orderId
      );
    }
    if (
      entryFingerprint(current.orderData, current.samples) !==
      pending.fingerprint
    )
      return false;
    if (
      current.localLabNumber !== pending.labNo &&
      current.localLabNumber !== pending.originalLabNo
    )
      return false;
    const patientId = current.orderData?.patientProperties?.patientPK;
    if (
      pending.patientId &&
      String(patientId || "") !== pending.patientId &&
      !isEntryPatientReceipt?.(pending.labNo, pending.patientId, patientId)
    )
      return false;
    if (patientId) pending.patientId = String(patientId);
    if (
      pending.persistedId &&
      String(current.orderId || "") !== pending.persistedId
    )
      return false;
    if (current.orderId) pending.persistedId = String(current.orderId);
    return true;
  };
  // Permanently invalidate an in-flight operation, including A -> B -> A.
  useLayoutEffect(() => {
    const pending = operation.current;
    if (pending && !ownsEntry(pending)) {
      // A dispatched write cannot become retryable just because asynchronous
      // metadata (or another draft) changed. Keep its number available to query.
      if (pending.phase === "save") {
        pending.markUnknown?.();
        setUnconfirmed(true);
        setUnconfirmedNumber(pending.labNo);
      }
      pending.cancelled = true;
      pending.cancel?.();
      operation.current = null;
      setIsSaving(false);
      setIsGeneratingLabNo(false);
    }
  });
  useLayoutEffect(
    () => () => {
      componentMounted.current = false;
      const pending = operation.current;
      if (pending) {
        if (pending.phase === "save") pending.markUnknown?.();
        pending.cancelled = true;
        pending.cancel?.();
        operation.current = null;
      }
    },
    [],
  );

  // Sync workflow type from loaded order data (e.g., when editing existing order)
  useEffect(() => {
    const savedWorkflowType =
      orderData?.sampleOrderItems?.environmentalFields?.workflowType;
    if (savedWorkflowType && savedWorkflowType !== workflowType) {
      setWorkflowType(savedWorkflowType);
    }
  }, [orderData?.sampleOrderItems?.environmentalFields?.workflowType]);

  // Fetch lab unit configuration
  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer("/rest/labUnit/config", (response) => {
      if (componentMounted.current && response) {
        setLabUnitConfig(response);
        // Only set default workflow type from config if no saved workflow type exists
        // (i.e., this is a new order, not an edit)
        const savedWorkflowType =
          orderData?.sampleOrderItems?.environmentalFields?.workflowType;
        if (!savedWorkflowType) {
          if (response.workflowType === "Environmental") {
            setWorkflowType("environmental");
          } else if (response.workflowType === "Clinical") {
            setWorkflowType("clinical");
          }
          // If "Both", keep default "clinical"
        }
      }
    });
    return () => {
      componentMounted.current = false;
    };
  }, []);

  // Generate the number only when the user saves. The backend generator advances
  // the accession sequence, so generating on page load would create gaps for
  // abandoned drafts.
  const generateLabNumber = (pending) =>
    new Promise((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      let timer;
      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      pending.cancel = () => {
        finish(null, entryError("order.progress.requestChanged"));
        controller.abort();
      };
      timer = setTimeout(() => {
        finish(null, entryError("order.labNumber.generate.failed"));
        controller.abort();
      }, 15000);
      setIsGeneratingLabNo(true);
      try {
        getFromOpenElisServer(
          "/rest/SampleEntryGenerateScanProvider",
          (response) => {
            if (settled) return;
            if (!ownsEntry(pending)) {
              pending.cancel();
              return;
            }
            if (typeof response?.body !== "string" || !response.body.trim()) {
              finish(null, entryError("order.labNumber.generate.failed"));
              return;
            }
            finish(response.body.trim());
          },
          controller.signal,
        );
      } catch {
        finish(null, entryError("order.labNumber.generate.failed"));
      }
    });

  const ensureLabNumber = async (pending) => {
    if (typeof localLabNumber === "string" && localLabNumber.trim())
      return localLabNumber.trim();
    if (usesExternalLabNumber) {
      throw new Error(
        intl.formatMessage({ id: "order.blocker.externalLabNumber" }),
      );
    }
    return generateLabNumber(pending);
  };

  // Handle lab number change
  const handleLabNumberChange = (e) => {
    const newLabNo = e.target.value;
    setOrderData((prev) => ({
      ...prev,
      sampleOrderItems: {
        ...prev.sampleOrderItems,
        labNo: newLabNo,
      },
    }));
  };

  const environmentalSwitchBlocked =
    workflowType === "clinical" &&
    Boolean(
      orderData?.sampleOrderItems?.isEQASample ||
      ["patientPK", "lastName", "firstName", "nationalId"].some((field) =>
        String(orderData?.patientProperties?.[field] || "").trim(),
      ),
    );
  // Switching workflow must not silently carry a clinical patient into an
  // environment-only command or discard the clinical draft to make it fit.
  const handleWorkflowTypeChange = (index) => {
    if (index === 1 && environmentalSwitchBlocked) return;
    const newWorkflowType = index === 0 ? "clinical" : "environmental";
    setWorkflowType(newWorkflowType);

    // Persist workflow type to orderData for backend storage
    // For environmental samples, set patientUpdateStatus to NO_ACTION since there's no patient
    setOrderData((prev) => ({
      ...prev,
      // Set top-level patientUpdateStatus for backend
      patientUpdateStatus:
        newWorkflowType === "environmental"
          ? "NO_ACTION"
          : prev.patientUpdateStatus,
      patientProperties: {
        ...prev.patientProperties,
        // Also set inside patientProperties where backend reads it
        patientUpdateStatus:
          newWorkflowType === "environmental"
            ? "NO_ACTION"
            : prev.patientProperties?.patientUpdateStatus,
      },
      sampleOrderItems: {
        ...prev.sampleOrderItems,
        environmentalFields: {
          ...prev.sampleOrderItems?.environmentalFields,
          workflowType: newWorkflowType,
        },
      },
    }));
  };

  // Minimum data required before any save (including draft) is allowed.
  // Generating a lab number alone is not sufficient to persist an order.
  const envFields = orderData?.sampleOrderItems?.environmentalFields || {};
  const hasPatientOrSite =
    workflowType === "environmental"
      ? !!(envFields.samplingSiteId || envFields.samplingSiteName)
      : !!(
          orderData?.patientProperties?.lastName ||
          orderData?.patientProperties?.nationalId
        );
  const hasSampleTypes = samples.some((s) => s.sampleTypeId);
  const hasRequester = !!orderData?.sampleOrderItems?.referringSiteId;
  const hasRequestedTests = samples.some(
    (sample) =>
      (sample.tests && sample.tests.length > 0) ||
      (sample.panels && sample.panels.length > 0),
  );
  const canSave =
    !isGeneratingLabNo &&
    (!usesExternalLabNumber ||
      (typeof localLabNumber === "string" && !!localLabNumber.trim())) &&
    hasPatientOrSite &&
    hasRequester &&
    hasSampleTypes &&
    hasRequestedTests;

  // canProceed gates the Save / Save & Next buttons in the layout
  const canProceed =
    canSave &&
    Object.values(phoneValidation).every((item) => item.status !== false);

  const blockingReasons = [
    usesExternalLabNumber &&
      !localLabNumber &&
      "order.blocker.externalLabNumber",
    !hasPatientOrSite &&
      (workflowType === "environmental"
        ? "order.blocker.samplingSite"
        : "order.blocker.patient"),
    !hasRequester && "order.blocker.requester",
    !hasSampleTypes && "order.blocker.sampleType",
    hasSampleTypes && !hasRequestedTests && "order.blocker.test",
    !Object.values(phoneValidation).every((item) => item.status !== false) &&
      "order.blocker.validContact",
  ].filter(Boolean);

  const formatSaveError = (error) => {
    const errorKey = error?.details?.errorKey;
    if (errorKey?.startsWith("error.duplicate.")) {
      return intl.formatMessage({
        id: errorKey,
        defaultMessage:
          error?.message || "The patient identifier is already in use.",
      });
    }

    if (error?.errorKey) return intl.formatMessage({ id: error.errorKey });
    if (error?.message && error.message !== "Failed to save order") {
      return intl.formatMessage(
        {
          id: "order.save.failed.detail",
          defaultMessage: "The order could not be saved: {detail}",
        },
        { detail: error.message },
      );
    }

    return intl.formatMessage({ id: "server.error.msg" });
  };

  // All three entry points share one synchronous lock, including silent drafts.
  const submitEntry = async (mode) => {
    if (
      operation.current ||
      isSubmitting ||
      unconfirmed ||
      isSaveUnconfirmed ||
      (isReadOnly && !isEditMode)
    )
      return;
    if (!canProceed) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "order.save.incomplete",
          defaultMessage:
            "Please add a patient (or sampling site), and at least one sample type before saving.",
        }),
      });
      setNotificationVisible(true);
      return;
    }
    const pending = {
      ...currentEntry.current,
      originalLabNo: localLabNumber,
      fingerprint: entryFingerprint(orderData, samples),
      persistedId: orderId ? String(orderId) : "",
      patientId: orderData?.patientProperties?.patientPK
        ? String(orderData.patientProperties.patientPK)
        : "",
      phase: "number",
    };
    operation.current = pending;
    setIsSaving(true);
    try {
      const effectiveLabNumber = await ensureLabNumber(pending);
      if (!ownsEntry(pending)) return;
      pending.labNo = effectiveLabNumber;
      pending.phase = "save";
      pending.markUnknown = () =>
        markEntrySubmissionUnconfirmed?.(effectiveLabNumber);
      setIsGeneratingLabNo(false);
      setOrderData((prev) => ({
        ...prev,
        sampleOrderItems: {
          ...prev.sampleOrderItems,
          labNo: effectiveLabNumber,
        },
      }));
      // This bounds the UI wait, not the server transaction. A timeout must not
      // be treated as a failed write that is safe to send again.
      const result = await new Promise((resolve, reject) => {
        let settled = false;
        let timer;
        const finish = (value, error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(value);
        };
        pending.cancel = () =>
          finish(null, entryError("order.progress.requestChanged"));
        timer = setTimeout(() => {
          pending.markUnknown?.();
          finish(null, entryError("order.save.readbackUnconfirmed"));
        }, 30000);
        try {
          Promise.resolve(
            saveOrderEntry(mode === "draft", effectiveLabNumber),
          ).then(
            (value) => finish(value),
            (error) => finish(null, error),
          );
        } catch (error) {
          finish(null, error);
        }
      });
      if (!ownsEntry(pending)) return;
      if (
        result?.success !== true ||
        !validId(result.sampleId) ||
        (pending.persistedId && pending.persistedId !== String(result.sampleId))
      ) {
        throw entryError("order.save.readbackUnconfirmed");
      }
      if (mode === "next") {
        markStepComplete("enter");
        pushWithListContext(history, "/order/collect");
        return;
      }
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: mode === "draft" ? "order.saved.draft" : "save.order.success.msg",
        }),
      });
      setNotificationVisible(true);
    } catch (error) {
      if (!ownsEntry(pending)) return;
      // Explicit pre-submit/validation rejection is retryable. Once dispatched,
      // an unreadable or transport failure may already have created the order.
      const knownRejection =
        error?.errorKey !== "order.save.readbackUnconfirmed" &&
        (error?.errorKey === "order.save.incomplete" ||
          error?.errorKey === "security.sessionWriteBlocked" ||
          [400, 401, 403, 409, 422].includes(error?.status));
      const unknown = pending.phase === "save" && !knownRejection;
      if (unknown) {
        pending.markUnknown?.();
        setUnconfirmed(true);
        setUnconfirmedNumber(pending.labNo);
      }
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: unknown
          ? intl.formatMessage({ id: "order.save.readbackUnconfirmed" })
          : formatSaveError(error),
      });
      setNotificationVisible(true);
    } finally {
      if (operation.current === pending) {
        operation.current = null;
        if (componentMounted.current) {
          setIsSaving(false);
          setIsGeneratingLabNo(false);
        }
      }
    }
  };
  const handleSave = () => submitEntry("save");
  const handleSaveAndNext = () => submitEntry("next");
  const handleSaveAsDraft = () => submitEntry("draft");
  const savingBlocked =
    unconfirmed || isSaveUnconfirmed || Boolean(entryRecovery?.error);
  const savingInProgress = isSaving || isSubmitting;
  const inputsLocked =
    savingInProgress ||
    savingBlocked ||
    Boolean(orderId) ||
    (isReadOnly && !isEditMode);
  const numberToVerify = unconfirmedNumber || unconfirmedLabNumber;

  // Check if lab unit supports both workflow types
  const showWorkflowToggle =
    labUnitConfig?.workflowType === "Both" ||
    configurationProperties?.LAB_WORKFLOW_TYPE === "Both";

  return (
    <OrderWorkflowLayout
      currentStep={0}
      title="order.step.enter"
      showBarcodeScanner={false}
      canProceed={canProceed && !savingInProgress && !savingBlocked}
      isSaving={savingInProgress}
      saveDisabled={!canProceed || savingBlocked}
      showSaveStatus={!savingInProgress && !savingBlocked}
      showGuidance={!savingInProgress && !savingBlocked}
      onSave={handleSave}
      onSaveAndNext={handleSaveAndNext}
      blockingReasons={blockingReasons}
      extraButtons={
        <Button
          kind="tertiary"
          onClick={handleSaveAsDraft}
          size="md"
          disabled={!canProceed || inputsLocked || isSubmitting}
        >
          <FormattedMessage
            id="button.save.draft"
            defaultMessage="Save as Draft"
          />
        </Button>
      }
    >
      {notificationVisible && <AlertDialog />}
      <EntryRecoveryPanel />
      {orderId && (
        <InlineNotification
          kind="info"
          hideCloseButton
          lowContrast
          title={intl.formatMessage({ id: "order.entry.editUnavailable" })}
        />
      )}
      {savingInProgress && (
        <InlineLoading
          description={intl.formatMessage({ id: "order.saveStatus.saving" })}
        />
      )}
      {savingBlocked && (
        <InlineNotification
          kind="warning"
          hideCloseButton
          lowContrast
          title={intl.formatMessage({ id: "order.saveStatus.unconfirmed" })}
          subtitle={
            <>
              <p>
                {intl.formatMessage({ id: "order.save.readbackUnconfirmed" })}
              </p>
              {numberToVerify && (
                <p>
                  <FormattedMessage id="order.entry.number.title" />：
                  {numberToVerify}
                </p>
              )}
              {unconfirmedSubmissionId && (
                <p style={{ overflowWrap: "anywhere" }}>
                  <FormattedMessage
                    id="order.save.submissionReference"
                    defaultMessage="保存核对码"
                  />
                  ：{unconfirmedSubmissionId}
                </p>
              )}
            </>
          }
        />
      )}

      <fieldset
        disabled={inputsLocked}
        style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
      >
        <Stack gap={5} className="order-entry-sections">
          {/* Section 1: Lab Number */}
          <Tile className="order-section lab-number-section">
            <div className="order-section-heading order-section-heading--compact">
              <div className="order-section-heading__copy">
                <h4 className="section-title">
                  <FormattedMessage id="order.entry.number.title" />
                </h4>
                <p>
                  <FormattedMessage id="order.entry.number.helper" />
                </p>
              </div>
            </div>

            <div className="lab-number-master-data">
              <div className="lab-number-master-data__status">
                <Tag type={localLabNumber ? "green" : "blue"} size="sm">
                  <FormattedMessage
                    id={
                      localLabNumber
                        ? "order.labNumber.assigned"
                        : "order.labNumber.auto"
                    }
                  />
                </Tag>
                <strong>
                  {localLabNumber || (
                    <FormattedMessage id="order.labNumber.generatedOnSave" />
                  )}
                </strong>
              </div>

              {!labNumber && !isReadOnly && (
                <Checkbox
                  id="usesExternalLabNumber"
                  aria-label={intl.formatMessage({
                    id: "order.labNumber.useExternal",
                  })}
                  checked={usesExternalLabNumber}
                  labelText={intl.formatMessage({
                    id: "order.labNumber.useExternal",
                  })}
                  onChange={(_event, { checked }) => {
                    setUsesExternalLabNumber(checked);
                    if (!checked) {
                      setOrderData((prev) => ({
                        ...prev,
                        sampleOrderItems: {
                          ...prev.sampleOrderItems,
                          labNo: "",
                        },
                      }));
                    }
                  }}
                />
              )}

              {usesExternalLabNumber && !labNumber && (
                <div className="lab-number-field">
                  <TextInput
                    id="labNumber"
                    labelText={
                      <span>
                        <FormattedMessage
                          id="order.labNumber"
                          defaultMessage="Lab Number"
                        />
                        <span className="required-indicator"> *</span>
                      </span>
                    }
                    value={localLabNumber}
                    onChange={handleLabNumberChange}
                    placeholder={intl.formatMessage({
                      id: "order.labNumber.external.placeholder",
                    })}
                    disabled={isReadOnly}
                  />
                </div>
              )}

              <p className="helper-text">
                <FormattedMessage id="order.labNumber.masterData.helper" />
              </p>
            </div>

            {/* Printing is intentionally unavailable before a traceable number
              exists. Hiding the disabled control keeps the creation form
              focused on the data required to save the request. */}
            {localLabNumber && (
              <Accordion>
                <AccordionItem
                  title={
                    <span className="print-labels-title">
                      <Printer size={16} />
                      <FormattedMessage
                        id="order.printLabels"
                        defaultMessage="Print Labels"
                      />
                    </span>
                  }
                  open={printLabelsExpanded}
                  onHeadingClick={() =>
                    setPrintLabelsExpanded(!printLabelsExpanded)
                  }
                >
                  <div className="print-labels-content">
                    <p className="helper-text">
                      <FormattedMessage
                        id="order.printLabels.info"
                        defaultMessage="Labels can be printed here or from Step 3 (Label & Store)."
                      />
                    </p>
                    <div className="label-buttons">
                      <Button kind="tertiary" size="sm">
                        <FormattedMessage
                          id="label.order"
                          defaultMessage="Order Label"
                        />
                      </Button>
                      <Button kind="tertiary" size="sm" disabled>
                        <FormattedMessage
                          id="label.sample"
                          defaultMessage="Sample Label"
                        />
                      </Button>
                      <Button kind="tertiary" size="sm">
                        <FormattedMessage
                          id="label.slide"
                          defaultMessage="Slide Label"
                        />
                      </Button>
                      <Button kind="tertiary" size="sm">
                        <FormattedMessage
                          id="label.block"
                          defaultMessage="Block Label"
                        />
                      </Button>
                      <Button kind="tertiary" size="sm">
                        <FormattedMessage
                          id="label.freezer"
                          defaultMessage="Freezer Label"
                        />
                      </Button>
                    </div>
                  </div>
                </AccordionItem>
              </Accordion>
            )}
          </Tile>

          {/* Section 2: Sample Category Toggle */}
          {showWorkflowToggle && (
            <Tile className="order-section">
              <h4 className="section-title">
                <FormattedMessage
                  id="order.sampleCategory"
                  defaultMessage="Sample Category"
                />
              </h4>
              <ContentSwitcher
                onChange={({ index }) => handleWorkflowTypeChange(index)}
                selectedIndex={workflowType === "clinical" ? 0 : 1}
              >
                <Switch name="clinical">
                  <FormattedMessage
                    id="workflow.clinical"
                    defaultMessage="Clinical"
                  />
                </Switch>
                <Switch
                  name="environmental"
                  disabled={environmentalSwitchBlocked}
                >
                  <FormattedMessage
                    id="workflow.environmental"
                    defaultMessage="Environmental / Other"
                  />
                </Switch>
              </ContentSwitcher>
              <p className="helper-text">
                <FormattedMessage
                  id={
                    environmentalSwitchBlocked
                      ? "order.entry.workflowPatientConflict"
                      : "order.sampleCategory.helper"
                  }
                />
              </p>
            </Tile>
          )}

          {/* Section 3: Patient Search (Clinical) */}
          {workflowType === "clinical" && (
            <PatientSearchSection
              orderData={orderData}
              setOrderData={setOrderData}
              setPhoneValidation={setPhoneValidation}
              isReadOnly={inputsLocked}
            />
          )}

          {/* Section 3: Location (Environmental) */}
          {workflowType === "environmental" && (
            <LocationSection
              orderData={orderData}
              setOrderData={setOrderData}
              isReadOnly={inputsLocked}
            />
          )}

          {/* Section 6: Requester / Ordering Provider */}
          <RequesterSection
            orderData={orderData}
            setOrderData={setOrderData}
            isReadOnly={inputsLocked}
          />

          {/* Section 7: Sample & Test Selection */}
          <SampleTestSection
            samples={samples}
            setSamples={setSamples}
            orderData={orderData}
            setOrderData={setOrderData}
            isReadOnly={inputsLocked}
          />

          {/* Optional fields are intentionally kept after the required clinical
            path so routine requests are completed from top to bottom. */}
          <Tile className="order-section order-optional-details">
            <Accordion>
              <AccordionItem
                title={intl.formatMessage({
                  id: "order.entry.optional.title",
                })}
              >
                <p className="order-optional-details__helper">
                  <FormattedMessage id="order.entry.optional.helper" />
                </p>
                <div className="order-optional-sections">
                  <ProgramSection
                    orderData={orderData}
                    setOrderData={setOrderData}
                    isReadOnly={inputsLocked}
                  />
                  {workflowType === "clinical" && (
                    <ClinicalInfoSection
                      orderData={orderData}
                      setOrderData={setOrderData}
                      isReadOnly={inputsLocked}
                    />
                  )}
                </div>
              </AccordionItem>
            </Accordion>
          </Tile>
        </Stack>
      </fieldset>
    </OrderWorkflowLayout>
  );
};

export default OrderEnter;
