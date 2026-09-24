import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from "@carbon/react";
import { ArrowLeft, ArrowRight, Search } from "@carbon/react/icons";
import { getFromOpenElisServer } from "../utils/Utils";
import type { PatientRecord, PatientSearchResponse } from "./types";
import {
  validatePatientSearchPage,
  type PatientSearchPagingContext,
} from "./patientSearchPagingContract";

interface PatientListResponse {
  patients: PatientRecord[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PatientListViewState {
  query?: string;
  page?: number;
  pageSize?: number;
  searchMode?: boolean;
}

interface PatientMasterListProps {
  onOpenPatient: (patient: PatientRecord) => void;
  onOpenResults: (patient: PatientRecord) => void;
  onNewPatient: () => void;
  onOpenAdvancedSearch?: () => void;
  initialState?: PatientListViewState;
  onStateChange?: (state: PatientListViewState) => void;
}

const formatPatientName = (patient: PatientRecord) => {
  const firstName = String(patient.firstName || "").trim();
  const lastName = String(patient.lastName || "").trim();
  const hasCjkName = /[\u3400-\u9fff]/u.test(`${lastName}${firstName}`);
  return hasCjkName
    ? `${lastName}${firstName}` || "—"
    : `${firstName} ${lastName}`.trim() || "—";
};

const normalizeSearchPatient = (patient: PatientRecord): PatientRecord => ({
  ...patient,
  patientPK: patient.patientPK || patient.patientID || patient.patientId,
  patientId: patient.patientId || patient.patientID || patient.patientPK,
  birthDate: patient.birthDate || patient.birthdate || patient.dob,
  phoneNumber:
    patient.phoneNumber || patient.primaryPhone || patient.contactPhone,
  merged: patient.merged ?? patient.isMerged,
});

const PatientMasterList = ({
  onOpenPatient,
  onOpenResults,
  onNewPatient,
  onOpenAdvancedSearch,
  initialState = {},
  onStateChange,
}: PatientMasterListProps) => {
  const intl = useIntl();
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [query, setQuery] = useState(initialState.query || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [searchMode, setSearchMode] = useState(!!initialState.searchMode);
  const [page, setPage] = useState(initialState.page || 1);
  const [pageSize, setPageSize] = useState(initialState.pageSize || 20);
  const requestId = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const activeSearchQuery = useRef(
    initialState.searchMode ? String(initialState.query || "").trim() : "",
  );
  const activeSearchQueryId = useRef("");
  const activeSearchPaging = useRef<PatientSearchPagingContext | null>(null);
  const initialViewState = useRef(initialState);
  const [totalItems, setTotalItems] = useState(0);
  const [searchTotalPages, setSearchTotalPages] = useState(1);

  const beginRequest = useCallback(() => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    return { id: ++requestId.current, controller };
  }, []);

  const isCurrentRequest = useCallback(
    (request: { id: number; controller: AbortController }) =>
      request.id === requestId.current && !request.controller.signal.aborted,
    [],
  );

  const loadPatientList = useCallback(
    (nextPage = 1, nextPageSize = 20) => {
      const request = beginRequest();
      activeSearchQuery.current = "";
      activeSearchQueryId.current = "";
      activeSearchPaging.current = null;
      setLoading(true);
      setError(false);
      getFromOpenElisServer<PatientListResponse>(
        `/rest/patient-management-list?page=${nextPage}&pageSize=${nextPageSize}`,
        (response) => {
          if (!isCurrentRequest(request)) return;
          if (!response || !Array.isArray(response.patients)) {
            setPatients([]);
            setError(true);
            setLoading(false);
            return;
          }
          setPatients(response.patients.map(normalizeSearchPatient));
          setPage(response.page);
          setPageSize(response.pageSize);
          setTotalItems(response.totalItems);
          setSearchTotalPages(1);
          setSearchMode(false);
          setLoading(false);
        },
        request.controller.signal,
      );
    },
    [beginRequest, isCurrentRequest],
  );

  const loadSearchPage = useCallback(
    (
      searchQuery: string,
      targetPage = 1,
      mode: "new" | "page" | "restore" = "page",
    ) => {
      const normalizedQuery = searchQuery.trim();
      if (!normalizedQuery) return;

      activeSearchQuery.current = normalizedQuery;
      if (mode !== "page") {
        activeSearchQueryId.current = "";
        activeSearchPaging.current = null;
      }
      setLoading(true);
      setError(false);
      setSearchMode(true);

      const failSearch = () => {
        activeSearchQueryId.current = "";
        activeSearchPaging.current = null;
        setPatients([]);
        setPage(1);
        setTotalItems(0);
        setSearchTotalPages(1);
        setError(true);
        setLoading(false);
      };

      const requestPage = (
        requestedPage: number,
        queryId: string,
        restoredPage?: number,
      ) => {
        const request = beginRequest();
        const parameters = new URLSearchParams({
          quickQuery: normalizedQuery,
          suppressExternalSearch: "true",
        });
        if (queryId) {
          parameters.set("page", String(requestedPage));
          parameters.set("queryId", queryId);
        }

        getFromOpenElisServer<PatientSearchResponse>(
          `/rest/patient-search-results?${parameters.toString()}`,
          (response) => {
            if (!isCurrentRequest(request)) return;
            if (!response || !Array.isArray(response.patientSearchResults)) {
              failSearch();
              return;
            }

            const established = queryId ? activeSearchPaging.current : null;
            if (queryId && (!established || established.queryId !== queryId)) {
              failSearch();
              return;
            }
            const validated = validatePatientSearchPage(
              response,
              requestedPage,
              established,
            );
            if (!validated) {
              failSearch();
              return;
            }
            activeSearchQueryId.current = validated.queryId;
            activeSearchPaging.current = {
              queryId: validated.queryId,
              totalItems: validated.totalItems,
              totalPages: validated.totalPages,
              pageSize: validated.pageSize,
            };

            if (restoredPage && restoredPage > 1 && validated.totalPages > 1) {
              requestPage(
                Math.min(restoredPage, validated.totalPages),
                validated.queryId,
              );
              return;
            }

            const results = validated.results
              .filter(
                (patient) =>
                  !(
                    patient.lastName === "NULL" && patient.firstName === "NULL"
                  ),
              )
              .map(normalizeSearchPatient);
            setPatients(results);
            setTotalItems(validated.totalItems);
            setPage(validated.currentPage);
            setSearchTotalPages(validated.totalPages);
            setSearchMode(true);
            setLoading(false);
          },
          request.controller.signal,
        );
      };

      const safeTargetPage = Math.max(1, targetPage);
      if (mode === "page") {
        if (!activeSearchQueryId.current) {
          failSearch();
          return;
        }
        requestPage(safeTargetPage, activeSearchQueryId.current);
        return;
      }
      requestPage(1, "", mode === "restore" ? safeTargetPage : undefined);
    },
    [beginRequest, isCurrentRequest],
  );

  useEffect(() => {
    const restoredState = initialViewState.current;
    if (restoredState.searchMode && restoredState.query) {
      loadSearchPage(restoredState.query, restoredState.page || 1, "restore");
    } else {
      loadPatientList(restoredState.page || 1, restoredState.pageSize || 20);
    }
    return () => {
      requestController.current?.abort();
      requestId.current += 1;
    };
  }, [loadPatientList, loadSearchPage]);

  useEffect(() => {
    onStateChange?.({ query, page, pageSize, searchMode });
  }, [query, page, pageSize, searchMode, onStateChange]);

  const handleSearch = () => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      loadPatientList(1, pageSize);
      return;
    }
    loadSearchPage(normalizedQuery, 1, "new");
  };

  const handleReset = () => {
    setQuery("");
    loadPatientList(1, pageSize);
  };

  const columns = useMemo(
    () => [
      "patient.management.list.number",
      "patient.management.list.name",
      "patient.gender",
      "patient.dob",
      "patient.natioanalid",
      "patient.management.list.phone",
      "patient.management.list.status",
      "label.results.actions",
    ],
    [],
  );

  return (
    <section
      className="patient-master-list"
      aria-labelledby="patient-list-title"
    >
      <div className="patient-master-list__toolbar">
        <div className="patient-master-list__search">
          <TextInput
            id="patientMasterListQuery"
            labelText={intl.formatMessage({
              id: "patient.management.list.search.label",
            })}
            placeholder={intl.formatMessage({
              id: "patient.management.list.search.placeholder",
            })}
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value;
              setQuery(nextQuery);
              if (nextQuery.trim() !== activeSearchQuery.current) {
                requestController.current?.abort();
                requestId.current += 1;
                activeSearchQuery.current = "";
                activeSearchQueryId.current = "";
                activeSearchPaging.current = null;
                setPatients([]);
                setSearchMode(false);
                setSearchTotalPages(1);
                setPage(1);
                setTotalItems(0);
                setLoading(false);
                setError(false);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSearch();
              }
            }}
          />
          <Button renderIcon={Search} type="button" onClick={handleSearch}>
            <FormattedMessage id="label.button.search" />
          </Button>
          <Button kind="ghost" type="button" onClick={handleReset}>
            <FormattedMessage id="patient.management.list.showAll" />
          </Button>
          {onOpenAdvancedSearch && (
            <Button
              kind="tertiary"
              type="button"
              onClick={onOpenAdvancedSearch}
            >
              <FormattedMessage id="advanced.search" />
            </Button>
          )}
        </div>
        <p className="patient-master-list__helper">
          <FormattedMessage id="patient.management.list.search.helper" />
        </p>
      </div>

      <div className="patient-master-list__heading">
        <div>
          <h2 id="patient-list-title">
            <FormattedMessage id="patient.management.list.title" />
          </h2>
          <p>
            <FormattedMessage
              id={
                searchMode
                  ? "patient.management.list.searchCount"
                  : "patient.management.list.total"
              }
              values={{ count: totalItems }}
            />
          </p>
        </div>
      </div>

      {loading && (
        <div className="patient-master-list__loading">
          <InlineLoading
            description={intl.formatMessage({
              id: "patient.management.list.loading",
            })}
          />
        </div>
      )}

      {!loading && error && (
        <div className="patient-master-list__error">
          <InlineNotification
            kind="error"
            hideCloseButton
            title={intl.formatMessage({ id: "patient.management.list.error" })}
            subtitle={intl.formatMessage({
              id: "patient.management.list.error.helper",
            })}
          />
          <Button
            kind="tertiary"
            type="button"
            onClick={() =>
              searchMode ? handleSearch() : loadPatientList(page, pageSize)
            }
          >
            <FormattedMessage id="patient.management.list.retry" />
          </Button>
        </div>
      )}

      {!loading && !error && patients.length === 0 && (
        <div className="patient-master-list__empty">
          <h3>
            <FormattedMessage id="patient.management.list.empty" />
          </h3>
          <p>
            <FormattedMessage id="patient.management.list.empty.helper" />
          </p>
          <Button type="button" onClick={onNewPatient}>
            <FormattedMessage id="new.patient.label" />
          </Button>
        </div>
      )}

      {!loading && !error && patients.length > 0 && (
        <>
          <TableContainer className="patient-master-list__table">
            <Table useZebraStyles>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableHeader key={column}>
                      <FormattedMessage id={column} />
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {patients.map((patient) => {
                  const patientId = String(
                    patient.patientPK || patient.patientId || patient.patientID,
                  );
                  const isMerged =
                    patient.merged === true || patient.isMerged === true;
                  return (
                    <TableRow key={patientId}>
                      <TableCell>{patientId || "—"}</TableCell>
                      <TableCell>
                        <strong>{formatPatientName(patient)}</strong>
                      </TableCell>
                      <TableCell>
                        {patient.gender === "M"
                          ? intl.formatMessage({ id: "patient.male" })
                          : patient.gender === "F"
                            ? intl.formatMessage({ id: "patient.female" })
                            : "—"}
                      </TableCell>
                      <TableCell>
                        {String(patient.birthDate || patient.dob || "—")}
                      </TableCell>
                      <TableCell>{String(patient.nationalId || "—")}</TableCell>
                      <TableCell>
                        {String(
                          patient.phoneNumber ||
                            patient.primaryPhone ||
                            patient.contactPhone ||
                            "—",
                        )}
                      </TableCell>
                      <TableCell>
                        <Tag type={isMerged ? "magenta" : "green"} size="sm">
                          <FormattedMessage
                            id={
                              isMerged
                                ? "patient.management.list.status.merged"
                                : "patient.management.list.status.active"
                            }
                          />
                        </Tag>
                      </TableCell>
                      <TableCell>
                        <div className="patient-master-list__actions">
                          <Button
                            type="button"
                            kind="ghost"
                            size="sm"
                            disabled={isMerged}
                            onClick={() => onOpenPatient(patient)}
                          >
                            <FormattedMessage id="patient.management.open" />
                          </Button>
                          <Button
                            type="button"
                            kind="ghost"
                            size="sm"
                            disabled={isMerged}
                            onClick={() => onOpenResults(patient)}
                          >
                            <FormattedMessage id="patient.management.list.results" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {searchMode && searchTotalPages > 1 && (
            <div className="patient-api-pagination__controls">
              <span className="patient-api-pagination__count">
                {page} / {searchTotalPages}
              </span>
              <Button
                hasIconOnly
                kind="ghost"
                type="button"
                disabled={page <= 1}
                renderIcon={ArrowLeft}
                iconDescription={intl.formatMessage({
                  id: "pagination.backward",
                })}
                onClick={() =>
                  loadSearchPage(activeSearchQuery.current, page - 1, "page")
                }
              />
              <Button
                hasIconOnly
                kind="ghost"
                type="button"
                disabled={page >= searchTotalPages}
                renderIcon={ArrowRight}
                iconDescription={intl.formatMessage({
                  id: "pagination.forward",
                })}
                onClick={() =>
                  loadSearchPage(activeSearchQuery.current, page + 1, "page")
                }
              />
            </div>
          )}
          {!searchMode && (
            <Pagination
              page={page}
              pageSize={pageSize}
              pageSizes={[10, 20, 50, 100]}
              totalItems={totalItems}
              onChange={({ page: nextPage, pageSize: nextPageSize }) =>
                loadPatientList(nextPage, nextPageSize)
              }
              forwardText={intl.formatMessage({ id: "pagination.forward" })}
              backwardText={intl.formatMessage({ id: "pagination.backward" })}
              itemsPerPageText={intl.formatMessage({
                id: "pagination.items-per-page",
              })}
              itemRangeText={(min, max, total) =>
                intl.formatMessage(
                  { id: "pagination.item-range" },
                  { min, max, total },
                )
              }
              pageNumberText={intl.formatMessage({
                id: "pagination.page-number",
              })}
              pageRangeText={(_current, total) =>
                intl.formatMessage({ id: "pagination.page-range" }, { total })
              }
              pageSelectLabelText={(total) =>
                intl.formatMessage({ id: "pagination.page-select" }, { total })
              }
            />
          )}
        </>
      )}
    </section>
  );
};

export default PatientMasterList;
