import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useContext,
} from "react";
import {
  Grid,
  Column,
  Dropdown,
  Button,
  DatePicker,
  DatePickerInput,
  Tag,
  Tabs,
  Tab,
  TabList,
  TabPanels,
  TabPanel,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Pagination,
} from "@carbon/react";
import { useIntl } from "react-intl";
import "./Reports.scss";
import {
  fetchReportExcursions,
  fetchAuditTrail,
  downloadReportDirect,
} from "./api";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import { toDate } from "./shared/timeUtils";
import {
  getCarbonDateFormat,
  getDatePickerPlaceholderMessage,
} from "../common/dateLocaleUtils";

const ALL_FREEZERS = "ALL_FREEZERS";

const getReportTypes = (intl) => [
  {
    id: "daily",
    label: intl.formatMessage({ id: "coldStorage.reports.type.daily" }),
  },
  {
    id: "weekly",
    label: intl.formatMessage({ id: "coldStorage.reports.type.weekly" }),
  },
  {
    id: "monthly",
    label: intl.formatMessage({ id: "coldStorage.reports.type.monthly" }),
  },
];

const EXPORT_FORMATS = ["PDF"]; // CSV, XML, and Excel to be implemented in Phase 2

const REPORT_TYPE_MAP = {
  daily: "freezerDailyLogReport",
  weekly: "freezerDailyLogReport",
  monthly: "freezerDailyLogReport",
};

const getExcursionHeaders = (intl) => [
  {
    key: "id",
    header: intl.formatMessage({ id: "coldStorage.reports.excursion.id" }),
  },
  {
    key: "freezer",
    header: intl.formatMessage({ id: "coldStorage.device" }),
  },
  {
    key: "location",
    header: intl.formatMessage({ id: "coldStorage.location" }),
  },
  {
    key: "startTime",
    header: intl.formatMessage({ id: "coldStorage.alert.startedAt" }),
  },
  {
    key: "duration",
    header: intl.formatMessage({ id: "coldStorage.alert.duration" }),
  },
  {
    key: "range",
    header: intl.formatMessage({
      id: "coldStorage.reports.temperatureRange",
    }),
  },
  {
    key: "severity",
    header: intl.formatMessage({ id: "coldStorage.alert.severity" }),
  },
  {
    key: "status",
    header: intl.formatMessage({ id: "coldStorage.status" }),
  },
];

const getAuditHeaders = (intl) => [
  {
    key: "timestamp",
    header: intl.formatMessage({ id: "coldStorage.reports.audit.time" }),
  },
  {
    key: "performedBy",
    header: intl.formatMessage({ id: "coldStorage.reports.audit.operator" }),
  },
  {
    key: "action",
    header: intl.formatMessage({ id: "coldStorage.reports.audit.action" }),
  },
  {
    key: "comment",
    header: intl.formatMessage({ id: "coldStorage.reports.audit.details" }),
  },
  {
    key: "freezer",
    header: intl.formatMessage({ id: "coldStorage.unit.id" }),
  },
];

const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString() : "—";
};

const formatTemperature = (value) => {
  if (value === null || value === undefined) {
    return "—";
  }
  const number = Number(value);
  return Number.isNaN(number) ? "—" : `${number.toFixed(1)}°C`;
};

const formatRange = (min, max, intl) => {
  if (min == null && max == null) {
    return "—";
  }
  if (min == null) {
    return intl.formatMessage(
      { id: "coldStorage.reports.range.maximum" },
      { value: formatTemperature(max) },
    );
  }
  if (max == null) {
    return intl.formatMessage(
      { id: "coldStorage.reports.range.minimum" },
      { value: formatTemperature(min) },
    );
  }
  return intl.formatMessage(
    { id: "coldStorage.reports.range.between" },
    { min: formatTemperature(min), max: formatTemperature(max) },
  );
};

const formatReportDuration = (seconds, intl) => {
  const total = Number(seconds);
  if (seconds == null || Number.isNaN(total)) return "—";
  let remaining = Math.max(0, Math.floor(total));
  const days = Math.floor(remaining / 86400);
  remaining %= 86400;
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;
  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  if (days > 0) {
    return intl.formatMessage(
      { id: "coldStorage.reports.duration.daysHours" },
      { days, hours },
    );
  }
  if (hours > 0) {
    return intl.formatMessage(
      { id: "coldStorage.reports.duration.hoursMinutes" },
      { hours, minutes },
    );
  }
  if (minutes > 0) {
    return intl.formatMessage(
      { id: "coldStorage.reports.duration.minutes" },
      { minutes },
    );
  }
  return intl.formatMessage(
    { id: "coldStorage.reports.duration.seconds" },
    { seconds: secs },
  );
};

const mapAlertToExcursion = (alert, intl) => {
  const alertId = alert.alertId ?? alert.id;
  const freezerId = alert.freezerId ?? alert.freezer;
  const durationSeconds =
    alert.durationSeconds != null ? alert.durationSeconds : alert.duration;
  return {
    id: `ALERT-${alertId}`,
    alertId,
    freezerId,
    freezerName:
      alert.freezerName ??
      intl.formatMessage(
        { id: "coldStorage.device.fallbackName" },
        { id: freezerId },
      ),
    location:
      alert.locationName ??
      intl.formatMessage({ id: "coldStorage.location.unknown" }),
    startTime: formatDateTime(alert.startTime),
    endTime: formatDateTime(alert.endTime),
    duration: formatReportDuration(durationSeconds, intl),
    range: formatRange(alert.minTemperature, alert.maxTemperature, intl),
    severity: alert.severity ?? "UNKNOWN",
    status: alert.status ?? "OPEN",
  };
};

const defaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return [start, end];
};

const toIsoString = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const formatActionLabel = (value, intl) => {
  const actionLabels = {
    ALERT_ACKNOWLEDGED: "coldStorage.reports.audit.alertAcknowledged",
    CRITICAL_ALERT_RESOLVED: "coldStorage.reports.audit.criticalAlertResolved",
    CORRECTIVE_ACTION_LOGGED:
      "coldStorage.reports.audit.correctiveActionLogged",
    THRESHOLD_UPDATED: "coldStorage.reports.audit.thresholdUpdated",
    FREEZER_RENAMED: "coldStorage.reports.audit.deviceRenamed",
    FREEZER_STATUS_CHANGED: "coldStorage.reports.audit.statusChanged",
    CONFIGURATION_UPDATED: "coldStorage.reports.audit.configurationUpdated",
    ALERT: "coldStorage.reports.audit.alertTriggered",
    CORRECTIVE_ACTION: "coldStorage.reports.audit.correctiveAction",
  };
  if (!value) return "";
  const messageId = actionLabels[value];
  return messageId
    ? intl.formatMessage({ id: messageId })
    : intl.formatMessage(
        { id: "coldStorage.reports.audit.unknownAction" },
        { action: value },
      );
};

const mapAuditEvent = (event, intl) => ({
  id:
    event.id ??
    `ACTION-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
  freezerName:
    event.freezerName ??
    intl.formatMessage(
      { id: "coldStorage.device.fallbackName" },
      { id: event.freezerId ?? "—" },
    ),
  freezerId: event.freezerId ?? "—",
  actionType: formatActionLabel(event.actionType, intl),
  performedBy:
    event.performedBy ??
    intl.formatMessage({ id: "coldStorage.reports.audit.system" }),
  timestamp: event.performedAt || "—", // Backend already formats the date
  comment: event.comment || event.details || "—",
  details: event.details || "",
});

function Reports({ devices = [] }) {
  const intl = useIntl();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const dateLocale = configurationProperties.DEFAULT_DATE_LOCALE || "zh-CN";
  const datePickerPlaceholder = intl.formatMessage(
    getDatePickerPlaceholderMessage(dateLocale),
  );
  const reportTypes = useMemo(() => getReportTypes(intl), [intl]);
  const excursionHeaders = useMemo(() => getExcursionHeaders(intl), [intl]);
  const auditHeaders = useMemo(() => getAuditHeaders(intl), [intl]);

  const notify = useCallback(
    ({ kind = NotificationKinds.info, title, subtitle, message }) => {
      setNotificationVisible(true);
      addNotification({
        kind,
        title,
        subtitle,
        message,
      });
    },
    [addNotification, setNotificationVisible],
  );

  const normalizeArray = useCallback((payload) => {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && typeof payload === "object") {
      return (
        payload.items ||
        payload.data ||
        payload.results ||
        payload.list ||
        payload.rows ||
        []
      );
    }
    return [];
  }, []);

  const freezerOptions = useMemo(() => {
    const uniqueDevices = devices.filter(
      (device, index, self) =>
        device.id && self.findIndex((d) => d.id === device.id) === index,
    );
    return [
      {
        id: ALL_FREEZERS,
        label: intl.formatMessage({ id: "coldStorage.trends.allFreezers" }),
      },
      ...uniqueDevices.map((device) => ({
        id: String(device.id),
        value: device.id,
        label:
          device.unitName ||
          intl.formatMessage(
            { id: "coldStorage.device.fallbackName" },
            { id: device.id },
          ),
      })),
    ];
  }, [devices, intl]);

  const [excursions, setExcursions] = useState([]);
  const [auditTrail, setAuditTrail] = useState([]);

  const [excursionsLoading, setExcursionsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);

  const [pendingDownload, setPendingDownload] = useState(null);

  // Audit trail pagination and search
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(5);
  const [auditSearchTerm, setAuditSearchTerm] = useState("");

  const excursionRows = useMemo(
    () =>
      excursions.map((item) => ({
        id: item.id,
        freezer: item.freezerName,
        location: item.location,
        startTime: item.startTime,
        duration: item.duration,
        range: item.range,
        severity: item.severity,
        status: item.status,
        source: item,
      })),
    [excursions],
  );

  const auditRows = useMemo(
    () =>
      auditTrail.map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        performedBy: event.performedBy,
        action: event.actionType,
        comment: event.comment,
        freezer: event.freezerId || "—",
        freezerName: event.freezerName,
        source: event,
      })),
    [auditTrail],
  );

  // Filtered audit rows based on search term
  const filteredAuditRows = useMemo(() => {
    if (!auditSearchTerm.trim()) {
      return auditRows;
    }
    const searchLower = auditSearchTerm.toLowerCase();
    return auditRows.filter((row) => {
      return (
        row.timestamp?.toLowerCase().includes(searchLower) ||
        row.performedBy?.toLowerCase().includes(searchLower) ||
        row.action?.toLowerCase().includes(searchLower) ||
        row.comment?.toLowerCase().includes(searchLower) ||
        row.freezer?.toString().toLowerCase().includes(searchLower) ||
        row.freezerName?.toLowerCase().includes(searchLower)
      );
    });
  }, [auditRows, auditSearchTerm]);

  // Paginated audit rows
  const paginatedAuditRows = useMemo(() => {
    const startIndex = (auditPage - 1) * auditPageSize;
    const endIndex = startIndex + auditPageSize;
    return filteredAuditRows.slice(startIndex, endIndex);
  }, [filteredAuditRows, auditPage, auditPageSize]);

  const [reportType, setReportType] = useState("daily");
  const [freezer, setFreezer] = useState(ALL_FREEZERS);
  const [format, setFormat] = useState("PDF");
  const [dateRange, setDateRange] = useState(defaultDateRange());

  const selectedFreezerId = useMemo(() => {
    if (!freezer || freezer === ALL_FREEZERS) {
      return null;
    }
    return (
      freezerOptions.find((option) => option.id === freezer)?.value ?? null
    );
  }, [freezer, freezerOptions]);

  const rangeParams = useMemo(() => {
    if (!Array.isArray(dateRange) || dateRange.length < 2) {
      return null;
    }
    const [start, end] = dateRange;
    const startIso = toIsoString(start);
    const endIso = toIsoString(end);
    if (!startIso || !endIso) {
      return null;
    }
    return { start: startIso, end: endIso };
  }, [dateRange]);

  const loadExcursions = useCallback(async () => {
    if (!rangeParams) {
      return;
    }
    setExcursionsLoading(true);
    try {
      const data = await fetchReportExcursions({
        freezerId: selectedFreezerId,
        start: rangeParams.start,
        end: rangeParams.end,
      });
      const items = normalizeArray(data);
      setExcursions(items.map((alert) => mapAlertToExcursion(alert, intl)));
    } catch (error) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({
          id: "coldStorage.reports.error.excursionsTitle",
        }),
        subtitle: intl.formatMessage({
          id: "coldStorage.reports.error.excursionsMessage",
        }),
      });
    } finally {
      setExcursionsLoading(false);
    }
  }, [rangeParams, selectedFreezerId, notify, normalizeArray, intl]);

  const loadAuditTrail = useCallback(async () => {
    setAuditLoading(true);
    try {
      // Fetch all audit trail data (no date filtering on backend)
      const data = await fetchAuditTrail({
        freezerId: selectedFreezerId,
      });
      const items = normalizeArray(data);
      setAuditTrail(items.map((event) => mapAuditEvent(event, intl)));
    } catch (error) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({
          id: "coldStorage.reports.error.auditTitle",
        }),
        subtitle: intl.formatMessage({
          id: "coldStorage.reports.error.auditMessage",
        }),
      });
    } finally {
      setAuditLoading(false);
    }
  }, [selectedFreezerId, notify, normalizeArray, intl]);

  useEffect(() => {
    if (!rangeParams) {
      return;
    }
    loadExcursions();
  }, [rangeParams, loadExcursions]);

  // Load audit trail once when freezer changes (no date filtering)
  useEffect(() => {
    loadAuditTrail();
  }, [loadAuditTrail]);

  const handleDateChange = (range) => {
    if (!Array.isArray(range) || range.length < 2) {
      return;
    }
    const normalized = range.map((value) =>
      value instanceof Date ? value : new Date(value),
    );
    setDateRange(normalized);
  };

  const handleDownload = useCallback(
    (reference, formatType) => {
      try {
        const downloadUrl = `/rest/coldstorage/reports/download/${reference}`;
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `冰箱温度记录_${reference}.${formatType.toLowerCase()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setPendingDownload(null);
        notify({
          kind: NotificationKinds.success,
          title: intl.formatMessage({
            id: "coldStorage.reports.downloadStarted",
          }),
          subtitle: intl.formatMessage({
            id: "coldStorage.reports.downloadStartedMessage",
          }),
        });
      } catch (error) {
        notify({
          kind: NotificationKinds.error,
          title: intl.formatMessage({
            id: "coldStorage.reports.downloadFailed",
          }),
          subtitle: intl.formatMessage({
            id: "coldStorage.reports.downloadFailedMessage",
          }),
        });
      }
    },
    [notify, intl],
  );

  const handleGenerate = async () => {
    if (!rangeParams) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({
          id: "coldStorage.reports.missingDateRange",
        }),
        subtitle: intl.formatMessage({
          id: "coldStorage.reports.missingDateRangeMessage",
        }),
      });
      return;
    }

    const reportName = REPORT_TYPE_MAP[reportType];
    const formatParam = format.toUpperCase();

    if (!reportName) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({
          id: "coldStorage.reports.invalidReportType",
        }),
        subtitle: intl.formatMessage({
          id: "coldStorage.reports.invalidReportTypeMessage",
        }),
      });
      return;
    }

    try {
      // Call API to get report blob
      const blob = await downloadReportDirect({
        reportName: reportName,
        format: formatParam,
        startDate: rangeParams.start.split("T")[0],
        endDate: rangeParams.end.split("T")[0],
        freezerId: selectedFreezerId,
      });

      // Download file immediately
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date().toISOString().split("T")[0];
      link.download = `冰箱温度记录_${reportType}_${dateStr}.${formatParam.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      notify({
        kind: NotificationKinds.success,
        title: intl.formatMessage({
          id: "coldStorage.reports.generateSuccess",
        }),
        subtitle: intl.formatMessage({
          id: "coldStorage.reports.generateSuccessMessage",
        }),
      });
    } catch (error) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({
          id: "coldStorage.reports.generateFailed",
        }),
        subtitle: intl.formatMessage({
          id: "coldStorage.reports.generateFailedMessage",
        }),
      });
    }
  };

  const severityTag = (severity) => {
    if ((severity || "").toUpperCase() === "CRITICAL") {
      return (
        <Tag type="red">
          {intl.formatMessage({ id: "coldStorage.status.critical" })}
        </Tag>
      );
    }
    if ((severity || "").toUpperCase() === "WARNING") {
      return (
        <Tag type="yellow">
          {intl.formatMessage({ id: "coldStorage.status.warning" })}
        </Tag>
      );
    }
    return <Tag>{severity}</Tag>;
  };

  const statusTag = (status) => {
    if ((status || "").toUpperCase() === "RESOLVED") {
      return (
        <Tag type="green">
          {intl.formatMessage({ id: "coldStorage.reports.status.resolved" })}
        </Tag>
      );
    }
    if ((status || "").toUpperCase() === "OPEN") {
      return (
        <Tag type="red">
          {intl.formatMessage({ id: "coldStorage.reports.status.open" })}
        </Tag>
      );
    }
    if ((status || "").toUpperCase() === "ACKNOWLEDGED") {
      return (
        <Tag type="blue">
          {intl.formatMessage({
            id: "coldStorage.reports.status.acknowledged",
          })}
        </Tag>
      );
    }
    return <Tag>{status}</Tag>;
  };

  return (
    <div className="reports-page">
      {notificationVisible === true ? <AlertDialog /> : ""}

      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <h3 className="reports-title">
            {intl.formatMessage({ id: "coldStorage.reports.title" })}
          </h3>
        </Column>
      </Grid>

      <Grid fullWidth={true} className="reports-form">
        <Column lg={4} md={4} sm={4}>
          <Dropdown
            id="report-type"
            titleText={intl.formatMessage({
              id: "coldStorage.reports.reportType",
            })}
            items={reportTypes}
            label={
              reportTypes.find((item) => item.id === reportType)?.label ||
              reportTypes[0].label
            }
            itemToString={(item) => item?.label || ""}
            selectedItem={reportTypes.find((item) => item.id === reportType)}
            onChange={({ selectedItem }) =>
              setReportType(selectedItem?.id || "daily")
            }
          />
        </Column>
        <Column lg={4} md={4} sm={4}>
          <Dropdown
            id="freezer-select"
            titleText={intl.formatMessage({ id: "coldStorage.device" })}
            items={freezerOptions}
            label={
              freezerOptions.find((item) => item.id === freezer)?.label ||
              freezerOptions[0].label
            }
            itemToString={(item) => item?.label || ""}
            selectedItem={freezerOptions.find((item) => item.id === freezer)}
            onChange={({ selectedItem }) =>
              setFreezer(selectedItem?.id || ALL_FREEZERS)
            }
          />
        </Column>
        <Column lg={4} md={4} sm={4}>
          <Dropdown
            id="export-format"
            titleText={intl.formatMessage({
              id: "coldStorage.reports.exportFormat",
            })}
            items={EXPORT_FORMATS}
            label={format}
            selectedItem={format}
            onChange={({ selectedItem }) => setFormat(selectedItem)}
          />
        </Column>
      </Grid>

      <Grid fullWidth className="reports-form">
        <Column lg={4} md={4} sm={4}>
          <DatePicker
            datePickerType="single"
            dateFormat={getCarbonDateFormat(dateLocale)}
            onChange={(dates) => {
              if (dates && dates.length > 0) {
                const newRange = [...dateRange];
                newRange[0] = dates[0];
                setDateRange(newRange);
              }
            }}
          >
            <DatePickerInput
              id="reports-start-date"
              placeholder={datePickerPlaceholder}
              labelText={intl.formatMessage({
                id: "coldStorage.reports.startDate",
              })}
              size="md"
            />
          </DatePicker>
        </Column>
        <Column lg={4} md={4} sm={4}>
          <DatePicker
            datePickerType="single"
            dateFormat={getCarbonDateFormat(dateLocale)}
            onChange={(dates) => {
              if (dates && dates.length > 0) {
                const newRange = [...dateRange];
                newRange[1] = dates[0];
                setDateRange(newRange);
              }
            }}
          >
            <DatePickerInput
              id="reports-end-date"
              placeholder={datePickerPlaceholder}
              labelText={intl.formatMessage({
                id: "coldStorage.reports.endDate",
              })}
              size="md"
            />
          </DatePicker>
        </Column>
        <Column lg={16} md={8} sm={4} className="reports-generate">
          <Button size="sm" onClick={handleGenerate}>
            {intl.formatMessage({ id: "coldStorage.reports.generate" })}
          </Button>
          {pendingDownload && (
            <Button
              size="lg"
              kind="secondary"
              onClick={() =>
                handleDownload(
                  pendingDownload.reference,
                  pendingDownload.format,
                )
              }
              style={{ marginLeft: "1rem" }}
            >
              {intl.formatMessage(
                { id: "coldStorage.reports.downloadFormat" },
                { format: pendingDownload.format },
              )}
            </Button>
          )}
        </Column>
        <Column lg={16} md={8} sm={4}>
          <div className="reports-compliance-box">
            <p>
              <strong>
                {intl.formatMessage({
                  id: "coldStorage.reports.complianceTitle",
                })}
              </strong>
              <br />
              {intl.formatMessage({
                id: "coldStorage.reports.complianceDescription",
              })}
            </p>
          </div>
        </Column>
      </Grid>

      <Grid fullWidth={true} className="reports-bottom-tabs">
        <Column lg={16} md={8} sm={4}>
          <Tabs>
            <TabList
              aria-label={intl.formatMessage({
                id: "coldStorage.reports.tabs.ariaLabel",
              })}
              contained
            >
              <Tab>
                {intl.formatMessage({
                  id: "coldStorage.reports.excursionsTab",
                })}
              </Tab>
              <Tab>
                {intl.formatMessage({ id: "coldStorage.reports.auditTab" })}
              </Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <h4 className="exc-title">
                  {intl.formatMessage({
                    id: "coldStorage.reports.excursionHistory",
                  })}
                </h4>
                <DataTable rows={excursionRows} headers={excursionHeaders}>
                  {({
                    rows,
                    headers,
                    getRowProps,
                    getHeaderProps,
                    getTableProps,
                  }) => (
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
                          {rows.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={excursionHeaders.length}
                                className="empty-state"
                              >
                                {excursionsLoading
                                  ? intl.formatMessage({
                                      id: "coldStorage.reports.excursionsLoading",
                                    })
                                  : intl.formatMessage({
                                      id: "coldStorage.reports.excursionsEmpty",
                                    })}
                              </TableCell>
                            </TableRow>
                          )}
                          {rows.map((row) => {
                            const excursion = row.source;
                            if (!excursion) {
                              return null;
                            }
                            return (
                              <TableRow key={row.id} {...getRowProps({ row })}>
                                <TableCell>{excursion.id}</TableCell>
                                <TableCell>
                                  <span className="freezer-stack">
                                    <strong>
                                      {excursion.freezerId ?? "—"}
                                    </strong>
                                    <br />
                                    {excursion.freezerName}
                                  </span>
                                </TableCell>
                                <TableCell>{excursion.location}</TableCell>
                                <TableCell>{excursion.startTime}</TableCell>
                                <TableCell>{excursion.duration}</TableCell>
                                <TableCell>{excursion.range}</TableCell>
                                <TableCell>
                                  {severityTag(excursion.severity)}
                                </TableCell>
                                <TableCell>
                                  {statusTag(excursion.status)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              </TabPanel>
              <TabPanel>
                <h4 className="exc-title">
                  {intl.formatMessage({ id: "coldStorage.reports.auditTab" })}
                </h4>
                <DataTable rows={paginatedAuditRows} headers={auditHeaders}>
                  {({
                    rows,
                    headers,
                    getRowProps,
                    getHeaderProps,
                    getTableProps,
                    getToolbarProps,
                  }) => (
                    <TableContainer>
                      <TableToolbar {...getToolbarProps()}>
                        <TableToolbarContent>
                          <TableToolbarSearch
                            closeButtonLabelText={intl.formatMessage({
                              id: "carbon.search.clear",
                            })}
                            persistent
                            placeholder={intl.formatMessage({
                              id: "coldStorage.reports.auditSearch",
                            })}
                            value={auditSearchTerm}
                            onChange={(e) => {
                              setAuditSearchTerm(e.target.value);
                              setAuditPage(1); // Reset to first page on search
                            }}
                          />
                        </TableToolbarContent>
                      </TableToolbar>
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
                          {rows.length === 0 && (
                            <TableRow>
                              <TableCell
                                colSpan={auditHeaders.length}
                                className="empty-state"
                              >
                                {auditLoading
                                  ? intl.formatMessage({
                                      id: "coldStorage.reports.auditLoading",
                                    })
                                  : auditSearchTerm
                                    ? intl.formatMessage({
                                        id: "coldStorage.reports.auditSearchEmpty",
                                      })
                                    : intl.formatMessage({
                                        id: "coldStorage.reports.auditEmpty",
                                      })}
                              </TableCell>
                            </TableRow>
                          )}
                          {rows.map((row) => (
                            <TableRow key={row.id} {...getRowProps({ row })}>
                              {row.cells.map((cell) => (
                                <TableCell key={cell.id}>
                                  {cell.value}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
                {filteredAuditRows.length > 0 && (
                  <Pagination
                    backwardText={intl.formatMessage({
                      id: "pagination.previousPage",
                    })}
                    forwardText={intl.formatMessage({
                      id: "pagination.nextPage",
                    })}
                    itemsPerPageText={intl.formatMessage({
                      id: "pagination.itemsPerPage",
                    })}
                    page={auditPage}
                    pageSize={auditPageSize}
                    pageSizes={[5, 10, 20, 50]}
                    totalItems={filteredAuditRows.length}
                    onChange={({ page, pageSize }) => {
                      setAuditPage(page);
                      setAuditPageSize(pageSize);
                    }}
                  />
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Column>
      </Grid>

      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          <p className="reports-footer">
            {intl.formatMessage({ id: "coldStorage.reports.footer" })}
          </p>
        </Column>
      </Grid>
    </div>
  );
}

export default Reports;
