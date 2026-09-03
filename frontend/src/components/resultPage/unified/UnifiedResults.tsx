import React, {
  useCallback,
  useContext,
  useEffect,
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
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
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
import { usePresence } from "./usePresence";
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
  sequenceNumber?: string;
  testName?: string;
  patientInfo?: string;
  patientName?: string;
  sampleType?: string;
  normalRange?: string;
  analysisStatusId?: string;
  analysisLastupdated?: string;
  testResultComponentId?: string;
  [key: string]: unknown;
}

interface StatusOption {
  id: string;
  value: string;
}

interface SaveResponse {
  status?: number;
  error?: string;
  modifiedBy?: string;
  modifiedAt?: string;
  analysisLastupdated?: string;
  analysisStatusId?: string;
  reflex?: string[];
  calculated?: string[];
}

const UnifiedResults: React.FC = () => {
  const intl = useIntl();
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
  const initialLoadStarted = useRef(false);
  const initialLabUnitEffect = useRef(true);

  const domain: ResultsDomain = useMemo(() => {
    const unit = labUnits.find((u) => u.id === selectedLabUnit);
    return normalizeDomain(unit?.domain);
  }, [labUnits, selectedLabUnit]);

  useEffect(() => {
    getFromOpenElisServer("/rest/results-entry/lab-units", (list: LabUnit[]) =>
      setLabUnits(list || []),
    );
    getFromOpenElisServer(
      "/rest/analysis-status-types",
      (list: StatusOption[]) =>
        setStatusOptions((list || []).filter((s) => s.id !== "0")),
    );
  }, []);

  const applyLoadedRows = useCallback(
    (results: { testResult?: WorklistRow[] }) => {
      const loaded = (results?.testResult || []).filter((r) => r.analysisId);
      setRows(loaded);
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
      setLoading(false);
      setHasLoaded(true);
    },
    [],
  );

  const loadWorklist = useCallback(
    (labNumberOverride?: string) => {
      setLoading(true);
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
      getFromOpenElisServer(endpoint, applyLoadedRows);
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

  const presence = usePresence(editingAnalysisId, visibleAnalysisIds);

  const handleValueChange = useCallback(
    (
      target: WorklistRow,
      field: "resultValue" | "multiSelectResultValues",
      value: string,
    ) => {
      // FR-A′3: a multi-component analysis renders one row per component —
      // update ONLY the edited row (keyed by analysisId + componentId), never
      // its sibling component rows
      const key = worklistRowKey(target);
      setRows((current) =>
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

  const handleEdit = useCallback((target: WorklistRow) => {
    const key = worklistRowKey(target);
    setRowStates((current) => ({
      ...current,
      [key]: nextRowState(current[key] || "SAVED", {
        type: "EDIT_CLICKED",
      }),
    }));
    setEditingAnalysisId(target.analysisId);
  }, []);

  const handleSaveResponse = useCallback(
    (target: WorklistRow, response: SaveResponse | undefined) => {
      if (!response) {
        return;
      }
      const key = worklistRowKey(target);
      if (response.status === 409) {
        // FR-O2: the stale editor loses — nothing merged, refresh offered.
        setStaleInfo((current) => ({
          ...current,
          [key]: {
            modifiedBy: response.modifiedBy,
            modifiedAt: response.modifiedAt,
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
      if (response.status && response.status >= 400) {
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message:
            response.error || intl.formatMessage({ id: "error.save.msg" }),
          kind: NotificationKinds.error,
        });
        setNotificationVisible(true);
        return;
      }
      setRowStates((current) => ({
        ...current,
        [key]: nextRowState(current[key] || "EDITING", {
          type: "SAVE_SUCCEEDED",
        }),
      }));
      if (response.analysisLastupdated || response.analysisStatusId) {
        // the version token is per ANALYSIS — refresh it on every component
        // row of this analysis so a sibling save isn't falsely rejected. The
        // status changes to Technical Acceptance after a successful entry and
        // must be reflected immediately instead of continuing to say
        // "Not started" until the next page load.
        setRows((current) =>
          current.map((row) =>
            row.analysisId === target.analysisId
              ? {
                  ...row,
                  analysisLastupdated:
                    response.analysisLastupdated || row.analysisLastupdated,
                  analysisStatusId:
                    response.analysisStatusId || row.analysisStatusId,
                }
              : row,
          ),
        );
      }
      setStaleInfo((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setEditingAnalysisId((current) =>
        current === target.analysisId ? null : current,
      );
      const triggered = [
        ...(response.reflex || []),
        ...(response.calculated || []),
      ];
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message:
          intl.formatMessage({ id: "success.save.msg" }) +
          (triggered.length
            ? " " +
              intl.formatMessage({ id: "label.results.reflexTriggered" }) +
              " " +
              triggered.join(", ")
            : ""),
        kind: NotificationKinds.success,
      });
      setNotificationVisible(true);
    },
    [addNotification, intl, setNotificationVisible],
  );

  const handleSave = useCallback(
    (row: WorklistRow) => {
      // FR-O1: the payload names and carries exactly this analysis — never
      // the page. Untouched rows cannot be re-submitted or defaulted.
      const item: Record<string, unknown> = { ...row, isModified: true };
      delete item.result;
      // TestResultItem serializes reportable as "Y"/"N" but deserializes it
      // as boolean — same normalization the legacy page applies before POST
      item.reportable = item.reportable !== "N";
      postToOpenElisServerJsonResponse(
        `/rest/results-entry/analysis/${row.analysisId}/result`,
        JSON.stringify({ testResult: item }),
        (response: SaveResponse | undefined) =>
          handleSaveResponse(row, response),
      );
    },
    [handleSaveResponse],
  );

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

          {!loading && hasLoaded && filteredRows.length === 0 ? (
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
                      const state = rowStates[key] || "EMPTY";
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
                              <PolymorphicResultCell
                                row={row}
                                editable={isRowEditable(state)}
                                onValueChange={(field, value) =>
                                  handleValueChange(row, field, value)
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {statusName(row.analysisStatusId)}
                            </TableCell>
                            <TableCell>
                              {showEdit(state) && (
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  onClick={() => handleEdit(row)}
                                >
                                  <FormattedMessage id="label.results.edit" />
                                </Button>
                              )}
                              {showSave(state) && (
                                <ESignatureButton
                                  meaning={SignatureMeaning.AUTHORED}
                                  context={`${intl.formatMessage({
                                    id: "label.results.save",
                                  })} ${row.accessionNumber} - ${row.testName}`}
                                  recordType="RESULT"
                                  recordId={row.analysisId}
                                  onSign={() => handleSave(row)}
                                  size="sm"
                                >
                                  <FormattedMessage id="label.results.save" />
                                </ESignatureButton>
                              )}
                            </TableCell>
                          </TableRow>
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
                                  actions={
                                    <Button
                                      kind="ghost"
                                      size="sm"
                                      onClick={() => loadWorklist()}
                                    >
                                      <FormattedMessage id="label.results.refresh" />
                                    </Button>
                                  }
                                />
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
