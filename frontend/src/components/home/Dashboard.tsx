import React from "react";
import {
  Tile,
  ClickableTile,
  Loading,
  Grid,
  Button,
  Column,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  Pagination,
  Link,
  Tab,
  Tabs,
  TabList,
  Tag,
  Stack,
} from "@carbon/react";
import "./Dashboard.css";
import {
  Minimize,
  Maximize,
  ArrowLeft,
  ArrowRight,
  InProgress,
  TaskView,
  CheckmarkFilled,
  IncompleteCancel,
  DocumentAdd,
  CloseOutline,
  Printer,
  EmailNew,
  Time,
  WarningSquareFilled,
  Renew,
} from "@carbon/react/icons";
import { Copy } from "@carbon/icons-react";
import ProductPageHeader from "../common/ProductPageHeader";

// Map each metric type to a representative icon shown in the top-left of its card.
const TILE_ICONS: Record<string, any> = {
  ORDERS_IN_PROGRESS: InProgress,
  ORDERS_READY_FOR_VALIDATION: TaskView,
  ORDERS_COMPLETED_TODAY: CheckmarkFilled,
  ORDERS_PARTIALLY_COMPLETED_TODAY: IncompleteCancel,
  ORDERS_ENTERED_BY_USER_TODAY: DocumentAdd,
  ORDERS_REJECTED_TODAY: CloseOutline,
  UN_PRINTED_RESULTS: Printer,
  INCOMING_ORDERS: EmailNew,
  AVERAGE_TURN_AROUND_TIME: Time,
  DELAYED_TURN_AROUND: WarningSquareFilled,
};
import { useState, useEffect, useRef, useContext } from "react";
import {
  getFromOpenElisServer,
  convertAlphaNumLabNumForDisplay,
  hasRole,
  Roles,
} from "../utils/Utils";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { NotificationContext } from "../layout/Layout";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";

interface DashBoardProps {}

interface Tile {
  title: string | JSX.Element;
  subTitle?: string | JSX.Element;
  type: MetricType;
  value: number;
  id?: number;
}
type MetricType =
  | "ORDERS_IN_PROGRESS"
  | "ORDERS_READY_FOR_VALIDATION"
  | "ORDERS_COMPLETED_TODAY"
  | "ORDERS_PARTIALLY_COMPLETED_TODAY"
  | "ORDERS_ENTERED_BY_USER_TODAY"
  | "ORDERS_REJECTED_TODAY"
  | "UN_PRINTED_RESULTS"
  | "INCOMING_ORDERS"
  | "AVERAGE_TURN_AROUND_TIME"
  | "DELAYED_TURN_AROUND"
  | "ORDERS_FOR_USER";

interface UserSessionDetails {
  userSessionDetails: any;
}

interface Notification {
  notificationVisible: any;
  setNotificationVisible: any;
  addNotification: any;
}

const EMPTY_COUNTS = {
  ordersInProgress: 0,
  ordersReadyForValidation: 0,
  ordersCompletedToday: 0,
  patiallyCompletedToday: 0,
  orderEnterdByUserToday: 0,
  ordersRejectedToday: 0,
  unPritendResults: 0,
  incomigOrders: 0,
  averageTurnAroudTime: 0,
  delayedTurnAround: 0,
};

export const getDashboardLabNumberRoute = (
  metricType: MetricType,
  labNumber: string,
): string | null => {
  const accessionNumber = encodeURIComponent(labNumber);

  if (metricType === "ORDERS_IN_PROGRESS") {
    return `/Results?accessionNumber=${accessionNumber}`;
  }

  if (metricType === "ORDERS_READY_FOR_VALIDATION") {
    return `/validation?type=order&accessionNumber=${accessionNumber}`;
  }

  return null;
};

const HomeDashBoard: React.FC<DashBoardProps> = () => {
  const intl = useIntl();
  const history = useHistory();

  const [counts, setCounts] = useState(EMPTY_COUNTS);

  const [timeMetrics, setTimeMetrics] = useState({
    receptionToResult: 0,
    resultToValidation: 0,
    receptionToValidation: 0,
  });

  const [data, setData] = useState([]);
  const [testSections, setTestSections] = useState([]);
  const [selectedTestSection, setSelectedTestSection] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const componentMounted = useRef(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [selectedTile, setSelectedTile] = useState<Tile>(null);
  const [nextPage, setNextPage] = useState(null);
  const [previousPage, setPreviousPage] = useState(null);
  const [pagination, setPagination] = useState(false);
  const [currentApiPage, setCurrentApiPage] = useState(null);
  const [totalApiPages, setTotalApiPages] = useState(null);
  const [url, setUrl] = useState("");
  const { userSessionDetails } = useContext(
    UserSessionDetailsContext,
  ) as UserSessionDetails;
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as Notification;

  useEffect(() => {
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
  }, []);

  useEffect(() => {
    refreshMetrics();

    return () => {
      // This code runs when component is unmounted
      componentMounted.current = false;
    };
  }, []);

  const refreshMetrics = () => {
    setLoading(true);
    getFromOpenElisServer("/rest/home-dashboard/metrics", loadCount);
  };

  useEffect(() => {
    if (selectedTile != null) {
      setNextPage(null);
      setPreviousPage(null);
      setPagination(false);
      setLoading(true);
      if (selectedTile.type == "AVERAGE_TURN_AROUND_TIME") {
        getFromOpenElisServer(
          "/rest/home-dashboard/turn-around-time-metrics",
          loadTimeMetrics,
        );
      } else if (selectedTile.type == "ORDERS_FOR_USER") {
        getFromOpenElisServer(
          "/rest/home-dashboard/" +
            selectedTile.type +
            "?systemUserId=" +
            selectedTile.id,
          loadData,
        );
      } else {
        getFromOpenElisServer(
          "/rest/home-dashboard/" + selectedTile.type,
          loadData,
        );
      }
    }
  }, [selectedTile]);

  useEffect(() => {
    getFromOpenElisServer(
      "/rest/user-test-sections/ALL",
      (fetchedTestSections) => {
        fetchTestSections(fetchedTestSections);
      },
    );
    return () => {
      componentMounted.current = false;
    };
  }, []);

  const fetchTestSections = (res) => {
    setTestSections(res);
    hasRole(userSessionDetails, "Global Administrator")
      ? setSelectedTestSection("all")
      : setSelectedTestSection(res[0]?.id);
  };

  const loadNextResultsPage = () => {
    setLoading(true);
    getFromOpenElisServer(
      "/rest/home-dashboard/" + selectedTile.type + "?page=" + nextPage,
      loadData,
    );
  };

  const loadPreviousResultsPage = () => {
    setLoading(true);
    getFromOpenElisServer(
      "/rest/home-dashboard/" + selectedTile.type + "?page=" + previousPage,
      loadData,
    );
  };

  const loadCount = (data) => {
    if (componentMounted.current) {
      if (data && typeof data === "object") {
        setCounts({ ...EMPTY_COUNTS, ...data });
        setLastUpdated(new Date());
      } else {
        addNotification({
          kind: NotificationKinds.error,
          title: intl.formatMessage({ id: "dashboard.error.title" }),
          message: intl.formatMessage({ id: "dashboard.error.load" }),
        });
        setNotificationVisible(true);
      }
      setLoading(false);
    }
  };

  const loadData = (res) => {
    // If the response object is not null and has displayItems array with length greater than 0 then set it as data.
    if (res && res.displayItems && res.displayItems.length > 0) {
      setData(res.displayItems);
    } else {
      setData([]);
    }

    // Reset server-side paging first so a previous tile cannot leak stale controls.
    setPagination(false);
    setCurrentApiPage(null);
    setTotalApiPages(null);
    setNextPage(null);
    setPreviousPage(null);

    // Sets next and previous page numbers based on the total pages and current page number.
    if (res && res.paging) {
      const { totalPages, currentPage } = res.paging;
      if (totalPages > 1) {
        setPagination(true);
        setCurrentApiPage(currentPage);
        setTotalApiPages(totalPages);
        if (parseInt(currentPage) < parseInt(totalPages)) {
          setNextPage(parseInt(currentPage) + 1);
        } else {
          setNextPage(null);
        }

        if (parseInt(currentPage) > 1) {
          setPreviousPage(parseInt(currentPage) - 1);
        } else {
          setPreviousPage(null);
        }
      }
    }

    setLoading(false);
  };

  const loadTimeMetrics = (data) => {
    setTimeMetrics(data);
    setLoading(false);
  };

  const tileList: Array<Tile> = [
    {
      title: <FormattedMessage id="dashboard.in.progress.label" />,
      subTitle: <FormattedMessage id="dashboard.in.progress.subtitle.label" />,
      type: "ORDERS_IN_PROGRESS",
      value: counts.ordersInProgress,
    },
    {
      title: <FormattedMessage id="dashboard.validation.ready.label" />,
      subTitle: (
        <FormattedMessage id="dashboard.validation.ready.subtitle.label" />
      ),
      type: "ORDERS_READY_FOR_VALIDATION",
      value: counts.ordersReadyForValidation,
    },
    {
      title: <FormattedMessage id="dashboard.complete.orders.label" />,
      type: "ORDERS_COMPLETED_TODAY",
      value: counts.ordersCompletedToday,
    },
    {
      title: <FormattedMessage id="dashboard.partially.completed.label" />,
      subTitle: (
        <FormattedMessage id="dashboard.partially.completed.subtitle.label" />
      ),
      type: "ORDERS_PARTIALLY_COMPLETED_TODAY",
      value: counts.patiallyCompletedToday,
    },
    {
      title: <FormattedMessage id="dashboard.user.orders.label" />,
      type: "ORDERS_ENTERED_BY_USER_TODAY",
      value: counts.orderEnterdByUserToday,
    },
    {
      title: <FormattedMessage id="dashboard.rejected.orders" />,
      type: "ORDERS_REJECTED_TODAY",
      value: counts.ordersRejectedToday,
    },
    {
      title: <FormattedMessage id="dashboard.unprints.results.label" />,
      type: "UN_PRINTED_RESULTS",
      value: counts.unPritendResults,
    },
    {
      title: <FormattedMessage id="sidenav.label.incomingorder" />,
      type: "INCOMING_ORDERS",
      value: counts.incomigOrders,
    },
    {
      title: <FormattedMessage id="dashboard.avg.turn.around.label" />,
      subTitle: (
        <FormattedMessage id="dashboard.avg.turn.around.subtitle.label" />
      ),
      type: "AVERAGE_TURN_AROUND_TIME",
      value: counts.averageTurnAroudTime,
    },
    {
      title: <FormattedMessage id="dashboard.turn.around.label" />,
      subTitle: <FormattedMessage id="dashboard.turn.around.subtitle.label" />,
      type: "DELAYED_TURN_AROUND",
      value: counts.delayedTurnAround,
    },
  ];

  const averageTimeTileList: Array<Tile> = [
    {
      title: (
        <FormattedMessage id="dashboard.avg.turn.around.reception.to.validation.label" />
      ),
      type: "AVERAGE_TURN_AROUND_TIME",
      value: timeMetrics.receptionToValidation,
    },
    {
      title: (
        <FormattedMessage id="dashboard.avg.turn.around.reception.to.result.label" />
      ),
      type: "AVERAGE_TURN_AROUND_TIME",
      value: timeMetrics.receptionToResult,
    },
    {
      title: (
        <FormattedMessage id="dashboard.avg.turn.around.result.to.validation.label" />
      ),
      type: "AVERAGE_TURN_AROUND_TIME",
      value: timeMetrics.resultToValidation,
    },
  ];

  const tilesWithTabs = [
    "ORDERS_IN_PROGRESS",
    "ORDERS_READY_FOR_VALIDATION",
    "ORDERS_COMPLETED_TODAY",
    "ORDERS_REJECTED_TODAY",
    "UN_PRINTED_RESULTS",
    "DELAYED_TURN_AROUND",
    "ORDERS_FOR_USER",
    "ORDERS_PARTIALLY_COMPLETED_TODAY",
  ];

  const workItems = [
    {
      type: "INCOMING_ORDERS",
      titleId: "dashboard.task.incoming.title",
      descriptionId: "dashboard.task.incoming.description",
      value: counts.incomigOrders,
      route: "/ElectronicOrders",
      icon: EmailNew,
      roles: [Roles.RECEPTION],
    },
    {
      type: "ORDERS_IN_PROGRESS",
      titleId: "dashboard.task.results.title",
      descriptionId: "dashboard.task.results.description",
      value: counts.ordersInProgress,
      route: "/Results?scope=pending",
      icon: InProgress,
      roles: [Roles.RESULTS],
    },
    {
      type: "ORDERS_READY_FOR_VALIDATION",
      titleId: "dashboard.task.validation.title",
      descriptionId: "dashboard.task.validation.description",
      value: counts.ordersReadyForValidation,
      route: "/validation?type=routine",
      icon: TaskView,
      roles: [Roles.VALIDATION],
    },
    {
      type: "UN_PRINTED_RESULTS",
      titleId: "dashboard.task.reports.title",
      descriptionId: "dashboard.task.reports.description",
      value: counts.unPritendResults,
      route: "/RoutineReports",
      icon: Printer,
      roles: [Roles.REPORTS],
    },
  ];

  const quickActions = [
    {
      labelId: "dashboard.quick.newOrder",
      route: "/order/enter",
      icon: DocumentAdd,
      kind: "primary",
      roles: [Roles.RECEPTION],
    },
    {
      labelId: "dashboard.quick.receiveSample",
      route: "/order/collect",
      icon: InProgress,
      kind: "tertiary",
      roles: [Roles.RECEPTION],
    },
    {
      labelId: "dashboard.quick.enterResults",
      route: "/Results?scope=pending",
      icon: TaskView,
      kind: "tertiary",
      roles: [Roles.RESULTS],
    },
    {
      labelId: "dashboard.quick.validate",
      route: "/validation?type=routine",
      icon: CheckmarkFilled,
      kind: "tertiary",
      roles: [Roles.VALIDATION],
    },
  ];

  const userCanAccessAny = (roles: string[]) =>
    roles.some((role) => hasRole(userSessionDetails, role));
  const visibleWorkItems = workItems.filter((item) =>
    userCanAccessAny(item.roles),
  );
  const visibleQuickActions = quickActions.filter((action) =>
    userCanAccessAny(action.roles),
  );

  const workflowStages = [
    {
      labelId: "dashboard.flow.order",
      descriptionId: "dashboard.flow.order.description",
      route: "/order",
      roles: [Roles.RECEPTION],
    },
    {
      labelId: "dashboard.flow.sample",
      descriptionId: "dashboard.flow.sample.description",
      route: "/order/collect",
      roles: [Roles.RECEPTION],
    },
    {
      labelId: "dashboard.flow.testing",
      descriptionId: "dashboard.flow.testing.description",
      route: "/Results?scope=pending",
      roles: [Roles.RESULTS],
    },
    {
      labelId: "dashboard.flow.validation",
      descriptionId: "dashboard.flow.validation.description",
      route: "/validation?type=routine",
      roles: [Roles.VALIDATION],
    },
    {
      labelId: "dashboard.flow.report",
      descriptionId: "dashboard.flow.report.description",
      route: "/RoutineReports",
      roles: [Roles.REPORTS],
    },
  ];

  const operationalMetricTypes = new Set([
    "ORDERS_COMPLETED_TODAY",
    "ORDERS_PARTIALLY_COMPLETED_TODAY",
    "ORDERS_ENTERED_BY_USER_TODAY",
    "ORDERS_REJECTED_TODAY",
    "AVERAGE_TURN_AROUND_TIME",
    "DELAYED_TURN_AROUND",
  ]);
  const operationalTiles = tileList.filter((tile) =>
    operationalMetricTypes.has(tile.type),
  );

  const handleMinimizeClick = () => {
    if (selectedTile.type == "ORDERS_FOR_USER") {
      const tile: Tile = {
        title: <FormattedMessage id="dashboard.user.orders.label" />,
        type: "ORDERS_ENTERED_BY_USER_TODAY",
        value: counts.orderEnterdByUserToday,
      };
      setSelectedTile(tile);
    } else {
      setSelectedTile(null);
      hasRole(userSessionDetails, "Global Administrator")
        ? setSelectedTestSection("all")
        : setSelectedTestSection(testSections[0]?.id);
    }
  };

  const handleMaximizeClick = (tile) => {
    if (
      testSections?.length > 0 ||
      hasRole(userSessionDetails, "Global Administrator")
    ) {
      setSelectedTile(tile);
    } else {
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.warning,
        title: intl.formatMessage({ id: "accessDenied.title" }),
        message: intl.formatMessage({ id: "accessDenied.message" }),
      });
    }
  };

  const viewUserOrders = (row) => {
    const firstName = row.cells.find(
      (e) => e.info.header === "userFirstName",
    ).value;
    const lastName = row.cells.find(
      (e) => e.info.header === "userLastName",
    ).value;
    const value = row.cells.find(
      (e) => e.info.header === "countOfOrdersEntered",
    ).value;

    const tile: Tile = {
      title: <FormattedMessage id="dashboard.user.orders.today.label" />,
      subTitle: firstName + " " + lastName,
      type: "ORDERS_FOR_USER",
      value: value,
      id: row.id,
    };
    setSelectedTile(tile);
  };

  const handlePageChange = (pageInfo) => {
    if (page != pageInfo.page) {
      setPage(pageInfo.page);
    }

    if (pageSize != pageInfo.pageSize) {
      setPageSize(pageInfo.pageSize);
    }
  };
  const renderCell = (cell, row) => {
    if (cell.info.header === "labNumber" && cell.value) {
      const targetRoute = getDashboardLabNumberRoute(
        selectedTile.type,
        cell.value,
      );
      return (
        <TableCell key={cell.id}>
          <>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Button
                onClick={async () => {
                  if ("clipboard" in navigator) {
                    return await navigator.clipboard.writeText(cell.value);
                  } else {
                    return document.execCommand("copy", true, cell.value);
                  }
                }}
                kind="ghost"
                iconDescription={intl.formatMessage({
                  id: "instructions.copy.labnum",
                })}
                hasIconOnly
                renderIcon={Copy}
              />
              {targetRoute ? (
                <Link
                  href={targetRoute}
                  onClick={(event) => {
                    event.preventDefault();
                    history.push(targetRoute);
                  }}
                >
                  {convertAlphaNumLabNumForDisplay(cell.value)}
                </Link>
              ) : (
                <> {convertAlphaNumLabNumForDisplay(cell.value)}</>
              )}
            </div>
          </>
        </TableCell>
      );
    } else if (cell.info.header === "countOfOrdersEntered" && cell.value) {
      return (
        <TableCell key={cell.id}>
          <Button kind="ghost" size="sm" onClick={() => viewUserOrders(row)}>
            {cell.value}
          </Button>
        </TableCell>
      );
    } else {
      return <TableCell key={cell.id}>{cell.value}</TableCell>;
    }
  };

  const orderHeaders = [
    {
      key: "priority",
      header: <FormattedMessage id="eorder.priority" />,
    },
    {
      key: "orderDate",
      header: <FormattedMessage id="sample.label.orderdate" />,
    },
    {
      key: "patientId",
      header: <FormattedMessage id="patient.id" />,
    },
    {
      key: "labNumber",
      header: <FormattedMessage id="eorder.labNumber" />,
    },
    {
      key: "testName",
      header: <FormattedMessage id="eorder.test.name" />,
    },
  ];

  const userHeaders = [
    {
      key: "userFirstName",
      header: intl.formatMessage({ id: "dashboard.user.first.name" }),
    },
    {
      key: "userLastName",
      header: intl.formatMessage({ id: "dashboard.user.last.name" }),
    },
    {
      key: "countOfOrdersEntered",
      header: intl.formatMessage({ id: "dashboard.user.orders.count" }),
    },
  ];

  return (
    <section className="home-dashboard" aria-labelledby="dashboard-title">
      {loading && (
        <Loading
          description={intl.formatMessage({ id: "dashboard.loading" })}
        />
      )}
      {notificationVisible === true ? <AlertDialog /> : ""}
      {selectedTile == null ? (
        <>
          <ProductPageHeader
            titleId="dashboard-title"
            title={<FormattedMessage id="dashboard.command.title" />}
            subtitle={
              <>
                <FormattedMessage id="dashboard.command.subtitle" />
                {lastUpdated && (
                  <span className="dashboard-last-updated">
                    {" · "}
                    <FormattedMessage
                      id="dashboard.last.updated"
                      values={{ time: intl.formatTime(lastUpdated) }}
                    />
                  </span>
                )}
              </>
            }
            actions={
              <Button
                kind="tertiary"
                size="md"
                renderIcon={Renew}
                onClick={refreshMetrics}
                disabled={loading}
              >
                <FormattedMessage id="dashboard.refresh" />
              </Button>
            }
          />

          <section
            className="dashboard-shift-strip"
            aria-label={intl.formatMessage({ id: "dashboard.shift.summary" })}
          >
            <div className="dashboard-shift-item">
              <span>
                <FormattedMessage id="dashboard.shift.pending" />
              </span>
              <strong>
                {visibleWorkItems.reduce(
                  (total, item) => total + Number(item.value || 0),
                  0,
                )}
              </strong>
            </div>
            <div className="dashboard-shift-item is-success">
              <span>
                <FormattedMessage id="dashboard.shift.completed" />
              </span>
              <strong>{counts.ordersCompletedToday}</strong>
            </div>
            <div className="dashboard-shift-item is-warning">
              <span>
                <FormattedMessage id="dashboard.shift.delayed" />
              </span>
              <strong>{counts.delayedTurnAround}</strong>
            </div>
            <div className="dashboard-shift-item is-neutral">
              <span>
                <FormattedMessage id="dashboard.shift.incoming" />
              </span>
              <strong>{counts.incomigOrders}</strong>
            </div>
          </section>

          <Grid fullWidth className="dashboard-command-grid">
            <Column lg={10} md={5} sm={4}>
              <Tile className="dashboard-command-panel dashboard-work-panel">
                <div className="dashboard-section-heading">
                  <div>
                    <h2>
                      <FormattedMessage id="dashboard.task.title" />
                    </h2>
                    <p>
                      <FormattedMessage id="dashboard.task.subtitle" />
                    </p>
                  </div>
                  <Tag type="blue">
                    <FormattedMessage
                      id="dashboard.task.total"
                      values={{
                        count: visibleWorkItems.reduce(
                          (total, item) => total + Number(item.value || 0),
                          0,
                        ),
                      }}
                    />
                  </Tag>
                </div>

                <Stack gap={3} className="dashboard-task-list">
                  {visibleWorkItems.length === 0 && (
                    <p className="dashboard-empty-actions">
                      <FormattedMessage id="dashboard.task.empty" />
                    </p>
                  )}
                  {visibleWorkItems.map((item) => {
                    const TaskIcon = item.icon;
                    return (
                      <ClickableTile
                        key={item.type}
                        className={`dashboard-task-item ${Number(item.value || 0) > 0 ? "has-work" : "is-clear"}`}
                        role="button"
                        onClick={() => history.push(item.route)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            history.push(item.route);
                          }
                        }}
                      >
                        <Grid condensed fullWidth>
                          <Column lg={1} md={1} sm={1}>
                            <span className="dashboard-task-icon">
                              <TaskIcon size={22} aria-hidden="true" />
                            </span>
                          </Column>
                          <Column lg={7} md={3} sm={2}>
                            <strong>
                              <FormattedMessage id={item.titleId} />
                            </strong>
                            <span className="dashboard-task-description">
                              <FormattedMessage id={item.descriptionId} />
                            </span>
                          </Column>
                          <Column lg={2} md={1} sm={1}>
                            <span className="dashboard-task-action">
                              <span className="dashboard-task-state">
                                <span className="dashboard-task-count">
                                  {item.value}
                                </span>
                                <small>
                                  <FormattedMessage
                                    id={
                                      Number(item.value || 0) > 0
                                        ? "dashboard.task.pending"
                                        : "dashboard.task.clear"
                                    }
                                  />
                                </small>
                              </span>
                              <ArrowRight size={18} aria-hidden="true" />
                            </span>
                          </Column>
                        </Grid>
                      </ClickableTile>
                    );
                  })}
                </Stack>
              </Tile>
            </Column>

            <Column lg={6} md={3} sm={4}>
              <Tile className="dashboard-command-panel dashboard-quick-panel">
                <h2>
                  <FormattedMessage id="dashboard.quick.title" />
                </h2>
                <p>
                  <FormattedMessage id="dashboard.quick.subtitle" />
                </p>
                <Stack gap={4} className="dashboard-quick-actions">
                  {visibleQuickActions.length === 0 && (
                    <p className="dashboard-empty-actions">
                      <FormattedMessage id="dashboard.quick.empty" />
                    </p>
                  )}
                  {visibleQuickActions.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <Button
                        key={action.route}
                        kind={action.kind as any}
                        renderIcon={ActionIcon}
                        onClick={() => history.push(action.route)}
                      >
                        <FormattedMessage id={action.labelId} />
                      </Button>
                    );
                  })}
                </Stack>
              </Tile>
            </Column>
          </Grid>

          <section
            className="dashboard-flow-section"
            aria-labelledby="dashboard-flow-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <h2 id="dashboard-flow-title">
                  <FormattedMessage id="dashboard.flow.title" />
                </h2>
                <p>
                  <FormattedMessage id="dashboard.flow.subtitle" />
                </p>
              </div>
            </div>
            <Grid fullWidth condensed className="dashboard-flow-grid">
              {workflowStages.map((stage, index) => (
                <Column
                  key={stage.labelId}
                  lg={index === workflowStages.length - 1 ? 4 : 3}
                  md={4}
                  sm={4}
                >
                  {userCanAccessAny(stage.roles) ? (
                    <ClickableTile
                      className="dashboard-flow-stage dashboard-flow-stage--actionable"
                      role="button"
                      onClick={() => history.push(stage.route)}
                    >
                      <span className="dashboard-flow-number">{index + 1}</span>
                      <h3>
                        <FormattedMessage id={stage.labelId} />
                      </h3>
                      <p>
                        <FormattedMessage id={stage.descriptionId} />
                      </p>
                      <ArrowRight
                        className="dashboard-flow-open-icon"
                        size={18}
                        aria-hidden="true"
                      />
                    </ClickableTile>
                  ) : (
                    <Tile className="dashboard-flow-stage">
                      <span className="dashboard-flow-number">{index + 1}</span>
                      <h3>
                        <FormattedMessage id={stage.labelId} />
                      </h3>
                      <p>
                        <FormattedMessage id={stage.descriptionId} />
                      </p>
                    </Tile>
                  )}
                </Column>
              ))}
            </Grid>
          </section>

          <section
            className="dashboard-operations-section"
            aria-labelledby="dashboard-operations-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <h2 id="dashboard-operations-title">
                  <FormattedMessage id="dashboard.operations.title" />
                </h2>
                <p>
                  <FormattedMessage id="dashboard.operations.subtitle" />
                </p>
              </div>
            </div>
            <Grid fullWidth condensed>
              {operationalTiles.map((tile) => {
                const TileIcon = TILE_ICONS[tile.type];
                return (
                  <Column key={tile.type} lg={4} md={4} sm={4}>
                    <ClickableTile
                      className="dashboard-tile dashboard-metric-tile"
                      role="button"
                      onClick={() => handleMaximizeClick(tile)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleMaximizeClick(tile);
                        }
                      }}
                    >
                      {TileIcon && (
                        <div className="tile-leading-icon">
                          <TileIcon size={24} aria-hidden="true" />
                        </div>
                      )}
                      <h3 className="dashboard-tile__title">{tile.title}</h3>
                      <p className="dashboard-tile__subtitle">
                        {tile.subTitle ?? " "}
                      </p>
                      <p className="dashboard-tile__value">{tile.value}</p>
                      <div className="dashboard-tile__action">
                        <FormattedMessage id="lot.details.view" />
                        <Maximize size={16} aria-hidden="true" />
                      </div>
                    </ClickableTile>
                  </Column>
                );
              })}
            </Grid>
          </section>
        </>
      ) : (
        <div className="dashboard-view">
          <Tile className="dashboard-tile">
            <Grid>
              <Column lg={16} md={8} sm={4}>
                <h2 className="dashboard-tile__title-view">
                  {selectedTile.title}
                </h2>
                <p className="dashboard-tile__subtitle-view">
                  {selectedTile.subTitle ?? " "}
                </p>
                <h1 className="dashboard-tile__value-view">
                  {selectedTile.value}
                </h1>
                <Button
                  id="minimizeIcon"
                  className="tile-icon"
                  kind="ghost"
                  size="md"
                  hasIconOnly
                  renderIcon={Minimize}
                  iconDescription={intl.formatMessage({
                    id: "dashboard.back.to.overview",
                  })}
                  onClick={handleMinimizeClick}
                />
              </Column>
            </Grid>
            <div className="gridBoundary">
              {selectedTile.type == "AVERAGE_TURN_AROUND_TIME" ? (
                <>
                  <div className="home-dashboard-container">
                    {averageTimeTileList.map((tile, index) => (
                      <Tile key={index} className="dashboard-tile">
                        <h5 className="dashboard-tile__title">{tile.title}</h5>
                        <p className="dashboard-tile__subtitle">
                          {tile.subTitle}
                        </p>
                        <h2 className="dashboard-tile__value">{tile.value}</h2>
                      </Tile>
                    ))}
                  </div>
                </>
              ) : (
                <Grid>
                  <Column lg={16} md={8} sm={4}>
                    {pagination && (
                      <Grid>
                        <Column lg={14} />
                        <Column
                          lg={2}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "10px",
                            width: "110%",
                          }}
                        >
                          <Link>
                            {currentApiPage} / {totalApiPages}
                          </Link>
                          <div style={{ display: "flex", gap: "10px" }}>
                            <Button
                              hasIconOnly
                              id="loadpreviousresults"
                              onClick={loadPreviousResultsPage}
                              disabled={previousPage != null ? false : true}
                              renderIcon={ArrowLeft}
                              iconDescription={intl.formatMessage({
                                id: "pagination.backward",
                              })}
                            ></Button>
                            <Button
                              hasIconOnly
                              id="loadnextresults"
                              onClick={loadNextResultsPage}
                              disabled={nextPage != null ? false : true}
                              renderIcon={ArrowRight}
                              iconDescription={intl.formatMessage({
                                id: "pagination.forward",
                              })}
                            ></Button>
                          </div>
                        </Column>
                      </Grid>
                    )}
                    {tilesWithTabs.includes(selectedTile.type) && (
                      <Grid>
                        <Column lg={16} md={8} sm={4}>
                          <Tabs>
                            {hasRole(
                              userSessionDetails,
                              "Global Administrator",
                            ) ? (
                              <TabList
                                style={{ width: "100%" }}
                                aria-label={intl.formatMessage({
                                  id: "dashboard.sections.label",
                                })}
                                contained
                              >
                                <Tab
                                  onClick={() => setSelectedTestSection("all")}
                                >
                                  <FormattedMessage id="all.label" />
                                </Tab>

                                {testSections?.map((item, id) => {
                                  return (
                                    <Tab
                                      key={id}
                                      onClick={() =>
                                        setSelectedTestSection(item.id)
                                      }
                                    >
                                      {item.value}
                                    </Tab>
                                  );
                                })}
                              </TabList>
                            ) : (
                              <TabList
                                style={{ width: "100%" }}
                                aria-label={intl.formatMessage({
                                  id: "dashboard.sections.label",
                                })}
                                contained
                              >
                                {testSections?.map((item, id) => {
                                  return (
                                    <Tab
                                      key={id}
                                      onClick={() =>
                                        setSelectedTestSection(item.id)
                                      }
                                    >
                                      {item.value}
                                    </Tab>
                                  );
                                })}
                              </TabList>
                            )}
                          </Tabs>
                        </Column>
                      </Grid>
                    )}
                    <DataTable
                      rows={data
                        .filter((item) =>
                          tilesWithTabs.includes(selectedTile.type) &&
                          selectedTestSection != "all"
                            ? item.testSection === selectedTestSection
                            : true,
                        )
                        .slice((page - 1) * pageSize, page * pageSize)}
                      headers={
                        selectedTile.type != "ORDERS_ENTERED_BY_USER_TODAY"
                          ? orderHeaders
                          : userHeaders
                      }
                      isSortable
                    >
                      {({ rows, headers, getHeaderProps, getTableProps }) => (
                        <TableContainer title="" description="">
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
                              <>
                                {rows.map((row) => (
                                  <TableRow key={row.id}>
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
                      pageSizes={[10, 20, 30, 50, 100]}
                      totalItems={
                        data.filter((item) =>
                          tilesWithTabs.includes(selectedTile.type) &&
                          selectedTestSection != "all"
                            ? item.testSection === selectedTestSection
                            : true,
                        ).length
                      }
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
                  </Column>
                </Grid>
              )}
            </div>
          </Tile>
        </div>
      )}
    </section>
  );
};
export default HomeDashBoard;
