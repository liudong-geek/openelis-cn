import React, {
  createContext,
  useState,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useLocation } from "react-router-dom";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
  putToOpenElisServer,
} from "../utils/Utils";
import { ConfigurationContext } from "../layout/Layout";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import {
  getRequestsBySample,
  convertRequestsToSamples,
} from "./api/sampleTypeRequestApi";
import { SampleOrderFormValues } from "../formModel/innitialValues/OrderEntryFormValues";
import { convertIsoToBackendDate } from "./orderDateUtils";
import { entrySubmissionError, submitOrderEntry } from "./orderEntrySubmission";
import { isFirstEntry } from "./orderEntryReceipt";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";
import {
  readEntryCheckpoint,
  rememberEntryCheckpoint,
  forgetEntryCheckpoint,
  recoverEntrySubmission,
} from "./orderEntryRecovery";
import { isEntryInputRejection } from "./orderEntryReceipt";
import { recoverCurrentEntrySubmission } from "./orderEntryCurrent";
import { recoveredLabelIdentity, labelSessionReady } from "./recoveredLabels";
import { generateOrderLabels } from "./api/orderLabelApi";
import { hasPendingLabels, labelFailure } from "./labelCheckpoint";
import { buildRecoveredCollection, collectionRecoveryOptions, submitRecoveredCollection, verifyRecoveredCollection, freezeCollectionAttempt } from "./collectionRecovery";
import { postRecoveredCollection } from "./collectionTransport";
import { readCollectionCheckpoint, rememberCollectionCheckpoint, reconcileCollectionCheckpoint, forgetCollectionCheckpoint } from "./collectionCheckpoint";

/**
 * OrderContext - Shared state for the decoupled sample collection workflow.
 *
 * This context provides order state that persists across the 4 independent steps:
 * - Enter Order (/order/enter)
 * - Collect Sample (/order/collect)
 * - Label & Store (/order/label)
 * - QA Review (/order/qa)
 *
 * Features:
 * - Auto-save every 30 seconds on dirty forms
 * - Save status indicator (Saved, Saving..., Unsaved changes)
 * - Read-only mode for barcode-loaded orders with Edit toggle
 * - Browser navigation warning for unsaved changes
 */

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

const nonemptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;
const readSessionIdentity = (context) => {
  try {
    if (typeof context.getSessionIdentity === "function") {
      const identity = context.getSessionIdentity();
      return nonemptyString(identity) ? identity : null;
    }
    const details = context.userSessionDetails;
    return details?.authenticated === true &&
      nonemptyString(details.userId) &&
      nonemptyString(details.sessionId)
      ? JSON.stringify([details.userId, details.sessionId])
      : null;
  } catch {
    return null;
  }
};
const readSessionCheckGeneration = (context) => {
  if (typeof context.getSessionCheckGeneration !== "function") return undefined;
  try {
    const generation = context.getSessionCheckGeneration();
    return Number.isSafeInteger(generation) && generation >= 0
      ? generation
      : NaN;
  } catch {
    return NaN;
  }
};
const sessionAllowsWrite = (context, expectedIdentity, expectedGeneration) => {
  if (!expectedIdentity || readSessionIdentity(context) !== expectedIdentity)
    return false;
  if (
    expectedGeneration !== undefined &&
    readSessionCheckGeneration(context) !== expectedGeneration
  )
    return false;
  try {
    if (typeof context.isSessionWriteAllowed === "function")
      return (
        context.isSessionWriteAllowed(expectedIdentity, expectedGeneration) ===
        true
      );
    return (
      context.userSessionDetails?.authenticated === true &&
      nonemptyString(context.userSessionDetails.csrf) &&
      (!context.sessionPhase || context.sessionPhase === "authenticated")
    );
  } catch {
    return false;
  }
};
const sessionWriteBlocked = () =>
  entrySubmissionError("security.sessionWriteBlocked");

export const SaveStatus = {
  SAVED: "saved",
  SAVING: "saving",
  UNSAVED: "unsaved",
  ERROR: "error",
  UNCONFIRMED: "unconfirmed",
};

export const OrderContext = createContext({
  // Order identification
  orderId: null,
  labNumber: null,

  // Order data (form values)
  orderData: null,

  // Samples associated with the order
  samples: [],

  // Read-only mode (when order is loaded via barcode scan)
  isReadOnly: false,

  // Edit mode (user clicked Edit to modify read-only order)
  isEditMode: false,

  // Current step index (0-3)
  currentStep: 0,

  // Loading and submission states
  isLoading: false,
  isSubmitting: false,

  // Save status for auto-save indicator
  saveStatus: SaveStatus.SAVED,

  // Dirty flag for unsaved changes
  isDirty: false,

  // Error state
  error: null,

  // Step progress tracking
  stepProgress: {
    enter: false,
    collect: false,
    label: false,
    qa: false,
  },

  // Test-to-sample assignments (Step 2: Collect)
  testSampleAssignments: {},

  // Actions
  loadOrder: () => {},
  saveOrder: () => {},
  setCurrentStep: () => {},
  setOrderData: () => {},
  setSamples: () => {},
  resetOrder: () => {},
  enableEditMode: () => {},
  markStepComplete: () => {},
  // Test assignment actions (Step 2)
  assignTestToSample: () => {},
  removeTestFromSample: () => {},
  updateSampleCollectionDetails: () => {},
});

export const sampleObject = {
  index: 0,
  sampleItemId: "",
  sampleRejected: false,
  rejectionReason: "",
  sampleTypeId: "",
  sampleTypeName: "",
  sampleXML: null,
  panels: [],
  tests: [],
  requestReferralEnabled: false,
  referralItems: [],
  quantity: "",
  quantityUnit: "",
  collectionConditions: "",
  collectionDate: "",
  collectionTime: "",
  collectorId: "",
  receivedDate: "",
  receivedTime: "",
  receivedBy: "",
  hasNCE: false,
  nceId: "",
};

/**
 * Get current time formatted as HH:MM
 */
const getCurrentTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

/**
 * Initialize order data with minimal defaults.
 * Date fields will be populated from API response.
 */
const getInitialOrderData = () => {
  return {
    ...SampleOrderFormValues,
    // currentDate will be set from API
    currentDate: "",
    sampleOrderItems: {
      ...SampleOrderFormValues.sampleOrderItems,
      // The shared legacy editor template defaults to modified=true. This
      // workspace is a fresh application until a persisted ID is loaded.
      modified: false,
      // Date fields will be set from API
      requestDate: "",
      receivedDateForDisplay: "",
      receivedTime: getCurrentTime(),
      // paymentOptionSelection should be empty or a valid numeric string
      paymentOptionSelection: "",
    },
  };
};

export const OrderProvider = ({ children }) => {
  const location = useLocation();
  const sessionContext = useContext(UserSessionDetailsContext) || {};
  const latestSessionContext = useRef(sessionContext);
  latestSessionContext.current = sessionContext;
  const observedSessionIdentity = readSessionIdentity(sessionContext);
  const draftSessionIdentity = useRef(observedSessionIdentity);
  const sessionAutoSaveSuspended = useRef(false);
  const sessionPauseGeneration = useRef(0);
  const observedCheckGeneration = useRef(
    readSessionCheckGeneration(sessionContext),
  );
  const previousSessionWritable = useRef(false);
  const canWriteForSession = useCallback((identity, expectedGeneration) => {
    const generation = readSessionCheckGeneration(latestSessionContext.current);
    if (!Object.is(generation, observedCheckGeneration.current)) {
      observedCheckGeneration.current = generation;
      sessionAutoSaveSuspended.current = true;
      sessionPauseGeneration.current += 1;
    }
    const allowed =
      (generation === undefined || Number.isSafeInteger(generation)) &&
      sessionAllowsWrite(
        latestSessionContext.current,
        identity,
        expectedGeneration,
      );
    if (!allowed) {
      sessionAutoSaveSuspended.current = true;
      if (previousSessionWritable.current) sessionPauseGeneration.current += 1;
    }
    previousSessionWritable.current = allowed;
    return allowed;
  }, []);
  // Observe committed session transitions as well as checking synchronously at
  // each write. Recovery never grants permission to replay a paused draft.
  canWriteForSession(draftSessionIdentity.current);
  const assertSessionWrite = useCallback(
    (identity, generation) => {
      if (!canWriteForSession(identity, generation))
        throw sessionWriteBlocked();
    },
    [canWriteForSession],
  );
  const canContinueSessionSave = useCallback(
    (operation) => {
      const allowed = canWriteForSession(
        operation.sessionIdentity,
        operation.sessionCheckGeneration,
      );
      if (
        operation.sessionInterrupted ||
        !allowed ||
        operation.sessionPauseGeneration !== sessionPauseGeneration.current ||
        !Object.is(
          operation.sessionCheckGeneration,
          readSessionCheckGeneration(latestSessionContext.current),
        )
      ) {
        // Recovery can authorize a NEW manual operation, never the remainder of
        // one that crossed an unverified interval.
        operation.sessionInterrupted = true;
        sessionAutoSaveSuspended.current = true;
        return false;
      }
      return true;
    },
    [canWriteForSession],
  );
  const confirmManualSessionSave = useCallback(
    (operation, silent) => {
      if (!silent && canContinueSessionSave(operation))
        sessionAutoSaveSuspended.current = false;
    },
    [canContinueSessionSave],
  );
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const backendDateLocale =
    configurationProperties.DEFAULT_DATE_LOCALE || "en-US";
  const [orderId, setOrderId] = useState(null);
  const confirmedEntry = useRef(null);
  const [entryRecovery, setEntryRecovery] = useState(readEntryCheckpoint);
  const recoveredEntry = useRef(null);
  const activeRecoveredCollection = useRef(null);
  const activeRecoveredLabels = useRef(null);
  const recoveredLabelOperation = useRef(null);
  // Latch interruption during rendering too: a later return to the same account
  // must not revive a PDF or operation from before a failed session check.
  recoveredLabelOperation.current?.isCurrent();
  const pendingRecoveredCollection = useRef(null);
  const recoverySequence = useRef(0);
  const [labNumber, setLabNumber] = useState(null);
  const [orderData, setOrderDataState] = useState(getInitialOrderData);
  const [samples, setSamplesState] = useState([sampleObject]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState(SaveStatus.SAVED);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState(null);
  const [stepProgress, setStepProgress] = useState({
    enter: false,
    collect: false,
    label: false,
    qa: false,
  });

  const currentSaveBlocked = useRef(false);
  currentSaveBlocked.current = isReadOnly && !isEditMode;
  const progressReadSequence = useRef(0);
  // A lifecycle is invalidated synchronously when another request starts loading,
  // even when navigation eventually returns to the same accession number.
  const requestEpoch = useRef(0);
  const activeLoad = useRef(null);
  const activeSave = useRef(null);
  const activeIdentity = useRef("");
  const entryUnconfirmed = useRef(new Map());
  const latestEntryInput = useRef(null);
  latestEntryInput.current = JSON.stringify({
    orderData: {
      ...orderData,
      sampleOrderItems: { ...orderData?.sampleOrderItems, labNo: undefined },
    },
    samples,
  });
  const renderEntryInput = latestEntryInput.current;
  const isMounted = useRef(true);
  const currentLabNumber = labNumber || orderData?.sampleOrderItems?.labNo;
  const latestLabNumber = useRef(currentLabNumber);
  latestLabNumber.current = currentLabNumber;
  activeIdentity.current = `${orderId || ""}:${currentLabNumber || ""}`;
  const renderEpoch = requestEpoch.current;
  const renderIdentity = activeIdentity.current;
  useLayoutEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      interruptEntrySave();
      requestEpoch.current += 1;
      activeLoad.current = null;
      activeSave.current = null;
      progressReadSequence.current += 1;
    };
  }, []);

  // Separate save tokens prevent an old completion/finally from clearing the
  // busy state of a newer save. Already-sent requests are not rolled back.
  const beginSave = useCallback(
    (kind, entryLabNo) => {
      if (
        !isMounted.current ||
        renderEpoch !== requestEpoch.current ||
        renderEntryInput !== latestEntryInput.current ||
        (kind === "entry" &&
          latestLabNumber.current &&
          entryLabNo !== latestLabNumber.current) ||
        activeLoad.current
      ) {
        throw new Error("order.progress.requestChanged");
      }
      if (activeSave.current || activeRecoveredCollection.current || activeRecoveredLabels.current) throw new Error("order.progress.saveInProgress");
      if (readCollectionCheckpoint()) throw entrySubmissionError("order.collectionRecovery.unknown");
      const recovery = readEntryCheckpoint();
      if (recovery.error) throw entrySubmissionError(recovery.error);
      if (recovery.checkpoint)
        throw entrySubmissionError("order.save.readbackUnconfirmed");
      if (entryUnconfirmed.current.has(entryLabNo || currentLabNumber))
        throw entrySubmissionError("order.save.readbackUnconfirmed");
      if (unconfirmedWrite.current)
        throw entrySubmissionError("order.save.readbackUnconfirmed");
      if (currentSaveBlocked.current)
        throw new Error("Cannot save in read-only mode");
      const sessionIdentity = draftSessionIdentity.current;
      const sessionCheckGeneration = readSessionCheckGeneration(
        latestSessionContext.current,
      );
      assertSessionWrite(sessionIdentity, sessionCheckGeneration);
      const operation = {
        kind,
        labNo: entryLabNo,
        input: latestEntryInput.current,
        epoch: renderEpoch,
        sessionIdentity,
        sessionCheckGeneration,
        sessionInterrupted: false,
        sessionPauseGeneration: sessionPauseGeneration.current,
      };
      activeSave.current = operation;
      return operation;
    },
    [assertSessionWrite, renderEpoch, currentLabNumber, renderEntryInput],
  );
  const isCurrentSave = useCallback((operation) => {
    const current =
      isMounted.current &&
      !operation.invalidated &&
      activeSave.current === operation &&
      requestEpoch.current === operation.epoch &&
      draftSessionIdentity.current === operation.sessionIdentity &&
      readSessionIdentity(latestSessionContext.current) ===
        operation.sessionIdentity;
    if (
      current &&
      operation.kind === "entry" &&
      operation.input !== latestEntryInput.current
    ) {
      markEntryUnknown(operation);
      operation.cancel?.();
      return false;
    }
    return current;
  }, []);
  const finishSave = useCallback((operation) => {
    if (activeSave.current !== operation) return;
    activeSave.current = null;
    if (isMounted.current && requestEpoch.current === operation.epoch) {
      setIsSubmitting(false);
    }
  }, []);

  // EQA may be assigned to the server's configured control patient. Permit
  // only this already-verified operation's exact patient mapping, never a
  // general relaxation of the page's cross-patient guard.
  const isEntryPatientReceipt = useCallback((labNo, fromId, toId) => {
    const operation = activeSave.current;
    const receipt = operation?.verifiedReceipt;
    if (
      !receipt ||
      !operation.command ||
      operation.invalidated ||
      !isMounted.current ||
      requestEpoch.current !== operation.epoch ||
      readSessionIdentity(latestSessionContext.current) !==
        operation.sessionIdentity
    )
      return false;
    const sent = JSON.parse(operation.command.body);
    return (
      sent.sampleOrderItems.isEQASample === true &&
      receipt.labNumber === labNo &&
      String(sent.patientProperties?.patientPK || "") ===
        String(fromId || "") &&
      String(receipt.patientProperties?.patientPK || "") === String(toId || "")
    );
  }, []);

  // Storage assignment skipped flag (Label step)
  // Persisted to backend via /rest/order/storage-skipped endpoint
  const [storageSkipped, setStorageSkippedState] = useState(false);

  // Wrapper for setStorageSkipped - persists to backend
  const setStorageSkipped = useCallback(
    (value) => {
      setStorageSkippedState(value);

      if (labNumber) {
        const endpoint = `/rest/order/storage-skipped?labNumber=${encodeURIComponent(labNumber)}&storageSkipped=${value}`;
        putToOpenElisServer(endpoint, null, Function.prototype);
      }
    },
    [labNumber],
  );

  // Test-to-sample assignments for Step 2
  // Structure: { [testId]: { testId, testName, isPanel, assignedToSamples: [sampleIndex, ...] } }
  const [testSampleAssignments, setTestSampleAssignments] = useState({});

  const autoSaveTimerRef = useRef(null);
  const autoSaveSuspended = useRef(false);
  const unconfirmedWrite = useRef(false);
  const markEntryUnknown = useCallback((operation) => {
    if (
      operation?.kind !== "entry" ||
      !operation.labNo ||
      !operation.dispatched
    )
      return;
    // Keep the original opaque key/body in this workspace for explicit receipt
    // recovery. No clinical command is written to browser persistent storage.
    entryUnconfirmed.current.set(operation.labNo, {
      command: operation.command || null,
      sessionIdentity: operation.sessionIdentity,
      epoch: operation.epoch,
    });
    if (isMounted.current && activeSave.current === operation) {
      autoSaveSuspended.current = true;
      setIsDirty(true);
      setSaveStatus(SaveStatus.UNCONFIRMED);
      setError("order.save.readbackUnconfirmed");
    }
  }, []);
  const interruptEntrySave = useCallback(() => {
    const operation = activeSave.current;
    if (operation?.kind !== "entry") return;
    markEntryUnknown(operation);
    operation.cancel?.();
  }, [markEntryUnknown]);
  const markEntrySubmissionUnconfirmed = useCallback(
    (entryLabNo) => {
      const operation = activeSave.current;
      if (
        operation?.kind !== "entry" ||
        operation.epoch !== renderEpoch ||
        operation.labNo !== entryLabNo
      )
        return;
      operation.markUnknown?.();
    },
    [renderEpoch],
  );
  const lastSavedDataRef = useRef(null);

  /**
   * Wrapper for setOrderData that marks form as dirty
   */
  const setOrderData = useCallback(
    (newData) => {
      interruptEntrySave();
      setOrderDataState(newData);
      setIsDirty(true);
      setSaveStatus(SaveStatus.UNSAVED);
    },
    [interruptEntrySave],
  );

  /**
   * Wrapper for setSamples that marks form as dirty
   */
  const setSamples = useCallback(
    (newSamples) => {
      interruptEntrySave();
      setSamplesState(newSamples);
      setIsDirty(true);
      setSaveStatus(SaveStatus.UNSAVED);
    },
    [interruptEntrySave],
  );

  /**
   * Load an existing order by lab number (accession number).
   * Used when user scans a barcode or enters a lab number.
   * Loads in read-only mode by default (user must click Edit to modify).
   */
  const loadOrder = useCallback(
    async (searchLabNumber, readOnly = true) => {
      if (!isMounted.current)
        throw entrySubmissionError("order.progress.requestChanged");
      interruptEntrySave();
      const operation = { epoch: ++requestEpoch.current };
      activeLoad.current = operation;
      activeSave.current = null;
      const isCurrent = () =>
        isMounted.current && requestEpoch.current === operation.epoch;
      setIsSubmitting(false);
      setIsLoading(true);
      setError(null);

      return new Promise((resolve, reject) => {
        getFromOpenElisServer(
          `/rest/order/search?labNumber=${encodeURIComponent(searchLabNumber)}`,
          (response) => {
            if (!isCurrent()) {
              reject(entrySubmissionError("order.progress.requestChanged"));
              return;
            }
            activeLoad.current = null;
            setIsLoading(false);

            if (response && response.labNumber) {
              setOrderId(response.id);
              setLabNumber(response.labNumber);

              // Build order data by merging response fields with defaults
              // The backend returns patientProperties at top level and inside orderData
              const loadedOrderData = {
                ...SampleOrderFormValues,
                ...(response.orderData || {}),
                patientProperties: {
                  ...SampleOrderFormValues.patientProperties,
                  ...(response.patientProperties || {}),
                  ...(response.orderData?.patientProperties || {}),
                  // Keep patient status from response or default to NO_ACTION for subsequent saves
                  // Only set UPDATE when patient data has actually been modified
                  patientUpdateStatus:
                    response.patientProperties?.patientUpdateStatus ||
                    "NO_ACTION",
                },
                sampleOrderItems: {
                  ...SampleOrderFormValues.sampleOrderItems,
                  ...(response.sampleOrderItems || {}),
                  labNo: response.labNumber,
                },
              };

              setOrderDataState(loadedOrderData);

              // Load sample type requests if no sample_items exist (decoupled workflow)
              // This handles Step 1 edit where samples are stored as requests, not items
              const hasSampleItems =
                response.samples &&
                response.samples.length > 0 &&
                response.samples.some((s) => s.sampleItemId);

              if (!hasSampleItems && response.id) {
                // Try to load sample type requests
                getRequestsBySample(response.id)
                  .then((requests) => {
                    if (!isCurrent()) return;
                    if (requests && requests.length > 0) {
                      const samplesFromRequests =
                        convertRequestsToSamples(requests);
                      setSamplesState(samplesFromRequests);
                    } else {
                      setSamplesState(response.samples || [sampleObject]);
                    }
                  })
                  .catch(() => {
                    if (!isCurrent()) return;
                    setSamplesState(response.samples || [sampleObject]);
                  });
              } else {
                setSamplesState(response.samples || [sampleObject]);
              }

              setIsReadOnly(readOnly);
              setIsEditMode(false);
              setIsDirty(false);
              setSaveStatus(SaveStatus.SAVED);

              setStepProgress(
                response.stepProgress || {
                  enter: false,
                  collect: false,
                  label: false,
                  qa: false,
                },
              );

              // Load storageSkipped from backend response
              const savedStorageSkipped = response.storageSkipped === true;
              setStorageSkippedState(savedStorageSkipped);

              setError(null);
              lastSavedDataRef.current = JSON.stringify({
                orderData: loadedOrderData,
                samples: response.samples,
              });
              resolve(response);
            } else {
              const errorMsg = "Order not found";
              setError(errorMsg);
              reject(new Error(errorMsg));
            }
          },
        );
      });
    },
    [interruptEntrySave],
  );
  const queryEntryRecovery = useCallback(
    async (code, signal, currentState = false) => {
      if (activeSave.current || activeLoad.current || activeRecoveredCollection.current || activeRecoveredLabels.current)
        throw entrySubmissionError("order.progress.saveInProgress");
      const identity = readSessionIdentity(latestSessionContext.current);
      const generation = readSessionCheckGeneration(
        latestSessionContext.current,
      );
      assertSessionWrite(identity, generation);
      const checkpointState = readEntryCheckpoint();
      // A pending key must not be replaced by querying another operation.
      if (
        checkpointState.checkpoint &&
        checkpointState.checkpoint.submissionId !== code
      )
        throw entrySubmissionError("order.recovery.pendingMismatch");
      const reference = checkpointState.checkpoint || { submissionId: code };
      const epoch = requestEpoch.current;
      const input = latestEntryInput.current;
      const sequence = ++recoverySequence.current;
      const pauseGeneration = sessionPauseGeneration.current;
      recoveredEntry.current = null;
      const isAuthorized = () =>
        isMounted.current &&
        !signal?.aborted &&
        sequence === recoverySequence.current &&
        canWriteForSession(identity, generation) &&
        pauseGeneration === sessionPauseGeneration.current;
      const isCurrent = () =>
        isAuthorized() &&
        requestEpoch.current === epoch &&
        latestEntryInput.current === input &&
        !activeSave.current &&
        !activeLoad.current;
      const pending = [...entryUnconfirmed.current.values()].find(
        (item) => item.command?.submissionId === code,
      );
      const query = currentState
        ? recoverCurrentEntrySubmission
        : recoverEntrySubmission;
      const receipt = await query({
        reference,
        command: pending?.command,
        read: readOpenElisResponse,
        isCurrent,
        signal,
      });
      if (!isCurrent())
        throw entrySubmissionError("order.progress.requestChanged");
      if (currentState && pendingRecoveredCollection.current) {
        const pending = pendingRecoveredCollection.current;
        if (pending.submissionId !== code)
          throw entrySubmissionError("order.collectionRecovery.unknown");
        // REQUESTED is not proof that a timed-out write rolled back. Only a
        // matching persisted collection resolves an in-flight/unknown attempt.
        verifyRecoveredCollection(receipt, pending.command);
        pendingRecoveredCollection.current = null;
      }
      if (currentState) await reconcileCollectionCheckpoint(receipt, isCurrent);
      if (!isCurrent()) throw entrySubmissionError("order.progress.requestChanged");
      // Private authoritative snapshot; callers cannot authorize an arbitrary ID.
      recoveredEntry.current = { isCurrent, result: currentState ? JSON.parse(JSON.stringify(receipt)) : null, adopted: false, used: false };
      return JSON.parse(JSON.stringify(receipt));
    },
    [assertSessionWrite, canWriteForSession],
  );

  const queryCurrentEntryRecovery = useCallback(
    (code, signal) => queryEntryRecovery(code, signal, true),
    [queryEntryRecovery],
  );

  // Explicit adoption authorizes only this private current snapshot's collection
  // command. It never fills or unlocks the legacy editable order form.
  const adoptRecoveredCollection = useCallback((visible) => {
    const record = recoveredEntry.current;
    if (!record?.result || !record.isCurrent() || record.used || activeRecoveredCollection.current || activeRecoveredLabels.current || readCollectionCheckpoint() ||
        JSON.stringify(visible) !== JSON.stringify(record.result) || !collectionRecoveryOptions(record.result).length)
      throw entrySubmissionError("order.collectionRecovery.requery");
    record.adopted = true;
    return JSON.parse(JSON.stringify(record.result));
  }, []);

  const saveRecoveredCollection = useCallback(async (visible, selections) => {
    const record = recoveredEntry.current;
    if (!record?.adopted || record.used || !record.isCurrent() || activeRecoveredCollection.current || activeRecoveredLabels.current || readCollectionCheckpoint() ||
        JSON.stringify(visible) !== JSON.stringify(record.result))
      throw entrySubmissionError("order.collectionRecovery.requery");
    const command = buildRecoveredCollection(record.result, selections);
    const operation = {};
    activeRecoveredCollection.current = operation;
    record.used = true;
    pendingRecoveredCollection.current = { submissionId: record.result.receipt.submissionId, command };
    setIsSubmitting(true);
    const isCurrent = () => activeRecoveredCollection.current === operation &&
      recoveredEntry.current === record && record.isCurrent();
    let checkpoint, preparationTimer, dispatched = false;
    try {
      checkpoint = await Promise.race([
        (async () => {
          command.attempt = await freezeCollectionAttempt(command.body);
          if (!isCurrent()) throw entrySubmissionError("order.progress.requestChanged");
          return rememberCollectionCheckpoint(record.result.receipt.submissionId, command, isCurrent);
        })(),
        new Promise((_, reject) => { preparationTimer = setTimeout(() => reject(entrySubmissionError("order.collectionRecovery.unknown")), 10000); }),
      ]);
      clearTimeout(preparationTimer);
      await submitRecoveredCollection({ command, post: postRecoveredCollection, isCurrent, onDispatch: () => { dispatched = true; } });
      const next = await recoverCurrentEntrySubmission({
        reference: record.result.receipt, read: readOpenElisResponse, isCurrent,
      });
      verifyRecoveredCollection(next, command);
      if (!isCurrent()) throw entrySubmissionError("order.progress.requestChanged");
      await reconcileCollectionCheckpoint(next, isCurrent);
      if (!isCurrent()) throw entrySubmissionError("order.progress.requestChanged");
      pendingRecoveredCollection.current = null;
      record.result = JSON.parse(JSON.stringify(next));
      return JSON.parse(JSON.stringify(next));
    } catch (failure) {
      if (dispatched && failure.errorKey === "order.collectionRecovery.rejected" && isCurrent()) {
        // Only the exact active command's observed rollback can release its marker.
        // The private snapshot stays used: a fresh explicit read/adoption is required.
        forgetCollectionCheckpoint(checkpoint);
        pendingRecoveredCollection.current = null;
        throw entrySubmissionError("order.collectionRecovery.rejected");
      }
      if (!dispatched) {
        pendingRecoveredCollection.current = null;
        if (checkpoint) forgetCollectionCheckpoint(checkpoint);
      }
      // A dispatched operation never becomes safe to retry because its response
      // was lost or the operator changed. Another explicit current read is needed.
      throw entrySubmissionError(failure.errorKey === "order.progress.requestChanged"
        ? failure.errorKey : "order.collectionRecovery.unknown");
    } finally {
      clearTimeout(preparationTimer);
      if (activeRecoveredCollection.current === operation) {
        activeRecoveredCollection.current = null;
        if (isMounted.current) setIsSubmitting(false);
      }
    }
  }, []);

  const prepareRecoveredLabels = useCallback((visible) => {
    const record = recoveredEntry.current;
    if (!record?.result || !record.isCurrent() || activeRecoveredCollection.current || activeRecoveredLabels.current ||
        readCollectionCheckpoint() || !labelSessionReady(latestSessionContext.current) ||
        JSON.stringify(visible) !== JSON.stringify(record.result)) throw labelFailure("STALE");
    const identity = recoveredLabelIdentity(record.result);
    const snapshot = JSON.stringify(record.result);
    const barcodes = Object.fromEntries(identity.samples.map(tube =>
      [`specimen:${tube.sampleItemId}`, `${identity.labNumber}.${tube.sortOrder}`]));
    barcodes["order:"] = identity.labNumber;
    let valid = true;
    const capability = {
      ...identity,
      invalidate: () => { valid = false; },
      isCurrent: () => {
        valid = valid && recoveredLabelOperation.current === capability && recoveredEntry.current === record && record.isCurrent() &&
          JSON.stringify(record.result) === snapshot && !activeRecoveredCollection.current &&
          labelSessionReady(latestSessionContext.current);
        return valid;
      },
      generate: async (request) => {
        if (!capability.isCurrent() || recoveredLabelOperation.current !== capability || activeRecoveredLabels.current ||
            hasPendingLabels() || request?.orderId !== identity.orderId || request?.labNumber !== identity.labNumber)
          throw labelFailure(hasPendingLabels() ? "UNCONFIRMED" : "STALE");
        const operation = {};
        activeRecoveredLabels.current = operation;
        setIsSubmitting(true);
        try {
          return await generateOrderLabels(request, {
            barcodes,
            csrf: latestSessionContext.current.userSessionDetails?.csrf,
            isCurrent: () => capability.isCurrent(),
          });
        } finally {
          if (activeRecoveredLabels.current === operation) {
            activeRecoveredLabels.current = null;
            if (isMounted.current) setIsSubmitting(false);
          }
        }
      },
    };
    recoveredLabelOperation.current = capability;
    return capability;
  }, []);

  /**
   * Convert samples array to XML format expected by backend
   * @param samplesArray - Array of sample objects
   * @param envFields - Optional environmentalFields from orderData (for GPS fallback)
   */
  const buildSampleXML = useCallback(
    (samplesArray, envFields = {}) => {
      if (!samplesArray || samplesArray.length === 0) {
        return "";
      }

      // Check if any sample has a sample type (required for saving)
      const hasSampleType = samplesArray.some((s) => s.sampleTypeId);
      if (!hasSampleType) {
        return "";
      }

      let sampleXmlString = '<?xml version="1.0" encoding="utf-8"?>';
      sampleXmlString += "<samples>";

      samplesArray.forEach((sampleItem) => {
        // Include sample if it has a sample type (tests are optional for collection step)
        if (sampleItem.sampleTypeId) {
          const tests =
            sampleItem.tests && sampleItem.tests.length > 0
              ? sampleItem.tests.map((t) => t.id).join(",")
              : "";
          const panels =
            sampleItem.panels && sampleItem.panels.length > 0
              ? sampleItem.panels.map((p) => p.id).join(",")
              : "";

          // Get collection data - check both top-level fields (new) and sampleXML (legacy)
          const sampleXMLData = sampleItem.sampleXML || {};
          // Convert ISO state to the locale-specific format required by the
          // legacy REST backend (for example dd/MM/yyyy for fr-FR).
          const collectionDate = convertIsoToBackendDate(
            sampleItem.collectionDate || sampleXMLData.collectionDate || "",
            backendDateLocale,
          );
          const collectionTime =
            sampleItem.collectionTime || sampleXMLData.collectionTime || "";
          const collector =
            sampleItem.collectorId || sampleXMLData.collector || "";
          const collectionConditions =
            sampleItem.collectionConditions ||
            sampleXMLData.collectionConditions ||
            "";
          const quantity = sampleItem.quantity || sampleXMLData.quantity || "";
          const uom = sampleItem.quantityUnit || sampleXMLData.uom || "";
          const rejected = sampleItem.sampleRejected ? "true" : "false";
          const rejectReasonId = sampleItem.rejectionReason || "";

          const receivedDate = convertIsoToBackendDate(
            sampleItem.receivedDate || sampleXMLData.receivedDate || "",
            backendDateLocale,
          );
          const receivedTime =
            sampleItem.receivedTime || sampleXMLData.receivedTime || "";

          // Storage location data - check both top-level sample properties (from OrderLabel)
          // and nested sampleXML.storageLocation (legacy format)
          const storageLocation = sampleXMLData.storageLocation || {};
          const storageLocationId =
            sampleItem.storageLocationId || storageLocation.id || "";
          const storageLocationType =
            sampleItem.storageLocationType || storageLocation.type || "";
          const storagePositionCoordinate =
            sampleItem.storagePositionCoordinate ||
            storageLocation.positionCoordinate ||
            "";

          // GPS data - fallback to environmentalFields for environmental workflow
          const gpsLatitude =
            sampleXMLData.gpsLatitude || envFields.gpsLatitude || "";
          const gpsLongitude =
            sampleXMLData.gpsLongitude || envFields.gpsLongitude || "";
          const gpsAccuracy = sampleXMLData.gpsAccuracy || "";
          const gpsCaptureMethod = sampleXMLData.gpsCaptureMethod || "";

          // Include sampleItemId for updates - this identifies which existing sample_item to update
          const sampleItemId = sampleItem.sampleItemId || "";

          sampleXmlString += `<sample sampleID='${sampleItem.sampleTypeId}' sampleItemId='${sampleItemId}' date='${collectionDate}' time='${collectionTime}' collector='${collector}' collectionConditions='${collectionConditions}' quantity='${quantity}' uom='${uom}' receivedDate='${receivedDate}' receivedTime='${receivedTime}' tests='${tests}' testSectionMap='' testSampleTypeMap='' panels='${panels}' rejected='${rejected}' rejectReasonId='${rejectReasonId}' initialConditionIds='' storageLocationId='${storageLocationId}' storageLocationType='${storageLocationType}' storagePositionCoordinate='${storagePositionCoordinate}' gpsLatitude='${gpsLatitude}' gpsLongitude='${gpsLongitude}' gpsAccuracy='${gpsAccuracy}' gpsCaptureMethod='${gpsCaptureMethod}'/>`;
        }
      });

      sampleXmlString += "</samples>";
      return sampleXmlString;
    },
    [backendDateLocale],
  );

  /**
   * Build referral items from samples
   */
  const buildReferralItems = useCallback((samplesArray) => {
    const referralItems = [];

    samplesArray.forEach((sampleItem) => {
      if (sampleItem.referralItems && sampleItem.referralItems.length > 0) {
        const tests = sampleItem.tests
          ? sampleItem.tests.map((t) => t.id).join(",")
          : "";
        const referredInstitutes = sampleItem.referralItems
          .map((r) => r.institute)
          .join(",");
        const sentDates = sampleItem.referralItems
          .map((r) => r.sentDate)
          .join(",");
        const referralReasonIds = sampleItem.referralItems
          .map((r) => r.reasonForReferral)
          .join(",");
        const referrers = sampleItem.referralItems
          .map((r) => r.referrer)
          .join(",");

        referralItems.push({
          referrer: referrers,
          referredInstituteId: referredInstitutes,
          referredTestId: tests,
          referredSendDate: sentDates,
          referralReasonId: referralReasonIds,
        });
      }
    });

    return referralItems;
  }, []);

  /**
   * Save the current order state.
   * Can be called at any step to persist progress.
   *
   * @param {boolean} silent - If true, no loading indicator is shown
   * @param {boolean} orderEntryOnly - If true, samples are not required (decoupled workflow)
   */
  const saveOrder = useCallback(
    async (silent = false, orderEntryOnly = false) => {
      if (activeRecoveredLabels.current) throw entrySubmissionError("order.progress.saveInProgress");
      if (isReadOnly && !isEditMode) {
        return Promise.reject(new Error("Cannot save in read-only mode"));
      }

      // Build sample XML and referral items
      // Pass environmentalFields for GPS fallback in environmental workflow
      const envFields = orderData?.sampleOrderItems?.environmentalFields || {};
      const sampleXML = buildSampleXML(samples, envFields);
      const referralItems = buildReferralItems(samples);
      const useReferral = referralItems.length > 0;

      // Prepare order data for submission in the format expected by SamplePatientEntry
      const submitData = {
        ...orderData,
        sampleXML: sampleXML,
        referralItems: referralItems,
        useReferral: useReferral,
        // Flag for decoupled workflow: samples not required when orderEntryOnly=true
        orderEntryOnly: orderEntryOnly,
        // Clean up display lists that shouldn't be sent
        sampleOrderItems: {
          ...orderData.sampleOrderItems,
          priorityList: [],
          programList: [],
          referringSiteList: [],
          providersList: [],
          paymentOptions: [],
          testLocationCodeList: [],
        },
        initialSampleConditionList: [],
        testSectionList: [],
      };

      // Remove extra fields from sampleOrderItems that backend doesn't expect or that fail validation
      if (submitData.sampleOrderItems.questionnaire) {
        delete submitData.sampleOrderItems.questionnaire;
      }
      if (submitData.sampleOrderItems.vlProgramFields) {
        delete submitData.sampleOrderItems.vlProgramFields;
      }
      if (submitData.sampleOrderItems.paymentStatus) {
        delete submitData.sampleOrderItems.paymentStatus;
      }
      // Remove 'program' field - it contains the name (e.g., "Histopathology") but validation
      // expects a numeric ID. The backend uses 'programId' instead.
      if (submitData.sampleOrderItems.program) {
        delete submitData.sampleOrderItems.program;
      }

      const operation = beginSave();
      if (!silent) setIsSubmitting(true);
      setSaveStatus(SaveStatus.SAVING);
      setError(null);
      return new Promise((resolve, reject) => {
        // Always use SamplePatientEntry endpoint - the backend handles both insert and update
        // based on whether sampleOrderItems.sampleId is present
        const endpoint = "/rest/SamplePatientEntry";

        // Include sampleId in the payload for updates
        if (orderId) {
          submitData.sampleOrderItems = {
            ...submitData.sampleOrderItems,
            sampleId: orderId,
          };
        }

        postToOpenElisServerFullResponse(
          endpoint,
          JSON.stringify(submitData),
          async (response, _extra, requestError) => {
            if (!isCurrentSave(operation)) {
              reject(entrySubmissionError("order.progress.requestChanged"));
              return;
            }
            if (requestError) {
              setSaveStatus(SaveStatus.ERROR);
              setError(requestError.errorKey);
              reject(requestError);
              return;
            }
            const status = response?.status || 0;

            if (status === 200 || status === 201) {
              setIsDirty(false);
              setSaveStatus(SaveStatus.SAVED);
              setError(null);
              lastSavedDataRef.current = JSON.stringify({
                orderData,
                samples,
              });

              // Reload order to get created sampleItemIds and orderId for subsequent saves
              const labNo = orderData?.sampleOrderItems?.labNo;
              if (labNo) {
                getFromOpenElisServer(
                  `/rest/order/search?labNumber=${encodeURIComponent(labNo)}`,
                  (response) => {
                    if (!isCurrentSave(operation)) {
                      reject(
                        entrySubmissionError("order.progress.requestChanged"),
                      );
                      return;
                    }
                    if (response) {
                      // CRITICAL: Update orderId from the response - needed for Step 2 to work correctly
                      // The orderId is used to set sampleOrderItems.sampleId which tells the backend
                      // this is an UPDATE (not insert), so it loads the existing sample and skips
                      // accession number validation
                      if (response.id) {
                        setOrderId(response.id);
                      }
                      if (response.samples) {
                        setSamplesState(response.samples);
                      }
                      // CRITICAL: Update patientUpdateStatus to NO_ACTION after first save
                      // This prevents "stale state" errors when saving again (patient already exists)
                      setOrderDataState((prev) => ({
                        ...prev,
                        patientProperties: {
                          ...prev.patientProperties,
                          patientUpdateStatus: "NO_ACTION",
                          // Also update patientPK if available
                          patientPK:
                            response.patientProperties?.patientPK ||
                            prev.patientProperties?.patientPK,
                        },
                      }));
                    }
                    // Return the freshly-loaded samples (with sampleItemIds) so
                    // callers can immediately use them for downstream actions
                    // like storage assignment, without waiting for the next render.
                    resolve({
                      success: true,
                      samples: response?.samples || [],
                    });
                  },
                );
              } else {
                resolve({ success: true, samples: [] });
              }
            } else {
              setSaveStatus(SaveStatus.ERROR);
              let responseBody = {};
              try {
                responseBody = (await response?.json()) || {};
              } catch {
                // Preserve a stable fallback when an intermediary returns HTML.
              }
              if (!isCurrentSave(operation)) {
                reject(entrySubmissionError("order.progress.requestChanged"));
                return;
              }
              const errorMsg = responseBody.error || "Failed to save order";
              setError(errorMsg);
              const saveError = new Error(errorMsg);
              saveError.status = status;
              saveError.details = responseBody;
              reject(saveError);
            }
          },
        );
      })
        .catch((error) => {
          if (isCurrentSave(operation)) autoSaveSuspended.current = true;
          throw error;
        })
        .finally(() => finishSave(operation));
    },
    [
      orderId,
      orderData,
      samples,
      stepProgress,
      isReadOnly,
      isEditMode,
      buildSampleXML,
      buildReferralItems,
      beginSave,
      isCurrentSave,
      finishSave,
    ],
  );

  /**
   * Save order entry only (Step 1) - creates order metadata and sample_type_requests,
   * but NOT sample_item records. Sample items are created in Step 2 (Collect Sample).
   *
   * This enables the decoupled workflow where:
   * - Step 1: Order metadata + requested sample types
   * - Step 2: Physical sample collection (creates sample_item records)
   *
   * @param {boolean} silent - If true, no loading indicator is shown
   */
  const saveOrderEntry = useCallback(
    async (silent = false, labNumberOverride = null) => {
      if (activeRecoveredLabels.current) throw entrySubmissionError("order.progress.saveInProgress");
      assertSessionWrite(draftSessionIdentity.current);
      if (isReadOnly && !isEditMode) {
        return Promise.reject(new Error("Cannot save in read-only mode"));
      }

      const effectiveLabNumber =
        labNumberOverride || orderData?.sampleOrderItems?.labNo || "";

      // Prepare order data WITHOUT sample items
      const submitData = {
        ...orderData,
        sampleXML: "", // Empty - no sample_item records created
        referralItems: [],
        useReferral: false,
        orderEntryOnly: true, // Flag for backend to skip sample validation
        sampleOrderItems: {
          ...orderData.sampleOrderItems,
          labNo: effectiveLabNumber,
          priorityList: [],
          programList: [],
          referringSiteList: [],
          providersList: [],
          paymentOptions: [],
          testLocationCodeList: [],
        },
        initialSampleConditionList: [],
        testSectionList: [],
      };

      // Remove extra fields that fail validation
      if (submitData.sampleOrderItems.questionnaire) {
        delete submitData.sampleOrderItems.questionnaire;
      }
      if (submitData.sampleOrderItems.vlProgramFields) {
        delete submitData.sampleOrderItems.vlProgramFields;
      }
      if (submitData.sampleOrderItems.paymentStatus) {
        delete submitData.sampleOrderItems.paymentStatus;
      }
      if (submitData.sampleOrderItems.program) {
        delete submitData.sampleOrderItems.program;
      }

      if (
        typeof effectiveLabNumber !== "string" ||
        !effectiveLabNumber.trim()
      ) {
        throw entrySubmissionError("order.save.incomplete");
      }
      if (orderId) submitData.sampleOrderItems.sampleId = orderId;
      const body = JSON.stringify(submitData);
      const operation = beginSave("entry", effectiveLabNumber);
      // Silent draft saves still own the shared lock across page navigation.
      setIsSubmitting(true);
      setSaveStatus(SaveStatus.SAVING);
      setError(null);
      try {
        const confirmed = confirmedEntry.current;
        if (
          confirmed &&
          confirmed.sampleId === String(orderId) &&
          confirmed.labNo === effectiveLabNumber &&
          confirmed.input === operation.input &&
          confirmed.sessionIdentity === operation.sessionIdentity &&
          confirmed.epoch === operation.epoch &&
          canContinueSessionSave(operation)
        ) {
          // Save draft -> continue with unchanged data does not create tubes again.
          setIsDirty(false);
          setSaveStatus(SaveStatus.SAVED);
          return { success: true, sampleId: confirmed.sampleId };
        }
        const receipt = await submitOrderEntry({
          operation,
          body,
          samples: isFirstEntry(submitData, orderId)
            ? samples
            : samples.filter((sample) => sample.sampleTypeId),
          orderId,
          post: postToOpenElisServerFullResponse,
          isCurrent: isCurrentSave,
          canContinue: canContinueSessionSave,
          onUnknown: markEntryUnknown,
          beforeDispatch: (command) =>
            setEntryRecovery(rememberEntryCheckpoint(command)),
        });
        if (!isCurrentSave(operation)) {
          throw entrySubmissionError("order.progress.requestChanged");
        }
        if (!canContinueSessionSave(operation)) {
          markEntryUnknown(operation);
          throw entrySubmissionError("order.save.readbackUnconfirmed");
        }
        operation.verifiedReceipt = receipt.entryReceipt ? receipt : null;
        if (receipt.entryReceipt)
          setEntryRecovery(forgetEntryCheckpoint(operation.command));
        setOrderId(receipt.id);
        setLabNumber(effectiveLabNumber);
        setOrderDataState((previous) => {
          if (
            !isMounted.current ||
            requestEpoch.current !== operation.epoch ||
            latestEntryInput.current !== operation.input
          )
            return previous;
          const nextData = {
            ...previous,
            sampleOrderItems: {
              ...previous.sampleOrderItems,
              labNo: effectiveLabNumber,
            },
            patientProperties: {
              ...previous.patientProperties,
              patientUpdateStatus: "NO_ACTION",
              patientPK:
                receipt.patientProperties?.patientPK ||
                previous.patientProperties?.patientPK,
            },
          };
          if (receipt.entryReceipt) {
            confirmedEntry.current = {
              sampleId: String(receipt.id),
              labNo: effectiveLabNumber,
              sessionIdentity: operation.sessionIdentity,
              epoch: operation.epoch,
              input: JSON.stringify({
                orderData: {
                  ...nextData,
                  sampleOrderItems: {
                    ...nextData.sampleOrderItems,
                    labNo: undefined,
                  },
                },
                samples,
              }),
            };
          }
          return nextData;
        });
        setIsDirty(false);
        setSaveStatus(SaveStatus.SAVED);
        setError(null);
        autoSaveSuspended.current = false;
        confirmManualSessionSave(operation, silent);
        return { success: true, sampleId: receipt.id };
      } catch (error) {
        if (
          operation.command &&
          [400, 422].includes(error.status) &&
          isEntryInputRejection(error.details)
        )
          setEntryRecovery(forgetEntryCheckpoint(operation.command));
        if (isCurrentSave(operation)) {
          autoSaveSuspended.current = true;
          if (!entryUnconfirmed.current.has(effectiveLabNumber)) {
            setSaveStatus(SaveStatus.ERROR);
            setError(error.errorKey || "order.save.incomplete");
          }
        }
        throw error;
      } finally {
        finishSave(operation);
      }
    },
    [
      orderId,
      orderData,
      samples,
      isReadOnly,
      isEditMode,
      beginSave,
      finishSave,
      isCurrentSave,
      assertSessionWrite,
      canContinueSessionSave,
      markEntryUnknown,
      confirmManualSessionSave,
    ],
  );

  /**
   * Enable edit mode for a read-only order
   */
  const enableEditMode = useCallback(() => {
    setIsEditMode(true);
  }, []);

  /**
   * Mark a step as complete
   */
  const markStepComplete = useCallback((step) => {
    setStepProgress((prev) => ({
      ...prev,
      [step]: true,
    }));
  }, []);

  /**
   * Assign a test to a sample (Step 2: Collect)
   * @param {string} testId - The test ID to assign
   * @param {string} testName - The test name
   * @param {boolean} isPanel - Whether this is a panel
   * @param {number} sampleIndex - The sample index to assign to
   */
  const assignTestToSample = useCallback(
    (testId, testName, isPanel, sampleIndex) => {
      // Update test assignments
      setTestSampleAssignments((prev) => {
        const existing = prev[testId] || {
          testId,
          testName,
          isPanel,
          assignedToSamples: [],
        };
        const assignedToSamples = existing.assignedToSamples.includes(
          sampleIndex,
        )
          ? existing.assignedToSamples
          : [...existing.assignedToSamples, sampleIndex];
        return {
          ...prev,
          [testId]: { ...existing, assignedToSamples },
        };
      });

      // Also add the test to the sample's tests array
      setSamplesState((prevSamples) => {
        const updated = [...prevSamples];
        const sample = updated[sampleIndex];
        if (sample) {
          const existingTests = sample.tests || [];
          if (!existingTests.some((t) => t.id === testId)) {
            updated[sampleIndex] = {
              ...sample,
              tests: [...existingTests, { id: testId, name: testName }],
            };
          }
        }
        return updated;
      });

      setIsDirty(true);
      setSaveStatus(SaveStatus.UNSAVED);
    },
    [],
  );

  /**
   * Remove a test from a sample (Step 2: Collect)
   * @param {string} testId - The test ID to remove
   * @param {number} sampleIndex - The sample index to remove from
   */
  const removeTestFromSample = useCallback((testId, sampleIndex) => {
    // Update test assignments
    setTestSampleAssignments((prev) => {
      const existing = prev[testId];
      if (!existing) return prev;
      const assignedToSamples = existing.assignedToSamples.filter(
        (idx) => idx !== sampleIndex,
      );
      if (assignedToSamples.length === 0) {
        const { [testId]: removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [testId]: { ...existing, assignedToSamples },
      };
    });

    // Also remove the test from the sample's tests array
    setSamplesState((prevSamples) => {
      const updated = [...prevSamples];
      const sample = updated[sampleIndex];
      if (sample && sample.tests) {
        updated[sampleIndex] = {
          ...sample,
          tests: sample.tests.filter((t) => t.id !== testId),
        };
      }
      return updated;
    });

    setIsDirty(true);
    setSaveStatus(SaveStatus.UNSAVED);
  }, []);

  /**
   * Update collection details for a sample (Step 2: Collect)
   * @param {number} sampleIndex - The sample index to update
   * @param {object} details - The collection details to update
   */
  const updateSampleCollectionDetails = useCallback((sampleIndex, details) => {
    setSamplesState((prevSamples) => {
      const updated = [...prevSamples];
      if (updated[sampleIndex]) {
        updated[sampleIndex] = {
          ...updated[sampleIndex],
          ...details,
        };
      }
      return updated;
    });

    setIsDirty(true);
    setSaveStatus(SaveStatus.UNSAVED);
  }, []);

  /**
   * Reset the order context to initial state.
   * Used when starting a new order.
   */
  const resetOrder = useCallback(() => {
    if (!isMounted.current) return;
    interruptEntrySave();
    draftSessionIdentity.current = readSessionIdentity(
      latestSessionContext.current,
    );
    sessionAutoSaveSuspended.current = !sessionAllowsWrite(
      latestSessionContext.current,
      draftSessionIdentity.current,
    );
    sessionPauseGeneration.current += 1;
    const epoch = ++requestEpoch.current;
    activeLoad.current = null;
    activeSave.current = null;
    setIsLoading(false);
    setIsSubmitting(false);
    autoSaveSuspended.current = false;
    setOrderId(null);
    setLabNumber(null);
    setOrderDataState(getInitialOrderData());
    setSamplesState([sampleObject]);
    setIsReadOnly(false);
    setIsEditMode(false);
    setCurrentStep(0);
    setIsDirty(false);
    setSaveStatus(SaveStatus.SAVED);
    setError(null);
    setStepProgress({
      enter: false,
      collect: false,
      label: false,
      qa: false,
    });
    setStorageSkippedState(false);
    lastSavedDataRef.current = null;

    // Re-fetch form defaults from API to get correct date format
    getFromOpenElisServer("/rest/SamplePatientEntry", (response) => {
      if (!isMounted.current || epoch !== requestEpoch.current) return;
      if (response && response.currentDate) {
        setOrderDataState((prev) => ({
          ...prev,
          currentDate: response.currentDate,
          sampleOrderItems: {
            ...prev.sampleOrderItems,
            requestDate: response.currentDate,
            receivedDateForDisplay: response.currentDate,
            receivedTime: getCurrentTime(),
            paymentOptions: response.sampleOrderItems?.paymentOptions || [],
            paymentOptionSelection: "",
            referringSiteList:
              response.sampleOrderItems?.referringSiteList || [],
            providersList: response.sampleOrderItems?.providersList || [],
            testLocationCodeList:
              response.sampleOrderItems?.testLocationCodeList || [],
            priorityList: response.sampleOrderItems?.priorityList || [],
            programList: response.sampleOrderItems?.programList || [],
          },
          sampleTypes: response.sampleTypes || [],
          testSectionList: response.testSectionList || [],
          rejectReasonList: response.rejectReasonList || [],
          referralOrganizations: response.referralOrganizations || [],
          referralReasons: response.referralReasons || [],
        }));
      }
    });
  }, [interruptEntrySave]);

  useLayoutEffect(() => {
    // Temporary failure/expiry can hide the identity while preserving local
    // input. A newly confirmed, different session must never inherit that input.
    if (!observedSessionIdentity) return;
    if (
      draftSessionIdentity.current &&
      draftSessionIdentity.current !== observedSessionIdentity
    ) {
      resetOrder();
    }
    draftSessionIdentity.current = observedSessionIdentity;
  }, [observedSessionIdentity, resetOrder]);

  /**
   * Initialize form defaults from API on mount.
   * This ensures we get the correct date format from the server.
   */
  useEffect(() => {
    if (activeLoad.current || activeIdentity.current !== ":") return;
    const epoch = requestEpoch.current;
    getFromOpenElisServer("/rest/SamplePatientEntry", (response) => {
      if (!isMounted.current || epoch !== requestEpoch.current) return;
      if (response && response.currentDate) {
        setOrderDataState((prev) => ({
          ...prev,
          currentDate: response.currentDate,
          sampleOrderItems: {
            ...prev.sampleOrderItems,
            requestDate: response.currentDate,
            receivedDateForDisplay: response.currentDate,
            receivedTime:
              prev.sampleOrderItems?.receivedTime || getCurrentTime(),
            // Use payment options from API if available
            paymentOptions: response.sampleOrderItems?.paymentOptions || [],
            // Keep paymentOptionSelection empty (not "free")
            paymentOptionSelection: "",
            // Copy other reference data from API
            referringSiteList:
              response.sampleOrderItems?.referringSiteList || [],
            providersList: response.sampleOrderItems?.providersList || [],
            testLocationCodeList:
              response.sampleOrderItems?.testLocationCodeList || [],
            priorityList: response.sampleOrderItems?.priorityList || [],
            programList: response.sampleOrderItems?.programList || [],
          },
          // Copy other lists from API response
          sampleTypes: response.sampleTypes || [],
          testSectionList: response.testSectionList || [],
          rejectReasonList: response.rejectReasonList || [],
          referralOrganizations: response.referralOrganizations || [],
          referralReasons: response.referralReasons || [],
        }));
      }
    });
  }, []);

  /**
   * Auto-save effect - saves every 30 seconds if form is dirty and has minimum required data.
   * A lab number alone is not sufficient — patient (clinical) or site (environmental) plus
   * at least one sample type must be present before we persist.
   *
   * Step 1 is deliberately excluded. Its decoupled save creates sample type
   * requests, while saveOrder creates physical sample items. Running the latter
   * in the background used to advance an order past collection before the user
   * clicked Save. Step 1 already provides explicit Save and Save draft actions.
   */
  useEffect(() => {
    if (location.pathname === "/order/enter") {
      return undefined;
    }

    const hasLabNumber = orderData?.sampleOrderItems?.labNo;
    const envFields = orderData?.sampleOrderItems?.environmentalFields || {};
    const workflowType = envFields.workflowType || "clinical";
    const hasPatientOrSite =
      workflowType === "environmental"
        ? !!(envFields.samplingSiteId || envFields.samplingSiteName)
        : !!(
            orderData?.patientProperties?.lastName ||
            orderData?.patientProperties?.nationalId
          );
    const hasSampleTypes = samples.some((s) => s.sampleTypeId);
    const canAutoSave = hasLabNumber && hasPatientOrSite && hasSampleTypes;

    if (isDirty && !isReadOnly && canAutoSave) {
      autoSaveTimerRef.current = setInterval(() => {
        if (
          isDirty &&
          !isSubmitting &&
          !activeSave.current &&
          !autoSaveSuspended.current &&
          !entryUnconfirmed.current.has(currentLabNumber)
        ) {
          saveOrder(true).catch(() => {});
        }
      }, AUTO_SAVE_INTERVAL);
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [
    isDirty,
    isReadOnly,
    isSubmitting,
    saveOrder,
    orderData?.sampleOrderItems?.labNo,
    orderData?.sampleOrderItems?.environmentalFields?.workflowType,
    orderData?.sampleOrderItems?.environmentalFields?.samplingSiteId,
    orderData?.sampleOrderItems?.environmentalFields?.samplingSiteName,
    orderData?.patientProperties?.lastName,
    orderData?.patientProperties?.nationalId,
    samples,
    location.pathname,
  ]);

  /**
   * Browser navigation warning for unsaved changes
   */
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const entryNeedsConfirmation =
    entryUnconfirmed.current.has(currentLabNumber) ||
    Boolean(entryRecovery.checkpoint && !activeSave.current);
  const pendingEntry = entryUnconfirmed.current.get(currentLabNumber);
  let collectionRecovery;
  try {
    const checkpoint = readCollectionCheckpoint();
    collectionRecovery = { checkpoint: checkpoint ? { submissionId: checkpoint.submissionId } : null, error: null };
  } catch (failure) {
    collectionRecovery = { checkpoint: null, error: failure.errorKey || "order.collectionRecovery.unknown" };
  }
  const value = {
    // State
    orderId,
    labNumber,
    orderData,
    samples,
    isReadOnly,
    isEditMode,
    currentStep,
    isLoading,
    isSubmitting,
    saveStatus: entryNeedsConfirmation ? SaveStatus.UNCONFIRMED : saveStatus,
    isSaveUnconfirmed: entryNeedsConfirmation,
    unconfirmedLabNumber: entryNeedsConfirmation ? currentLabNumber : "",
    // Show only an opaque recovery reference to the same signed-in operator.
    // The frozen clinical body remains private, in this workspace's memory.
    unconfirmedSubmissionId:
      pendingEntry?.sessionIdentity === observedSessionIdentity
        ? pendingEntry.command?.submissionId || ""
        : "",
    entryRecovery,
    collectionRecovery,
    queryEntryRecovery,
    queryCurrentEntryRecovery,
    adoptRecoveredCollection,
    saveRecoveredCollection,
    isRecoveryCurrent: () => recoveredEntry.current?.isCurrent() === true,
    prepareRecoveredLabels,
    isDirty,
    error,
    stepProgress,
    storageSkipped,
    testSampleAssignments,

    // Actions
    loadOrder,
    saveOrder,
    markEntrySubmissionUnconfirmed,
    isEntryPatientReceipt,
    saveOrderEntry, // Step 1: saves order + creates sample_type_requests (no sample_items)
    setCurrentStep,
    setOrderData,
    setSamples,
    resetOrder,
    enableEditMode,
    markStepComplete,
    setStorageSkipped,
    // Test assignment actions (Step 2)
    assignTestToSample,
    removeTestFromSample,
    updateSampleCollectionDetails,
  };

  return (
    <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
  );
};

/**
 * Custom hook for accessing the OrderContext.
 * Throws an error if used outside of OrderProvider.
 */
export const useOrderContext = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error("useOrderContext must be used within an OrderProvider");
  }
  return context;
};

export default OrderContext;
