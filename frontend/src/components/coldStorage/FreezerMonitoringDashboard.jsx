import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
} from "react";
import {
  Grid,
  Column,
  InlineNotification,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Tag,
  Button,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  Search,
  Dropdown,
  Section,
  Heading,
  Form,
  Tile,
  Pagination,
} from "@carbon/react";
import { View } from "@carbon/icons-react";
import "./FreezerMonitoringDashboard.scss";
import CorrectiveActions from "./CorrectiveActions";
import HistoricalTrends from "./HistoricalTrends";
import Reports from "./Reports";
import Settings from "./Settings";
import PageBreadCrumb from "../common/PageBreadCrumb";
import { injectIntl } from "react-intl";
import {
  fetchFreezerStatus,
  fetchOpenAlerts,
  acknowledgeAlert,
  resolveAlert,
} from "./api";
import AlertDetailModal from "./AlertDetailModal";
import DeviceHistoryExpansion from "./DeviceHistoryExpansion";
import { toDate, formatDuration } from "./shared/timeUtils";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";

const getColumns = (intl) => [
  { key: "id", header: intl.formatMessage({ id: "coldStorage.unit.id" }) },
  {
    key: "status",
    header: intl.formatMessage({ id: "coldStorage.status" }),
  },
  {
    key: "unitName",
    header: intl.formatMessage({ id: "coldStorage.unit.name" }),
  },
  {
    key: "deviceType",
    header: intl.formatMessage({ id: "coldStorage.device.type" }),
  },
  {
    key: "location",
    header: intl.formatMessage({ id: "coldStorage.location" }),
  },
  {
    key: "currentTemp",
    header: intl.formatMessage({ id: "coldStorage.temperature.current" }),
  },
  {
    key: "targetTemp",
    header: intl.formatMessage({ id: "coldStorage.targetTemperature" }),
  },
  {
    key: "protocol",
    header: intl.formatMessage({ id: "coldStorage.device.protocol" }),
  },
  {
    key: "lastReading",
    header: intl.formatMessage({ id: "coldStorage.reading.last" }),
  },
];

function statusTag(status, intl) {
  switch (status) {
    case "NORMAL":
      return (
        <Tag type="green">
          {intl.formatMessage({ id: "coldStorage.status.normal" })}
        </Tag>
      );
    case "WARNING":
      return (
        <Tag type="warm-gray" className="oe-coldStorage-tag--warning">
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
      return <Tag>{status}</Tag>;
  }
}

function temperatureColor(value, target) {
  if (value == null || target == null) {
    return "oe-coldStorage-temp--ok";
  }
  if (value > target) {
    return "oe-coldStorage-temp--high";
  }
  return "oe-coldStorage-temp--ok";
}

const breadcrumbs = [
  { label: "home.label", link: "/" },
  {
    label: "coldstorage.label.dashboard",
    link: "/FreezerMonitoring",
  },
];

const STATUS_OPTIONS = ["ALL", "NORMAL", "WARNING", "CRITICAL"];
const ALL_DEVICE_TYPES = "__ALL_DEVICE_TYPES__";
const DEFAULT_DEVICE_TYPE = "COLD_STORAGE_UNIT";

const getStatusLabel = (status, intl) => {
  const messageIds = {
    ALL: "coldStorage.filter.allStatuses",
    NORMAL: "coldStorage.status.normal",
    WARNING: "coldStorage.status.warning",
    CRITICAL: "coldStorage.status.critical",
  };
  return messageIds[status]
    ? intl.formatMessage({ id: messageIds[status] })
    : status;
};

const getDeviceTypeLabel = (deviceType, intl) => {
  const messageIds = {
    [ALL_DEVICE_TYPES]: "coldStorage.filter.allDeviceTypes",
    COLD_STORAGE_UNIT: "coldStorage.device.type.coldStorageUnit",
    Freezer: "coldStorage.device.type.freezer",
    Refrigerator: "coldStorage.device.type.refrigerator",
    "Ultra-low Freezer": "coldStorage.device.type.ultraLowFreezer",
  };
  return messageIds[deviceType]
    ? intl.formatMessage({ id: messageIds[deviceType] })
    : deviceType;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString() : "—";
};

const normalizeUnit = (unit, intl) => ({
  id: unit.freezerId?.toString() ?? unit.freezerName ?? "UNKNOWN",
  status: unit.status ?? "NORMAL",
  unitName:
    unit.freezerName ??
    unit.freezerId ??
    intl.formatMessage({ id: "coldStorage.device.unnamed" }),
  deviceType: unit.deviceType ?? DEFAULT_DEVICE_TYPE,
  location:
    unit.locationName ??
    intl.formatMessage({ id: "coldStorage.location.unknown" }),
  currentTemp: toNumber(unit.temperatureCelsius),
  targetTemp: toNumber(
    unit.targetTemperatureCelsius ?? unit.temperatureCelsius,
  ),
  protocol: unit.protocol ?? intl.formatMessage({ id: "not.specified" }),
  lastReading: unit.recordedAt,
});

const normalizeAlert = (alert, intl) => {
  let contextData = {};
  try {
    contextData = alert.contextData ? JSON.parse(alert.contextData) : {};
  } catch (e) {
    console.warn("Failed to parse alert contextData:", alert.contextData);
  }

  const currentTemp = toNumber(contextData.temperature);

  let durationSeconds = null;
  const startTime = toDate(alert.startTime);
  if (startTime) {
    durationSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
  }

  return {
    id: alert.id,
    severity: alert.severity ?? "WARNING",
    status: alert.status ?? "OPEN",
    unitName:
      alert.freezer?.name ??
      intl.formatMessage(
        { id: "coldStorage.device.fallbackName" },
        { id: alert.alertEntityId },
      ),
    location:
      alert.freezer?.code ??
      intl.formatMessage({ id: "coldStorage.location.unknown" }),
    currentTemp,
    durationSeconds,
    startedAt: alert.startTime,
  };
};

const formatTemperatureDisplay = (value) =>
  value == null ? "—" : `${value.toFixed(1)}°C`;

function FreezerMonitoringDashboard({ intl }) {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
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
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deviceFilter, setDeviceFilter] = useState(ALL_DEVICE_TYPES);
  const [searchTerm, setSearchTerm] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 720);
  const [storageUnits, setStorageUnits] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionInFlight, setActionInFlight] = useState(null);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [showAlertDetail, setShowAlertDetail] = useState(false);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const [preselectedFreezerId, setPreselectedFreezerId] = useState(null);
  const [expandedRowIds, setExpandedRowIds] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [alertsCurrentPage, setAlertsCurrentPage] = useState(1);
  const [alertsPageSize, setAlertsPageSize] = useState(5);

  const handleRowExpand = useCallback((rowId) => {
    const rowIdStr = String(rowId || "");
    setExpandedRowIds((prevExpanded) => ({
      ...prevExpanded,
      [rowIdStr]: !prevExpanded[rowIdStr],
    }));
  }, []);

  const deviceOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        storageUnits.map((unit) => unit.deviceType || DEFAULT_DEVICE_TYPE),
      ),
    );
    return [ALL_DEVICE_TYPES, ...unique];
  }, [storageUnits]);

  const filteredUnits = useMemo(() => {
    return storageUnits.filter((unit) => {
      if (statusFilter !== "ALL" && unit.status !== statusFilter) {
        return false;
      }
      if (
        deviceFilter !== ALL_DEVICE_TYPES &&
        unit.deviceType !== deviceFilter
      ) {
        return false;
      }
      if (!searchTerm) return true;
      const lc = searchTerm.toLowerCase();
      return (
        unit.id.toLowerCase().includes(lc) ||
        unit.unitName.toLowerCase().includes(lc)
      );
    });
  }, [statusFilter, deviceFilter, searchTerm, storageUnits]);

  const paginatedUnits = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredUnits.slice(startIndex, endIndex);
  }, [filteredUnits, currentPage, pageSize]);

  const paginatedAlerts = useMemo(() => {
    const startIndex = (alertsCurrentPage - 1) * alertsPageSize;
    const endIndex = startIndex + alertsPageSize;
    return activeAlerts.slice(startIndex, endIndex);
  }, [activeAlerts, alertsCurrentPage, alertsPageSize]);

  const totalUnits = storageUnits.length;
  const normalUnits = storageUnits.filter((u) => u.status === "NORMAL").length;
  const warningUnits = storageUnits.filter(
    (u) => u.status === "WARNING",
  ).length;
  const criticalUnits = storageUnits.filter(
    (u) => u.status === "CRITICAL",
  ).length;

  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [statusPayload, alertsPayload] = await Promise.all([
        fetchFreezerStatus(),
        fetchOpenAlerts(),
      ]);

      const unitsArray = Array.isArray(statusPayload)
        ? statusPayload
        : statusPayload?.items ||
          statusPayload?.data ||
          statusPayload?.results ||
          [];

      const alertsArray = Array.isArray(alertsPayload)
        ? alertsPayload
        : alertsPayload?.content ||
          alertsPayload?.alerts ||
          alertsPayload?.items ||
          [];

      setStorageUnits(unitsArray.map((unit) => normalizeUnit(unit, intl)));
      setActiveAlerts(alertsArray.map((alert) => normalizeAlert(alert, intl)));
      setLastUpdated(new Date().toISOString());
    } catch (error) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "coldStorage.error.dashboard.title" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.error.dashboard.load",
        }),
      });
    } finally {
      setDashboardLoading(false);
    }
  }, [intl, notify]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, deviceFilter, searchTerm]);

  const handleAlertAction = useCallback(
    async (alertId, action) => {
      setActionInFlight(alertId);
      try {
        if (action === "acknowledge") {
          await acknowledgeAlert(
            alertId,
            1,
            intl.formatMessage({ id: "coldStorage.alert.audit.acknowledged" }),
          );
        } else {
          await resolveAlert(
            alertId,
            1,
            intl.formatMessage({ id: "coldStorage.alert.audit.resolved" }),
          );
        }
        await loadDashboardData();
        notify({
          kind: NotificationKinds.success,
          title: intl.formatMessage({ id: "notification.success" }),
          subtitle: intl.formatMessage({
            id:
              action === "acknowledge"
                ? "coldStorage.alert.acknowledgeSuccess"
                : "coldStorage.alert.resolveSuccess",
          }),
        });
      } catch (error) {
        notify({
          kind: NotificationKinds.error,
          title: intl.formatMessage({ id: "notification.error" }),
          subtitle: intl.formatMessage({
            id:
              action === "acknowledge"
                ? "coldStorage.alert.acknowledgeFailed"
                : "coldStorage.alert.resolveFailed",
          }),
        });
      } finally {
        setActionInFlight(null);
      }
    },
    [intl, loadDashboardData, notify],
  );

  const handleAcknowledgeAlert = useCallback(
    (alertId) => handleAlertAction(alertId, "acknowledge"),
    [handleAlertAction],
  );

  const handleResolveAlert = useCallback(
    (alertId) => handleAlertAction(alertId, "resolve"),
    [handleAlertAction],
  );

  const lastUpdateLabel = formatDateTime(lastUpdated);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 720);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleAlertRowClick = useCallback((alertId) => {
    setSelectedAlertId(alertId);
    setShowAlertDetail(true);
  }, []);

  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <Grid fullWidth={true}>
        <Column lg={16} md={8} sm={4}>
          {notificationVisible === true ? <AlertDialog /> : ""}
          <Section>
            <Section>
              <Heading>
                {intl.formatMessage({
                  id: "coldstorage.label.dashboard",
                })}
              </Heading>
            </Section>
            <p className="oe-coldStorage-pageSubtitle">
              {intl.formatMessage({ id: "coldStorage.dashboard.subtitle" })}
            </p>
          </Section>
          <Section>
            <div className="oe-coldStorage-statusRow">
              <InlineNotification
                statusIconDescription={intl.formatMessage({
                  id: dashboardLoading
                    ? "carbon.notification.info"
                    : "carbon.notification.success",
                })}
                title={intl.formatMessage(
                  { id: "coldStorage.dashboard.systemStatus" },
                  {
                    status: intl.formatMessage({
                      id: dashboardLoading
                        ? "coldStorage.dashboard.refreshing"
                        : "coldStorage.dashboard.online",
                    }),
                  },
                )}
                subtitle={intl.formatMessage(
                  { id: "coldStorage.dashboard.lastUpdate" },
                  { time: lastUpdateLabel },
                )}
                kind={dashboardLoading ? "info" : "success"}
                lowContrast
                hideCloseButton
                className="oe-coldStorage-systemStatus"
              />
              <Button
                kind="ghost"
                size="sm"
                disabled={dashboardLoading}
                onClick={loadDashboardData}
              >
                {intl.formatMessage({
                  id: dashboardLoading
                    ? "coldStorage.dashboard.refreshing"
                    : "coldStorage.dashboard.refresh",
                })}
              </Button>
            </div>
          </Section>
        </Column>
      </Grid>
      <div className="orderLegendBody">
        <Grid fullWidth={true}>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <Tabs
                selectedIndex={selectedTabIndex}
                onChange={({ selectedIndex }) => {
                  setSelectedTabIndex(selectedIndex);
                  // Clear preselected freezer when switching away from Historical Trends tab
                  if (selectedIndex !== 2) {
                    setPreselectedFreezerId(null);
                  }
                }}
              >
                <TabList
                  aria-label={intl.formatMessage({
                    id: "coldStorage.dashboard.tabs.ariaLabel",
                  })}
                  contained
                >
                  <Tab>
                    {intl.formatMessage({ id: "coldStorage.tab.dashboard" })}
                  </Tab>
                  <Tab>
                    {intl.formatMessage({
                      id: "coldStorage.tab.correctiveActions",
                    })}
                  </Tab>
                  <Tab>
                    {intl.formatMessage({
                      id: "coldStorage.tab.historicalTrends",
                    })}
                  </Tab>
                  <Tab>
                    {intl.formatMessage({ id: "coldStorage.tab.reports" })}
                  </Tab>
                  <Tab>
                    {intl.formatMessage({ id: "coldStorage.tab.settings" })}
                  </Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>
                    <Grid fullWidth className="oe-coldStorage-grid">
                      {criticalUnits > 0 && (
                        <Column lg={16} md={8} sm={4}>
                          <InlineNotification
                            statusIconDescription={intl.formatMessage({
                              id: "carbon.notification.error",
                            })}
                            kind="error"
                            title={intl.formatMessage({
                              id: "coldStorage.dashboard.criticalAlert",
                            })}
                            subtitle={intl.formatMessage(
                              {
                                id: "coldStorage.dashboard.criticalAlertCount",
                              },
                              { count: criticalUnits },
                            )}
                            hideCloseButton
                            lowContrast={false}
                            size="sm"
                          />
                        </Column>
                      )}

                      <Column lg={16} md={8} sm={4}>
                        <Grid condensed className="oe-coldStorage-kpis">
                          <Column lg={4} md={4} sm={4}>
                            <div className="oe-coldStorage-kpiCard">
                              <p className="oe-coldStorage-kpiLabel">
                                {intl.formatMessage({
                                  id: "coldStorage.dashboard.totalUnits",
                                })}
                              </p>
                              <p className="oe-coldStorage-kpiValue">
                                {totalUnits}
                              </p>
                            </div>
                          </Column>
                          <Column lg={4} md={4} sm={4}>
                            <div className="oe-coldStorage-kpiCard">
                              <p className="oe-coldStorage-kpiLabel">
                                {intl.formatMessage({
                                  id: "coldStorage.dashboard.normalUnits",
                                })}
                              </p>
                              <p className="oe-coldStorage-kpiValue">
                                {normalUnits}
                              </p>
                            </div>
                          </Column>
                          <Column lg={4} md={4} sm={4}>
                            <div className="oe-coldStorage-kpiCard">
                              <p className="oe-coldStorage-kpiLabel">
                                {intl.formatMessage({
                                  id: "coldStorage.dashboard.warningUnits",
                                })}
                              </p>
                              <p className="oe-coldStorage-kpiValue">
                                {warningUnits}
                              </p>
                            </div>
                          </Column>
                          <Column lg={4} md={4} sm={4}>
                            <div className="oe-coldStorage-kpiCard">
                              <p className="oe-coldStorage-kpiLabel">
                                {intl.formatMessage({
                                  id: "coldStorage.dashboard.criticalUnits",
                                })}
                              </p>
                              <p className="oe-coldStorage-kpiValue">
                                {criticalUnits}
                              </p>
                            </div>
                          </Column>
                        </Grid>
                      </Column>

                      <Column lg={16} md={8} sm={4}>
                        <Form
                          onSubmit={(event) => event.preventDefault()}
                          style={{
                            display: "flex",
                            flexDirection: isMobile ? "column" : "row",
                            gap: isMobile ? "1rem" : "1.5rem",
                            justifyContent: isMobile
                              ? "stretch"
                              : "space-between",
                            alignItems: isMobile ? "stretch" : "center",
                            flexWrap: "wrap",
                            marginBottom: "1rem",
                          }}
                        >
                          <Search
                            size="lg"
                            closeButtonLabelText={intl.formatMessage({
                              id: "carbon.search.clear",
                            })}
                            labelText={intl.formatMessage({
                              id: "coldStorage.dashboard.search",
                            })}
                            placeholder={intl.formatMessage({
                              id: "coldStorage.dashboard.search",
                            })}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            value={searchTerm}
                            style={{
                              flex: isMobile ? "1 1 100%" : "1 1 40%",
                              minWidth: isMobile ? "100%" : "15rem",
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              flexDirection: isMobile ? "column" : "row",
                              gap: isMobile ? "0.75rem" : "0.5rem",
                              width: isMobile ? "100%" : "auto",
                              alignItems: "stretch",
                              justifyContent: isMobile ? "stretch" : "center",
                            }}
                          >
                            <Dropdown
                              id="status-filter"
                              label={intl.formatMessage({
                                id: "coldStorage.filter.allStatuses",
                              })}
                              titleText={intl.formatMessage({
                                id: "coldStorage.status",
                              })}
                              items={STATUS_OPTIONS}
                              selectedItem={statusFilter}
                              itemToString={(item) =>
                                item ? getStatusLabel(item, intl) : ""
                              }
                              onChange={({ selectedItem }) =>
                                setStatusFilter(selectedItem)
                              }
                            />
                            <Dropdown
                              id="device-filter"
                              label={intl.formatMessage({
                                id: "coldStorage.filter.allDeviceTypes",
                              })}
                              titleText={intl.formatMessage({
                                id: "coldStorage.device.type",
                              })}
                              items={deviceOptions}
                              selectedItem={deviceFilter}
                              itemToString={(item) =>
                                item ? getDeviceTypeLabel(item, intl) : ""
                              }
                              onChange={({ selectedItem }) =>
                                setDeviceFilter(selectedItem)
                              }
                            />
                          </div>
                        </Form>

                        <DataTable
                          rows={paginatedUnits.map((row) => ({
                            id: row.id,
                            ...row,
                            isExpanded: !!expandedRowIds[String(row.id || "")],
                          }))}
                          headers={getColumns(intl)}
                          size="lg"
                          expandableRows
                        >
                          {({
                            rows,
                            headers,
                            getHeaderProps,
                            getTableProps,
                            getRowProps,
                          }) => (
                            <TableContainer
                              title={intl.formatMessage({
                                id: "coldStorage.dashboard.storageUnits",
                              })}
                            >
                              <Table {...getTableProps()}>
                                <TableHead>
                                  <TableRow>
                                    <TableExpandHeader
                                      aria-label={intl.formatMessage({
                                        id: "coldStorage.table.expand",
                                      })}
                                    />
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
                                        colSpan={getColumns(intl).length + 2}
                                        className="empty-state"
                                      >
                                        {dashboardLoading
                                          ? intl.formatMessage({
                                              id: "coldStorage.dashboard.loadingUnits",
                                            })
                                          : intl.formatMessage({
                                              id: "coldStorage.dashboard.noUnits",
                                            })}
                                      </TableCell>
                                    </TableRow>
                                  )}
                                  {rows.map((row) => {
                                    const unit =
                                      storageUnits.find(
                                        (u) => u.id === row.id,
                                      ) || row;
                                    return (
                                      <React.Fragment key={row.id}>
                                        <TableExpandRow
                                          isExpanded={row.isExpanded}
                                          ariaLabel={
                                            row.isExpanded
                                              ? intl.formatMessage({
                                                  id: "coldStorage.table.collapse",
                                                })
                                              : intl.formatMessage({
                                                  id: "coldStorage.table.expand",
                                                })
                                          }
                                          {...getRowProps({
                                            row,
                                            onClick: () => {
                                              handleRowExpand(row.id);
                                            },
                                          })}
                                        >
                                          {row.cells.map((cell) => {
                                            if (cell.info.header === "status") {
                                              return (
                                                <TableCell key={cell.id}>
                                                  {statusTag(cell.value, intl)}
                                                </TableCell>
                                              );
                                            }
                                            if (
                                              cell.info.header === "deviceType"
                                            ) {
                                              return (
                                                <TableCell key={cell.id}>
                                                  {getDeviceTypeLabel(
                                                    cell.value,
                                                    intl,
                                                  )}
                                                </TableCell>
                                              );
                                            }
                                            if (
                                              cell.info.header === "currentTemp"
                                            ) {
                                              return (
                                                <TableCell key={cell.id}>
                                                  <span
                                                    className={temperatureColor(
                                                      unit.currentTemp,
                                                      unit.targetTemp,
                                                    )}
                                                  >
                                                    {formatTemperatureDisplay(
                                                      unit.currentTemp,
                                                    )}
                                                  </span>
                                                </TableCell>
                                              );
                                            }
                                            if (
                                              cell.info.header === "targetTemp"
                                            ) {
                                              return (
                                                <TableCell key={cell.id}>
                                                  {formatTemperatureDisplay(
                                                    unit.targetTemp,
                                                  )}
                                                </TableCell>
                                              );
                                            }
                                            if (
                                              cell.info.header === "lastReading"
                                            ) {
                                              return (
                                                <TableCell key={cell.id}>
                                                  {formatDateTime(
                                                    unit.lastReading,
                                                  )}
                                                </TableCell>
                                              );
                                            }
                                            return (
                                              <TableCell key={cell.id}>
                                                {cell.value}
                                              </TableCell>
                                            );
                                          })}
                                        </TableExpandRow>
                                        {row.isExpanded && (
                                          <TableExpandedRow
                                            colSpan={headers.length + 1}
                                          >
                                            <DeviceHistoryExpansion
                                              key={unit.id || unit.freezerId}
                                              device={unit}
                                            />
                                          </TableExpandedRow>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          )}
                        </DataTable>

                        {filteredUnits.length > 0 && (
                          <Pagination
                            backwardText={intl.formatMessage({
                              id: "pagination.previous",
                            })}
                            forwardText={intl.formatMessage({
                              id: "pagination.next",
                            })}
                            itemsPerPageText={intl.formatMessage({
                              id: "pagination.itemsPerPage",
                            })}
                            page={currentPage}
                            pageSize={pageSize}
                            pageSizes={[5, 10, 20, 30, 50]}
                            totalItems={filteredUnits.length}
                            onChange={({ page, pageSize: newPageSize }) => {
                              setCurrentPage(page);
                              setPageSize(newPageSize);
                            }}
                          />
                        )}
                      </Column>

                      <Column lg={16} md={8} sm={4}>
                        <Section style={{ marginTop: "2rem" }}>
                          <Heading style={{ marginBottom: "1rem" }}>
                            {intl.formatMessage(
                              { id: "coldStorage.dashboard.activeAlerts" },
                              { count: activeAlerts.length },
                            )}
                          </Heading>

                          {activeAlerts.length > 0 ? (
                            <>
                              <DataTable
                                rows={paginatedAlerts.map((alert) => ({
                                  id: alert.id.toString(),
                                  severity: (
                                    <Tag
                                      type={
                                        alert.severity === "CRITICAL"
                                          ? "red"
                                          : "warm-gray"
                                      }
                                    >
                                      {getStatusLabel(alert.severity, intl)}
                                    </Tag>
                                  ),
                                  device: alert.unitName,
                                  location: alert.location,
                                  temperature: formatTemperatureDisplay(
                                    alert.currentTemp,
                                  ),
                                  duration: formatDuration(
                                    alert.durationSeconds,
                                  ),
                                  startedAt: formatDateTime(alert.startedAt),
                                  status: alert.status,
                                  _alert: alert,
                                }))}
                                headers={[
                                  {
                                    key: "severity",
                                    header: intl.formatMessage({
                                      id: "coldStorage.alert.severity",
                                    }),
                                  },
                                  {
                                    key: "device",
                                    header: intl.formatMessage({
                                      id: "coldStorage.device",
                                    }),
                                  },
                                  {
                                    key: "location",
                                    header: intl.formatMessage({
                                      id: "coldStorage.location",
                                    }),
                                  },
                                  {
                                    key: "temperature",
                                    header: intl.formatMessage({
                                      id: "coldStorage.temperature",
                                    }),
                                  },
                                  {
                                    key: "duration",
                                    header: intl.formatMessage({
                                      id: "coldStorage.alert.duration",
                                    }),
                                  },
                                  {
                                    key: "startedAt",
                                    header: intl.formatMessage({
                                      id: "coldStorage.alert.startedAt",
                                    }),
                                  },
                                ]}
                                size="sm"
                              >
                                {({
                                  rows,
                                  headers,
                                  getHeaderProps,
                                  getRowProps,
                                  getTableProps,
                                  getTableContainerProps,
                                }) => (
                                  <TableContainer
                                    {...getTableContainerProps()}
                                    style={{ maxHeight: "400px" }}
                                  >
                                    <Table
                                      {...getTableProps()}
                                      size="sm"
                                      useZebraStyles
                                    >
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
                                          <TableHeader>
                                            {intl.formatMessage({
                                              id: "coldStorage.actions",
                                            })}
                                          </TableHeader>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {rows.map((row) => {
                                          const alert = activeAlerts.find(
                                            (a) => a.id.toString() === row.id,
                                          );
                                          return (
                                            <TableRow
                                              key={row.id}
                                              {...getRowProps({ row })}
                                              style={{ cursor: "pointer" }}
                                              onClick={() =>
                                                handleAlertRowClick(alert.id)
                                              }
                                            >
                                              {row.cells.map((cell) => (
                                                <TableCell key={cell.id}>
                                                  {cell.value}
                                                </TableCell>
                                              ))}
                                              <TableCell>
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    gap: "0.5rem",
                                                    alignItems: "center",
                                                  }}
                                                >
                                                  <Button
                                                    kind="ghost"
                                                    size="sm"
                                                    renderIcon={View}
                                                    iconDescription={intl.formatMessage(
                                                      {
                                                        id: "coldStorage.alert.viewDetails",
                                                      },
                                                    )}
                                                    hasIconOnly
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleAlertRowClick(
                                                        alert.id,
                                                      );
                                                    }}
                                                  />
                                                  {alert.status === "OPEN" && (
                                                    <Button
                                                      kind="ghost"
                                                      size="sm"
                                                      disabled={
                                                        actionInFlight ===
                                                        alert.id
                                                      }
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAcknowledgeAlert(
                                                          alert.id,
                                                        );
                                                      }}
                                                    >
                                                      {intl.formatMessage({
                                                        id: "coldStorage.alert.acknowledge",
                                                      })}
                                                    </Button>
                                                  )}
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                )}
                              </DataTable>

                              <Pagination
                                backwardText={intl.formatMessage({
                                  id: "pagination.previous",
                                })}
                                forwardText={intl.formatMessage({
                                  id: "pagination.next",
                                })}
                                itemsPerPageText={intl.formatMessage({
                                  id: "pagination.itemsPerPage",
                                })}
                                page={alertsCurrentPage}
                                pageSize={alertsPageSize}
                                pageSizes={[5, 10, 20, 30, 50]}
                                totalItems={activeAlerts.length}
                                onChange={({ page, pageSize: newPageSize }) => {
                                  setAlertsCurrentPage(page);
                                  setAlertsPageSize(newPageSize);
                                }}
                              />
                            </>
                          ) : (
                            <Tile
                              style={{ padding: "1rem", textAlign: "center" }}
                            >
                              <p style={{ margin: 0 }}>
                                {intl.formatMessage({
                                  id: "coldStorage.dashboard.noActiveAlerts",
                                })}
                              </p>
                            </Tile>
                          )}
                        </Section>
                      </Column>
                    </Grid>
                    <Grid fullWidth>
                      <Column lg={16} md={8} sm={4}>
                        <p className="hist-footer">
                          {intl.formatMessage({
                            id: "coldStorage.dashboard.complianceNotice",
                          })}
                        </p>
                      </Column>
                    </Grid>
                  </TabPanel>

                  <TabPanel>
                    <CorrectiveActions />
                  </TabPanel>
                  <TabPanel>
                    <HistoricalTrends
                      devices={storageUnits}
                      initialSelectedFreezerId={preselectedFreezerId}
                      onFreezerSelected={(freezerId) =>
                        setPreselectedFreezerId(freezerId)
                      }
                    />
                  </TabPanel>
                  <TabPanel>
                    <Reports devices={storageUnits} />
                  </TabPanel>
                  <TabPanel>
                    <Settings />
                  </TabPanel>
                </TabPanels>
              </Tabs>
            </Section>
          </Column>
        </Grid>
      </div>

      <AlertDetailModal
        alertId={selectedAlertId}
        open={showAlertDetail}
        onClose={() => {
          setShowAlertDetail(false);
          setSelectedAlertId(null);
        }}
      />
    </>
  );
}

export default injectIntl(FreezerMonitoringDashboard);
