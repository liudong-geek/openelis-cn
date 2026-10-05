import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useContext,
  useLayoutEffect,
  useCallback,
} from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory, useLocation } from "react-router-dom";
import "../../Style.css";
import "./ReferredOutTests.scss";
import { getFromOpenElisServer, Roles } from "../../utils/Utils";
import {
  Button,
  Select,
  SelectItem,
  TextInput,
  Grid,
  Column,
  FilterableMultiSelect,
  InlineLoading,
  InlineNotification,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableHeader,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TableCell,
  Pagination,
} from "@carbon/react";
import { Filter, Renew, Printer } from "@carbon/react/icons";
import config from "../../../config.json";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import SearchPatientForm from "../../patient/SearchPatientForm";
import { ConfigurationContext } from "../../layout/Layout";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import {
  pendingSummarySessionKey,
  readPendingSummarySession,
} from "../../home/pendingSummarySession";
import {
  recentReferralDraft,
  referralHistoryOwner,
  forgetReferralHistoryOwner,
  buildReferralParams,
  readReferralRecords,
} from "./referralQuery";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "referral.label.referredOutTests", link: "/ReferredOutTests" },
];
const statusIds = {
  CREATED: "label.referOut.status.draft",
  SENT: "shipment.state.sent",
  RECEIVED: "label.referOut.status.received",
  FINISHED: "label.referOut.status.completed",
  CANCELED: "label.referOut.status.cancelled",
};
const modes = {
  TEST_AND_DATES: "referral.query.records",
  PATIENT: "referral.main.button",
  LAB_NUMBER: "referral.result.labNumber",
};
const failureIds = {
  date: "referral.query.invalidDate",
  conditions: "referral.query.conditions",
  patient: "referral.query.choosePatient",
  number: "referral.query.enterNumber",
  configuration: "referral.query.configuration",
  invalid: "referral.query.invalid",
  unauthenticated: "referral.query.session",
  forbidden: "referral.query.forbidden",
  scope: "referral.query.scope",
  unavailable: "referral.search.error.detail",
};

export default function ReferredOutTests() {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const { userSessionDetails = {} } =
    useContext(UserSessionDetailsContext) || {};
  const dateLocale = configurationProperties.DEFAULT_DATE_LOCALE;
  let actor;
  try {
    actor = pendingSummarySessionKey(userSessionDetails);
  } catch {
    actor = "";
  }
  const actorRef = useRef(actor);
  actorRef.current = actor;
  const historyOwner = referralHistoryOwner(actor);
  const initial = useRef(null);
  if (!initial.current) {
    const link = new URLSearchParams(location.search);
    const restored = location.state?.referralQuery;
    const hasRestored = Boolean(
      actor && restored?.owner === historyOwner && restored.draft,
    );
    const draft = hasRestored ? restored.draft : recentReferralDraft();
    initial.current = {
      draft: { ...draft },
      advanced: restored?.owner === historyOwner ? restored.advanced : false,
      page: restored?.owner === historyOwner ? restored.page : 1,
      pageSize: restored?.owner === historyOwner ? restored.pageSize : 10,
      patient: restored?.owner === historyOwner ? restored.patient : null,
      patientSearch:
        restored?.owner === historyOwner ? restored.patientSearch : undefined,
      link,
      patientLink:
        !hasRestored && link.get("patientId")
          ? new URLSearchParams({ patientId: link.get("patientId") }).toString()
          : "",
    };
    if (!hasRestored && link.get("patientId"))
      initial.current.draft = {
        ...recentReferralDraft(),
        mode: "PATIENT",
        patientId: link.get("patientId"),
      };
    else if (
      !hasRestored &&
      (link.get("selectedTest") || link.get("testSectionId"))
    )
      initial.current.draft = {
        ...recentReferralDraft(),
        startDate: "",
        endDate: "",
        testIds: link.get("selectedTest") ? [link.get("selectedTest")] : [],
        testUnitIds: link.get("testSectionId")
          ? [link.get("testSectionId")]
          : [],
      };
  }
  const [draft, setDraft] = useState(initial.current.draft);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [advanced, setAdvanced] = useState(initial.current.advanced);
  const [patient, setPatient] = useState(initial.current.patient);
  const [patientSearch, setPatientSearch] = useState(
    initial.current.patientSearch,
  );
  const [page, setPage] = useState(initial.current.page);
  const [pageSize, setPageSize] = useState(initial.current.pageSize);
  const [options, setOptions] = useState({
    tests: [],
    sections: [],
    status: "loading",
  });
  const [optionsVersion, setOptionsVersion] = useState(0);
  const [boundaryEpoch, setBoundaryEpoch] = useState(0);
  const epochRef = useRef(boundaryEpoch);
  epochRef.current = boundaryEpoch;
  const [searchStatus, setSearchStatus] = useState("idle");
  const [failure, setFailure] = useState("");
  const [responseDataShow, setResponseDataShow] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [reportStatus, setReportStatus] = useState("idle");
  const request = useRef({ sequence: 0, controller: null, timer: null });
  const automatic = useRef(false);
  const applied = useRef(null);
  const loading = searchStatus === "loading";
  const patientLinkConsumed = useRef(false);
  const invalidate = () => {
    request.current.sequence += 1;
    request.current.controller?.abort();
    clearTimeout(request.current.timer);
    applied.current = null;
    setResponseDataShow([]);
    setSelectedRowIds([]);
    setReportStatus("idle");
    setSearchStatus("idle");
    setFailure("");
  };
  const clearPrivateQuery = () => {
    invalidate();
    automatic.current = true;
    forgetReferralHistoryOwner(actorRef.current);
    const fresh = recentReferralDraft();
    draftRef.current = fresh;
    setDraft(fresh);
    setPatient(null);
    setPatientSearch(undefined);
    setAdvanced(false);
    setPage(1);
    epochRef.current += 1;
    setBoundaryEpoch(epochRef.current);
    patientLinkConsumed.current = true;
  };
  const changeDraft = (patch) => {
    const next = { ...draftRef.current, ...patch };
    if (JSON.stringify(next) === JSON.stringify(draftRef.current)) return;
    invalidate();
    draftRef.current = next;
    setDraft(next);
    setPage(1);
  };
  const runSearch = async (
    candidate = draftRef.current,
    restorePage = false,
  ) => {
    invalidate();
    let params;
    try {
      if (!actorRef.current) throw { kind: "unauthenticated" };
      params = buildReferralParams(candidate, dateLocale);
    } catch (error) {
      setSearchStatus("error");
      setFailure(error.kind || "invalid");
      return;
    }
    const controller = new AbortController();
    const sequence = request.current.sequence;
    const scope = actorRef.current;
    const key = JSON.stringify(candidate);
    request.current.controller = controller;
    setSearchStatus("loading");
    if (!restorePage) setPage(1);
    request.current.timer = setTimeout(() => {
      if (sequence !== request.current.sequence) return;
      controller.abort();
      setSearchStatus("error");
      setFailure("unavailable");
    }, 20000);
    try {
      const result = await readReferralRecords(
        params.toString(),
        controller.signal,
        scope,
      );
      if (
        controller.signal.aborted ||
        sequence !== request.current.sequence ||
        scope !== actorRef.current ||
        key !== JSON.stringify(draftRef.current)
      )
        return;
      const rows = result.rows.map((row, index) => ({
        ...row,
        id: String(index),
        disabled: Boolean(row.disabled || !row.analysisId),
        referralStatusDisplay: statusIds[row.referralStatus]
          ? intl.formatMessage({ id: statusIds[row.referralStatus] })
          : row.referralStatusDisplay ||
            intl.formatMessage({ id: "referral.query.unknownStatus" }),
      }));
      applied.current = { key, actor: scope };
      setResponseDataShow(rows);
      setSearchStatus(rows.length ? "success" : "empty");
      if (restorePage)
        setPage((current) =>
          Math.max(
            1,
            Math.min(current, Math.ceil(rows.length / pageSize) || 1),
          ),
        );
    } catch (error) {
      if (
        controller.signal.aborted ||
        sequence !== request.current.sequence ||
        scope !== actorRef.current
      )
        return;
      if (["scope", "unauthenticated", "forbidden"].includes(error.kind))
        clearPrivateQuery();
      setFailure(error.kind || "unavailable");
      setSearchStatus("error");
    } finally {
      if (sequence === request.current.sequence)
        clearTimeout(request.current.timer);
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    const scope = actor;
    let active = true;
    let tests;
    let sections;
    setOptions({ tests: [], sections: [], status: "loading" });
    const publish = () => {
      if (
        !active ||
        scope !== actorRef.current ||
        tests === undefined ||
        sections === undefined
      )
        return;
      clearTimeout(timer);
      const validOptions = (items) =>
        Array.isArray(items) &&
        items.every(
          (item) =>
            item &&
            /^[1-9]\d*$/.test(String(item.id)) &&
            typeof item.value === "string",
        );
      const okay = validOptions(tests) && validOptions(sections);
      setOptions({
        tests: okay ? tests : [],
        sections: okay ? sections : [],
        status: okay ? "ready" : "error",
      });
    };
    const timer = setTimeout(() => {
      if (active) {
        active = false;
        controller.abort();
        setOptions({ tests: [], sections: [], status: "error" });
      }
    }, 20000);
    void readPendingSummarySession(controller.signal)
      .then((owner) => {
        if (!active || owner !== scope || scope !== actorRef.current)
          throw { kind: "scope" };
        getFromOpenElisServer(
          "/rest/test-list",
          (value) => {
            tests = value;
            publish();
          },
          controller.signal,
        );
        getFromOpenElisServer(
          `/rest/user-test-sections/${Roles.RESULTS}`,
          (value) => {
            sections = value;
            publish();
          },
          controller.signal,
        );
      })
      .catch((error) => {
        if (active) {
          clearTimeout(timer);
          if (["scope", "unauthenticated", "forbidden"].includes(error.kind)) {
            clearPrivateQuery();
            setFailure(error.kind);
            setSearchStatus("error");
          }
          setOptions({ tests: [], sections: [], status: "error" });
        }
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [actor, optionsVersion]);
  useEffect(() => {
    if (
      automatic.current ||
      !actor ||
      !dateLocale ||
      options.status !== "ready"
    )
      return;
    automatic.current = true;
    const value = draftRef.current;
    if (
      value.testIds.some(
        (id) => !options.tests.some((item) => String(item.id) === id),
      ) ||
      value.testUnitIds.some(
        (id) => !options.sections.some((item) => String(item.id) === id),
      )
    ) {
      setFailure("invalid");
      setSearchStatus("error");
      return;
    }
    void runSearch(value, true);
  }, [dateLocale, options.status]);
  useEffect(() => {
    return () => {
      request.current.sequence += 1;
      request.current.controller?.abort();
      clearTimeout(request.current.timer);
    };
  }, [actor]);
  const previousActor = useRef(actor);
  const hasAuthenticated = useRef(Boolean(actor));
  useLayoutEffect(() => {
    if (previousActor.current === actor) return;
    previousActor.current = actor;
    if (!hasAuthenticated.current && actor) {
      hasAuthenticated.current = true;
      automatic.current = false;
      setFailure("");
      setSearchStatus("idle");
      return;
    }
    invalidate();
    automatic.current = true;
    const fresh = recentReferralDraft();
    draftRef.current = fresh;
    setDraft(fresh);
    setPatient(null);
    setPatientSearch(undefined);
    setAdvanced(false);
    setPage(1);
    setFailure("scope");
    setSearchStatus("error");
  }, [actor]);
  useEffect(() => {
    if (!actor) return;
    history.replace({
      ...location,
      state: {
        ...location.state,
        referralQuery: {
          owner: historyOwner,
          draft,
          advanced,
          page,
          pageSize,
          patient,
          patientSearch,
        },
      },
    });
  }, [
    actor,
    historyOwner,
    draft,
    advanced,
    page,
    pageSize,
    patient,
    patientSearch,
  ]);
  useEffect(() => {
    const check = (event) => {
      if (
        event?.type === "storage" &&
        event.key !== null &&
        !["CSRF", "userSessionDetails"].includes(event.key)
      )
        return;
      clearPrivateQuery();
      setOptionsVersion((value) => value + 1);
      setFailure("scope");
      setSearchStatus("error");
    };
    window.addEventListener("storage", check);
    return () => window.removeEventListener("storage", check);
  }, []);
  useEffect(() => {
    if (draft.mode === "PATIENT") patientLinkConsumed.current = true;
  }, [draft.mode]);
  const rememberPatientSearch = useCallback(
    (value) => {
      if (
        actor === actorRef.current &&
        boundaryEpoch === epochRef.current &&
        draftRef.current.mode === "PATIENT"
      )
        setPatientSearch(value);
    },
    [actor, boundaryEpoch],
  );
  const currentResult =
    applied.current?.actor === actor &&
    applied.current?.key === JSON.stringify(draft);
  const selectedAnalysisIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedRowIds
            .map(
              (id) => responseDataShow.find((row) => row.id === id)?.analysisId,
            )
            .filter(Boolean),
        ),
      ),
    [responseDataShow, selectedRowIds],
  );
  const isRowSelectable = (rowId) => {
    const row = responseDataShow.find((item) => item.id === rowId);
    return Boolean(currentResult && row && !row.disabled && row.analysisId);
  };
  const toggleRowSelection = (rowId) => {
    if (!isRowSelectable(rowId)) return;
    setSelectedRowIds((ids) =>
      ids.includes(rowId) ? ids.filter((id) => id !== rowId) : [...ids, rowId],
    );
  };
  const renderCell = (cell, row) =>
    cell.info.header === "select" ? (
      <TableSelectRow
        key={cell.id}
        id={cell.id}
        checked={selectedRowIds.includes(row.id)}
        disabled={!isRowSelectable(row.id)}
        name="selectRowCheckbox"
        aria-label={intl.formatMessage({
          id: selectedRowIds.includes(row.id)
            ? "referral.unselect.row"
            : "referral.select.row",
        })}
        onSelect={(event) => {
          event?.stopPropagation();
          toggleRowSelection(row.id);
        }}
      />
    ) : (
      <TableCell key={cell.id}>
        {cell.info.header === "notes" ? (
          <span style={{ whiteSpace: "pre-wrap" }}>
            {String(cell.value || "").replace(/<br\s*\/?>/gi, "\n")}
          </span>
        ) : (
          (cell.value ?? "—")
        )}
      </TableCell>
    );
  const handlePageChange = ({ page, pageSize }) => {
    setPage(page);
    setPageSize(pageSize);
  };
  const translateMenu = (id) =>
    intl.formatMessage({
      id: ["clear.all", "clear.selection"].includes(id)
        ? "referral.query.clearSelections"
        : `carbon.${id}`,
    });
  const translateTable = (id) => intl.formatMessage({ id });
  const print = () => {
    if (!currentResult || !selectedAnalysisIds.length) return;
    const params = new URLSearchParams({
      report: "patientCILNSP_vreduit",
      type: "patient",
      analysisIds: selectedAnalysisIds.join(","),
    });
    try {
      const report = window.open(
        `${config.serverBaseUrl}/ReportPrint?${params}`,
        "_blank",
      );
      if (!report) throw new Error();
      report.opener = null;
      report.focus?.();
      setReportStatus("idle");
    } catch {
      setReportStatus("error");
    }
  };
  const dateSummary =
    draft.startDate || draft.endDate
      ? `${draft.startDate || "…"} — ${draft.endDate || "…"}`
      : intl.formatMessage({ id: "referral.query.anyDate" });
  const selectedTests = options.tests.filter((item) =>
    draft.testIds.includes(String(item.id)),
  );
  const selectedSections = options.sections.filter((item) =>
    draft.testUnitIds.includes(String(item.id)),
  );
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="referral-title"
        title={<FormattedMessage id="referral.out.head" />}
        subtitle={<FormattedMessage id="referral.query.subtitle" />}
      />
      <div className="referral-workspace">
        <section
          className="referral-query-panel"
          aria-label={intl.formatMessage({ id: "referral.search" })}
        >
          <div className="referral-query-toolbar">
            <Select
              id="referral-query-mode"
              labelText={intl.formatMessage({ id: "referral.query.mode" })}
              value={draft.mode}
              onChange={(event) => changeDraft({ mode: event.target.value })}
            >
              {Object.entries(modes).map(([value, id]) => (
                <SelectItem
                  key={value}
                  value={value}
                  text={intl.formatMessage({ id })}
                />
              ))}
            </Select>
            {draft.mode === "LAB_NUMBER" ? (
              <TextInput
                id="labNumberInput"
                labelText={intl.formatMessage({ id: "sample.label.labnumber" })}
                placeholder={intl.formatMessage({ id: "referral.input" })}
                value={draft.labNumber}
                onChange={(event) =>
                  changeDraft({ labNumber: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runSearch();
                  }
                }}
              />
            ) : (
              <div className="referral-query-summary">
                <strong>
                  <FormattedMessage
                    id={
                      draft.mode === "PATIENT"
                        ? "referral.query.choosePatient"
                        : draft.dateType === "RESULT"
                          ? "referral.dateType.result"
                          : "referral.dateType.sent"
                    }
                  />
                </strong>
                <span>
                  {draft.mode === "PATIENT"
                    ? patient
                      ? `${patient.lastName || ""}${patient.firstName || ""}`
                      : draft.patientId ||
                        intl.formatMessage({ id: "referral.query.patientHint" })
                    : dateSummary}
                </span>
              </div>
            )}
            <div className="referral-query-actions">
              <Button
                size="md"
                disabled={
                  loading ||
                  (draft.mode === "PATIENT" && !draft.patientId) ||
                  (draft.mode === "LAB_NUMBER" && !draft.labNumber.trim())
                }
                onClick={() => void runSearch()}
              >
                <FormattedMessage id="label.button.search" />
              </Button>
              {draft.mode === "TEST_AND_DATES" && (
                <Button
                  size="md"
                  kind="ghost"
                  renderIcon={Filter}
                  aria-expanded={advanced}
                  aria-controls="referral-advanced"
                  onClick={() => setAdvanced((value) => !value)}
                >
                  <FormattedMessage
                    id={
                      advanced ? "referral.query.collapse" : "advanced.search"
                    }
                  />
                </Button>
              )}
              <Button
                size="md"
                kind="secondary"
                renderIcon={Renew}
                onClick={() => {
                  const fresh = recentReferralDraft();
                  changeDraft(fresh);
                  setPatient(null);
                  setPatientSearch(undefined);
                  setAdvanced(false);
                  void runSearch(fresh);
                }}
              >
                <FormattedMessage id="label.button.reset" />
              </Button>
            </div>
          </div>
          {draft.mode === "TEST_AND_DATES" && (
            <p className="referral-query-applied">
              <FormattedMessage id="referral.query.rangeHint" />
              {selectedSections.length > 0 && (
                <span>
                  {" "}
                  · {selectedSections.map((item) => item.value).join("、")}
                </span>
              )}
              {selectedTests.length > 0 && (
                <span>
                  {" "}
                  · {selectedTests.map((item) => item.value).join("、")}
                </span>
              )}
            </p>
          )}
          {draft.mode === "TEST_AND_DATES" && advanced && (
            <div id="referral-advanced" className="referral-advanced">
              <Select
                id="dateType"
                labelText={intl.formatMessage({
                  id: "referral.query.dateType",
                })}
                value={draft.dateType}
                onChange={(event) =>
                  changeDraft({ dateType: event.target.value })
                }
              >
                <SelectItem
                  value="SENT"
                  text={intl.formatMessage({ id: "referral.dateType.sent" })}
                />
                <SelectItem
                  value="RESULT"
                  text={intl.formatMessage({ id: "referral.dateType.result" })}
                />
              </Select>
              <TextInput
                type="date"
                id="startDate"
                labelText={intl.formatMessage({ id: "eorder.date.start" })}
                value={draft.startDate}
                onChange={(event) =>
                  changeDraft({ startDate: event.target.value })
                }
              />
              <TextInput
                type="date"
                id="endDate"
                labelText={intl.formatMessage({ id: "eorder.date.end" })}
                value={draft.endDate}
                onChange={(event) =>
                  changeDraft({ endDate: event.target.value })
                }
              />
              <FilterableMultiSelect
                id="testunits"
                titleText={intl.formatMessage({ id: "search.label.testunit" })}
                items={options.sections}
                selectedItems={selectedSections}
                itemToString={(item) => item?.value || ""}
                onChange={({ selectedItems }) =>
                  changeDraft({
                    testUnitIds: selectedItems.map((item) => String(item.id)),
                  })
                }
                clearSelectionText={intl.formatMessage({
                  id: "carbon.multiselect.clearSelection",
                })}
                clearSelectionDescription={intl.formatMessage({
                  id: "carbon.multiselect.totalSelected",
                })}
                translateWithId={translateMenu}
                locale={intl.locale}
                selectionFeedback="top-after-reopen"
              />
              <FilterableMultiSelect
                id="testnames"
                titleText={intl.formatMessage({ id: "search.label.test" })}
                items={options.tests}
                selectedItems={selectedTests}
                itemToString={(item) => item?.value || ""}
                onChange={({ selectedItems }) =>
                  changeDraft({
                    testIds: selectedItems.map((item) => String(item.id)),
                  })
                }
                clearSelectionText={intl.formatMessage({
                  id: "carbon.multiselect.clearSelection",
                })}
                clearSelectionDescription={intl.formatMessage({
                  id: "carbon.multiselect.totalSelected",
                })}
                translateWithId={translateMenu}
                locale={intl.locale}
                selectionFeedback="top-after-reopen"
              />
              <p>
                <FormattedMessage id="referral.out.note" />
              </p>
            </div>
          )}
          {draft.mode === "PATIENT" && (
            <div className="referral-patient-search">
              {draft.patientId && (
                <div className="referral-selected-patient">
                  <span>
                    <FormattedMessage id="referral.query.selectedPatient" />{" "}
                    {patient
                      ? `${patient.lastName || ""}${patient.firstName || ""}`
                      : ""}{" "}
                    · {draft.patientId}
                  </span>
                  <Button
                    size="md"
                    kind="ghost"
                    onClick={() => {
                      changeDraft({ patientId: "" });
                      setPatient(null);
                      epochRef.current += 1;
                      setBoundaryEpoch(epochRef.current);
                      patientLinkConsumed.current = true;
                    }}
                  >
                    <FormattedMessage id="label.button.remove" />
                  </Button>
                </div>
              )}
              <SearchPatientForm
                key={`${actor}:${boundaryEpoch}`}
                initialSearch={
                  !patientLinkConsumed.current &&
                  draft.patientId === initial.current.draft.patientId
                    ? initial.current.patientLink
                    : ""
                }
                compactSearch
                initialState={patientSearch}
                onStateChange={rememberPatientSearch}
                getSelectedPatient={(value) => {
                  if (
                    !value?.patientPK ||
                    actor !== actorRef.current ||
                    boundaryEpoch !== epochRef.current ||
                    draftRef.current.mode !== "PATIENT"
                  )
                    return;
                  setPatient({
                    lastName: value.lastName,
                    firstName: value.firstName,
                  });
                  const next = {
                    ...draftRef.current,
                    patientId: String(value.patientPK),
                  };
                  changeDraft({ patientId: next.patientId });
                  void runSearch(next);
                }}
              />
            </div>
          )}
          {options.status === "error" && (
            <div className="referral-options-error">
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title={intl.formatMessage({
                  id: "referral.query.optionsFailed",
                })}
              />
              <Button
                size="sm"
                kind="ghost"
                onClick={() => setOptionsVersion((value) => value + 1)}
              >
                <FormattedMessage id="button.retry" />
              </Button>
            </div>
          )}
        </section>
        <section
          className="referral-results-panel"
          aria-label={intl.formatMessage({ id: "referral.query.results" })}
        >
          <div className="referral-results-heading">
            <h2>
              <FormattedMessage id="referral.query.results" />
            </h2>
            {currentResult && (
              <span>
                {intl.formatMessage(
                  { id: "referral.query.count" },
                  { count: responseDataShow.length },
                )}
              </span>
            )}
          </div>
          {loading && (
            <InlineLoading
              description={intl.formatMessage({
                id: "referral.search.loading",
              })}
            />
          )}
          {searchStatus === "idle" && (
            <p className="referral-empty">
              <FormattedMessage id="referral.query.awaitSearch" />
            </p>
          )}
          {searchStatus === "empty" && (
            <div className="referral-empty">
              <strong>
                <FormattedMessage id="referral.search.empty.title" />
              </strong>
              <p>
                <FormattedMessage id="referral.search.empty.detail" />
              </p>
            </div>
          )}
          {searchStatus === "error" && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={intl.formatMessage({ id: "referral.search.error.title" })}
              subtitle={intl.formatMessage({
                id: failureIds[failure] || failureIds.unavailable,
              })}
            />
          )}
          {responseDataShow.length > 0 && currentResult && (
            <>
              <div className="referral-results-actions">
                <Button
                  kind="secondary"
                  size="md"
                  disabled={!selectedAnalysisIds.length}
                  renderIcon={Printer}
                  onClick={print}
                >
                  <FormattedMessage id="referral.print.selected.patient.reports" />
                </Button>
                <Button
                  kind="ghost"
                  size="md"
                  disabled={responseDataShow
                    .filter((row) => !row.disabled)
                    .every((row) => selectedRowIds.includes(row.id))}
                  onClick={() =>
                    setSelectedRowIds(
                      responseDataShow
                        .filter((row) => !row.disabled)
                        .map((row) => row.id),
                    )
                  }
                >
                  <FormattedMessage id="referral.print.selected.patient.reports.selectall.button" />
                </Button>
                <Button
                  kind="ghost"
                  size="md"
                  disabled={!selectedRowIds.length}
                  onClick={() => setSelectedRowIds([])}
                >
                  <FormattedMessage id="referral.print.selected.patient.reports.selectnone.button" />
                </Button>
              </div>
              {reportStatus === "error" && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title={intl.formatMessage({
                    id: "reports.error.generationFailed",
                  })}
                />
              )}
              <Grid fullWidth={true} className="referral-results-grid">
                <Column lg={16} md={8} sm={4}>
                  <br />
                  <DataTable
                    rows={responseDataShow.slice(
                      (page - 1) * pageSize,
                      page * pageSize,
                    )}
                    headers={[
                      {
                        key: "select",
                        header: intl.formatMessage({
                          id: "referral.select.column",
                        }),
                      },
                      {
                        key: "resultDate",
                        header: intl.formatMessage({
                          id: "referral.search.column.resultDate",
                        }),
                      },
                      {
                        key: "accessionNumber",
                        header: intl.formatMessage({
                          id: "sample.label.labnumber",
                        }),
                      },
                      {
                        key: "referredSendDate",
                        header: intl.formatMessage({
                          id: "referral.search.column.sentDate",
                        }),
                      },
                      {
                        key: "referralStatusDisplay",
                        header: intl.formatMessage({
                          id: "label.filters.status",
                        }),
                      },
                      {
                        key: "patientLastName",
                        header: intl.formatMessage({
                          id: "eorder.name.last",
                        }),
                      },
                      {
                        key: "patientFirstName",
                        header: intl.formatMessage({
                          id: "eorder.name.first",
                        }),
                      },
                      {
                        key: "referringTestName",
                        header: intl.formatMessage({
                          id: "eorder.test.name",
                        }),
                      },
                      {
                        key: "referralResultsDisplay",
                        header: intl.formatMessage({
                          id: "column.name.result",
                        }),
                      },
                      {
                        key: "referenceLabDisplay",
                        header: intl.formatMessage({
                          id: "referral.search.column.referenceLab",
                        }),
                      },
                      {
                        key: "notes",
                        header: intl.formatMessage({
                          id: "column.name.notes",
                        }),
                      },
                    ]}
                    translateWithId={translateTable}
                  >
                    {({
                      rows,
                      headers,
                      getHeaderProps,
                      getTableProps,
                      getSelectionProps,
                    }) => (
                      <TableContainer>
                        <Table {...getTableProps()}>
                          <TableHead>
                            <TableRow>
                              <TableSelectAll
                                id="table-select-all"
                                {...getSelectionProps()}
                                checked={
                                  responseDataShow
                                    .slice(
                                      (page - 1) * pageSize,
                                      page * pageSize,
                                    )
                                    .filter((row) => !row.disabled).length >
                                    0 &&
                                  responseDataShow
                                    .slice(
                                      (page - 1) * pageSize,
                                      page * pageSize,
                                    )
                                    .filter((row) => !row.disabled)
                                    .every((row) =>
                                      selectedRowIds.includes(row.id),
                                    )
                                }
                                indeterminate={
                                  responseDataShow
                                    .slice(
                                      (page - 1) * pageSize,
                                      page * pageSize,
                                    )
                                    .filter(
                                      (row) =>
                                        !row.disabled &&
                                        selectedRowIds.includes(row.id),
                                    ).length > 0 &&
                                  !responseDataShow
                                    .slice(
                                      (page - 1) * pageSize,
                                      page * pageSize,
                                    )
                                    .filter((row) => !row.disabled)
                                    .every((row) =>
                                      selectedRowIds.includes(row.id),
                                    )
                                }
                                onSelect={() => {
                                  const currentPageIds = responseDataShow
                                    .slice(
                                      (page - 1) * pageSize,
                                      page * pageSize,
                                    )
                                    .filter((row) => !row.disabled)
                                    .map((row) => row.id);
                                  if (
                                    currentPageIds.every((index) =>
                                      selectedRowIds.includes(index),
                                    )
                                  ) {
                                    setSelectedRowIds((currentIds) =>
                                      currentIds.filter(
                                        (selectedId) =>
                                          !currentPageIds.includes(selectedId),
                                      ),
                                    );
                                  } else {
                                    setSelectedRowIds((currentIds) =>
                                      Array.from(
                                        new Set([
                                          ...currentIds,
                                          ...currentPageIds,
                                        ]),
                                      ),
                                    );
                                  }
                                }}
                              />
                              {headers.map(
                                (header) =>
                                  header.key !== "select" && (
                                    <TableHeader
                                      key={header.key}
                                      {...getHeaderProps({ header })}
                                    >
                                      {header.header}
                                    </TableHeader>
                                  ),
                              )}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            <>
                              {rows.map((row) => (
                                <TableRow
                                  key={row.id}
                                  aria-disabled={!isRowSelectable(row.id)}
                                  onClick={() => {
                                    toggleRowSelection(row.id);
                                  }}
                                >
                                  {row.cells.map((cell) =>
                                    renderCell(cell, row),
                                  )}
                                </TableRow>
                              ))}
                            </>
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </DataTable>
                  <Pagination
                    onChange={handlePageChange}
                    page={page}
                    pageSize={pageSize}
                    pageSizes={[5, 10, 20]}
                    totalItems={responseDataShow.length}
                    forwardText={intl.formatMessage({
                      id: "pagination.forward",
                    })}
                    backwardText={intl.formatMessage({
                      id: "pagination.backward",
                    })}
                    itemRangeText={(min, max, total) =>
                      intl.formatMessage(
                        { id: "pagination.item-range" },
                        { min: min, max: max, total: total },
                      )
                    }
                    itemsPerPageText={intl.formatMessage({
                      id: "pagination.items-per-page",
                    })}
                    itemText={(min, max) =>
                      intl.formatMessage(
                        { id: "pagination.item" },
                        { min: min, max: max },
                      )
                    }
                    pageNumberText={intl.formatMessage({
                      id: "pagination.page-number",
                    })}
                    pageSelectLabelText={(total) =>
                      intl.formatMessage(
                        { id: "pagination.page-select" },
                        { total },
                      )
                    }
                    pageRangeText={(_current, total) =>
                      intl.formatMessage(
                        { id: "pagination.page-range" },
                        { total: total },
                      )
                    }
                    pageText={(page, pagesUnknown) =>
                      intl.formatMessage(
                        { id: "pagination.page" },
                        { page: pagesUnknown ? "" : page },
                      )
                    }
                  />
                  <br />
                </Column>
              </Grid>
            </>
          )}
        </section>
      </div>
    </>
  );
}
