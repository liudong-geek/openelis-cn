/**
 * AlertsTab Component
 *
 * Displays QC violations split into active (unacknowledged) and
 * acknowledged sections, with time period filtering.
 *
 * Features:
 * - Time period dropdown filter (24h, 72h, 7d, 30d, all)
 * - Active violations cards with Acknowledge button
 * - Acknowledged violations DataTable
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Dropdown,
  Tag,
  Tile,
  Button,
  Loading,
  InlineNotification,
} from "@carbon/react";
import { CheckmarkFilled } from "@carbon/icons-react";
import { useIntl } from "react-intl";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import {
  getSeverityTagType,
  formatTimestamp,
  filterByTimePeriod,
} from "./qcDashboardUtils";
import "./AlertsTab.css";

const AlertsTab = ({ refreshToken = 0 }) => {
  const intl = useIntl();
  const intlRef = useRef(intl);
  intlRef.current = intl;

  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timePeriod, setTimePeriod] = useState("72h");
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  const timePeriodOptions = [
    {
      id: "24h",
      label: intl.formatMessage({ id: "qc.dashboard.alerts.timePeriod.24h" }),
    },
    {
      id: "72h",
      label: intl.formatMessage({ id: "qc.dashboard.alerts.timePeriod.72h" }),
    },
    {
      id: "7d",
      label: intl.formatMessage({ id: "qc.dashboard.alerts.timePeriod.7d" }),
    },
    {
      id: "30d",
      label: intl.formatMessage({ id: "qc.dashboard.alerts.timePeriod.30d" }),
    },
    {
      id: "all",
      label: intl.formatMessage({ id: "qc.dashboard.alerts.timePeriod.all" }),
    },
  ];

  const loadViolations = useCallback(() => {
    setLoading(true);
    setError(null);

    getFromOpenElisServer("/rest/qc/violations", (response) => {
      const responseData = response?.data ?? response;
      const rawViolations = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.violations)
          ? responseData.violations
          : null;
      const nextViolations = rawViolations?.filter(
        (violation) =>
          violation &&
          typeof violation === "object" &&
          !Array.isArray(violation),
      );

      if (nextViolations) {
        setViolations(nextViolations);
      } else {
        setError({
          title: intlRef.current.formatMessage({
            id: "qc.dashboard.error.title",
          }),
          message: intlRef.current.formatMessage({
            id: "qc.dashboard.error.loadFailed",
          }),
        });
      }
      setAcknowledgingId(null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    loadViolations();
  }, [loadViolations, refreshToken]);

  // Filter by time period
  const filteredViolations = useMemo(() => {
    return filterByTimePeriod(violations, "violationDateTime", timePeriod);
  }, [violations, timePeriod]);

  // Split into active (unresolved+unacknowledged) and acknowledged
  const activeViolations = useMemo(() => {
    return filteredViolations.filter((v) => {
      const status = v.resolutionStatus || v.status;
      return status === "UNRESOLVED";
    });
  }, [filteredViolations]);

  const acknowledgedViolations = useMemo(() => {
    return filteredViolations.filter((v) => {
      const status = v.resolutionStatus || v.status;
      return (
        status === "ACKNOWLEDGED" || status === "CORRECTIVE_ACTION_PENDING"
      );
    });
  }, [filteredViolations]);

  const handleAcknowledge = (violationId) => {
    if (violationId == null || acknowledgingId != null) return;
    setAcknowledgingId(violationId);
    setError(null);
    const endpoint = `/rest/qc/violations/${encodeURIComponent(
      violationId,
    )}/acknowledge`;
    postToOpenElisServerFullResponse(
      endpoint,
      JSON.stringify({}),
      (response) => {
        if (response?.ok) {
          loadViolations();
        } else {
          setAcknowledgingId(null);
          setError({
            title: intl.formatMessage({
              id: "qc.violations.error.acknowledgeTitle",
            }),
            message: intl.formatMessage({
              id: "qc.violations.error.acknowledgeFailed",
            }),
          });
        }
      },
    );
  };

  const formatSeverity = (severity) => {
    const normalizedSeverity = String(severity || "WARNING").toLowerCase();
    const knownSeverities = ["warning", "rejection"];
    return knownSeverities.includes(normalizedSeverity)
      ? intl.formatMessage({
          id: `qc.dashboard.alerts.severity.${normalizedSeverity}`,
        })
      : severity || "-";
  };
  const translateMenu = (messageId) =>
    intl.formatMessage({ id: `carbon.${messageId}` });
  const translateTable = (messageId) => intl.formatMessage({ id: messageId });
  const translateTableHeader = (messageId, args) =>
    intl.formatMessage({ id: messageId }, { header: args?.header || "" });

  // Acknowledged violations table headers
  const acknowledgedHeaders = [
    {
      key: "severity",
      header: intl.formatMessage({ id: "qc.dashboard.alerts.col.severity" }),
    },
    {
      key: "instrument",
      header: intl.formatMessage({ id: "qc.dashboard.alerts.col.instrument" }),
    },
    {
      key: "analyte",
      header: intl.formatMessage({ id: "qc.dashboard.alerts.col.analyte" }),
    },
    {
      key: "rule",
      header: intl.formatMessage({ id: "qc.dashboard.alerts.col.rule" }),
    },
    {
      key: "acknowledgedBy",
      header: intl.formatMessage({
        id: "qc.dashboard.alerts.col.acknowledgedBy",
      }),
    },
    {
      key: "acknowledgedDate",
      header: intl.formatMessage({
        id: "qc.dashboard.alerts.col.acknowledgedDate",
      }),
    },
  ];

  const acknowledgedRows = acknowledgedViolations.map((v) => ({
    id: String(v.id),
    severity: v.severity || "WARNING",
    instrument: v.instrumentName || "-",
    analyte: v.testName || "-",
    rule: v.ruleCode || "-",
    acknowledgedBy: v.resolvedByUserName || "-",
    acknowledgedDate: formatTimestamp(v.acknowledgedDate),
  }));

  if (loading && violations.length === 0) {
    return (
      <div className="alerts-tab__loading" data-testid="alerts-tab-loading">
        <Loading
          description={intl.formatMessage({ id: "qc.dashboard.loading" })}
          withOverlay={false}
        />
      </div>
    );
  }

  return (
    <div className="alerts-tab" data-testid="alerts-tab">
      {/* Header with time period filter */}
      <div className="alerts-tab__header">
        <div>
          <h4 className="alerts-tab__title">
            {intl.formatMessage({ id: "qc.dashboard.alerts.title" })}
          </h4>
        </div>
        <Dropdown
          id="alerts-time-period"
          className="alerts-tab__time-filter"
          label={intl.formatMessage({
            id: "qc.dashboard.alerts.timePeriod",
          })}
          titleText={intl.formatMessage({
            id: "qc.dashboard.alerts.timePeriod",
          })}
          items={timePeriodOptions}
          itemToString={(item) => item?.label || ""}
          selectedItem={timePeriodOptions.find((o) => o.id === timePeriod)}
          onChange={({ selectedItem }) =>
            setTimePeriod(selectedItem?.id || "72h")
          }
          translateWithId={translateMenu}
          data-testid="alerts-time-period-filter"
        />
      </div>

      {error && (
        <div className="alerts-tab__error" data-testid="alerts-tab-error">
          <InlineNotification
            aria-label={intl.formatMessage({ id: "button.close" })}
            statusIconDescription={intl.formatMessage({
              id: "carbon.notification.error",
            })}
            kind="error"
            title={error.title}
            subtitle={error.message}
            onClose={() => setError(null)}
          />
          <Button kind="ghost" size="sm" onClick={loadViolations}>
            {intl.formatMessage({ id: "qc.dashboard.alerts.retry" })}
          </Button>
        </div>
      )}

      {/* Active Violations Section */}
      <div className="alerts-tab__section" data-testid="alerts-active-section">
        <h5 className="alerts-tab__section-title">
          {intl.formatMessage({ id: "qc.dashboard.alerts.active" })}
        </h5>
        <p className="alerts-tab__section-count">
          {intl.formatMessage(
            { id: "qc.dashboard.alerts.active.count" },
            { count: activeViolations.length },
          )}
        </p>

        {activeViolations.length === 0 ? (
          <Tile
            className="alerts-tab__empty-state"
            data-testid="alerts-active-empty"
          >
            <CheckmarkFilled size={24} className="alerts-tab__empty-icon" />
            <span>
              {intl.formatMessage({ id: "qc.dashboard.alerts.active.empty" })}
            </span>
          </Tile>
        ) : (
          <div className="alerts-tab__active-cards">
            {activeViolations.map((violation) => (
              <Tile
                key={violation.id}
                className="alerts-tab__violation-card"
                data-testid={`alert-card-${violation.id}`}
              >
                <div className="alerts-tab__card-header">
                  <Tag type={getSeverityTagType(violation.severity)}>
                    {formatSeverity(violation.severity)}
                  </Tag>
                  <span className="alerts-tab__card-rule">
                    {violation.ruleCode}
                  </span>
                </div>
                <div className="alerts-tab__card-details">
                  <span>{violation.instrumentName || "-"}</span>
                  <span className="alerts-tab__card-separator">|</span>
                  <span>{violation.testName || "-"}</span>
                </div>
                <div className="alerts-tab__card-footer">
                  <span className="alerts-tab__card-timestamp">
                    {formatTimestamp(violation.violationDateTime)}
                  </span>
                  <Button
                    kind="tertiary"
                    size="sm"
                    onClick={() => handleAcknowledge(violation.id)}
                    disabled={acknowledgingId != null}
                    data-testid={`alert-acknowledge-${violation.id}`}
                  >
                    {intl.formatMessage({
                      id:
                        acknowledgingId === violation.id
                          ? "qc.dashboard.alerts.acknowledging"
                          : "qc.dashboard.alerts.acknowledge",
                    })}
                  </Button>
                </div>
              </Tile>
            ))}
          </div>
        )}
      </div>

      {/* Acknowledged Violations Section */}
      <div
        className="alerts-tab__section"
        data-testid="alerts-acknowledged-section"
      >
        <h5 className="alerts-tab__section-title">
          {intl.formatMessage({ id: "qc.dashboard.alerts.acknowledged" })}
        </h5>
        <p className="alerts-tab__section-count">
          {intl.formatMessage(
            { id: "qc.dashboard.alerts.acknowledged.count" },
            { count: acknowledgedViolations.length },
          )}
        </p>

        {acknowledgedViolations.length === 0 ? (
          <div
            className="alerts-tab__empty-text"
            data-testid="alerts-acknowledged-empty"
          >
            {intl.formatMessage({
              id: "qc.dashboard.alerts.acknowledged.empty",
            })}
          </div>
        ) : (
          <TableContainer data-testid="alerts-acknowledged-table-container">
            <DataTable
              rows={acknowledgedRows}
              headers={acknowledgedHeaders}
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
                <Table
                  {...getTableProps()}
                  data-testid="alerts-acknowledged-table"
                >
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
                    {rows.map((row) => (
                      <TableRow key={row.id} {...getRowProps({ row })}>
                        {row.cells.map((cell) => {
                          let cellContent = cell.value;

                          if (cell.info.header === "severity") {
                            cellContent = (
                              <Tag type={getSeverityTagType(cell.value)}>
                                {formatSeverity(cell.value)}
                              </Tag>
                            );
                          }

                          return (
                            <TableCell key={cell.id}>{cellContent}</TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </DataTable>
          </TableContainer>
        )}
      </div>
    </div>
  );
};

export default AlertsTab;
