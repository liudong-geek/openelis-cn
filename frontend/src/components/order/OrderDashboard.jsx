import React, {
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from "react";
import { useHistory, useLocation } from "react-router-dom";
import { useIntl, FormattedMessage } from "react-intl";
import {
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Tag,
  Dropdown,
  DatePicker,
  DatePickerInput,
  Pagination,
  ProgressBar,
  Stack,
} from "@carbon/react";
import { Add, Renew, WarningAltFilled } from "@carbon/icons-react";
import PageBreadCrumb from "../common/PageBreadCrumb";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { getFromOpenElisServer } from "../utils/Utils";
import BarcodeScannerBar from "./BarcodeScannerBar";
import { useOrderContext } from "./OrderContext";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ProductPageHeader from "../common/ProductPageHeader";
import { fromList } from "../common/listWorkspace";
import { normalizeIntakeFilter, resolveIntakeStage } from "./orderIntakeStatus";
import "./order-workflow.scss";
import "./order-dashboard.scss";
import {
  getDatePickerFormat,
  getDatePickerPlaceholderMessage,
  toLocalIsoDate,
} from "./orderDateUtils";

/**
 * OrderDashboard - Default landing page for "Add Order" menu (DSH-1 to DSH-9)
 *
 * Features:
 * - DSH-1: Shows current user's in-progress orders by default
 * - DSH-2: Search by patient name, lab number, national ID, referring lab number
 * - DSH-3/4: "Include external sources" toggle for EMR/referral orders
 * - DSH-5/6: "+ New Order" button and barcode scan bar
 * - DSH-7/8: Filter dropdowns (Status, date range, Priority)
 * - DSH-9: Pagination (25/50/100 items, default 100)
 */

const STATUS_OPTIONS = [
  { id: "all", messageId: "order.status.all" },
  { id: "in_progress", messageId: "order.status.in.progress" },
  {
    id: "registration_pending",
    messageId: "order.intake.registration.pending",
  },
  { id: "collection_pending", messageId: "order.intake.collection.pending" },
  { id: "label_pending", messageId: "order.intake.label.pending" },
  { id: "qa_pending", messageId: "order.intake.qa.pending" },
  { id: "checklist_complete", messageId: "order.dashboard.checklistComplete" },
];

const PRIORITY_OPTIONS = [
  { id: "all", messageId: "order.priority.all" },
  { id: "stat", messageId: "order.priority.stat" },
  { id: "asap", messageId: "order.priority.asap" },
  { id: "timed", messageId: "order.priority.timed" },
  { id: "routine", messageId: "order.priority.routine" },
];

const PAGE_SIZES = [25, 50, 100];

const OrderDashboardContent = () => {
  const session = useContext(UserSessionDetailsContext);
  const sessionKey = JSON.stringify([
    session?.userSessionDetails,
    session?.sessionPhase,
    Boolean(session?.errorLoadingSessionDetails),
  ]);
  const sessionAvailable =
    session?.userSessionDetails?.authenticated !== false &&
    !session?.errorLoadingSessionDetails &&
    (!session?.sessionPhase || session.sessionPhase === "authenticated");
  const currentSession = useRef(sessionKey);
  currentSession.current = sessionKey;
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const initial = useRef(location.state?.listState || {}).current;
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const dateLocale = configurationProperties.DEFAULT_DATE_LOCALE || "en-US";
  const { loadOrder, resetOrder } = useOrderContext();
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    label: intl.formatMessage({ id: option.messageId }),
  }));
  const priorityOptions = PRIORITY_OPTIONS.map((option) => ({
    ...option,
    label: intl.formatMessage({ id: option.messageId }),
  }));

  // State
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initial.searchQuery || "");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(
    initial.searchQuery || "",
  );
  const [statusFilter, setStatusFilter] = useState(
    normalizeIntakeFilter(initial.statusFilter),
  );
  const [priorityFilter, setPriorityFilter] = useState(
    initial.priorityFilter || "all",
  );
  const [dateRange, setDateRange] = useState(
    initial.dateRange || { start: null, end: null },
  );
  const [page, setPage] = useState(initial.page || 1);
  const [pageSize, setPageSize] = useState(initial.pageSize || 100);
  const [totalItems, setTotalItems] = useState(0);
  const requestSequence = useRef(0);
  const openFromList = (target) => {
    const [pathname, search = ""] = target.split("?");
    const listState = {
      searchQuery,
      statusFilter,
      priorityFilter,
      dateRange,
      page,
      pageSize,
    };
    history.replace({ ...location, state: { ...location.state, listState } });
    history.push({
      pathname,
      search: search ? `?${search}` : "",
      state: fromList("/order", listState),
    });
  };

  const breadcrumbs = [
    { label: "home.label", link: "/" },
    { label: "sidenav.label.order.workflow", link: "/order" },
  ];

  // Fetch orders
  const fetchOrders = useCallback(() => {
    const request = ++requestSequence.current;
    setOrders([]);
    setTotalItems(0);
    setIsLoading(true);
    setLoadError(false);
    const dispatchedSession = sessionKey;
    if (!sessionAvailable) {
      setIsLoading(false);
      setLoadError(true);
      return;
    }

    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });

    if (debouncedSearchQuery) params.append("search", debouncedSearchQuery);
    if (statusFilter === "in_progress") params.append("status", statusFilter);
    else if (statusFilter !== "all")
      params.append("specimenIntakeStatus", statusFilter);
    if (priorityFilter !== "all") params.append("priority", priorityFilter);
    // Format dates as YYYY-MM-DD for backend
    if (dateRange.start) {
      const d = new Date(dateRange.start);
      params.append("startDate", toLocalIsoDate(d));
    }
    if (dateRange.end) {
      const d = new Date(dateRange.end);
      params.append("endDate", toLocalIsoDate(d));
    }

    getFromOpenElisServer(
      `/rest/order/dashboard?${params}`,
      (response, requestError) => {
        if (
          request !== requestSequence.current ||
          dispatchedSession !== currentSession.current
        )
          return;
        if (
          !requestError &&
          Array.isArray(response?.orders) &&
          Number.isSafeInteger(response.totalCount) &&
          response.totalCount >= response.orders.length
        ) {
          const lastPage = Math.max(
            1,
            Math.ceil(response.totalCount / pageSize),
          );
          if (page > lastPage) {
            // A remembered page can disappear after filtering or another user's work.
            // Stay in loading state while retrieving an existing page, not a false empty list.
            setPage(lastPage);
            return;
          }
          if (response.totalCount > 0 && response.orders.length === 0) {
            setOrders([]);
            setTotalItems(0);
            setLoadError(true);
            setIsLoading(false);
            return;
          }
          setOrders(response.orders);
          setTotalItems(response.totalCount);
        } else {
          setOrders([]);
          setTotalItems(0);
          setLoadError(requestError?.errorKey || "order.dashboard.load.error");
        }
        setIsLoading(false);
      },
    );
  }, [
    sessionKey,
    sessionAvailable,
    page,
    pageSize,
    debouncedSearchQuery,
    statusFilter,
    priorityFilter,
    dateRange,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (searchQuery.trim() !== debouncedSearchQuery) {
        setPage(1);
        setDebouncedSearchQuery(searchQuery.trim());
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery, debouncedSearchQuery]);

  useEffect(() => {
    fetchOrders();
    return () => {
      requestSequence.current += 1;
    };
  }, [fetchOrders]);

  // Handlers
  const handleNewOrder = () => {
    resetOrder();
    openFromList("/order/enter");
  };

  const handleContinueOrder = async (order) => {
    const nextStep = resolveIntakeStage(order).nextStep;
    if (!nextStep) return;
    // Load the order into context, then navigate to the appropriate step
    try {
      await loadOrder(order.labNumber, false); // false = editable
      openFromList(`/order/${nextStep}`);
    } catch (error) {
      console.error("handleContinueOrder: Error loading order", error);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "order.load.error",
          defaultMessage: "Failed to load order",
        }),
      });
      setNotificationVisible(true);
    }
  };

  const handleViewOrder = async (order) => {
    try {
      await loadOrder(order.labNumber, true);
      openFromList("/order/enter");
    } catch (error) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "order.load.error" }),
      });
      setNotificationVisible(true);
    }
  };

  const handleAcceptExternal = async (order) => {
    if (resolveIntakeStage(order).completedSteps === null) return;
    try {
      await loadOrder(order.labNumber, false);
      openFromList("/order/enter");
    } catch (error) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "order.accept.error",
          defaultMessage: "Failed to accept order",
        }),
      });
      setNotificationVisible(true);
    }
  };

  const handleFixIssue = async (order) => {
    if (resolveIntakeStage(order).completedSteps === null) return;
    // Load the order into context, then navigate to the step that needs fixing
    try {
      await loadOrder(order.labNumber, false); // false = editable
      const returnedStep = order.returnedToStep || "enter";
      openFromList(`/order/${returnedStep}`);
    } catch (error) {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "order.load.error",
          defaultMessage: "Failed to load order",
        }),
      });
      setNotificationVisible(true);
    }
  };

  const handleBarcodeOrderLoaded = (order) => {
    openFromList(
      `/order/enter?labNumber=${encodeURIComponent(order.labNumber)}`,
    );
  };

  // Table headers
  const headers = [
    {
      key: "labNumber",
      header: intl.formatMessage({
        id: "order.labNumber",
        defaultMessage: "Lab Number",
      }),
    },
    {
      key: "patient",
      header: intl.formatMessage({
        id: "patient.label",
        defaultMessage: "Patient/Subject",
      }),
    },
    {
      key: "facility",
      header: intl.formatMessage({
        id: "order.facility",
        defaultMessage: "Facility",
      }),
    },
    {
      key: "priority",
      header: intl.formatMessage({
        id: "order.priority",
        defaultMessage: "Priority",
      }),
    },
    {
      key: "progress",
      header: intl.formatMessage({
        id: "order.progress",
        defaultMessage: "Progress",
      }),
    },
    {
      key: "lastUpdated",
      header: intl.formatMessage({
        id: "order.lastUpdated",
        defaultMessage: "Last Updated",
      }),
    },
    {
      key: "actions",
      header: intl.formatMessage({
        id: "label.action",
        defaultMessage: "Actions",
      }),
    },
  ];

  // Transform orders to table rows
  const rows = orders.map((order) => {
    const stage = resolveIntakeStage(order);
    const readOnly = stage.completedSteps === null;
    return {
      id: order.id || order.labNumber,
      labNumber: (
        <div className="order-lab-number">
          {order.labNumber}
          {order.isExternal && (
            <Tag type="purple" size="sm" className="external-badge">
              <FormattedMessage id="order.external" defaultMessage="External" />
            </Tag>
          )}
        </div>
      ),
      patient: order.patientName || order.subjectName || "---",
      facility: order.facilityName || "---",
      priority: (() => {
        const p = order.priority?.toLowerCase();
        if (p === "stat") {
          return (
            <Tag type="red" size="sm">
              {intl.formatMessage({ id: "order.priority.stat" })}
            </Tag>
          );
        } else if (p === "asap") {
          return (
            <Tag type="orange" size="sm">
              {intl.formatMessage({ id: "order.priority.asap" })}
            </Tag>
          );
        } else if (p === "timed") {
          return (
            <Tag type="blue" size="sm">
              {intl.formatMessage({ id: "order.priority.timed" })}
            </Tag>
          );
        } else {
          return (
            <Tag type="gray" size="sm">
              {intl.formatMessage({ id: "order.priority.routine" })}
            </Tag>
          );
        }
      })(),
      progress: (() => {
        return (
          <div className="order-progress">
            <span className="progress-stage">
              <FormattedMessage id={stage.messageId} />
            </span>
            {stage.completedSteps !== null && (
              <>
                <ProgressBar
                  label={intl.formatMessage({ id: "order.progress" })}
                  value={stage.completedSteps * 25}
                  size="small"
                  status={stage.completedSteps === 4 ? "finished" : "active"}
                  hideLabel
                />
                <span className="progress-label">{stage.completedSteps}/4</span>
              </>
            )}
            {order.labelEvidenceScope && (
              <span className="progress-label">
                <FormattedMessage id="order.dashboard.labelEvidence" />
              </span>
            )}
            {order.specimenDecisions && (
              <span
                className="progress-label"
                data-testid={`decisions-${order.id}`}
              >
                {intl.formatMessage(
                  { id: "order.dashboard.decisions" },
                  order.specimenDecisions,
                )}
                {" · "}
                <FormattedMessage id="order.dashboard.acceptanceUnverified" />
              </span>
            )}
          </div>
        );
      })(),
      lastUpdated: order.lastUpdated || "---",
      actions: (
        <div className="order-actions">
          {(!order.isExternal || readOnly) && (
            <>
              <Button
                kind="ghost"
                size="sm"
                onClick={() => handleViewOrder(order)}
              >
                <FormattedMessage id="label.button.view" />
              </Button>
              {!readOnly && (
                <>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() =>
                      openFromList(
                        `/ModifyOrder?accessionNumber=${encodeURIComponent(order.labNumber)}`,
                      )
                    }
                  >
                    <FormattedMessage id="workspace.order.edit" />
                  </Button>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() =>
                      openFromList(
                        `/PrintBarcode?labNumber=${encodeURIComponent(order.labNumber)}`,
                      )
                    }
                  >
                    <FormattedMessage id="workspace.order.reprint" />
                  </Button>
                </>
              )}
            </>
          )}
          {readOnly ? null : order.returnedFromQA ? (
            <Button
              kind="danger--tertiary"
              size="sm"
              onClick={() => handleFixIssue(order)}
            >
              <FormattedMessage
                id="order.fixIssue"
                defaultMessage="Fix Issue"
              />
            </Button>
          ) : order.isExternal ? (
            <Button
              kind="primary"
              size="sm"
              onClick={() => handleAcceptExternal(order)}
            >
              <FormattedMessage id="order.accept" defaultMessage="Accept" />
            </Button>
          ) : stage.nextStep ? (
            <Button
              kind="ghost"
              size="sm"
              onClick={() => handleContinueOrder(order)}
            >
              <FormattedMessage id="order.continue" defaultMessage="Continue" />
            </Button>
          ) : null}
        </div>
      ),
      className: order.returnedFromQA
        ? "returned-from-qa"
        : order.isExternal
          ? "external-order"
          : "",
    };
  });

  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      {notificationVisible && <AlertDialog />}

      <ProductPageHeader
        titleId="order-dashboard-title"
        title={<FormattedMessage id="order.dashboard.title" />}
        subtitle={<FormattedMessage id="order.dashboard.subtitle" />}
        actions={
          <Button
            kind="primary"
            renderIcon={Add}
            onClick={handleNewOrder}
            className="new-order-btn"
          >
            <FormattedMessage id="order.new" />
          </Button>
        }
      />

      <div className="order-dashboard">
        <Stack gap={5}>
          {/* Barcode Scanner Bar (DSH-5) */}
          <BarcodeScannerBar
            onOrderLoaded={handleBarcodeOrderLoaded}
            className="dashboard-barcode-section"
          />

          {/* Filters Row */}
          <div className="dashboard-filters">
            <Dropdown
              id="status-filter"
              titleText={intl.formatMessage({ id: "order.filter.status" })}
              label={intl.formatMessage({
                id: "order.filter.status",
                defaultMessage: "Status",
              })}
              items={statusOptions}
              itemToString={(item) => item?.label || ""}
              selectedItem={statusOptions.find((s) => s.id === statusFilter)}
              onChange={({ selectedItem }) => {
                setPage(1);
                setStatusFilter(selectedItem?.id || "all");
              }}
            />
            <Dropdown
              id="priority-filter"
              titleText={intl.formatMessage({ id: "order.filter.priority" })}
              label={intl.formatMessage({
                id: "order.filter.priority",
                defaultMessage: "Priority",
              })}
              items={priorityOptions}
              itemToString={(item) => item?.label || ""}
              selectedItem={priorityOptions.find(
                (p) => p.id === priorityFilter,
              )}
              onChange={({ selectedItem }) => {
                setPage(1);
                setPriorityFilter(selectedItem?.id || "all");
              }}
            />
            <DatePicker
              datePickerType="range"
              dateFormat={getDatePickerFormat(dateLocale)}
              value={[dateRange.start, dateRange.end].filter(Boolean)}
              onChange={(dates) => {
                setPage(1);
                setDateRange({ start: dates[0], end: dates[1] });
              }}
            >
              <DatePickerInput
                id="date-start"
                placeholder={intl.formatMessage(
                  getDatePickerPlaceholderMessage(dateLocale),
                )}
                labelText={intl.formatMessage({
                  id: "order.filter.dateFrom",
                })}
                size="md"
              />
              <DatePickerInput
                id="date-end"
                placeholder={intl.formatMessage(
                  getDatePickerPlaceholderMessage(dateLocale),
                )}
                labelText={intl.formatMessage({ id: "order.filter.dateTo" })}
                size="md"
              />
            </DatePicker>
          </div>

          {/* Orders Table */}
          <DataTable rows={rows} headers={headers}>
            {({
              rows,
              headers,
              getTableProps,
              getHeaderProps,
              getRowProps,
              getToolbarProps,
            }) => (
              <TableContainer className="order-dashboard-table">
                <TableToolbar {...getToolbarProps()}>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      persistent
                      value={searchQuery}
                      placeholder={intl.formatMessage({
                        id: "order.search.placeholder",
                        defaultMessage:
                          "Search by patient, lab number, or ID...",
                      })}
                      onChange={(e) => {
                        setSearchQuery(e?.target?.value || "");
                      }}
                    />
                  </TableToolbarContent>
                </TableToolbar>
                {isLoading || loadError || rows.length === 0 ? (
                  <div
                    className={`order-dashboard-state ${loadError ? "is-error" : ""}`}
                    role={loadError ? "alert" : "status"}
                  >
                    {loadError && <WarningAltFilled size={24} />}
                    <h3>
                      <FormattedMessage
                        id={
                          isLoading
                            ? "order.dashboard.loading.title"
                            : loadError
                              ? "order.dashboard.load.error.title"
                              : "order.dashboard.empty.title"
                        }
                      />
                    </h3>
                    <p>
                      <FormattedMessage
                        id={
                          isLoading
                            ? "order.dashboard.loading"
                            : loadError
                              ? typeof loadError === "string"
                                ? loadError
                                : "order.dashboard.load.error"
                              : "order.dashboard.empty"
                        }
                      />
                    </p>
                    {!isLoading && (
                      <div className="order-dashboard-state__actions">
                        {loadError ? (
                          <Button
                            kind="tertiary"
                            size="md"
                            renderIcon={Renew}
                            onClick={fetchOrders}
                          >
                            <FormattedMessage id="order.dashboard.retry" />
                          </Button>
                        ) : (
                          <Button
                            kind="primary"
                            size="md"
                            renderIcon={Add}
                            onClick={handleNewOrder}
                          >
                            <FormattedMessage id="order.new" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
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
                        <TableRow
                          key={row.id}
                          {...getRowProps({ row })}
                          className={
                            orders.find(
                              (o) => o.id === row.id || o.labNumber === row.id,
                            )?.returnedFromQA
                              ? "returned-from-qa"
                              : ""
                          }
                        >
                          {row.cells.map((cell) => (
                            <TableCell key={cell.id}>{cell.value}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TableContainer>
            )}
          </DataTable>

          {/* Pagination (DSH-9) */}
          {totalItems > 0 && (
            <Pagination
              totalItems={totalItems}
              pageSize={pageSize}
              pageSizes={PAGE_SIZES}
              page={page}
              onChange={({ page: newPage, pageSize: newPageSize }) => {
                setPage(newPage);
                setPageSize(newPageSize);
              }}
              forwardText={intl.formatMessage({ id: "pagination.forward" })}
              backwardText={intl.formatMessage({
                id: "pagination.backward",
              })}
              itemsPerPageText={intl.formatMessage({
                id: "pagination.items-per-page",
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
              pageNumberText={intl.formatMessage({
                id: "pagination.page-number",
              })}
              pageRangeText={(_current, total) =>
                intl.formatMessage({ id: "pagination.page-range" }, { total })
              }
              pageText={(currentPage, pagesUnknown) =>
                intl.formatMessage(
                  { id: "pagination.page" },
                  { page: pagesUnknown ? "" : currentPage },
                )
              }
            />
          )}
        </Stack>
      </div>
    </>
  );
};

// OrderDashboard uses the shared OrderProvider from App.js
// Do NOT wrap in OrderProvider here - it would create a separate context
const OrderDashboard = () => <OrderDashboardContent />;

export default OrderDashboard;
