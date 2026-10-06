import React, { useContext, useEffect, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  InlineLoading,
  InlineNotification,
  Link,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext } from "../layout/Layout";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import EQABadge from "../eqa/EQABadge";
import WorkplanModeSwitcher from "./WorkplanModeSwitcher";
import WorkplanSearchForm from "./WorkplanSearchForm";
import { requestWorkplanPDF, workplanSessionKey } from "./workplanRequest";
import "./wpStyle.css";

const IDENTITY_FIELDS = [
  "analysisId",
  "sampleId",
  "sampleItemId",
  "testId",
  "accessionNumber",
  "statusId",
  "lastupdated",
];
const PAGE_SIZES = [10, 20, 50, 100];
const identityOf = (row) =>
  Object.fromEntries(IDENTITY_FIELDS.map((field) => [field, row?.[field]]));
const actualRowIdentity = (row) =>
  row?.rowKind === "ANALYSIS" &&
  typeof row.analysisId === "string" &&
  /^[1-9]\d*$/.test(row.analysisId);
const validIdentity = (row) =>
  row?.rowKind === "ANALYSIS" &&
  ["analysisId", "sampleId", "sampleItemId", "testId", "statusId"].every(
    (field) => typeof row[field] === "string" && /^[1-9]\d*$/.test(row[field]),
  ) &&
  typeof row.accessionNumber === "string" &&
  Boolean(row.accessionNumber.trim()) &&
  typeof row.lastupdated === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(row.lastupdated) &&
  Number.isFinite(Date.parse(row.lastupdated));
const initialPaging = () => {
  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get("page") || "1";
  const page = /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const pageSize = Number(params.get("pageSize"));
  return {
    page: Number.isSafeInteger(page) ? page : 1,
    pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 50,
  };
};
const initialFilter = (type) =>
  new URLSearchParams(window.location.search).get(
    {
      test: "testId",
      panel: "panelId",
      unit: "testSectionId",
      priority: "priority",
    }[type],
  ) || "";

export const getWorkplanResultRoute = (accessionNumber) =>
  `/Results?accessionNumber=${encodeURIComponent(accessionNumber)}`;

export default function Workplan({ type }) {
  const intl = useIntl();
  const history = useHistory();
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const { userSessionDetails } = useContext(UserSessionDetailsContext) || {};
  let owner = null;
  try {
    owner = workplanSessionKey(userSessionDetails);
  } catch {
    owner = null;
  }
  const [selection, setSelection] = useState(() => ({
    filterId: initialFilter(type),
    label: "",
  }));
  const [pageRequest, setPageRequest] = useState(initialPaging);
  const [queryState, setQueryState] = useState({
    phase: "idle",
    owner: null,
    epoch: 0,
    query: { type, filterId: "" },
    rows: [],
    paging: null,
  });
  const [exclusionState, setExclusionState] = useState({
    key: "",
    ids: new Set(),
  });
  const [printFeedback, setPrintFeedback] = useState(null);
  const refs = useRef({});
  const printRequest = useRef(null);
  const objectUrls = useRef(new Map());
  const context = useRef({ owner, type });
  refs.current = { owner, type, selection, pageRequest, queryState };

  const rows = Array.isArray(queryState.rows) ? queryState.rows : [];
  const page = Number(queryState.paging?.currentPage) || 1;
  const pageSize = queryState.paging?.pageSize || pageRequest.pageSize;
  const total = queryState.paging?.totalResults ?? 0;
  const current = Boolean(
    owner &&
    queryState.owner === owner &&
    queryState.phase === "success" &&
    Number.isSafeInteger(queryState.epoch) &&
    queryState.epoch > 0 &&
    queryState.query?.type === type &&
    queryState.query?.filterId === selection.filterId &&
    selection.filterId &&
    page === pageRequest.page &&
    pageSize === pageRequest.pageSize,
  );
  const uniqueIdentities =
    rows.every(actualRowIdentity) &&
    new Set(rows.map((row) => row.analysisId)).size === rows.length;
  const supportedIdentities = rows.every(
    (row) =>
      validIdentity(row) ||
      (actualRowIdentity(row) &&
        typeof row.testId === "string" &&
        /^[1-9]\d*$/.test(row.testId) &&
        row.canPrint === false &&
        row.printUnavailableReason === "INCOMPLETE_ANALYSIS_IDENTITY"),
  );
  const baseKey = JSON.stringify({
    owner,
    type,
    selection: selection.filterId,
    pageRequest,
    phase: queryState.phase,
    queryOwner: queryState.owner,
    epoch: queryState.epoch,
    query: queryState.query,
    paging: queryState.paging,
    rows: rows.map((row) => [
      identityOf(row),
      row.canPrint,
      row.printUnavailableReason,
    ]),
  });
  const excluded =
    exclusionState.key === baseKey ? exclusionState.ids : new Set();
  const scopeKey = JSON.stringify([baseKey, [...excluded].sort()]);
  const activeScope = useRef({});
  activeScope.current = {
    key: scopeKey,
    current,
    owner,
    epoch: queryState.epoch,
  };
  const included = rows.filter((row) => !excluded.has(row.analysisId));
  const canPrint =
    current &&
    uniqueIdentities &&
    supportedIdentities &&
    typeof queryState.query?.pageSnapshot === "string" &&
    /^[a-f0-9]{64}$/.test(queryState.query.pageSnapshot) &&
    included.length > 0 &&
    included.every((row) => validIdentity(row) && row.canPrint === true);
  const feedback = printFeedback?.key === scopeKey ? printFeedback : null;
  const visiblePhase = !owner
    ? "idle"
    : queryState.owner !== owner
      ? "loading"
      : queryState.phase;
  const subjectOnWorkplan =
    String(configurationProperties.SUBJECT_ON_WORKPLAN).toLowerCase() ===
    "true";
  const nextVisitOnWorkplan =
    String(
      configurationProperties.NEXT_VISIT_DATE_ON_WORKPLAN,
    ).toLowerCase() === "true";
  const columnCount =
    4 + Number(subjectOnWorkplan) + Number(nextVisitOnWorkplan);
  const queryErrorId =
    {
      timeout: "workplan.query.timeout",
      forbidden: "workplan.query.forbidden",
      unauthenticated: "workplan.query.unauthenticated",
      scope: "workplan.query.scope",
      printForbidden: "workplan.print.forbidden",
      printChanged: "workplan.print.changed",
      printScopeChanged: "workplan.print.scopeChanged",
    }[queryState.errorCode] || "workplan.query.failed";

  const cancelPrint = () => {
    const pending = printRequest.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.controller.abort();
    printRequest.current = null;
  };
  useEffect(() => {
    if (printRequest.current?.key !== scopeKey) cancelPrint();
  }, [scopeKey]);
  useEffect(() => {
    if (context.current.owner === owner && context.current.type === type)
      return;
    context.current = { owner, type };
    cancelPrint();
    setExclusionState({ key: "", ids: new Set() });
    setPageRequest((previous) => ({ ...previous, page: 1 }));
  }, [owner, type]);
  useEffect(
    () => () => {
      cancelPrint();
      for (const [url, timer] of objectUrls.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      objectUrls.current.clear();
    },
    [],
  );

  const handleSelectionChange = ({
    filterId = "",
    label = "",
    restored = false,
  }) => {
    const changed = filterId !== refs.current.selection.filterId;
    refs.current.selection = { filterId, label };
    setSelection({ filterId, label });
    if (changed) {
      cancelPrint();
      setExclusionState({ key: "", ids: new Set() });
      setQueryState((previous) => ({ ...previous, phase: "idle", rows: [] }));
      if (!restored) {
        refs.current.pageRequest = { ...refs.current.pageRequest, page: 1 };
        setPageRequest(refs.current.pageRequest);
      }
    }
  };
  const handleQueryStateChange = (next) => {
    const latest = refs.current;
    if (
      !next ||
      next.owner !== latest.owner ||
      next.query?.type !== latest.type ||
      next.query?.filterId !== latest.selection.filterId
    )
      return;
    if (
      next.owner === latest.queryState.owner &&
      next.epoch < latest.queryState.epoch
    )
      return;
    if (
      next.phase === "success" &&
      (Number(next.paging?.currentPage) !== latest.pageRequest.page ||
        next.paging?.pageSize !== latest.pageRequest.pageSize)
    )
      return;
    refs.current.queryState = next;
    setQueryState(next);
  };
  const requestPage = ({ page: nextPage, pageSize: nextSize }) => {
    cancelPrint();
    setExclusionState({ key: "", ids: new Set() });
    const next = {
      page: nextSize !== pageRequest.pageSize ? 1 : nextPage,
      pageSize: nextSize,
    };
    refs.current.pageRequest = next;
    setPageRequest(next);
    setQueryState((previous) => ({ ...previous, phase: "loading", rows: [] }));
  };
  const toggleExclusion = (row, checked) => {
    if (
      !current ||
      !uniqueIdentities ||
      !supportedIdentities ||
      !actualRowIdentity(row)
    )
      return;
    cancelPrint();
    const next = new Set(excluded);
    if (checked) next.add(row.analysisId);
    else next.delete(row.analysisId);
    setExclusionState({ key: baseKey, ids: next });
  };
  const reasonFor = (row) =>
    intl.formatMessage({
      // i18n-keys: workplan.print.reason.*
      id: `workplan.print.reason.${row.printUnavailableReason || "UNKNOWN"}`,
      defaultMessage: intl.formatMessage({ id: "workplan.print.unavailable" }),
    });
  const printCurrentPage = async () => {
    if (!canPrint || printRequest.current) return;
    const controller = new AbortController();
    const pending = { controller, key: scopeKey, owner, timer: null };
    printRequest.current = pending;
    setPrintFeedback({ key: scopeKey, kind: "busy" });
    const isCurrent = () =>
      printRequest.current === pending &&
      !controller.signal.aborted &&
      activeScope.current.current &&
      activeScope.current.key === pending.key &&
      activeScope.current.owner === pending.owner;
    pending.timer = setTimeout(() => {
      if (!isCurrent()) return;
      printRequest.current = null;
      controller.abort();
      setPrintFeedback({
        key: pending.key,
        kind: "error",
        message: "workplan.print.timeout",
      });
    }, 20_000);
    try {
      const blob = await requestWorkplanPDF(
        {
          type: queryState.query.type,
          filterId: queryState.query.filterId,
          page,
          pageSize,
          pageSnapshot: queryState.query.pageSnapshot,
          analyses: included.map(identityOf),
        },
        controller.signal,
        owner,
      );
      if (!isCurrent()) return;
      if (
        !(blob instanceof Blob) ||
        !blob.size ||
        blob.type.toLowerCase().split(";")[0] !== "application/pdf"
      )
        throw new Error("workplan.print.failed");
      const url = URL.createObjectURL(blob);
      try {
        const opened = window.open(url, "_blank");
        if (!opened) throw new Error("workplan.print.openFailed");
        opened.opener = null;
      } catch {
        URL.revokeObjectURL(url);
        throw new Error("workplan.print.openFailed");
      }
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        objectUrls.current.delete(url);
      }, 60_000);
      objectUrls.current.set(url, timer);
      setPrintFeedback({
        key: pending.key,
        kind: "success",
        message: "workplan.print.ready",
      });
    } catch (error) {
      if (isCurrent()) {
        const errorCode = {
          forbidden: "printForbidden",
          changed: "printChanged",
          scope: "printScopeChanged",
          unauthenticated: "unauthenticated",
        }[error?.kind];
        if (errorCode) {
          setExclusionState({ key: "", ids: new Set() });
          const next = {
            ...refs.current.queryState,
            phase: "error",
            rows: [],
            paging: null,
            errorCode,
          };
          refs.current.queryState = next;
          setQueryState(next);
        } else {
          setPrintFeedback({
            key: pending.key,
            kind: "error",
            message:
              error?.message === "workplan.print.openFailed"
                ? "workplan.print.openFailed"
                : "workplan.print.failed",
          });
        }
      }
    } finally {
      clearTimeout(pending.timer);
      if (printRequest.current === pending) printRequest.current = null;
    }
  };

  return (
    <>
      <PageBreadCrumb breadcrumbs={[{ label: "home.label", link: "/" }]} />
      <ProductPageHeader
        title={<FormattedMessage id="banner.menu.workplan" />}
        subtitle={<FormattedMessage id="workplan.subtitle" />}
        titleId="workplan-page-title"
      />
      <main className="oe-workplan-page" aria-labelledby="workplan-page-title">
        <WorkplanModeSwitcher type={type} />
        <WorkplanSearchForm
          type={type}
          owner={owner}
          pageRequest={pageRequest}
          onSelectionChange={handleSelectionChange}
          onQueryStateChange={handleQueryStateChange}
        />
        <section
          className="oe-workplan-surface"
          aria-labelledby="workplan-list-title"
          aria-busy={visiblePhase === "loading"}
        >
          <div className="oe-workplan-list-heading">
            <div>
              <h2 id="workplan-list-title">
                <FormattedMessage id="workplan.list.title" />
              </h2>
              {current && (
                <p>
                  <FormattedMessage
                    id="workplan.list.count"
                    values={{ total, page, shown: rows.length }}
                  />
                </p>
              )}
            </div>
            <div className="oe-workplan-print-controls">
              <Button
                type="button"
                size="sm"
                onClick={printCurrentPage}
                disabled={!canPrint || feedback?.kind === "busy"}
                title={
                  !canPrint
                    ? intl.formatMessage({ id: "workplan.print.unavailable" })
                    : undefined
                }
                aria-label={intl.formatMessage({
                  id: "workplan.print.currentPage",
                })}
              >
                <FormattedMessage id="workplan.print.currentPage" />
              </Button>
              <p>
                <FormattedMessage id="workplan.print.scope" />
              </p>
            </div>
          </div>
          <div className="oe-workplan-feedback">
            {visiblePhase === "loading" && (
              <InlineLoading
                description={intl.formatMessage({ id: "loading.description" })}
              />
            )}
            {visiblePhase === "idle" && (
              <p role="status">
                <FormattedMessage id="workplan.list.idle" />
              </p>
            )}
            {visiblePhase === "error" && (
              <>
                <InlineNotification
                  kind="error"
                  hideCloseButton
                  lowContrast
                  title={intl.formatMessage({ id: queryErrorId })}
                />
                <Button
                  type="button"
                  kind="tertiary"
                  size="sm"
                  onClick={() => requestPage(pageRequest)}
                >
                  <FormattedMessage id="workplan.query.retry" />
                </Button>
              </>
            )}
            {current && (!uniqueIdentities || !supportedIdentities) && (
              <InlineNotification
                kind="error"
                hideCloseButton
                lowContrast
                title={intl.formatMessage({ id: "workplan.identity.invalid" })}
              />
            )}
            {current && rows.length === 0 && (
              <p role="status">
                <FormattedMessage id="result.noTestsFound" />
              </p>
            )}
            {feedback?.kind === "busy" && (
              <InlineLoading
                description={intl.formatMessage({
                  id: "workplan.print.generating",
                })}
              />
            )}
            {feedback?.message && (
              <InlineNotification
                kind={feedback.kind}
                hideCloseButton
                lowContrast
                title={intl.formatMessage({ id: feedback.message })}
              />
            )}
          </div>
          {current && rows.length > 0 && (
            <>
              <div className="oe-workplan-table-scroll">
                <Table
                  size="sm"
                  data-cy="workplanResultsTable"
                  className="oe-workplan-table"
                >
                  <TableHead>
                    <TableRow>
                      <TableHeader className="oe-workplan-column--exclude">
                        <FormattedMessage id="workplan.exclude.header" />
                      </TableHeader>
                      <TableHeader className="oe-workplan-column--accession">
                        <FormattedMessage id="quick.entry.accession.number" />
                      </TableHeader>
                      {subjectOnWorkplan && (
                        <TableHeader>
                          <FormattedMessage id="patient.subject.number" />
                        </TableHeader>
                      )}
                      {nextVisitOnWorkplan && (
                        <TableHeader>
                          <FormattedMessage id="sample.entry.nextVisit.date" />
                        </TableHeader>
                      )}
                      <TableHeader>
                        <FormattedMessage id="sample.entry.project.testName" />
                      </TableHeader>
                      <TableHeader className="oe-workplan-column--date">
                        <FormattedMessage id="sample.receivedDate" />
                      </TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, index) => {
                      const accessionNumber =
                        typeof row.accessionNumber === "string" &&
                        row.accessionNumber.trim()
                          ? row.accessionNumber
                          : null;
                      const firstInGroup =
                        index === 0 ||
                        row.groupKey !== rows[index - 1].groupKey;
                      const key = uniqueIdentities
                        ? row.analysisId
                        : `invalid-${index}`;
                      return (
                        <React.Fragment key={key}>
                          {firstInGroup && Boolean(row.groupLabel) && (
                            <TableRow className="oe-workplan-group-label">
                              <TableCell colSpan={columnCount}>
                                {row.groupLabel}
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow
                            className={
                              excluded.has(row.analysisId)
                                ? "oe-workplan-row--excluded"
                                : undefined
                            }
                          >
                            <TableCell className="oe-workplan-column--exclude">
                              <Checkbox
                                id={`workplan-exclude-${key}`}
                                labelText={intl.formatMessage(
                                  { id: "workplan.exclude.row" },
                                  {
                                    accessionNumber: accessionNumber || "—",
                                    testName: row.testName || "—",
                                  },
                                )}
                                hideLabel
                                checked={excluded.has(row.analysisId)}
                                disabled={
                                  !uniqueIdentities ||
                                  !supportedIdentities ||
                                  !actualRowIdentity(row)
                                }
                                onChange={(_event, { checked }) =>
                                  toggleExclusion(row, checked)
                                }
                              />
                            </TableCell>
                            <TableCell className="oe-workplan-column--accession">
                              {firstInGroup && (
                                <>
                                  {accessionNumber ? (
                                    <Link
                                      href={getWorkplanResultRoute(
                                        accessionNumber,
                                      )}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        history.push(
                                          getWorkplanResultRoute(
                                            accessionNumber,
                                          ),
                                        );
                                      }}
                                    >
                                      {accessionNumber}
                                    </Link>
                                  ) : (
                                    "—"
                                  )}
                                  {row.isEqaSample && (
                                    <EQABadge priority={row.eqaPriority} />
                                  )}
                                  {row.patientName && (
                                    <span className="oe-workplan-patient-name">
                                      {row.patientName}
                                    </span>
                                  )}
                                </>
                              )}
                            </TableCell>
                            {subjectOnWorkplan && (
                              <TableCell>
                                {firstInGroup ? row.patientInfo || "—" : null}
                              </TableCell>
                            )}
                            {nextVisitOnWorkplan && (
                              <TableCell>
                                {firstInGroup ? row.nextVisitDate || "—" : null}
                              </TableCell>
                            )}
                            <TableCell>
                              {row.testName || "—"}
                              {row.nonconforming && (
                                <img
                                  className="oe-workplan-nonconforming"
                                  src="images/nonconforming.gif"
                                  alt={intl.formatMessage({
                                    id: "result.nonconforming.item",
                                  })}
                                />
                              )}
                              {row.canPrint !== true && (
                                <span className="oe-workplan-print-reason">
                                  {reasonFor(row)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="oe-workplan-column--date">
                              {row.receivedDate || "—"}
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                pageSize={pageSize}
                pageSizes={PAGE_SIZES}
                totalItems={total}
                onChange={requestPage}
                forwardText={intl.formatMessage({ id: "pagination.forward" })}
                backwardText={intl.formatMessage({ id: "pagination.backward" })}
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.items-per-page",
                })}
                pageSelectLabelText={(totalPages) =>
                  intl.formatMessage(
                    { id: "pagination.page-select" },
                    { total: totalPages },
                  )
                }
                pageRangeText={(_page, totalPages) =>
                  intl.formatMessage(
                    { id: "pagination.page-range" },
                    { total: totalPages },
                  )
                }
                itemRangeText={(min, max, totalItems) =>
                  intl.formatMessage(
                    { id: "pagination.item-range" },
                    { min, max, total: totalItems },
                  )
                }
                itemText={(min, max) =>
                  intl.formatMessage({ id: "pagination.item" }, { min, max })
                }
                pageText={(currentPage) =>
                  intl.formatMessage(
                    { id: "pagination.page" },
                    { page: currentPage },
                  )
                }
              />
            </>
          )}
        </section>
      </main>
    </>
  );
}
