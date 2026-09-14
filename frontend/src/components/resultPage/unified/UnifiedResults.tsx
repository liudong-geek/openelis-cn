import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Pagination,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { Prompt } from "react-router-dom";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import {
  readResultWorkbench as getFromOpenElisServer,
  saveResultWorkbench as postToOpenElisServerJsonResponse,
  EntryRequestError,
} from "./resultEntryTransport";
import {
  EntryDraft,
  EntryRow,
  EntrySession,
  SessionStamp,
  entryBlocked,
  entryReason,
  entrySession,
  sessionReady,
  newEntryDraft,
  canResumeDraft,
  restrictTubes,
  specimenReasons,
  entryReasons,
} from "./resultEntryState";
import ResultDraftReview from "./ResultDraftReview";
import {
  confirmedResultReadback,
  resultReadbackPath,
} from "./resultSaveReadback";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import ESignatureButton, {
  SignatureMeaning,
} from "../../esignature/ESignatureButton";
import PolymorphicResultCell, {
  ResultCellRow,
  worklistRowKey,
} from "./PolymorphicResultCell";
import {
  RowEditState,
  initialRowState,
  isRowEditable,
  nextRowState,
  showEdit,
  showSave,
} from "./editState";
import {
  ResultsDomain,
  formatDomainMessage,
  normalizeDomain,
} from "./domainIntl";
import { useResultPresence } from "./useResultPresence";
import { createResultSignatureApi } from "./resultSignatureApi";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import CustomDatePicker from "../../common/CustomDatePicker";

/**
 * OGC-1020 (R1 of OGC-811) — unified /Results worklist.
 *
 * Consolidates the legacy result-entry routes behind the
 * `results.entry.unifiedRoute` site flag: one toolbar (search, Lab Unit,
 * date, status chips), a polymorphic result cell (FR-A1), a per-row
 * read-only→Edit→Save edit-state machine (FR-A2/A3), e-signature on Save
 * (FR-A4), per-analysis save scoping + optimistic version check + soft
 * presence (FR-O1–O3), and cross-domain rendering driven by the selected Lab
 * Unit (FR-M1–M4).
 */

interface LabUnit {
  id: string;
  value: string;
  domain?: string;
}

interface WorklistRow extends ResultCellRow {
  accessionNumber?: string;
  sampleItemExternalId?: string | null;
  sequenceNumber?: string;
  testName?: string;
  patientInfo?: string;
  patientName?: string;
  sampleType?: string;
  normalRange?: string;
  analysisStatusId?: string;
  analysisLastupdated?: string;
  testResultComponentId?: string;
  resultEntryBlockedReason?: string | null;
  [key: string]: unknown;
}

interface StatusOption {
  id: string;
  value: string;
}

interface SaveResponse {
  status?: number;
  success?: boolean;
  errorKey?: string;
  error?: string;
  modifiedBy?: string;
  modifiedAt?: string;
  analysisLastupdated?: string;
  analysisStatusId?: string;
  reflex?: string[];
  calculated?: string[];
}

interface ConfirmedSaveResponse extends SaveResponse {
  analysisLastupdated: string;
  analysisStatusId: string;
  reflex: string[];
  calculated: string[];
}

const isConfirmedSaveResponse = (
  response: unknown,
): response is ConfirmedSaveResponse => {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return false;
  }
  const receipt = response as SaveResponse;
  const isPositiveIntegerString = (value: unknown): value is string =>
    typeof value === "string" && /^[1-9]\d*$/.test(value);
  return (
    (receipt.status === undefined ||
      (Number.isInteger(receipt.status) &&
        receipt.status >= 200 &&
        receipt.status < 300)) &&
    (receipt.success === undefined || receipt.success === true) &&
    receipt.error === undefined &&
    receipt.errorKey === undefined &&
    isPositiveIntegerString(receipt.analysisStatusId) &&
    isPositiveIntegerString(receipt.analysisLastupdated) &&
    Array.isArray(receipt.reflex) &&
    receipt.reflex.every((value) => typeof value === "string") &&
    Array.isArray(receipt.calculated) &&
    receipt.calculated.every((value) => typeof value === "string")
  );
};

// Only known, localized failures are shown. Server exception text is not UI copy.
const SAVE_ERROR_KEYS = new Set([
  "results.workbench.saveReadbackUnconfirmed",
  ...entryReasons,
  "error.results.analysisMismatch",
  "error.results.resultMismatch",
  "error.results.qualifiedResultMismatch",
  "error.results.testMismatch",
  "error.results.componentMismatch",
  "error.results.resultDefinitionMissing",
  "error.results.orderMismatch",
  "error.results.reviewedResultLocked",
  "error.results.statusConfigurationInvalid",
  "security.authRequired",
  "security.sessionExpired",
  "security.accessDenied",
  "security.csrfInvalid",
  "common.api.networkError",
  "common.api.invalidResponse",
  "common.api.requestFailed",
]);

// Unknown nonempty reasons also fail closed; never render server error text.
const isResultEntryBlocked = entryBlocked;

const blockedResultDisplay = (row: EntryRow): string => {
  if (row.resultType === "D") {
    return (
      row.dictionaryResults?.find((option) => option.id === row.resultValue)
        ?.value ||
      row.resultValue ||
      ""
    );
  }
  if (row.resultType === "M" || row.resultType === "C") {
    try {
      const selected: unknown = JSON.parse(row.multiSelectResultValues || "{}");
      if (
        selected &&
        typeof selected === "object" &&
        !Array.isArray(selected)
      ) {
        const ids = Object.values(selected).flatMap((value) =>
          typeof value === "string" || typeof value === "number"
            ? String(value).split(",").filter(Boolean)
            : [],
        );
        if (ids.length) {
          return ids
            .map(
              (id) =>
                row.dictionaryResults?.find(
                  (option) => String(option.id) === id,
                )?.value || id,
            )
            .join(", ");
        }
      }
    } catch {
      // A missing definition must not erase an existing historical value.
    }
    return (
      row.resultValue ||
      (row.multiSelectResultValues !== "{}"
        ? row.multiSelectResultValues || ""
        : "")
    );
  }
  return row.resultValue || "";
};

const UnifiedResults: React.FC = () => {
  const intl = useIntl();
  const session = useContext(UserSessionDetailsContext) as EntrySession;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const stamp = entrySession(session);
  const worklistStamp = useRef<SessionStamp | null>(stamp);
  const revokedSession = useRef<string | null>(null);
  const { addNotification, setNotificationVisible } =
    useContext(NotificationContext);

  const initialUrlState = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );

  const [labUnits, setLabUnits] = useState<LabUnit[]>([]);
  const [selectedLabUnit, setSelectedLabUnit] = useState<string>(
    initialUrlState.get("testSectionId") || "",
  );
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
  const [searchText, setSearchText] = useState<string>(
    initialUrlState.get("accessionNumber") || "",
  );
  const [collectionDate, setCollectionDate] = useState<string>(
    initialUrlState.get("collectionDate") || "",
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    initialUrlState.get("status") || "ALL",
  );
  const [rows, setRows] = useState<WorklistRow[]>([]);
  const rowsRef = useRef<WorklistRow[]>([]);
  const drafts = useRef(new Map<string, EntryDraft>());
  const signatureApis = useRef(
    new Map<
      string,
      { binding: string; api: ReturnType<typeof createResultSignatureApi> }
    >(),
  );
  const [, renderDrafts] = useState(0);
  const updateRows = useCallback(
    (change: (current: WorklistRow[]) => WorklistRow[]) => {
      rowsRef.current = change(rowsRef.current);
      setRows(rowsRef.current);
    },
    [],
  );
  const ready = (expected = worklistStamp.current) =>
    Boolean(
      expected &&
      revokedSession.current !== expected.identity &&
      sessionReady(sessionRef.current, expected),
    );
  const signingName = session.userSessionDetails?.loginName;
  const signingToken = stamp?.csrf;
  const signingIdentityReady =
    typeof signingName === "string" &&
    signingName.length > 0 &&
    signingName.length <= 255 &&
    signingName.trim() === signingName &&
    typeof signingToken === "string" &&
    signingToken.length <= 4096 &&
    !/[\r\n]/.test(signingToken);
  const analysisUnconfirmed = (analysisId: string) =>
    [...drafts.current.values()].some(
      (draft) =>
        draft.row.analysisId === analysisId &&
        ["pending", "unknown"].includes(draft.disposition),
    );
  const [rowStates, setRowStates] = useState<Record<string, RowEditState>>({});
  const [staleInfo, setStaleInfo] = useState<
    Record<string, { modifiedBy?: string; modifiedAt?: string }>
  >({});
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(
    null,
  );
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const loadEpoch = useRef(0);
  const worklistLoading = useRef(false);
  const mounted = useRef(true);
  const rowEditRevisions = useRef<Record<string, number>>({});
  const blockedRowKeys = useRef(new Set<string>());
  const pendingSaves = useRef(
    new Map<string, { epoch: number; revision: number }>(),
  );
  const [savingRows, setSavingRows] = useState<Set<string>>(() => new Set());
  const initialLoadStarted = useRef(false);
  const initialLabUnitEffect = useRef(true);

  const clearPrivateState = () => {
    loadEpoch.current += 1;
    for (const value of signatureApis.current.values()) value.api.dispose();
    signatureApis.current.clear();
    drafts.current.clear();
    blockedRowKeys.current.clear();
    pendingSaves.current.clear();
    rowEditRevisions.current = {};
    updateRows(() => []);
    setRowStates({});
    setStaleInfo({});
    setEditingAnalysisId(null);
    setSavingRows(new Set());
    setHasLoaded(false);
    setSearchText("");
    setSelectedLabUnit("");
    setCollectionDate("");
    setStatusFilter("ALL");
    setLabUnits([]);
    setStatusOptions([]);
    window.history.replaceState(null, "", "/Results");
    worklistLoading.current = false;
    setLoading(false);
    renderDrafts((value) => value + 1);
  };
  const revokeFor = (
    response: { status?: number } | undefined,
    expected: SessionStamp | null,
  ) => {
    if (
      ![401, 403].includes(response?.status || 0) ||
      !mounted.current ||
      !expected ||
      JSON.stringify(entrySession(sessionRef.current)) !==
        JSON.stringify(expected)
    )
      return false;
    revokedSession.current = expected.identity;
    clearPrivateState();
    setLoadErrorKey(
      response?.status === 401
        ? "security.sessionExpired"
        : "security.accessDenied",
    );
    return true;
  };
  const renderedSessionKey = JSON.stringify(stamp);
  const sessionPhase = session.sessionPhase;
  const lastSessionKey = useRef(renderedSessionKey);
  useLayoutEffect(() => {
    if (stamp?.identity !== worklistStamp.current?.identity || !stamp) {
      clearPrivateState();
      worklistStamp.current = stamp;
      revokedSession.current = null;
      setLoadErrorKey("security.sessionWriteBlocked");
    } else if (lastSessionKey.current !== renderedSessionKey || !ready()) {
      loadEpoch.current += 1;
      for (const draft of drafts.current.values()) draft.held = true;
      worklistLoading.current = false;
      setLoading(false);
      setLoadErrorKey("security.sessionWriteBlocked");
      renderDrafts((value) => value + 1);
    }
    lastSessionKey.current = renderedSessionKey;
  }, [renderedSessionKey, sessionPhase, session.errorLoadingSessionDetails]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (drafts.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const value of signatureApis.current.values()) value.api.dispose();
      signatureApis.current.clear();
      // Late save responses belong to the discarded page, not a new worklist.
      loadEpoch.current += 1;
    };
  }, []);

  const domain: ResultsDomain = useMemo(() => {
    const unit = labUnits.find((u) => u.id === selectedLabUnit);
    return normalizeDomain(unit?.domain);
  }, [labUnits, selectedLabUnit]);

  useEffect(() => {
    const expected = entrySession(sessionRef.current);
    if (!ready(expected)) return;
    getFromOpenElisServer(
      "/rest/results-entry/lab-units",
      (list: LabUnit[] | undefined, error?: EntryRequestError) => {
        if (revokeFor(error, expected)) return;
        if (mounted.current && ready(expected) && Array.isArray(list))
          setLabUnits(
            list.filter(
              (item) =>
                item &&
                typeof item.id === "string" &&
                typeof item.value === "string",
            ),
          );
      },
    );
    getFromOpenElisServer(
      "/rest/analysis-status-types",
      (list: StatusOption[] | undefined, error?: EntryRequestError) => {
        if (revokeFor(error, expected)) return;
        if (mounted.current && ready(expected) && Array.isArray(list))
          setStatusOptions(
            list.filter(
              (s) =>
                s &&
                typeof s.id === "string" &&
                typeof s.value === "string" &&
                s.id !== "0",
            ),
          );
      },
    );
  }, [renderedSessionKey, sessionPhase]);

  const applyLoadedRows = useCallback(
    (results: { testResult?: WorklistRow[] }) => {
      const loaded = restrictTubes(
        (results?.testResult || []).filter((r) => r.analysisId),
      );
      for (const draft of drafts.current.values()) draft.held = true;
      blockedRowKeys.current = new Set(
        loaded.filter(isResultEntryBlocked).map(worklistRowKey),
      );
      updateRows(() => loaded);
      renderDrafts((value) => value + 1);
      const states: Record<string, RowEditState> = {};
      for (const row of loaded) {
        // one analysis may render N component rows (FR-A′1) — each row keeps
        // its own edit state under its composite key
        states[worklistRowKey(row)] = initialRowState(
          Boolean(row.resultValue) ||
            Boolean(
              row.multiSelectResultValues &&
              row.multiSelectResultValues !== "{}",
            ),
        );
      }
      setRowStates(states);
      setStaleInfo({});
      setEditingAnalysisId(null);
      setPage(1);
      worklistLoading.current = false;
      setLoading(false);
      setHasLoaded(true);
    },
    [updateRows],
  );

  const loadWorklist = useCallback(
    (labNumberOverride?: string) => {
      const requestedSession = entrySession(sessionRef.current);
      if (!ready(requestedSession)) {
        setLoadErrorKey("security.sessionWriteBlocked");
        return;
      }
      worklistStamp.current = requestedSession;
      const epoch = ++loadEpoch.current;
      worklistLoading.current = true;
      setLoading(true);
      setLoadErrorKey(null);
      const params = new URLSearchParams();
      // guard: when wired directly to onClick the argument is the click
      // event — only a string counts as an override
      const labNumber =
        typeof labNumberOverride === "string" ? labNumberOverride : searchText;
      if (labNumber) {
        params.set("labNumber", labNumber);
      }
      if (selectedLabUnit) {
        params.set("testSectionId", selectedLabUnit);
      }
      if (collectionDate) {
        params.set("collectionDate", collectionDate);
      }
      params.set("doRange", "false");
      params.set("finished", "false");
      const hasSpecificFilter = Boolean(
        labNumber || selectedLabUnit || collectionDate,
      );
      const endpoint = hasSpecificFilter
        ? "/rest/LogbookResults?" + params.toString()
        : "/rest/results-entry/pending";
      getFromOpenElisServer(
        endpoint,
        (
          response: { testResult?: WorklistRow[] } | undefined,
          error?: EntryRequestError,
        ) => {
          if (revokeFor(error, requestedSession)) return;
          if (
            epoch !== loadEpoch.current ||
            !mounted.current ||
            !ready(requestedSession)
          )
            return;
          if (error?.status === 401 || error?.status === 403) {
            revokedSession.current = requestedSession!.identity;
            clearPrivateState();
            setLoadErrorKey(error.errorKey);
            return;
          }
          if (
            error ||
            !Array.isArray(response?.testResult) ||
            response.testResult.some(
              (row) =>
                !row ||
                typeof row.analysisId !== "string" ||
                !/^[1-9][0-9]{0,9}$/.test(row.analysisId),
            ) ||
            (Array.isArray(response?.testResult) &&
              new Set(response.testResult.map(worklistRowKey)).size !==
                response.testResult.length)
          ) {
            setLoadErrorKey(
              error && SAVE_ERROR_KEYS.has(error.errorKey)
                ? error.errorKey
                : "common.api.invalidResponse",
            );
            worklistLoading.current = false;
            setLoading(false);
            return;
          }
          applyLoadedRows(response);
        },
      );
      // FRS: the selected Lab Unit (and filters) are the page's primary
      // state — keep them in the URL so refresh and share links reproduce
      // the same worklist
      const urlState = new URLSearchParams(window.location.search);
      const setOrDrop = (key: string, value: string) =>
        value ? urlState.set(key, value) : urlState.delete(key);
      setOrDrop("accessionNumber", labNumber);
      setOrDrop("testSectionId", selectedLabUnit);
      setOrDrop("collectionDate", collectionDate);
      if (hasSpecificFilter) {
        urlState.delete("scope");
      } else {
        urlState.set("scope", "pending");
      }
      const query = urlState.toString();
      window.history.replaceState(
        null,
        "",
        query ? `/Results?${query}` : "/Results",
      );
    },
    [searchText, selectedLabUnit, collectionDate, applyLoadedRows],
  );

  useEffect(() => {
    if (initialLabUnitEffect.current) {
      initialLabUnitEffect.current = false;
      return;
    }
    loadWorklist();
  }, [selectedLabUnit]);

  // The result workbench opens as a real pending task list. Deep links with
  // accession/unit/date filters still load the narrower legacy-compatible
  // search, while an unfiltered dashboard entry loads every authorized
  // NotStarted analysis through /rest/results-entry/pending.
  useEffect(() => {
    if (!initialLoadStarted.current) {
      initialLoadStarted.current = true;
      loadWorklist(initialUrlState.get("accessionNumber") || undefined);
    }
  }, []);

  // Keep the status chip in the URL too (client-side filter, no refetch)
  useEffect(() => {
    const urlState = new URLSearchParams(window.location.search);
    if (statusFilter === "ALL") {
      urlState.delete("status");
    } else {
      urlState.set("status", statusFilter);
    }
    const query = urlState.toString();
    window.history.replaceState(
      null,
      "",
      query ? `/Results?${query}` : "/Results",
    );
  }, [statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const key = row.analysisStatusId || "";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      statusFilter === "ALL"
        ? rows
        : rows.filter((row) => row.analysisStatusId === statusFilter),
    [rows, statusFilter],
  );

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  );

  const visibleAnalysisIds = useMemo(
    () => pagedRows.map((row) => row.analysisId),
    [pagedRows],
  );

  const { presence, unavailable: presenceUnavailable } = useResultPresence(
    editingAnalysisId,
    visibleAnalysisIds,
    renderedSessionKey,
    () => ready() && !worklistLoading.current && mounted.current,
    stamp?.csrf || "",
  );

  const signatureApiFor = (
    row: WorklistRow,
    epoch: number,
    revision: number,
  ) => {
    const key = worklistRowKey(row),
      expected = worklistStamp.current;
    const username = sessionRef.current.userSessionDetails?.loginName || "";
    const binding = JSON.stringify([epoch, revision, expected, username]);
    const existing = signatureApis.current.get(key);
    if (existing?.binding === binding && !existing.api.isInvalid())
      return existing.api;
    const api = createResultSignatureApi({
      username,
      userId: sessionRef.current.userSessionDetails?.userId || "",
      csrf: expected?.csrf || "",
      recordId: row.analysisId,
      guard: () =>
        ready(expected) &&
        sessionRef.current.userSessionDetails?.loginName === username &&
        mounted.current &&
        epoch === loadEpoch.current &&
        revision === (rowEditRevisions.current[key] || 0) &&
        !worklistLoading.current &&
        !drafts.current.get(key)?.held &&
        !analysisUnconfirmed(row.analysisId) &&
        !blockedRowKeys.current.has(key) &&
        rowsRef.current.some(
          (current) =>
            worklistRowKey(current) === key && !isResultEntryBlocked(current),
        ),
      onUnknown: () => {
        if (
          !mounted.current ||
          revokedSession.current === expected?.identity ||
          entrySession(sessionRef.current)?.identity !== expected?.identity
        )
          return;
        const draft = drafts.current.get(key) || newEntryDraft(row);
        draft.disposition = "unknown";
        draft.held = true;
        draft.uncertainOperation = "signature";
        drafts.current.set(key, draft);
        renderDrafts((value) => value + 1);
      },
    });
    signatureApis.current.set(key, { binding, api });
    return api;
  };

  const handleValueChange = useCallback(
    (
      target: WorklistRow,
      field: "resultValue" | "multiSelectResultValues",
      value: string,
      epoch: number,
    ) => {
      // FR-A′3: a multi-component analysis renders one row per component —
      // update ONLY the edited row (keyed by analysisId + componentId), never
      // its sibling component rows
      const key = worklistRowKey(target);
      if (
        !ready() ||
        drafts.current.get(key)?.held ||
        analysisUnconfirmed(target.analysisId) ||
        isResultEntryBlocked(target) ||
        blockedRowKeys.current.has(key) ||
        epoch !== loadEpoch.current ||
        worklistLoading.current ||
        !mounted.current
      )
        return;
      rowEditRevisions.current[key] = (rowEditRevisions.current[key] || 0) + 1;
      const actual = rowsRef.current.find((row) => worklistRowKey(row) === key);
      if (!actual) return;
      const draft = drafts.current.get(key) || newEntryDraft(actual);
      draft.row = { ...draft.row, [field]: value };
      drafts.current.set(key, draft);
      renderDrafts((value) => value + 1);
      updateRows((current) =>
        current.map((row) =>
          worklistRowKey(row) === key ? { ...row, [field]: value } : row,
        ),
      );
      setRowStates((current) => ({
        ...current,
        [key]: nextRowState(current[key] || "EMPTY", {
          type: "VALUE_CHANGED",
        }),
      }));
      // FR-O3: entering a fresh result counts as having the analysis "open
      // in Edit" — colleagues should see the presence hint for this row too
      setEditingAnalysisId(target.analysisId);
    },
    [],
  );

  const handleEdit = useCallback((target: WorklistRow, epoch: number) => {
    const key = worklistRowKey(target);
    if (
      !ready() ||
      drafts.current.get(key)?.held ||
      analysisUnconfirmed(target.analysisId) ||
      isResultEntryBlocked(target) ||
      blockedRowKeys.current.has(key) ||
      epoch !== loadEpoch.current ||
      worklistLoading.current ||
      !mounted.current
    )
      return;
    // Editing must start from the stored value, not a rounded/truncated label.
    if (
      target.resultType !== "M" &&
      target.resultType !== "C" &&
      typeof target.rawResultValue === "string"
    ) {
      updateRows((current) =>
        current.map((row) =>
          worklistRowKey(row) === key
            ? { ...row, resultValue: target.rawResultValue as string }
            : row,
        ),
      );
    }
    setRowStates((current) => ({
      ...current,
      [key]: nextRowState(current[key] || "SAVED", {
        type: "EDIT_CLICKED",
      }),
    }));
    setEditingAnalysisId(target.analysisId);
  }, []);

  const handleSaveResponse = useCallback(
    (
      target: WorklistRow,
      response: SaveResponse | undefined,
      unchanged: boolean,
      confirmedRows?: WorklistRow[],
    ) => {
      const key = worklistRowKey(target);
      const draft = drafts.current.get(key);
      if (draft) draft.disposition = "rejected";
      if (
        response?.status === 409 &&
        response.error === "error.results.staleSave"
      ) {
        if (draft) draft.held = true;
        // FR-O2: the stale editor loses — nothing merged, refresh offered.
        setStaleInfo((current) => ({
          ...current,
          [key]: {
            modifiedBy:
              typeof response.modifiedBy === "string"
                ? response.modifiedBy
                : undefined,
            modifiedAt:
              typeof response.modifiedAt === "string"
                ? response.modifiedAt
                : undefined,
          },
        }));
        setRowStates((current) => ({
          ...current,
          [key]: nextRowState(current[key] || "EDITING", {
            type: "SAVE_REJECTED_STALE",
          }),
        }));
        return;
      }
      if (!isConfirmedSaveResponse(response)) {
        const errorKey =
          [response?.error, response?.errorKey].find(
            (candidate) =>
              typeof candidate === "string" && SAVE_ERROR_KEYS.has(candidate),
          ) ||
          (response?.success === false ||
          (typeof response?.status === "number" && response.status >= 400)
            ? "error.save.msg"
            : "common.api.invalidResponse");
        if (response?.status === 401 || response?.status === 403) {
          revokedSession.current = worklistStamp.current?.identity || null;
          clearPrivateState();
          setLoadErrorKey(errorKey);
          return;
        }
        const explicitRejection =
          response?.status === 409 &&
          typeof response.error === "string" &&
          entryReasons.has(response.error);
        if (draft && !explicitRejection) {
          draft.disposition = "unknown";
          draft.held = true;
        }
        if (specimenReasons.has(errorKey)) {
          const restricted = restrictTubes(rowsRef.current, {
            ...target,
            resultEntryBlockedReason: errorKey,
          });
          for (const row of restricted)
            if (isResultEntryBlocked(row))
              blockedRowKeys.current.add(worklistRowKey(row));
          updateRows(() => restricted);
        } else if (explicitRejection) {
          // Stop repeat callbacks immediately, before the read-only row renders.
          blockedRowKeys.current.add(key);
          updateRows((current) =>
            current.map((row) =>
              worklistRowKey(row) === key
                ? { ...row, resultEntryBlockedReason: errorKey }
                : row,
            ),
          );
        }
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({ id: errorKey }),
          kind: NotificationKinds.error,
        });
        setNotificationVisible(true);
        renderDrafts((value) => value + 1);
        return;
      }
      if (unchanged) drafts.current.delete(key);
      else if (draft) draft.disposition = "editing";
      // Other component drafts remain separately visible for explicit comparison.
      for (const sibling of drafts.current.values()) {
        if (sibling.row.analysisId === target.analysisId) sibling.held = true;
      }
      if (unchanged) {
        setRowStates((current) => ({
          ...current,
          [key]: nextRowState(current[key] || "EDITING", {
            type: "SAVE_SUCCEEDED",
          }),
        }));
      }
      // Replace server-owned identities/definitions from the independent GET,
      // not from the submitted row. In particular a newly created resultId must
      // be carried by the next edit instead of silently inserting another result.
      updateRows((current) =>
        restrictTubes(
          current.map((row) =>
            row.analysisId === target.analysisId
              ? confirmedRows!.find(
                  (saved) => worklistRowKey(saved) === worklistRowKey(row),
                )!
              : row,
          ),
        ),
      );
      setStaleInfo((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (unchanged) {
        setEditingAnalysisId((current) =>
          current === target.analysisId ? null : current,
        );
      }
      const triggered = [
        ...(response.reflex || []),
        ...(response.calculated || []),
      ];
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message:
          (unchanged
            ? intl.formatMessage({ id: "success.save.msg" })
            : intl.formatMessage({
                id: "results.workbench.submittedValueSaved",
                defaultMessage:
                  "The submitted value was saved. Your later edits are still unsaved; review them before saving again.",
              })) +
          (triggered.length
            ? " " +
              intl.formatMessage({ id: "label.results.reflexTriggered" }) +
              " " +
              triggered.join(", ")
            : ""),
        kind: NotificationKinds.success,
      });
      setNotificationVisible(true);
      renderDrafts((value) => value + 1);
    },
    [addNotification, intl, setNotificationVisible],
  );

  const handleSave = useCallback(
    (row: WorklistRow, epoch: number, revision: number) => {
      const key = worklistRowKey(row);
      // Ref guards duplicate events before React renders the disabled button.
      if (
        !ready() ||
        revision !== (rowEditRevisions.current[key] || 0) ||
        drafts.current.get(key)?.held ||
        analysisUnconfirmed(row.analysisId) ||
        pendingSaves.current.has(key) ||
        isResultEntryBlocked(row) ||
        blockedRowKeys.current.has(key) ||
        worklistLoading.current ||
        epoch !== loadEpoch.current ||
        !mounted.current
      )
        return;
      const submission = {
        epoch,
        revision,
      };
      const submittedSession = worklistStamp.current;
      const draft = drafts.current.get(key) || newEntryDraft(row);
      draft.row = { ...row };
      draft.disposition = "pending";
      drafts.current.set(key, draft);
      renderDrafts((value) => value + 1);
      pendingSaves.current.set(key, submission);
      setSavingRows((current) => new Set(current).add(key));
      // FR-O1: the payload names and carries exactly this analysis — never
      // the page. Untouched rows cannot be re-submitted or defaulted.
      const item: Record<string, unknown> = { ...row, isModified: true };
      delete item.result;
      // TestResultItem serializes reportable as "Y"/"N" but deserializes it
      // as boolean — same normalization the legacy page applies before POST
      item.reportable = item.reportable !== "N";
      const currentSubmission = () =>
        pendingSaves.current.get(key) === submission &&
        mounted.current &&
        submission.epoch === loadEpoch.current &&
        ready(submittedSession);
      const clearSubmission = () => {
        if (pendingSaves.current.get(key) !== submission) return;
        pendingSaves.current.delete(key);
        if (mounted.current)
          setSavingRows((current) => {
            const next = new Set(current);
            next.delete(key);
            return next;
          });
      };
      const complete = (
        response: SaveResponse | undefined,
        confirmedRows?: WorklistRow[],
      ) => {
        if (!currentSubmission()) return;
        clearSubmission();
        handleSaveResponse(
          row,
          response,
          submission.revision === (rowEditRevisions.current[key] || 0),
          confirmedRows,
        );
      };
      postToOpenElisServerJsonResponse(
        `/rest/results-entry/analysis/${row.analysisId}/result`,
        JSON.stringify({ testResult: item }),
        (response: SaveResponse | undefined) => {
          if (revokeFor(response, submittedSession)) return;
          if (!currentSubmission()) {
            clearSubmission();
            return;
          }
          if (!isConfirmedSaveResponse(response)) {
            complete(response);
            return;
          }
          const path = resultReadbackPath(row);
          const unconfirmed = () =>
            complete({
              status: 0,
              errorKey: "results.workbench.saveReadbackUnconfirmed",
            });
          if (!path) {
            unconfirmed();
            return;
          }
          // Keep the entire analysis frozen until this independent read completes.
          getFromOpenElisServer(
            path,
            (data: unknown, error?: EntryRequestError) => {
              if (revokeFor(error, submittedSession)) return;
              if (!currentSubmission()) {
                clearSubmission();
                return;
              }
              const verified = error
                ? null
                : confirmedResultReadback(row, response, data, rowsRef.current);
              if (!verified) {
                unconfirmed();
                return;
              }
              complete(response, verified);
            },
          );
        },
        submittedSession!.csrf,
      );
    },
    [handleSaveResponse],
  );

  const resumeDraft = (key: string) => {
    const draft = drafts.current.get(key),
      current = rowsRef.current.find((row) => worklistRowKey(row) === key);
    if (
      !ready() ||
      loading ||
      !draft ||
      analysisUnconfirmed(draft.row.analysisId) ||
      !canResumeDraft(draft, current)
    )
      return;
    draft.held = false;
    draft.disposition = "editing";
    rowEditRevisions.current[key] = (rowEditRevisions.current[key] || 0) + 1;
    updateRows((list) =>
      list.map((row) =>
        worklistRowKey(row) === key
          ? {
              ...row,
              resultValue: draft.row.resultValue,
              multiSelectResultValues: draft.row.multiSelectResultValues,
            }
          : row,
      ),
    );
    setRowStates((current) => ({ ...current, [key]: "EDITING" }));
    renderDrafts((value) => value + 1);
  };

  const discardDraft = (key: string) => {
    const draft = drafts.current.get(key);
    if (
      !ready() ||
      worklistLoading.current ||
      !draft?.held ||
      !["editing", "rejected"].includes(draft.disposition)
    )
      return;
    drafts.current.delete(key);
    rowEditRevisions.current[key] = (rowEditRevisions.current[key] || 0) + 1;
    // Discard only the separate local draft. Never delete or POST a clinical record.
    const current = rowsRef.current.find((row) => worklistRowKey(row) === key);
    setRowStates((states) => ({
      ...states,
      [key]: initialRowState(
        Boolean(
          current?.resultValue ||
          (current?.multiSelectResultValues &&
            current.multiSelectResultValues !== "{}"),
        ),
      ),
    }));
    setStaleInfo((info) => {
      const next = { ...info };
      delete next[key];
      return next;
    });
    renderDrafts((value) => value + 1);
  };

  const subjectCell = (row: WorklistRow): string => {
    const accession = row.accessionNumber || "";
    if (domain === "CLINICAL") {
      const patient = row.patientInfo || row.patientName || "";
      return patient ? `${accession} · ${patient}` : accession;
    }
    // FR-M2/M3: no patient identity outside CLINICAL; sample context instead
    return row.sampleType ? `${accession} · ${row.sampleType}` : accession;
  };

  const statusName = (statusId?: string): string => {
    const fallback =
      statusOptions.find((status) => status.id === statusId)?.value ||
      statusId ||
      "";
    return intl.formatMessage(
      {
        id: `results.analysisStatus.${statusId}`,
        defaultMessage: fallback,
      },
      {},
    );
  };

  return (
    <>
      <Prompt
        when={drafts.current.size > 0}
        message={intl.formatMessage({ id: "security.loginUnsavedWarning" })}
      />
      <AlertDialog />
      <main className="results-workbench" aria-labelledby="results-title">
        <PageBreadCrumb
          breadcrumbs={[
            { label: "home.label", link: "/" },
            {
              label: "results.workbench.title",
              link: "/Results",
              isCurrentPage: true,
            },
          ]}
        />
        <ProductPageHeader
          titleId="results-title"
          title={<FormattedMessage id="results.workbench.title" />}
          subtitle={<FormattedMessage id="results.workbench.subtitle" />}
          actions={
            <Tag type={rows.length > 0 ? "blue" : "gray"}>
              <FormattedMessage
                id="results.workbench.pendingCount"
                values={{ count: rows.length }}
              />
            </Tag>
          }
        />

        <Tile className="results-workbench__filters">
          <div className="results-workbench__section-heading">
            <div>
              <h2>
                <FormattedMessage id="results.workbench.filters.title" />
              </h2>
              <p>
                <FormattedMessage id="results.workbench.filters.subtitle" />
              </p>
            </div>
            {domain !== "CLINICAL" && (
              <Tag type="cyan">
                {formatDomainMessage(intl, "label.results.domain", domain)}
              </Tag>
            )}
          </div>

          <div className="results-workbench__filter-grid">
            <div className="results-workbench__field">
              <div className="cds--label">
                <FormattedMessage id="results.workbench.accession" />
              </div>
              <Search
                id="unifiedResultsSearch"
                closeButtonLabelText={intl.formatMessage({
                  id: "carbon.search.clear",
                })}
                labelText={intl.formatMessage({
                  id: "results.workbench.accession",
                })}
                placeholder={intl.formatMessage({
                  id: "results.workbench.accession.placeholder",
                })}
                value={searchText}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchText(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") {
                    loadWorklist();
                  }
                }}
              />
            </div>
            <Select
              id="unifiedResultsLabUnit"
              labelText={intl.formatMessage({ id: "label.results.labUnit" })}
              value={selectedLabUnit}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setSelectedLabUnit(e.target.value)
              }
            >
              <SelectItem
                text={intl.formatMessage({
                  id: "results.workbench.labUnit.all",
                })}
                value=""
              />
              {labUnits.map((unit) => (
                <SelectItem text={unit.value} value={unit.id} key={unit.id} />
              ))}
            </Select>
            <CustomDatePicker
              id="unifiedResultsDate"
              labelText={intl.formatMessage({ id: "label.results.date" })}
              value={collectionDate}
              updateStateValue
              onChange={setCollectionDate}
            />
            <Button onClick={() => loadWorklist()} disabled={loading}>
              <FormattedMessage id="results.workbench.applyFilters" />
            </Button>
          </div>

          <div
            className="results-workbench__status-filters"
            aria-label={intl.formatMessage({
              id: "results.workbench.statusFilters",
            })}
          >
            <Button
              kind={statusFilter === "ALL" ? "primary" : "tertiary"}
              size="sm"
              onClick={() => setStatusFilter("ALL")}
            >
              <FormattedMessage id="label.results.status.all" /> ({rows.length})
            </Button>
            {statusOptions
              .filter((status) => statusCounts[status.id])
              .map((status) => (
                <Button
                  key={status.id}
                  kind={statusFilter === status.id ? "primary" : "tertiary"}
                  size="sm"
                  onClick={() => setStatusFilter(status.id)}
                >
                  {statusName(status.id)} ({statusCounts[status.id]})
                </Button>
              ))}
          </div>
        </Tile>

        {savingRows.size > 0 && (
          <InlineLoading
            description={intl.formatMessage({
              id: "results.workbench.savingAndChecking",
            })}
          />
        )}
        <ResultDraftReview
          drafts={[...drafts.current.entries()]}
          currentRows={rows}
          enabled={ready() && !loading}
          onResume={resumeDraft}
          onDiscard={discardDraft}
          displayValue={blockedResultDisplay}
          rowKey={worklistRowKey}
        />
        {presenceUnavailable && rows.length > 0 && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({
              id: "results.workbench.presenceUnavailable",
            })}
            subtitle={intl.formatMessage({
              id: "results.workbench.presenceUnavailableHint",
            })}
          />
        )}
        {!signingIdentityReady && rows.length > 0 && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({
              id: "results.workbench.signingIdentityIncomplete",
            })}
          />
        )}
        <Tile className="results-workbench__list">
          <div className="results-workbench__section-heading">
            <div>
              <h2>
                <FormattedMessage id="results.workbench.list.title" />
              </h2>
              <p>
                <FormattedMessage id="results.workbench.list.subtitle" />
              </p>
            </div>
            {loading && (
              <InlineLoading
                description={intl.formatMessage({
                  id: "results.workbench.loading",
                })}
              />
            )}
          </div>

          {loadErrorKey && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: "results.workbench.loadFailed" })}
              subtitle={intl.formatMessage({ id: loadErrorKey })}
            />
          )}
          {!loading &&
          !loadErrorKey &&
          hasLoaded &&
          filteredRows.length === 0 ? (
            <InlineNotification
              className="results-workbench__empty"
              kind="info"
              hideCloseButton
              lowContrast
              title={intl.formatMessage({
                id: "results.workbench.empty.title",
              })}
              subtitle={intl.formatMessage({
                id: "results.workbench.empty.subtitle",
              })}
            />
          ) : (
            <div className="results-workbench__table-scroll">
              <TableContainer>
                <Table size="lg">
                  <TableHead>
                    <TableRow>
                      <TableHeader>
                        {formatDomainMessage(
                          intl,
                          "label.results.subject",
                          domain,
                        )}
                      </TableHeader>
                      <TableHeader>
                        <FormattedMessage id="label.results.test" />
                      </TableHeader>
                      <TableHeader>
                        {formatDomainMessage(
                          intl,
                          "label.results.range",
                          domain,
                        )}
                      </TableHeader>
                      <TableHeader>
                        <FormattedMessage id="label.results.result" />
                      </TableHeader>
                      <TableHeader>
                        <FormattedMessage id="label.results.status" />
                      </TableHeader>
                      <TableHeader>
                        <FormattedMessage id="label.results.actions" />
                      </TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedRows.map((row) => {
                      const key = worklistRowKey(row);
                      // Keep a delayed signing callback bound to the rendered
                      // value's revision and worklist, not a later edit/reload.
                      const renderedEpoch = loadEpoch.current;
                      const renderedRevision =
                        rowEditRevisions.current[key] || 0;
                      const state = rowStates[key] || "EMPTY";
                      const draft = drafts.current.get(key);
                      const stateHeld = Boolean(
                        draft?.held || analysisUnconfirmed(row.analysisId),
                      );
                      const blocked = isResultEntryBlocked(row) || stateHeld;
                      const stale = staleInfo[key];
                      const reviewer = presence[row.analysisId];
                      return (
                        <React.Fragment key={key}>
                          <TableRow>
                            <TableCell>
                              {subjectCell(row)}
                              {reviewer && (
                                <Tag
                                  type="purple"
                                  className="unifiedResultsChip"
                                >
                                  <FormattedMessage
                                    id="label.results.inReviewBy"
                                    values={{ 0: reviewer }}
                                  />
                                </Tag>
                              )}
                            </TableCell>
                            <TableCell>{row.testName}</TableCell>
                            <TableCell>
                              {row.normalRange}{" "}
                              {row.unitsOfMeasure ? row.unitsOfMeasure : ""}
                            </TableCell>
                            <TableCell>
                              {blocked ? (
                                <span className="unifiedResultsReadOnlyValue">
                                  {blockedResultDisplay(row)}
                                </span>
                              ) : (
                                <PolymorphicResultCell
                                  row={row}
                                  editable={
                                    isRowEditable(state) && ready() && !loading
                                  }
                                  onValueChange={(field, value) =>
                                    handleValueChange(
                                      row,
                                      field,
                                      value,
                                      renderedEpoch,
                                    )
                                  }
                                />
                              )}
                            </TableCell>
                            <TableCell>
                              {statusName(row.analysisStatusId)}
                            </TableCell>
                            <TableCell>
                              {!blocked && showEdit(state) && (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  onClick={() => handleEdit(row, renderedEpoch)}
                                >
                                  <FormattedMessage id="label.results.edit" />
                                </Button>
                              )}
                              {!blocked &&
                                showSave(state) &&
                                ready() &&
                                signingIdentityReady && (
                                  <ESignatureButton
                                    signatureApi={signatureApiFor(
                                      row,
                                      renderedEpoch,
                                      renderedRevision,
                                    )}
                                    meaning={SignatureMeaning.AUTHORED}
                                    context={`${intl.formatMessage({
                                      id: "label.results.save",
                                    })} ${row.accessionNumber} - ${row.testName}`}
                                    recordType="RESULT"
                                    recordId={row.analysisId}
                                    onSign={() =>
                                      handleSave(
                                        row,
                                        renderedEpoch,
                                        renderedRevision,
                                      )
                                    }
                                    disabled={
                                      savingRows.has(key) || loading || !ready()
                                    }
                                    size="sm"
                                  >
                                    <FormattedMessage id="label.results.save" />
                                  </ESignatureButton>
                                )}
                            </TableCell>
                          </TableRow>
                          {isResultEntryBlocked(row) && (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <InlineNotification
                                  kind="warning"
                                  hideCloseButton
                                  lowContrast
                                  title={intl.formatMessage({
                                    id: entryReason(row),
                                  })}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                          {stale && (
                            <TableRow>
                              <TableCell colSpan={6}>
                                <InlineNotification
                                  kind="error"
                                  hideCloseButton
                                  lowContrast
                                  title={intl.formatMessage(
                                    { id: "error.results.staleSave" },
                                    {
                                      0:
                                        stale.modifiedBy ||
                                        intl.formatMessage({
                                          id: "label.results.anotherUser",
                                        }),
                                      1: stale.modifiedAt || "",
                                    },
                                  )}
                                />
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  disabled={loading}
                                  onClick={() => loadWorklist()}
                                >
                                  <FormattedMessage id="label.results.refresh" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          )}
          {filteredRows.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              pageSizes={[25, 50, 100]}
              totalItems={filteredRows.length}
              backwardText={intl.formatMessage({
                id: "pagination.previousPage",
              })}
              forwardText={intl.formatMessage({ id: "pagination.nextPage" })}
              itemsPerPageText={intl.formatMessage({
                id: "pagination.itemsPerPage",
              })}
              itemRangeText={(min, max, total) =>
                intl.formatMessage(
                  { id: "pagination.item-range" },
                  { min, max, total },
                )
              }
              itemText={(min, max) =>
                intl.formatMessage({ id: "pagination.item" }, { min, max })
              }
              pageRangeText={(_current, total) =>
                intl.formatMessage({ id: "pagination.page-range" }, { total })
              }
              pageSelectLabelText={(total) =>
                intl.formatMessage({ id: "pagination.page-select" }, { total })
              }
              pageText={(currentPage) =>
                intl.formatMessage(
                  { id: "pagination.page" },
                  { page: currentPage },
                )
              }
              onChange={({
                page: newPage,
                pageSize: newPageSize,
              }: {
                page: number;
                pageSize: number;
              }) => {
                setPage(newPage);
                setPageSize(newPageSize);
              }}
            />
          )}
        </Tile>
      </main>
    </>
  );
};

export default UnifiedResults;
