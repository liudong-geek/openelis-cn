/**
 * InstrumentsTab Component
 *
 * Displays a DataTable of all instruments with their QC compliance status.
 * Features client-side search and pagination.
 *
 * Columns: Instrument ID, Name, Type, Location, Status, Analytes,
 *          Recent Violations, Last Update, Actions
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Search,
  Tag,
  Pagination,
  Button,
  Tile,
} from "@carbon/react";
import { SettingsAdjust, SearchLocate } from "@carbon/icons-react";
import { useIntl } from "react-intl";
import {
  getComplianceTagType,
  getComplianceLabelKey,
  getZScoreBadgeType,
  formatTimestamp,
} from "./qcDashboardUtils";
import { useHistory } from "react-router-dom";
import "./InstrumentsTab.css";

const searchableText = (value) => String(value ?? "").toLowerCase();

const InstrumentsTab = ({ instruments = [], loading }) => {
  const intl = useIntl();
  const history = useHistory();

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const safeInstruments = useMemo(
    () => (Array.isArray(instruments) ? instruments : []),
    [instruments],
  );

  // Client-side search filtering
  const filteredInstruments = useMemo(() => {
    if (!searchTerm) return safeInstruments;
    const term = searchTerm.toLowerCase();
    return safeInstruments.filter(
      (inst) =>
        searchableText(inst.instrumentId ?? inst.id).includes(term) ||
        searchableText(inst.instrumentName).includes(term) ||
        searchableText(inst.instrumentType).includes(term) ||
        searchableText(inst.instrumentLocation).includes(term),
    );
  }, [safeInstruments, searchTerm]);

  const effectivePage = Math.min(
    page,
    Math.max(1, Math.ceil(filteredInstruments.length / pageSize)),
  );

  // Paginated subset
  const paginatedInstruments = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return filteredInstruments.slice(start, start + pageSize);
  }, [effectivePage, filteredInstruments, pageSize]);

  useEffect(() => {
    const lastPage = Math.max(
      1,
      Math.ceil(filteredInstruments.length / pageSize),
    );
    if (page > lastPage) setPage(lastPage);
  }, [filteredInstruments.length, page, pageSize]);

  // Table headers
  const headers = [
    {
      key: "instrumentName",
      header: intl.formatMessage({ id: "qc.dashboard.instruments.col.name" }),
    },
    {
      key: "instrumentType",
      header: intl.formatMessage({ id: "qc.dashboard.instruments.col.type" }),
    },
    {
      key: "instrumentLocation",
      header: intl.formatMessage({
        id: "qc.dashboard.instruments.col.location",
      }),
    },
    {
      key: "status",
      header: intl.formatMessage({
        id: "qc.dashboard.instruments.col.status",
      }),
    },
    {
      key: "analytes",
      header: intl.formatMessage({
        id: "qc.dashboard.instruments.col.analytes",
      }),
    },
    {
      key: "violations",
      header: intl.formatMessage({
        id: "qc.dashboard.instruments.col.violations",
      }),
    },
    {
      key: "lastUpdate",
      header: intl.formatMessage({
        id: "qc.dashboard.instruments.col.lastUpdate",
      }),
    },
    {
      key: "actions",
      header: intl.formatMessage({
        id: "qc.dashboard.instruments.col.actions",
      }),
    },
  ];

  // Format rows for DataTable
  const rows = paginatedInstruments.map((inst, index) => ({
    id: String(inst.instrumentId ?? inst.id ?? `instrument-${index}`),
    instrumentName: inst.instrumentName || "-",
    instrumentType: inst.instrumentType || "-",
    instrumentLocation: inst.instrumentLocation || "-",
    status:
      typeof inst.complianceColor === "string" ? inst.complianceColor : "GREEN",
    analytes: Array.isArray(inst.analyteDetails) ? inst.analyteDetails : [],
    violations: Array.isArray(inst.triggeredRuleDetails)
      ? inst.triggeredRuleDetails
      : [],
    lastUpdate: inst.lastResultTime || "",
    actions: inst.instrumentId ?? inst.id,
  }));

  const handleViewInstrument = (instrumentId) => {
    if (instrumentId == null || instrumentId === "") return;
    history.push(
      `/analyzers/qc/instruments/${encodeURIComponent(instrumentId)}`,
    );
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handlePaginationChange = ({ page: newPage, pageSize: newPageSize }) => {
    setPage(newPage);
    setPageSize(newPageSize);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setPage(1);
  };

  const paginationText = {
    forwardText: intl.formatMessage({ id: "pagination.forward" }),
    backwardText: intl.formatMessage({ id: "pagination.backward" }),
    itemsPerPageText: intl.formatMessage({ id: "pagination.items-per-page" }),
    itemRangeText: (min, max, total) =>
      intl.formatMessage({ id: "pagination.item-range" }, { min, max, total }),
    pageRangeText: (_current, total) =>
      intl.formatMessage({ id: "pagination.page-range" }, { total }),
    pageNumberText: intl.formatMessage({ id: "pagination.page-number" }),
  };
  const translateTable = (messageId) => intl.formatMessage({ id: messageId });
  const translateTableHeader = (messageId, args) =>
    intl.formatMessage({ id: messageId }, { header: args?.header || "" });

  return (
    <div className="instruments-tab" data-testid="instruments-tab">
      <div className="instruments-tab__header">
        <div>
          <h4 className="instruments-tab__title">
            {intl.formatMessage({ id: "qc.dashboard.instruments.title" })}
          </h4>
          <p className="instruments-tab__subtitle">
            {intl.formatMessage({ id: "qc.dashboard.instruments.subtitle" })}
          </p>
        </div>
      </div>

      <Search
        className="instruments-tab__search"
        placeholder={intl.formatMessage({
          id: "qc.dashboard.instruments.search",
        })}
        labelText={intl.formatMessage({
          id: "qc.dashboard.instruments.search",
        })}
        value={searchTerm}
        onChange={handleSearchChange}
        closeButtonLabelText={intl.formatMessage({
          id: "qc.dashboard.instruments.clearSearch",
        })}
        data-testid="instruments-search"
      />

      {filteredInstruments.length === 0 ? (
        <Tile
          className="instruments-tab__empty"
          data-testid="instruments-empty-state"
          role="status"
        >
          {searchTerm ? (
            <SearchLocate size={32} aria-hidden="true" />
          ) : (
            <SettingsAdjust size={32} aria-hidden="true" />
          )}
          <div className="instruments-tab__empty-copy">
            <h5>
              {intl.formatMessage({
                id: searchTerm
                  ? "qc.dashboard.instruments.noSearchResults.title"
                  : "qc.dashboard.instruments.empty.title",
              })}
            </h5>
            <p>
              {intl.formatMessage({
                id: searchTerm
                  ? "qc.dashboard.instruments.noSearchResults.description"
                  : "qc.dashboard.instruments.empty.description",
              })}
            </p>
          </div>
          <Button
            kind="tertiary"
            size="sm"
            onClick={
              searchTerm ? clearSearch : () => history.push("/analyzers")
            }
          >
            {intl.formatMessage({
              id: searchTerm
                ? "qc.dashboard.instruments.clearSearch"
                : "qc.dashboard.instruments.manage",
            })}
          </Button>
        </Tile>
      ) : (
        <TableContainer data-testid="instruments-table-container">
          <DataTable
            rows={rows}
            headers={headers}
            isSortable
            translateWithId={translateTable}
          >
            {({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getTableProps,
            }) => (
              <Table {...getTableProps()} data-testid="instruments-table">
                <TableHead>
                  <TableRow>
                    {headers.map((header) => (
                      <TableHeader
                        key={header.key}
                        {...getHeaderProps({ header })}
                        translateWithId={translateTableHeader}
                      >
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={headers.length}>
                        <div className="instruments-tab__empty">
                          {intl.formatMessage({
                            id: "qc.dashboard.instruments.empty",
                          })}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      return (
                        <TableRow
                          key={row.id}
                          {...getRowProps({ row })}
                          data-testid={`instrument-row-${row.id}`}
                        >
                          {row.cells.map((cell) => {
                            let cellContent = cell.value;

                            if (cell.info.header === "status") {
                              cellContent = (
                                <Tag type={getComplianceTagType(cell.value)}>
                                  {intl.formatMessage({
                                    id: getComplianceLabelKey(cell.value),
                                  })}
                                </Tag>
                              );
                            } else if (cell.info.header === "analytes") {
                              const analyteList = cell.value || [];
                              cellContent =
                                analyteList.length > 0 ? (
                                  <div className="instruments-tab__analytes">
                                    {analyteList.map((analyte, idx) => (
                                      <span
                                        key={idx}
                                        className="instruments-tab__analyte"
                                      >
                                        {analyte.testName}
                                        {analyte.latestZScore != null && (
                                          <Tag
                                            type={getZScoreBadgeType(
                                              analyte.latestZScore,
                                            )}
                                            size="sm"
                                          >
                                            {Math.abs(
                                              parseFloat(analyte.latestZScore),
                                            ).toFixed(1)}
                                            &sigma;
                                          </Tag>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  "-"
                                );
                            } else if (cell.info.header === "violations") {
                              const ruleList = cell.value || [];
                              cellContent =
                                ruleList.length > 0 ? (
                                  <div className="instruments-tab__violations">
                                    {ruleList.map((rule, idx) => (
                                      <Tag key={idx} type="red" size="sm">
                                        {rule.ruleCode || rule}
                                      </Tag>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="instruments-tab__no-violations">
                                    {intl.formatMessage({
                                      id: "qc.dashboard.instruments.noViolations",
                                    })}
                                  </span>
                                );
                            } else if (cell.info.header === "lastUpdate") {
                              cellContent = formatTimestamp(cell.value);
                            } else if (cell.info.header === "actions") {
                              cellContent = (
                                <Button
                                  kind="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleViewInstrument(cell.value)
                                  }
                                  disabled={
                                    cell.value == null || cell.value === ""
                                  }
                                  data-testid={`instrument-view-${row.id}`}
                                >
                                  {intl.formatMessage({
                                    id: "qc.dashboard.instruments.view",
                                  })}
                                </Button>
                              );
                            }

                            return (
                              <TableCell key={cell.id}>{cellContent}</TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </DataTable>
        </TableContainer>
      )}

      {filteredInstruments.length > pageSize && (
        <Pagination
          totalItems={filteredInstruments.length}
          page={effectivePage}
          pageSize={pageSize}
          pageSizes={[10, 25, 50]}
          onChange={handlePaginationChange}
          disabled={loading}
          {...paginationText}
          data-testid="instruments-pagination"
        />
      )}
    </div>
  );
};

export default InstrumentsTab;
