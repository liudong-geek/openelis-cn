import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DataTable,
  TableContainer,
  Table,
  TableHeader,
  TableRow,
  TableCell,
  TableBody,
  TableHead,
  Pagination,
  Button,
  DatePicker,
  DatePickerInput,
  Dropdown,
  Tag,
  TextInput,
  Loading,
} from "@carbon/react";
import { ChevronDown, ChevronUp, Download, Search } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer } from "../../utils/Utils";
import config from "../../../config.json";
import SearchPatientForm from "../../patient/SearchPatientForm";
import { ConfigurationContext } from "../../layout/Layout";
import {
  getCarbonDateFormat,
  getDatePickerPlaceholderMessage,
} from "../../common/dateLocaleUtils";
import {
  formatReportApiDateForLocale,
  parseReportDisplayDateToApi,
} from "../reportDateUtils";
import {
  getAuditActionMessageId,
  getAuditBusinessContext,
  getAuditEntityTypeMessageId,
  getAuditFieldMessageId,
} from "./auditLocalization";
import "../../Style.css";
import "./SystemAuditEvents.scss";

const PATIENT_ENTITY_NAME = "PATIENT";

const headers = [
  {
    key: "timestamp",
    header: <FormattedMessage id="systemAudit.table.heading.time" />,
  },
  {
    key: "entityType",
    header: <FormattedMessage id="systemAudit.table.heading.entityType" />,
  },
  {
    key: "entityId",
    header: <FormattedMessage id="systemAudit.table.heading.entityId" />,
  },
  {
    key: "action",
    header: <FormattedMessage id="systemAudit.table.heading.action" />,
  },
  {
    key: "user",
    header: <FormattedMessage id="systemAudit.table.heading.user" />,
  },
  {
    key: "changes",
    header: <FormattedMessage id="systemAudit.table.heading.changes" />,
  },
];

const SystemAuditEvents = () => {
  const intl = useIntl();
  const configuration = useContext(ConfigurationContext);
  const dateLocale =
    configuration?.configurationProperties?.DEFAULT_DATE_LOCALE ||
    intl.locale ||
    "zh-CN";
  const dateFormat = getCarbonDateFormat(dateLocale);
  const datePlaceholder = intl.formatMessage(
    getDatePickerPlaceholderMessage(dateLocale),
  );
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [entityTypes, setEntityTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedEntityType, setSelectedEntityType] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [searchText, setSearchText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const requestGeneration = useRef(0);
  const patientPickerGeneration = useRef(0);
  const initialQueryStarted = useRef(false);
  const renderedPickerGeneration = patientPickerGeneration.current;

  const isPatientEntity = selectedEntityType === PATIENT_ENTITY_NAME;
  const canQuery = !isPatientEntity || Boolean(selectedPatient?.patientPK);

  const clearScopedResults = useCallback(() => {
    requestGeneration.current += 1;
    patientPickerGeneration.current += 1;
    setEvents([]);
    setTotalItems(0);
    setPage(1);
    setIsLoading(false);
  }, []);

  useEffect(
    () => () => {
      requestGeneration.current += 1;
      patientPickerGeneration.current += 1;
    },
    [],
  );

  const allLabel = intl.formatMessage({ id: "systemAudit.filter.all" });
  const localizeEntityType = useCallback(
    (entityType) =>
      intl.formatMessage({ id: getAuditEntityTypeMessageId(entityType) }),
    [intl],
  );

  const actionOptions = [
    { id: "", text: allLabel },
    {
      id: "I",
      text: intl.formatMessage({ id: "systemAudit.action.insert" }),
    },
    {
      id: "U",
      text: intl.formatMessage({ id: "systemAudit.action.update" }),
    },
    {
      id: "D",
      text: intl.formatMessage({ id: "systemAudit.action.delete" }),
    },
  ];

  useEffect(() => {
    getFromOpenElisServer("/rest/systemAuditEvents/entityTypes", (data) => {
      if (data) {
        setEntityTypes([
          { id: "", apiName: "", text: allLabel },
          ...data.map((item) => ({
            ...item,
            apiName: item.name,
            text: localizeEntityType(item.name),
          })),
        ]);
      }
    });
    getFromOpenElisServer("/rest/users", (data) => {
      if (data) {
        setUsers([{ id: "", value: allLabel }, ...data]);
      }
    });
  }, [allLabel, localizeEntityType]);

  const buildParams = useCallback(
    (p, ps) => {
      const params = new URLSearchParams();
      if (p !== undefined) params.set("page", p);
      if (ps !== undefined) params.set("pageSize", ps);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (selectedEntityType) {
        // The patient-file entry includes demographics held in PERSON; the
        // API otherwise keeps entity filters exact, including patient queries.
        params.set(
          "entityType",
          isPatientEntity && selectedPatient?.patientPK
            ? "PATIENT,PERSON"
            : selectedEntityType,
        );
      }
      if (selectedAction) params.set("action", selectedAction);
      if (selectedUser) params.set("userId", selectedUser);
      if (searchText) params.set("search", searchText);
      if (isPatientEntity && selectedPatient?.patientPK) {
        params.set("patientId", selectedPatient.patientPK);
      }
      return params;
    },
    [
      startDate,
      endDate,
      selectedEntityType,
      isPatientEntity,
      selectedAction,
      selectedUser,
      searchText,
      selectedPatient,
    ],
  );

  const fetchEvents = useCallback(
    (p, ps) => {
      if (!canQuery) return;
      const generation = ++requestGeneration.current;
      setIsLoading(true);
      const params = buildParams(p, ps);

      getFromOpenElisServer(
        "/rest/systemAuditEvents?" + params.toString(),
        (data) => {
          if (generation !== requestGeneration.current) return;
          if (data && data.events) {
            const formatted = data.events.map((e, idx) => {
              const context = getAuditBusinessContext(e);
              const changesObj = e.changes || {};
              const changesStr =
                Object.keys(changesObj).length > 0
                  ? Object.entries(changesObj)
                      .map(([k, v]) => {
                        const fieldLabel = intl.formatMessage({
                          id: getAuditFieldMessageId(k),
                        });
                        if (v && typeof v === "object") {
                          const oldVal = v.old ?? "";
                          const newVal = v.new ?? "";
                          if (!oldVal && !newVal) return null;
                          if (oldVal && newVal)
                            return `${fieldLabel}：${oldVal} → ${newVal}`;
                          if (newVal) return `${fieldLabel}：${newVal}`;
                          return `${fieldLabel}：${oldVal}`;
                        }
                        if (!v) return null;
                        return `${fieldLabel}：${v}`;
                      })
                      .filter(Boolean)
                      .join("；")
                  : "";
              return {
                ...e,
                id: String((p - 1) * ps + idx + 1),
                timestamp: e.timestamp
                  ? new Date(e.timestamp).toLocaleString(intl.locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "",
                entityType: localizeEntityType(context.entityType),
                entityId: context.entityId,
                action: intl.formatMessage({
                  id: getAuditActionMessageId(e.action),
                }),
                changes: changesStr,
              };
            });
            setEvents(formatted);
            setTotalItems(data.totalItems);
          } else {
            setEvents([]);
            setTotalItems(0);
          }
          setIsLoading(false);
        },
      );
    },
    [buildParams, canQuery, intl, localizeEntityType],
  );

  const handleSearch = () => {
    if (!canQuery) return;
    setPage(1);
    fetchEvents(1, pageSize);
  };

  useEffect(() => {
    if (initialQueryStarted.current) return;
    initialQueryStarted.current = true;
    fetchEvents(1, pageSize);
  }, [fetchEvents, pageSize]);

  const handlePageChange = (pageInfo) => {
    if (!canQuery) return;
    setPage(pageInfo.page);
    setPageSize(pageInfo.pageSize);
    fetchEvents(pageInfo.page, pageInfo.pageSize);
  };

  const handleExportCsv = () => {
    if (!canQuery) return;
    const params = buildParams();
    window.open(
      config.serverBaseUrl +
        "/rest/systemAuditEvents/export?" +
        params.toString(),
      "_blank",
    );
  };

  const handleExportPdf = () => {
    if (!canQuery) return;
    const params = buildParams();
    window.open(
      config.serverBaseUrl +
        "/rest/systemAuditEvents/exportPdf?" +
        params.toString(),
      "_blank",
    );
  };

  const activeFilterCount = [
    startDate,
    endDate,
    selectedEntityType,
    selectedAction,
    selectedUser,
    searchText,
  ].filter(Boolean).length;

  return (
    <div className="system-audit-workspace">
      <header className="system-audit-workspace__header">
        <div>
          <h1>
            <FormattedMessage id="reports.systemAuditTrail" />
          </h1>
          <p>
            <FormattedMessage id="systemAudit.workspace.subtitle" />
          </p>
        </div>
        <Tag type="blue">
          <FormattedMessage
            id="systemAudit.results.summary"
            values={{ count: totalItems }}
          />
        </Tag>
      </header>

      <section className="system-audit-query">
        <div className="system-audit-query__quick-row">
          <TextInput
            id="searchText"
            hideLabel
            labelText={intl.formatMessage({
              id: "systemAudit.filter.searchText",
            })}
            placeholder={intl.formatMessage({
              id: "systemAudit.filter.searchText.placeholder",
            })}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Button
            renderIcon={Search}
            onClick={handleSearch}
            disabled={!canQuery}
          >
            <FormattedMessage id="systemAudit.filter.search" />
          </Button>
          <Button
            kind="tertiary"
            renderIcon={filtersExpanded ? ChevronUp : ChevronDown}
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded((expanded) => !expanded)}
          >
            <FormattedMessage
              id={
                filtersExpanded
                  ? "systemAudit.filter.collapse"
                  : "systemAudit.filter.expand"
              }
              values={{ count: activeFilterCount }}
            />
          </Button>
          <div className="system-audit-query__exports">
            <Button
              kind="ghost"
              renderIcon={Download}
              onClick={handleExportCsv}
              disabled={!canQuery}
            >
              <FormattedMessage id="systemAudit.filter.export" />
            </Button>
            <Button
              kind="ghost"
              renderIcon={Download}
              onClick={handleExportPdf}
              disabled={!canQuery}
            >
              <FormattedMessage id="systemAudit.filter.exportPdf" />
            </Button>
          </div>
        </div>

        {filtersExpanded && (
          <div className="system-audit-query__advanced">
            <div className="system-audit-query__filter-grid">
              <DatePicker
                datePickerType="single"
                dateFormat={dateFormat}
                value={formatReportApiDateForLocale(startDate, dateLocale)}
                onChange={(_dates, dateStr) =>
                  setStartDate(parseReportDisplayDateToApi(dateStr, dateLocale))
                }
              >
                <DatePickerInput
                  id="startDate"
                  placeholder={datePlaceholder}
                  labelText={intl.formatMessage({
                    id: "systemAudit.filter.startDate",
                  })}
                />
              </DatePicker>
              <DatePicker
                datePickerType="single"
                dateFormat={dateFormat}
                value={formatReportApiDateForLocale(endDate, dateLocale)}
                onChange={(_dates, dateStr) =>
                  setEndDate(parseReportDisplayDateToApi(dateStr, dateLocale))
                }
              >
                <DatePickerInput
                  id="endDate"
                  placeholder={datePlaceholder}
                  labelText={intl.formatMessage({
                    id: "systemAudit.filter.endDate",
                  })}
                />
              </DatePicker>
              <Dropdown
                id="entityType"
                titleText={intl.formatMessage({
                  id: "systemAudit.filter.entityType",
                })}
                items={entityTypes}
                itemToString={(item) => (item ? item.text : "")}
                onChange={({ selectedItem }) => {
                  const newType = selectedItem?.apiName || "";
                  clearScopedResults();
                  setShowPatientSearch(false);
                  setSelectedEntityType(newType);
                  if (newType !== PATIENT_ENTITY_NAME) {
                    setSelectedPatient(null);
                  }
                }}
                label={intl.formatMessage({
                  id: "systemAudit.filter.entityType",
                })}
              />
              <Dropdown
                id="action"
                titleText={intl.formatMessage({
                  id: "systemAudit.filter.action",
                })}
                items={actionOptions}
                itemToString={(item) => (item ? item.text : "")}
                onChange={({ selectedItem }) =>
                  setSelectedAction(selectedItem ? selectedItem.id : "")
                }
                label={intl.formatMessage({
                  id: "systemAudit.filter.action",
                })}
              />
              <Dropdown
                id="user"
                titleText={intl.formatMessage({
                  id: "systemAudit.filter.user",
                })}
                items={users}
                itemToString={(item) => (item ? item.value : "")}
                onChange={({ selectedItem }) =>
                  setSelectedUser(selectedItem ? selectedItem.id : "")
                }
                label={intl.formatMessage({ id: "systemAudit.filter.user" })}
              />
            </div>

            {isPatientEntity && (
              <div className="system-audit-query__patient-scope">
                <div className="system-audit-query__patient-actions">
                  <Tag type={selectedPatient?.patientPK ? "blue" : "gray"}>
                    <FormattedMessage id="systemAudit.filter.selectedPatient" />
                    ：{" "}
                    {selectedPatient?.patientPK
                      ? [selectedPatient.firstName, selectedPatient.lastName]
                          .filter(Boolean)
                          .join(" ") +
                        (selectedPatient.subjectNumber
                          ? ` (${selectedPatient.subjectNumber})`
                          : "")
                      : intl.formatMessage({
                          id: "systemAudit.filter.selectedPatient.none",
                        })}
                  </Tag>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => {
                      patientPickerGeneration.current += 1;
                      setShowPatientSearch((previous) => !previous);
                    }}
                  >
                    {selectedPatient?.patientPK ? (
                      <FormattedMessage id="systemAudit.filter.selectAnotherPatient" />
                    ) : (
                      <FormattedMessage id="systemAudit.filter.selectPatient" />
                    )}
                  </Button>
                  {selectedPatient?.patientPK && (
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={() => {
                        clearScopedResults();
                        setSelectedPatient(null);
                        setShowPatientSearch(false);
                      }}
                    >
                      <FormattedMessage id="label.button.clear" />
                    </Button>
                  )}
                </div>
                {showPatientSearch && (
                  <div className="system-audit-query__patient-picker">
                    <SearchPatientForm
                      getSelectedPatient={(patient) => {
                        if (
                          renderedPickerGeneration !==
                          patientPickerGeneration.current
                        ) {
                          return;
                        }
                        clearScopedResults();
                        setSelectedPatient(patient);
                        setShowPatientSearch(false);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="system-audit-query__advanced-footer">
              {activeFilterCount > 0 && (
                <span>
                  <FormattedMessage
                    id="systemAudit.filter.activeSummary"
                    values={{ count: activeFilterCount }}
                  />
                </span>
              )}
              <Button onClick={handleSearch} disabled={!canQuery}>
                <FormattedMessage id="results.workbench.applyFilters" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className="system-audit-results" aria-live="polite">
        {isLoading && events.length === 0 && (
          <div className="system-audit-results__loading">
            <Loading
              small
              withOverlay={false}
              description={intl.formatMessage({ id: "loading.description" })}
            />
          </div>
        )}
        {events.length === 0 && !isLoading && (
          <div className="oe-empty-state">
            <p>
              <FormattedMessage id="systemAudit.noResults" />
            </p>
          </div>
        )}
        {events.length > 0 && (
          <>
            <DataTable rows={events} headers={headers} isSortable>
              {({ rows, headers, getHeaderProps, getTableProps }) => (
                <TableContainer>
                  <Table {...getTableProps()}>
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => (
                          <TableHeader
                            key={header.key}
                            {...getHeaderProps({ header })}
                          >
                            {header.header}
                          </TableHeader>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          {row.cells.map((cell) => (
                            <TableCell key={cell.id}>{cell.value}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DataTable>
            <Pagination
              onChange={handlePageChange}
              page={page}
              pageSize={pageSize}
              pageSizes={[25, 50, 100]}
              totalItems={totalItems}
              forwardText={intl.formatMessage({ id: "pagination.forward" })}
              backwardText={intl.formatMessage({ id: "pagination.backward" })}
              itemRangeText={(min, max, total) =>
                intl.formatMessage(
                  { id: "pagination.item-range" },
                  { min, max, total },
                )
              }
              itemsPerPageText={intl.formatMessage({
                id: "pagination.items-per-page",
              })}
              itemText={(min, max) =>
                intl.formatMessage({ id: "pagination.item" }, { min, max })
              }
              pageNumberText={intl.formatMessage({
                id: "pagination.page-number",
              })}
              pageRangeText={(_current, total) =>
                intl.formatMessage({ id: "pagination.page-range" }, { total })
              }
              pageText={(page, pagesUnknown) =>
                intl.formatMessage(
                  { id: "pagination.page" },
                  { page: pagesUnknown ? "" : page },
                )
              }
            />
          </>
        )}
      </section>
    </div>
  );
};

export default SystemAuditEvents;
