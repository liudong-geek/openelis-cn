import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Grid,
  Column,
  Tag,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Dropdown,
  Pagination,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Loading,
  Button,
  Search,
} from "@carbon/react";
import {
  Document,
  Warning,
  Calendar,
  Time,
  Download,
} from "@carbon/icons-react";
import { LineChart } from "@carbon/charts-react";
import { useIntl } from "react-intl";
import "@carbon/charts/styles.css";
import {
  fetchCorrectiveActions,
  fetchFilteredAlerts,
  fetchHistoricalReadings,
} from "./api";

const getEventTypeOptions = (intl) => [
  {
    id: "all",
    label: intl.formatMessage({ id: "coldStorage.deviceHistory.allEvents" }),
  },
  {
    id: "alert",
    label: intl.formatMessage({ id: "coldStorage.deviceHistory.alertsOnly" }),
  },
  {
    id: "corrective-action",
    label: intl.formatMessage({
      id: "coldStorage.deviceHistory.correctiveActionsOnly",
    }),
  },
];

const getTimeRangeOptions = (intl) => [
  {
    id: "24h",
    label: intl.formatMessage({ id: "coldStorage.trends.range.24h" }),
  },
  {
    id: "7d",
    label: intl.formatMessage({ id: "coldStorage.trends.range.7d" }),
  },
  {
    id: "30d",
    label: intl.formatMessage({ id: "coldStorage.trends.range.30d" }),
  },
  {
    id: "all",
    label: intl.formatMessage({ id: "coldStorage.trends.range.all" }),
  },
];

const RANGE_TO_DURATION = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: 90 * 24 * 60 * 60 * 1000,
};

function DeviceHistoryExpansion({ device }) {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);
  const [correctiveActions, setCorrectiveActions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const [timeRange, setTimeRange] = useState("24h");
  const [chartData, setChartData] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsError, setTrendsError] = useState(null);
  const eventTypeOptions = useMemo(() => getEventTypeOptions(intl), [intl]);
  const timeRangeOptions = useMemo(() => getTimeRangeOptions(intl), [intl]);

  const loadDeviceHistory = useCallback(async () => {
    if (!device) return;

    const deviceId = device.id || device.freezerId;
    if (!deviceId) return;

    setLoading(true);
    setHistoryError(null);
    try {
      const freezerId =
        typeof deviceId === "string" ? parseInt(deviceId, 10) : deviceId;
      const [actionsData, alertsData] = await Promise.all([
        fetchCorrectiveActions({ freezerId: freezerId }),
        fetchFilteredAlerts({
          entityType: "FREEZER",
          entityId: freezerId,
          page: 0,
          size: 100,
        }),
      ]);

      const normalizeArray = (payload) => {
        if (Array.isArray(payload)) return payload;
        if (payload && typeof payload === "object") {
          return (
            payload.items ||
            payload.data ||
            payload.results ||
            payload.content ||
            payload.list ||
            payload.rows ||
            []
          );
        }
        return [];
      };

      const actions = normalizeArray(actionsData);
      const alertsResult = normalizeArray(alertsData);
      const alertsList = Array.isArray(alertsResult)
        ? alertsResult
        : alertsResult?.content || [];

      setCorrectiveActions(actions || []);
      setAlerts(alertsList || []);
    } catch (error) {
      console.error("Error loading device history:", error);
      setHistoryError(
        intl.formatMessage({ id: "coldStorage.deviceHistory.loadFailed" }),
      );
    } finally {
      setLoading(false);
    }
  }, [device, intl]);

  useEffect(() => {
    if (device) {
      loadDeviceHistory();
    }
  }, [device, loadDeviceHistory]);

  const loadTemperatureReadings = useCallback(async () => {
    if (!device) return;

    const deviceId = device.id || device.freezerId;
    if (!deviceId) return;

    setTrendsLoading(true);
    setTrendsError(null);

    try {
      const duration = RANGE_TO_DURATION[timeRange] || RANGE_TO_DURATION["24h"];
      const end = new Date();
      const start = new Date(end.getTime() - duration);

      const freezerId =
        typeof deviceId === "string" ? parseInt(deviceId, 10) : deviceId;
      const readings = await fetchHistoricalReadings(
        freezerId,
        start.toISOString(),
        end.toISOString(),
      );

      const normalizedReadings = (readings || [])
        .filter((reading) => reading.temperatureCelsius != null)
        .map((reading) => ({
          group: intl.formatMessage({ id: "coldStorage.temperature" }),
          date: new Date(reading.recordedAt),
          value: reading.temperatureCelsius,
        }))
        .sort((a, b) => a.date - b.date);

      setChartData(normalizedReadings);
    } catch (error) {
      console.error("Error loading temperature readings:", error);
      setTrendsError(
        intl.formatMessage({ id: "coldStorage.trends.error.loadFailed" }),
      );
      setChartData([]);
    } finally {
      setTrendsLoading(false);
    }
  }, [device, timeRange, intl]);

  useEffect(() => {
    if (activeTab === 1 && device) {
      loadTemperatureReadings();
    }
  }, [activeTab, device, loadTemperatureReadings]);

  const formatDate = (dateValue) => {
    if (!dateValue) return "—";
    const date =
      typeof dateValue === "number"
        ? new Date(dateValue * 1000)
        : new Date(dateValue);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
  };

  const formatTime = (dateValue) => {
    if (!dateValue) return "—";
    const date =
      typeof dateValue === "number"
        ? new Date(dateValue * 1000)
        : new Date(dateValue);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatTemperature = (value) => {
    if (value == null) return "—";
    return `${value.toFixed(1)}°C`;
  };

  const allEvents = useMemo(() => {
    const events = [];

    alerts.forEach((alert) => {
      events.push({
        id: `ALT-${String(alert.id).padStart(3, "0")}`,
        type: "alert",
        eventId: `ALT-${String(alert.id).padStart(3, "0")}`,
        summary:
          alert.currentTemperature != null
            ? intl.formatMessage(
                {
                  id:
                    alert.currentTemperature > alert.maxTemperature
                      ? "coldStorage.deviceHistory.temperatureExceeded"
                      : "coldStorage.deviceHistory.temperatureDroppedBelow",
                },
                {
                  temperature: formatTemperature(alert.currentTemperature),
                  level: intl.formatMessage({
                    id:
                      alert.severity === "CRITICAL"
                        ? "coldStorage.status.critical"
                        : "coldStorage.status.warning",
                  }),
                  threshold: formatTemperature(
                    alert.maxTemperature ?? alert.minTemperature,
                  ),
                },
              )
            : alert.severity === "CRITICAL"
              ? intl.formatMessage({
                  id: "coldStorage.deviceHistory.criticalExcursion",
                })
              : intl.formatMessage({
                  id: "coldStorage.deviceHistory.warningExceeded",
                }),
        severity: alert.severity,
        date: alert.startTime,
        time: alert.startTime,
        acknowledgedBy: alert.actions?.[0]?.performedBy || "—",
        rawData: alert,
      });
    });

    correctiveActions.forEach((action) => {
      events.push({
        id: `CA-${String(action.id).padStart(3, "0")}`,
        type: "corrective-action",
        eventId: `CA-${String(action.id).padStart(3, "0")}`,
        summary:
          action.description ||
          intl.formatMessage({ id: "coldStorage.deviceHistory.noDescription" }),
        severity: null,
        status: action.status || "PENDING",
        isEdited: action.isEdited || false,
        date: action.createdAt,
        time: action.createdAt,
        acknowledgedBy: action.createdByName || "—",
        rawData: action,
      });
    });

    return events.sort((a, b) => {
      const dateA =
        typeof a.date === "number" ? new Date(a.date * 1000) : new Date(a.date);
      const dateB =
        typeof b.date === "number" ? new Date(b.date * 1000) : new Date(b.date);
      return dateB - dateA;
    });
  }, [alerts, correctiveActions, intl]);

  const filteredEvents = useMemo(() => {
    let filtered = allEvents;

    if (eventFilter === "alert") {
      filtered = filtered.filter((e) => e.type === "alert");
    } else if (eventFilter === "corrective-action") {
      filtered = filtered.filter((e) => e.type === "corrective-action");
    }

    if (searchTerm) {
      const lc = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.eventId.toLowerCase().includes(lc) ||
          e.summary.toLowerCase().includes(lc) ||
          e.acknowledgedBy.toLowerCase().includes(lc),
      );
    }

    return filtered;
  }, [allEvents, eventFilter, searchTerm]);

  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredEvents.slice(start, end);
  }, [filteredEvents, currentPage, pageSize]);

  const totalEvents = allEvents.length;
  const totalAlerts = alerts.length;
  const totalCorrectiveActions = correctiveActions.length;

  const temperatureStats = useMemo(() => {
    if (!chartData.length) {
      return { avg: "—", min: "—", max: "—", count: 0 };
    }
    const values = chartData.map((d) => d.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      avg: avg.toFixed(1),
      min: min.toFixed(1),
      max: max.toFixed(1),
      count: values.length,
    };
  }, [chartData]);

  const formattedChartData = useMemo(() => {
    return chartData.map((point) => ({
      group: point.group,
      key: point.date.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: point.value,
    }));
  }, [chartData]);

  const deviceThresholds = useMemo(() => {
    const minTemp = device?.minTemperature || device?.thresholdMin || -20;
    const maxTemp = device?.maxTemperature || device?.thresholdMax || -18;
    return { minTemp, maxTemp };
  }, [device]);

  const chartOptions = useMemo(() => {
    const { minTemp, maxTemp } = deviceThresholds;

    return {
      title: "",
      axes: {
        bottom: {
          title: "",
          mapsTo: "key",
          scaleType: "labels",
        },
        left: {
          title: intl.formatMessage({ id: "coldStorage.temperature.celsius" }),
          mapsTo: "value",
          scaleType: "linear",
        },
      },
      legend: {
        enabled: false,
      },
      height: "400px",
      tooltip: {
        showTotal: false,
      },
      thresholds: [
        {
          value: maxTemp,
          label: intl.formatMessage({
            id: "coldStorage.deviceHistory.highTemperatureThreshold",
          }),
          fillColor: "#FF832B",
        },
        {
          value: minTemp,
          label: intl.formatMessage({
            id: "coldStorage.deviceHistory.lowTemperatureThreshold",
          }),
          fillColor: "#DA1E28",
        },
      ],
    };
  }, [deviceThresholds, intl]);

  const handleExportCsv = () => {
    if (!chartData.length) return;

    const csvHeader = `${intl.formatMessage({
      id: "coldStorage.timestamp",
    })},${intl.formatMessage({ id: "coldStorage.temperature.celsius" })}\n`;
    const csvRows = chartData
      .map((point) => `${point.date.toISOString()},${point.value}`)
      .join("\n");
    const csvContent = csvHeader + csvRows;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `设备温度记录-${device?.id || device?.freezerId}-${new Date().toISOString()}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const severityTag = (severity) => {
    if (!severity) return null;
    switch (severity) {
      case "WARNING":
        return (
          <Tag type="yellow">
            {intl.formatMessage({ id: "coldStorage.status.warning" })}
          </Tag>
        );
      case "CRITICAL":
        return (
          <Tag type="red">
            {intl.formatMessage({ id: "coldStorage.status.critical" })}
          </Tag>
        );
      default:
        return <Tag>{severity}</Tag>;
    }
  };

  const statusTag = (status, isEdited = false) => {
    const tag = (() => {
      switch (status) {
        case "PENDING":
          return (
            <Tag type="red">
              {intl.formatMessage({
                id: "coldStorage.corrective.status.pending",
              })}
            </Tag>
          );
        case "IN_PROGRESS":
          return (
            <Tag type="blue">
              {intl.formatMessage({
                id: "coldStorage.corrective.status.inProgress",
              })}
            </Tag>
          );
        case "COMPLETED":
          return (
            <Tag type="green">
              {intl.formatMessage({
                id: "coldStorage.corrective.status.completed",
              })}
            </Tag>
          );
        case "CANCELLED":
          return (
            <Tag type="gray">
              {intl.formatMessage({
                id: "coldStorage.corrective.status.cancelled",
              })}
            </Tag>
          );
        case "RETRACTED":
          return (
            <Tag type="magenta">
              {intl.formatMessage({
                id: "coldStorage.corrective.status.retracted",
              })}
            </Tag>
          );
        default:
          return <Tag>{status}</Tag>;
      }
    })();

    return (
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {tag}
        {isEdited && (
          <Tag type="purple" size="sm">
            {intl.formatMessage({ id: "coldStorage.corrective.edited" })}
          </Tag>
        )}
      </div>
    );
  };

  const eventColumns = [
    {
      key: "eventType",
      header: intl.formatMessage({ id: "coldStorage.deviceHistory.eventType" }),
    },
    {
      key: "eventId",
      header: intl.formatMessage({ id: "coldStorage.deviceHistory.eventId" }),
    },
    {
      key: "summary",
      header: intl.formatMessage({ id: "coldStorage.deviceHistory.summary" }),
    },
    {
      key: "severity",
      header: intl.formatMessage({ id: "coldStorage.deviceHistory.level" }),
    },
    {
      key: "date",
      header: intl.formatMessage({ id: "coldStorage.deviceHistory.date" }),
    },
    {
      key: "time",
      header: intl.formatMessage({ id: "coldStorage.deviceHistory.time" }),
    },
    {
      key: "performedBy",
      header: intl.formatMessage({
        id: "coldStorage.deviceHistory.acknowledgedOrPerformedBy",
      }),
    },
  ];

  const eventRows = paginatedEvents.map((event) => {
    const isAlert = event.type === "alert";

    return {
      id: event.id,
      eventType: (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {isAlert ? <Warning size={16} /> : <Document size={16} />}
          <Tag type={isAlert ? "red" : "blue"} size="sm">
            {intl.formatMessage({
              id: isAlert
                ? "coldStorage.deviceHistory.alert"
                : "coldStorage.deviceHistory.correctiveAction",
            })}
          </Tag>
        </div>
      ),
      eventId: event.eventId,
      summary: event.summary,
      severity: isAlert
        ? severityTag(event.severity)
        : statusTag(event.status, event.isEdited),
      date: formatDate(event.date),
      time: formatTime(event.time),
      performedBy: event.acknowledgedBy,
    };
  });

  const deviceDisplayName =
    device?.unitName ||
    device?.name ||
    device?.freezerName ||
    intl.formatMessage(
      { id: "coldStorage.deviceHistory.deviceFallback" },
      { id: device?.id || device?.freezerId || "—" },
    );
  const deviceId = device?.id || device?.freezerId;

  return (
    <div style={{ padding: "1.5rem", background: "var(--cds-layer-01)" }}>
      <h3
        style={{ marginBottom: "1.5rem", fontSize: "1.25rem", fontWeight: 600 }}
      >
        {intl.formatMessage(
          { id: "coldStorage.deviceHistory.title" },
          { name: deviceDisplayName, id: deviceId },
        )}
      </h3>

      {/* Summary Cards */}
      <Grid condensed style={{ marginBottom: "2rem" }}>
        <Column lg={4} md={4} sm={4} style={{ paddingRight: "1rem" }}>
          <div
            style={{
              background: "rgba(0, 102, 204, 0.7)",
              color: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              {intl.formatMessage({
                id: "coldStorage.deviceHistory.totalEvents",
              })}
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 600 }}>
              {totalEvents}
            </div>
          </div>
        </Column>
        <Column
          lg={4}
          md={4}
          sm={4}
          style={{ paddingRight: "1rem", paddingLeft: "1rem" }}
        >
          <div
            style={{
              background: "rgba(219, 48, 32, 0.7)",
              color: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              {intl.formatMessage({
                id: "coldStorage.deviceHistory.totalAlerts",
              })}
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 600 }}>
              {totalAlerts}
            </div>
          </div>
        </Column>
        <Column lg={4} md={4} sm={4} style={{ paddingLeft: "1rem" }}>
          <div
            style={{
              background: "rgba(24, 161, 50, 0.7)",
              color: "white",
              padding: "1.5rem",
              borderRadius: "0.5rem",
            }}
          >
            <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              {intl.formatMessage({
                id: "coldStorage.deviceHistory.totalCorrectiveActions",
              })}
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 600 }}>
              {totalCorrectiveActions}
            </div>
          </div>
        </Column>
      </Grid>

      {/* Tabs */}
      <Tabs
        selectedIndex={activeTab}
        onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
      >
        <TabList
          aria-label={intl.formatMessage({
            id: "coldStorage.deviceHistory.tabs.ariaLabel",
          })}
          contained
        >
          <Tab renderIcon={Calendar}>
            {intl.formatMessage({
              id: "coldStorage.deviceHistory.eventHistory",
            })}
          </Tab>
          <Tab renderIcon={Time}>
            {intl.formatMessage({ id: "coldStorage.trends.title" })}
          </Tab>
        </TabList>
        <TabPanels>
          {/* Event History Tab */}
          <TabPanel>
            {loading ? (
              <Loading
                description={intl.formatMessage({
                  id: "coldStorage.deviceHistory.loading",
                })}
              />
            ) : (
              <>
                {historyError && (
                  <div
                    role="alert"
                    style={{
                      color: "var(--cds-text-error)",
                      marginBottom: "1rem",
                    }}
                  >
                    {historyError}
                  </div>
                )}
                {/* Search and Filters Section */}
                <Grid fullWidth style={{ marginBottom: "1rem" }}>
                  {/* Search - full width */}
                  <Column lg={16} md={8} sm={4}>
                    <Search
                      closeButtonLabelText={intl.formatMessage({
                        id: "carbon.search.clear",
                      })}
                      labelText={intl.formatMessage({
                        id: "coldStorage.deviceHistory.searchLabel",
                      })}
                      placeholder={intl.formatMessage({
                        id: "coldStorage.deviceHistory.searchPlaceholder",
                      })}
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      size="lg"
                    />
                  </Column>
                  {/* Filter Dropdown */}
                  <Column lg={6} md={4} sm={4} style={{ marginTop: "1rem" }}>
                    <Dropdown
                      id="event-filter"
                      titleText={intl.formatMessage({
                        id: "coldStorage.deviceHistory.eventType",
                      })}
                      label={
                        eventTypeOptions.find((opt) => opt.id === eventFilter)
                          ?.label || eventTypeOptions[0].label
                      }
                      items={eventTypeOptions}
                      itemToString={(item) => (item ? item.label : "")}
                      selectedItem={eventTypeOptions.find(
                        (opt) => opt.id === eventFilter,
                      )}
                      onChange={({ selectedItem }) => {
                        setEventFilter(selectedItem?.id || "all");
                        setCurrentPage(1);
                      }}
                      size="md"
                    />
                  </Column>
                </Grid>

                <DataTable rows={eventRows} headers={eventColumns}>
                  {({
                    rows,
                    headers,
                    getHeaderProps,
                    getRowProps,
                    getTableProps,
                    getTableContainerProps,
                  }) => (
                    <TableContainer
                      title={intl.formatMessage({
                        id: "coldStorage.deviceHistory.eventHistory",
                      })}
                      {...getTableContainerProps()}
                    >
                      <Table {...getTableProps()} size="md">
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
                              <TableCell colSpan={eventColumns.length}>
                                {intl.formatMessage({
                                  id: "coldStorage.deviceHistory.empty",
                                })}
                              </TableCell>
                            </TableRow>
                          )}
                          {rows.map((row) => (
                            <TableRow key={row.id} {...getRowProps({ row })}>
                              {row.cells.map((cell) => (
                                <TableCell
                                  key={cell.id}
                                  style={{
                                    textAlign: "left",
                                    paddingLeft: "1rem",
                                  }}
                                >
                                  {cell.value}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
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
                        page={currentPage}
                        pageSize={pageSize}
                        pageSizes={[5, 10, 20, 50]}
                        totalItems={filteredEvents.length}
                        onChange={({ page, pageSize }) => {
                          setCurrentPage(page);
                          setPageSize(pageSize);
                        }}
                      />
                    </TableContainer>
                  )}
                </DataTable>
              </>
            )}
          </TabPanel>

          {/* Temperature Trends Tab */}
          <TabPanel>
            <div>
              {/* Time Range and Export Controls */}
              <Grid style={{ marginBottom: "2rem" }}>
                <Column lg={6} md={4} sm={4}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                      {intl.formatMessage({
                        id: "coldStorage.trends.timeRange",
                      })}
                    </span>
                    <Dropdown
                      id="time-range-dropdown"
                      titleText=""
                      label={
                        timeRangeOptions.find((opt) => opt.id === timeRange)
                          ?.label || timeRangeOptions[0].label
                      }
                      items={timeRangeOptions}
                      itemToString={(item) => (item ? item.label : "")}
                      selectedItem={timeRangeOptions.find(
                        (opt) => opt.id === timeRange,
                      )}
                      onChange={({ selectedItem }) =>
                        setTimeRange(selectedItem?.id || "24h")
                      }
                      size="md"
                    />
                  </div>
                </Column>
                <Column
                  lg={10}
                  md={4}
                  sm={4}
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                  }}
                >
                  <Button
                    kind="tertiary"
                    size="md"
                    renderIcon={Download}
                    onClick={handleExportCsv}
                    disabled={!chartData.length}
                  >
                    {intl.formatMessage({ id: "coldStorage.trends.export" })}
                  </Button>
                </Column>
              </Grid>

              {/* Metrics Cards */}
              <Grid style={{ marginBottom: "2rem" }}>
                <Column lg={4} md={4} sm={4}>
                  <div
                    style={{
                      background: "var(--cds-layer-02)",
                      padding: "1.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--cds-text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {intl.formatMessage({
                        id: "coldStorage.trends.average",
                      })}
                    </div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 600 }}>
                      {temperatureStats.avg === "—"
                        ? "—"
                        : `${temperatureStats.avg}°C`}
                    </div>
                  </div>
                </Column>
                <Column lg={4} md={4} sm={4}>
                  <div
                    style={{
                      background: "var(--cds-layer-02)",
                      padding: "1.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--cds-text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {intl.formatMessage({
                        id: "coldStorage.trends.minimum",
                      })}
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 600,
                        color: "#0F62FE",
                      }}
                    >
                      {temperatureStats.min === "—"
                        ? "—"
                        : `${temperatureStats.min}°C`}
                    </div>
                  </div>
                </Column>
                <Column lg={4} md={4} sm={4}>
                  <div
                    style={{
                      background: "var(--cds-layer-02)",
                      padding: "1.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--cds-text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {intl.formatMessage({
                        id: "coldStorage.trends.maximum",
                      })}
                    </div>
                    <div
                      style={{
                        fontSize: "1.75rem",
                        fontWeight: 600,
                        color: "#DA1E28",
                      }}
                    >
                      {temperatureStats.max === "—"
                        ? "—"
                        : `${temperatureStats.max}°C`}
                    </div>
                  </div>
                </Column>
                <Column lg={4} md={4} sm={4}>
                  <div
                    style={{
                      background: "var(--cds-layer-02)",
                      padding: "1.5rem",
                      borderRadius: "0.25rem",
                      border: "1px solid var(--cds-border-subtle)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "var(--cds-text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {intl.formatMessage({
                        id: "coldStorage.trends.dataPoints",
                      })}
                    </div>
                    <div style={{ fontSize: "1.75rem", fontWeight: 600 }}>
                      {temperatureStats.count.toLocaleString()}
                    </div>
                  </div>
                </Column>
              </Grid>

              {/* Temperature Chart */}
              <div
                style={{
                  background: "var(--cds-layer-02)",
                  padding: "1.5rem",
                  borderRadius: "0.25rem",
                  border: "1px solid var(--cds-border-subtle)",
                }}
              >
                {trendsLoading ? (
                  <Loading
                    description={intl.formatMessage({
                      id: "coldStorage.trends.loading",
                    })}
                  />
                ) : trendsError ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--cds-text-error)",
                    }}
                  >
                    {trendsError}
                  </div>
                ) : formattedChartData.length === 0 ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {intl.formatMessage({ id: "coldStorage.trends.empty" })}
                  </div>
                ) : (
                  <LineChart data={formattedChartData} options={chartOptions} />
                )}
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  );
}

export default DeviceHistoryExpansion;
