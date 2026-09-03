import React, {
  useState,
  useMemo,
  useEffect,
  useContext,
  useCallback,
} from "react";
import {
  Button,
  Dropdown,
  DataTable,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Pagination,
  Modal,
  Form,
  Stack,
  TextInput,
  TextArea,
  InlineNotification,
  Link,
  Toggle,
} from "@carbon/react";
import { Add, WarningAlt } from "@carbon/icons-react";
import {
  fetchCorrectiveActions,
  createCorrectiveAction,
  updateCorrectiveAction,
  completeCorrectiveAction,
  retractCorrectiveAction,
  fetchDevices,
  fetchUsers,
  fetchLocations,
  createDevice,
  createRoom,
} from "./api";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { useIntl } from "react-intl";
import AddDeviceModal from "./shared/AddDeviceModal";

const getColumns = (intl) => [
  {
    key: "id",
    header: intl.formatMessage({ id: "coldStorage.corrective.id" }),
  },
  {
    key: "status",
    header: intl.formatMessage({ id: "coldStorage.status" }),
  },
  {
    key: "device",
    header: intl.formatMessage({ id: "coldStorage.device" }),
  },
  {
    key: "summary",
    header: intl.formatMessage({ id: "coldStorage.corrective.summary" }),
  },
  {
    key: "performedBy",
    header: intl.formatMessage({ id: "coldStorage.corrective.performedBy" }),
  },
  {
    key: "created",
    header: intl.formatMessage({ id: "coldStorage.corrective.createdAt" }),
  },
  {
    key: "updated",
    header: intl.formatMessage({ id: "coldStorage.corrective.updatedAt" }),
  },
];

const getActionTypes = (intl) => [
  {
    id: "TEMPERATURE_ADJUSTMENT",
    label: intl.formatMessage({
      id: "coldStorage.corrective.type.temperatureAdjustment",
    }),
  },
  {
    id: "EQUIPMENT_REPAIR",
    label: intl.formatMessage({
      id: "coldStorage.corrective.type.equipmentRepair",
    }),
  },
  {
    id: "SAMPLE_RELOCATION",
    label: intl.formatMessage({
      id: "coldStorage.corrective.type.sampleRelocation",
    }),
  },
  {
    id: "CALIBRATION",
    label: intl.formatMessage({
      id: "coldStorage.corrective.type.calibration",
    }),
  },
  {
    id: "ITEM_REORDER",
    label: intl.formatMessage({
      id: "coldStorage.corrective.type.itemReorder",
    }),
  },
  {
    id: "MAINTENANCE",
    label: intl.formatMessage({
      id: "coldStorage.corrective.type.maintenance",
    }),
  },
  {
    id: "OTHER",
    label: intl.formatMessage({ id: "analyzer.form.type.other" }),
  },
];

const getTimeFilters = (intl) => [
  {
    id: "last24",
    label: intl.formatMessage({ id: "coldStorage.time.last24Hours" }),
    hours: 24,
  },
  {
    id: "last7",
    label: intl.formatMessage({ id: "coldStorage.time.last7Days" }),
    hours: 24 * 7,
  },
  {
    id: "last14",
    label: intl.formatMessage({ id: "coldStorage.time.last14Days" }),
    hours: 24 * 14,
  },
  {
    id: "current_month",
    label: intl.formatMessage({ id: "coldStorage.time.currentMonth" }),
    hours: null,
  },
  {
    id: "all",
    label: intl.formatMessage({ id: "coldStorage.filter.all" }),
    hours: null,
  },
];

const getStatusOptions = (intl) => [
  {
    id: "PENDING",
    label: intl.formatMessage({ id: "coldStorage.corrective.status.pending" }),
  },
  {
    id: "IN_PROGRESS",
    label: intl.formatMessage({
      id: "coldStorage.corrective.status.inProgress",
    }),
  },
  {
    id: "COMPLETED",
    label: intl.formatMessage({
      id: "coldStorage.corrective.status.completed",
    }),
  },
  {
    id: "CANCELLED",
    label: intl.formatMessage({
      id: "coldStorage.corrective.status.cancelled",
    }),
  },
];

function statusTag(status, intl, isEdited = false) {
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
}

export default function CorrectiveActions() {
  const intl = useIntl();
  const actionTypes = useMemo(() => getActionTypes(intl), [intl]);
  const timeFilters = useMemo(() => getTimeFilters(intl), [intl]);
  const statusOptions = useMemo(() => getStatusOptions(intl), [intl]);
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { userSessionDetails } = useContext(UserSessionDetailsContext);

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

  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState(() => getTimeFilters(intl)[4]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isRetractModalOpen, setIsRetractModalOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    device: null,
    performedBy: "",
    actionType: null,
    summary: "",
  });

  const [editStatus, setEditStatus] = useState(null);
  const [completionNotes, setCompletionNotes] = useState("");
  const [retractionReason, setRetractionReason] = useState("");

  const [roomFormData, setRoomFormData] = useState({
    name: "",
    description: "",
    active: true,
  });

  const getCurrentUserDisplayName = useCallback(() => {
    if (userSessionDetails?.firstName && userSessionDetails?.lastName) {
      return `${userSessionDetails.firstName} ${userSessionDetails.lastName}`;
    }
    return userSessionDetails?.loginName || "";
  }, [userSessionDetails]);

  const getDateRange = useCallback((filter) => {
    const end = new Date();
    let start = new Date();

    if (filter.id === "current_month") {
      start = new Date(end.getFullYear(), end.getMonth(), 1);
    } else if (filter.hours) {
      start = new Date(end.getTime() - filter.hours * 60 * 60 * 1000);
    } else {
      return { startDate: null, endDate: null };
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, []);

  useEffect(() => {
    loadCorrectiveActions();
  }, [timeFilter]);

  useEffect(() => {
    loadDevices();
    loadUsers();
    loadLocations();
  }, []);

  useEffect(() => {
    const currentUserDisplayName = getCurrentUserDisplayName();
    if (currentUserDisplayName) {
      setForm((prev) => {
        if (!prev.performedBy || prev.performedBy === "") {
          return { ...prev, performedBy: currentUserDisplayName };
        }
        return prev;
      });
    }
  }, [userSessionDetails, getCurrentUserDisplayName]);

  const loadCorrectiveActions = async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange(timeFilter);
      const filters = {};

      if (dateRange.startDate && dateRange.endDate) {
        filters.startDate = dateRange.startDate;
        filters.endDate = dateRange.endDate;
      }

      const data = await fetchCorrectiveActions(filters);
      const items = normalizeArray(data);
      const normalizedActions = items.map(normalizeAction);
      setActions(normalizedActions);
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({ id: "coldStorage.error.loadActions" }),
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const data = await fetchDevices();
      const items = Array.isArray(data) ? data : normalizeArray(data);
      const mappedDevices = items
        .filter((item) => {
          const device = item.device || item;
          return device.active !== false;
        })
        .map((item) => {
          const device = item.device || item;
          const freezerId = (item.id || device.id)?.toString() || "";
          const name =
            device.name ||
            device.unitName ||
            item.name ||
            item.unitName ||
            device.displayName ||
            intl.formatMessage({ id: "coldStorage.device.unnamed" });

          return {
            id: freezerId,
            displayName: name.trim(),
          };
        });
      setDevices(mappedDevices);
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({ id: "coldStorage.error.loadDevices" }),
      });
    }
  };

  const loadUsers = async () => {
    try {
      const data = await fetchUsers();
      const items = normalizeArray(data);
      setUsers(items || []);
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({ id: "coldStorage.error.loadUsers" }),
      });
    }
  };

  const loadLocations = async () => {
    try {
      const data = await fetchLocations();
      setLocations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load locations:", err);
    }
  };

  const normalizeAction = (action) => {
    const parseDate = (dateValue) => {
      if (!dateValue) return new Date();

      if (dateValue instanceof Date) return dateValue;
      if (typeof dateValue === "number") {
        return new Date(dateValue * 1000);
      }

      if (typeof dateValue === "string") {
        const parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      return new Date();
    };

    const createdDate = parseDate(action.createdAt);
    const updatedDate = action.updatedAt
      ? parseDate(action.updatedAt)
      : createdDate;

    const formatDate = (date) => {
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${dateStr} ${timeStr}`;
    };

    const updatedByText = action.updatedByName
      ? intl.formatMessage(
          { id: "coldStorage.corrective.updatedBy" },
          { name: action.updatedByName, time: formatDate(updatedDate) },
        )
      : formatDate(updatedDate);

    return {
      id: `CA-${String(action.id).padStart(3, "0")}`,
      rawId: action.id,
      status: action.status || "PENDING",
      isEdited: action.isEdited || false,
      device:
        action.freezerName ||
        intl.formatMessage(
          { id: "coldStorage.device.fallbackName" },
          {
            id: action.freezerId || intl.formatMessage({ id: "not.specified" }),
          },
        ),
      summary: action.description || "",
      performedBy:
        action.createdByName || intl.formatMessage({ id: "not.specified" }),
      created: formatDate(createdDate),
      updated: updatedByText,
      freezerId: action.freezerId,
      actionType: action.actionType,
      completedAt: action.completedAt,
      completionNotes: action.completionNotes,
      retractedAt: action.retractedAt,
      retractionReason: action.retractionReason,
      rawAction: action,
    };
  };

  const performerOptions = users.map(
    (user) => user.value || user.displayName || user.id,
  );

  const deviceOptions = devices.map((device) => ({
    id: device.id,
    label:
      device.displayName ||
      intl.formatMessage({ id: "coldStorage.device.unnamed" }),
  }));

  const filteredActions = useMemo(() => {
    return actions.filter((item) => {
      if (!searchTerm) return true;
      const lc = searchTerm.toLowerCase();
      return (
        item.id.toLowerCase().includes(lc) ||
        item.device.toLowerCase().includes(lc) ||
        item.summary.toLowerCase().includes(lc)
      );
    });
  }, [actions, searchTerm]);

  const paginatedActions = filteredActions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const itemToString = (item) => (item ? item.label || item : "");

  const resetForm = () => {
    const currentUserDisplayName = getCurrentUserDisplayName();
    setForm({
      device: null,
      performedBy: currentUserDisplayName || "",
      actionType: null,
      summary: "",
    });
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleCloseAddModal = () => {
    setIsAddModalOpen(false);
    setSubmitting(false);
  };

  const handleSearch = (event) => {
    setSearchTerm(event.target.value);
    setCurrentPage(1);
  };

  const handleViewAction = (action) => {
    setSelectedAction(action);
    setEditStatus(
      statusOptions.find((option) => option.id === action.status) || {
        id: action.status,
        label: action.status,
      },
    );
    setCompletionNotes(action.completionNotes || "");
    setIsViewModalOpen(true);
  };

  const handleCloseViewModal = () => {
    setIsViewModalOpen(false);
    setSelectedAction(null);
    setEditStatus(null);
    setCompletionNotes("");
  };

  const handleOpenRetractModal = (action) => {
    setSelectedAction(action);
    setRetractionReason("");
    setIsRetractModalOpen(true);
  };

  const handleCloseRetractModal = () => {
    setIsRetractModalOpen(false);
    setSelectedAction(null);
    setRetractionReason("");
  };

  const handleUpdateStatus = async () => {
    if (!selectedAction || !editStatus) return;

    setSubmitting(true);
    try {
      const actionId = selectedAction.rawId;
      const userId = userSessionDetails?.userId || 1;

      if (editStatus.id === "COMPLETED") {
        await completeCorrectiveAction(actionId, userId, completionNotes);
      } else {
        await updateCorrectiveAction(
          actionId,
          userId,
          selectedAction.summary,
          editStatus.id,
        );
      }

      handleCloseViewModal();

      notify({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.success" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.action.updateSuccess",
        }),
      });

      loadCorrectiveActions();
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({ id: "coldStorage.error.updateAction" }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetractAction = async () => {
    if (!selectedAction || !retractionReason.trim()) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "coldStorage.validation.error" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.validation.retractionReason",
        }),
      });
      return;
    }

    setSubmitting(true);
    try {
      const actionId = selectedAction.rawId;
      const userId = userSessionDetails?.userId || 1;

      await retractCorrectiveAction(actionId, userId, retractionReason);

      handleCloseRetractModal();

      notify({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.success" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.action.retractSuccess",
        }),
      });

      loadCorrectiveActions();
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.error.retractAction",
        }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDevice = async (formData) => {
    if (!formData.roomId || formData.roomId === "") {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "coldStorage.validation.error" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.validation.selectRoom",
        }),
      });
      return;
    }

    try {
      const deviceData = {
        ...formData,
        roomId: parseInt(formData.roomId),
        storageDevice: { type: formData.deviceType },
        port: parseInt(formData.port),
        slaveId: parseInt(formData.slaveId),
        temperatureRegister: parseInt(formData.temperatureRegister),
        humidityRegister:
          formData.humidityRegister != null
            ? parseInt(formData.humidityRegister)
            : null,
        dataBits: parseInt(formData.dataBits),
        stopBits: parseInt(formData.stopBits),
        baudRate: parseInt(formData.baudRate),
        temperatureScale: parseFloat(formData.temperatureScale),
        temperatureOffset: parseFloat(formData.temperatureOffset),
        humidityScale: parseFloat(formData.humidityScale),
        humidityOffset: parseFloat(formData.humidityOffset),
        active: true,
      };
      delete deviceData.deviceType;

      const createdDevice = await createDevice(deviceData);

      const newDevice = {
        id: createdDevice.id?.toString() || "",
        label: formData.name,
      };
      setForm((prev) => ({ ...prev, device: newDevice }));

      setIsDeviceModalOpen(false);
      setIsAddModalOpen(true);

      notify({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "coldStorage.device.created" }),
        subtitle: intl.formatMessage(
          { id: "coldStorage.device.createdSuccess" },
          { name: formData.name },
        ),
      });

      loadDevices();
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({ id: "coldStorage.error.createDevice" }),
      });
    }
  };

  const handleAddRoom = () => {
    setRoomFormData({ name: "", description: "", active: true });
    setIsDeviceModalOpen(false);
    setIsAddRoomModalOpen(true);
  };

  const handleRoomFormChange = (field, value) => {
    setRoomFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoomSubmit = async () => {
    try {
      await createRoom(roomFormData);
      setIsAddRoomModalOpen(false);
      setIsDeviceModalOpen(true);

      notify({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.success" }),
        subtitle: intl.formatMessage({ id: "coldStorage.room.created" }),
      });

      loadLocations();
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle:
          intl.formatMessage({ id: "coldStorage.error.createRoom" }) +
          err.message,
      });
    }
  };

  const handleSubmit = async () => {
    if (!isValid) {
      return;
    }

    setSubmitting(true);

    try {
      const freezerId = form.device?.id;
      if (!freezerId) {
        throw new Error(
          intl.formatMessage({ id: "coldStorage.validation.selectDevice" }),
        );
      }

      if (!form.actionType) {
        throw new Error(
          intl.formatMessage({ id: "coldStorage.validation.selectActionType" }),
        );
      }

      await createCorrectiveAction(
        parseInt(freezerId),
        form.actionType.id,
        form.summary,
        userSessionDetails?.userId || 1,
      );

      setIsAddModalOpen(false);
      resetForm();

      notify({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.success" }),
        subtitle: intl.formatMessage({
          id: "coldStorage.action.createSuccess",
        }),
      });

      loadCorrectiveActions();
    } catch (err) {
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "error.title" }),
        subtitle: intl.formatMessage({ id: "coldStorage.error.createAction" }),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isValid =
    form.device &&
    form.performedBy &&
    form.actionType &&
    form.summary.trim().length > 0;

  const rows = paginatedActions.map((action) => ({
    id: action.id,
    status: statusTag(action.status, intl, action.isEdited),
    device: action.device,
    summary: action.summary,
    performedBy: action.performedBy,
    created: action.created,
    updated: action.updated,
    _action: action,
  }));

  return (
    <div style={{ padding: "1rem 0" }}>
      {notificationVisible === true ? <AlertDialog /> : ""}
      {loading ? (
        <div>
          {intl.formatMessage({ id: "coldStorage.corrective.loading" })}
        </div>
      ) : (
        <DataTable rows={rows} headers={getColumns(intl)}>
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
                id: "coldStorage.corrective.title",
              })}
              description={intl.formatMessage({
                id: "coldStorage.corrective.subtitle",
              })}
              {...getTableContainerProps()}
            >
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    closeButtonLabelText={intl.formatMessage({
                      id: "carbon.search.clear",
                    })}
                    placeholder={intl.formatMessage({
                      id: "coldStorage.corrective.search",
                    })}
                    onChange={handleSearch}
                    value={searchTerm}
                  />
                  <Dropdown
                    id="time-filter"
                    titleText=""
                    label={timeFilter.label}
                    items={timeFilters}
                    itemToString={(item) => (item ? item.label : "")}
                    selectedItem={timeFilter}
                    onChange={({ selectedItem }) =>
                      setTimeFilter(selectedItem || timeFilters[0])
                    }
                    size="md"
                  />
                  <Button
                    kind="primary"
                    renderIcon={Add}
                    onClick={handleOpenAddModal}
                  >
                    {intl.formatMessage({
                      id: "coldStorage.corrective.add",
                    })}
                  </Button>
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
                    <TableHeader>
                      {intl.formatMessage({ id: "coldStorage.actions" })}
                    </TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={getColumns(intl).length + 1}
                        style={{
                          textAlign: "center",
                          padding: "2rem 0",
                          color: "var(--cds-text-secondary)",
                        }}
                      >
                        {intl.formatMessage({
                          id: "coldStorage.corrective.empty",
                        })}
                      </TableCell>
                    </TableRow>
                  )}

                  {rows.map((row) => {
                    const action = paginatedActions.find(
                      (a) => a.id === row.id,
                    );
                    return (
                      <TableRow key={row.id} {...getRowProps({ row })}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                        <TableCell>
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <Button
                              kind="ghost"
                              size="sm"
                              onClick={() => handleViewAction(action)}
                            >
                              {intl.formatMessage({ id: "label.view" })}
                            </Button>
                            {action &&
                              action.status !== "COMPLETED" &&
                              action.status !== "RETRACTED" &&
                              action.status !== "CANCELLED" && (
                                <Button
                                  kind="danger--ghost"
                                  size="sm"
                                  renderIcon={WarningAlt}
                                  onClick={() => handleOpenRetractModal(action)}
                                >
                                  {intl.formatMessage({
                                    id: "coldStorage.corrective.retract",
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
              <Pagination
                backwardText={intl.formatMessage({
                  id: "pagination.previous",
                })}
                forwardText={intl.formatMessage({ id: "pagination.next" })}
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.itemsPerPage",
                })}
                page={currentPage}
                pageSize={pageSize}
                pageSizes={[5, 10, 20, 30, 40, 50]}
                totalItems={filteredActions.length}
                onChange={({ page, pageSize }) => {
                  setCurrentPage(page);
                  setPageSize(pageSize);
                }}
              />
            </TableContainer>
          )}
        </DataTable>
      )}

      <Modal
        open={isAddModalOpen}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        onRequestClose={handleCloseAddModal}
        onRequestSubmit={handleSubmit}
        modalHeading={intl.formatMessage({
          id: "coldStorage.corrective.addTitle",
        })}
        primaryButtonText={intl.formatMessage({
          id: "coldStorage.corrective.addSubmit",
        })}
        secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
        primaryButtonDisabled={!isValid || submitting}
        size="sm"
      >
        <Form>
          <Stack gap={5}>
            {devices.length === 0 && (
              <InlineNotification
                aria-label={intl.formatMessage({ id: "button.close" })}
                statusIconDescription={intl.formatMessage({
                  id: "carbon.notification.info",
                })}
                kind="info"
                title={intl.formatMessage({
                  id: "coldStorage.corrective.noDevices",
                })}
                subtitle={intl.formatMessage({
                  id: "coldStorage.corrective.noDevicesHelp",
                })}
                lowContrast
                hideCloseButton
              />
            )}

            <div>
              <Dropdown
                id="device-dropdown"
                titleText={intl.formatMessage({
                  id: "coldStorage.corrective.deviceRequired",
                })}
                label={
                  form.device
                    ? itemToString(form.device)
                    : intl.formatMessage({ id: "coldStorage.device.select" })
                }
                items={deviceOptions}
                itemToString={itemToString}
                selectedItem={form.device}
                onChange={({ selectedItem }) =>
                  setForm((prev) => ({ ...prev, device: selectedItem }))
                }
                disabled={devices.length === 0}
              />
              <div style={{ marginTop: "0.5rem" }}>
                <Link
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setIsDeviceModalOpen(true);
                  }}
                  style={{ cursor: "pointer", fontSize: "0.875rem" }}
                >
                  {devices.length === 0
                    ? intl.formatMessage({
                        id: "coldStorage.device.createNew",
                      })
                    : intl.formatMessage({
                        id: "coldStorage.device.createMissing",
                      })}
                </Link>
              </div>
            </div>

            <Dropdown
              id="performed-by-dropdown"
              titleText={intl.formatMessage({
                id: "coldStorage.corrective.performedByRequired",
              })}
              label={form.performedBy}
              items={performerOptions}
              selectedItem={form.performedBy}
              onChange={({ selectedItem }) =>
                setForm((prev) => ({ ...prev, performedBy: selectedItem }))
              }
            />

            <Dropdown
              id="action-type-dropdown"
              titleText={intl.formatMessage({
                id: "coldStorage.corrective.actionTypeRequired",
              })}
              label={
                form.actionType
                  ? itemToString(form.actionType)
                  : intl.formatMessage({
                      id: "coldStorage.corrective.actionTypeSelect",
                    })
              }
              items={actionTypes}
              itemToString={itemToString}
              selectedItem={form.actionType}
              onChange={({ selectedItem }) =>
                setForm((prev) => ({ ...prev, actionType: selectedItem }))
              }
            />

            <TextArea
              id="action-summary"
              labelText={intl.formatMessage({
                id: "coldStorage.corrective.descriptionRequired",
              })}
              placeholder={intl.formatMessage({
                id: "coldStorage.corrective.descriptionPlaceholder",
              })}
              rows={4}
              value={form.summary}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, summary: e.target.value }))
              }
              required
            />
          </Stack>
        </Form>
      </Modal>

      <Modal
        open={isAddRoomModalOpen}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        onRequestClose={() => {
          setIsAddRoomModalOpen(false);
          setIsDeviceModalOpen(true);
        }}
        onRequestSubmit={handleRoomSubmit}
        modalHeading={intl.formatMessage({ id: "coldStorage.room.addNew" })}
        primaryButtonText={intl.formatMessage({
          id: "coldStorage.room.create",
        })}
        secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
        size="sm"
        preventCloseOnClickOutside
      >
        <Stack gap={5}>
          <TextInput
            id="roomName"
            labelText={intl.formatMessage({
              id: "coldStorage.room.nameRequired",
            })}
            placeholder={intl.formatMessage({
              id: "coldStorage.room.nameExample",
            })}
            value={roomFormData.name}
            onChange={(e) => handleRoomFormChange("name", e.target.value)}
            required
          />

          <TextInput
            id="roomDescription"
            labelText={intl.formatMessage({ id: "coldStorage.description" })}
            placeholder={intl.formatMessage({
              id: "coldStorage.room.descriptionPlaceholder",
            })}
            value={roomFormData.description}
            onChange={(e) =>
              handleRoomFormChange("description", e.target.value)
            }
          />

          <Toggle
            id="roomActive"
            labelText={intl.formatMessage({
              id: "coldStorage.status.active",
            })}
            toggled={roomFormData.active}
            onToggle={(checked) => handleRoomFormChange("active", checked)}
          />
        </Stack>
      </Modal>

      <AddDeviceModal
        isOpen={isDeviceModalOpen}
        onClose={() => {
          setIsDeviceModalOpen(false);
          setIsAddModalOpen(true);
        }}
        onSubmit={handleCreateDevice}
        locations={locations}
        onAddRoom={handleAddRoom}
        editingDevice={null}
      />

      <Modal
        open={isViewModalOpen}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        onRequestClose={handleCloseViewModal}
        onRequestSubmit={handleUpdateStatus}
        modalHeading={intl.formatMessage(
          { id: "coldStorage.corrective.detailTitle" },
          { id: selectedAction?.id || "" },
        )}
        primaryButtonText={intl.formatMessage({
          id: "coldStorage.corrective.updateStatus",
        })}
        secondaryButtonText={intl.formatMessage({ id: "button.close" })}
        primaryButtonDisabled={!editStatus || submitting}
        size="md"
      >
        {selectedAction && (
          <Stack gap={5}>
            <div>
              <strong>
                {intl.formatMessage({ id: "coldStorage.device" })}:
              </strong>{" "}
              {selectedAction.device}
            </div>
            <div>
              <strong>
                {intl.formatMessage({
                  id: "coldStorage.corrective.actionType",
                })}
                :
              </strong>{" "}
              {actionTypes.find((t) => t.id === selectedAction.actionType)
                ?.label || selectedAction.actionType}
            </div>
            <div>
              <strong>
                {intl.formatMessage({ id: "coldStorage.corrective.summary" })}:
              </strong>{" "}
              {selectedAction.summary}
            </div>
            <div>
              <strong>
                {intl.formatMessage({
                  id: "coldStorage.corrective.performedBy",
                })}
                :
              </strong>{" "}
              {selectedAction.performedBy}
            </div>
            <div>
              <strong>
                {intl.formatMessage({ id: "coldStorage.corrective.createdAt" })}
                :
              </strong>{" "}
              {selectedAction.created}
            </div>
            <div>
              <strong>
                {intl.formatMessage({ id: "coldStorage.corrective.updatedAt" })}
                :
              </strong>{" "}
              {selectedAction.updated}
            </div>
            <div>
              <strong>
                {intl.formatMessage({
                  id: "coldStorage.corrective.currentStatus",
                })}
                :
              </strong>{" "}
              {statusTag(selectedAction.status, intl, selectedAction.isEdited)}
            </div>

            {selectedAction.status !== "COMPLETED" &&
              selectedAction.status !== "CANCELLED" &&
              selectedAction.status !== "RETRACTED" && (
                <>
                  <Dropdown
                    id="status-dropdown"
                    titleText={intl.formatMessage({
                      id: "coldStorage.corrective.updateStatus",
                    })}
                    label={
                      editStatus
                        ? editStatus.label
                        : intl.formatMessage({
                            id: "coldStorage.corrective.selectStatus",
                          })
                    }
                    items={statusOptions}
                    itemToString={(item) => (item ? item.label : "")}
                    selectedItem={editStatus}
                    onChange={({ selectedItem }) => setEditStatus(selectedItem)}
                  />

                  {editStatus?.id === "COMPLETED" && (
                    <TextArea
                      id="completion-notes"
                      labelText={intl.formatMessage({
                        id: "coldStorage.corrective.completionNotesRequired",
                      })}
                      placeholder={intl.formatMessage({
                        id: "coldStorage.corrective.completionNotesPlaceholder",
                      })}
                      rows={4}
                      value={completionNotes}
                      onChange={(e) => setCompletionNotes(e.target.value)}
                      required
                    />
                  )}
                </>
              )}

            {selectedAction.completionNotes && (
              <div>
                <strong>
                  {intl.formatMessage({
                    id: "coldStorage.corrective.completionNotes",
                  })}
                  :
                </strong>
                <div style={{ whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
                  {selectedAction.completionNotes}
                </div>
              </div>
            )}

            {selectedAction.retractionReason && (
              <div>
                <strong>
                  {intl.formatMessage({
                    id: "coldStorage.corrective.retractionReason",
                  })}
                  :
                </strong>
                <div style={{ whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>
                  {selectedAction.retractionReason}
                </div>
              </div>
            )}
          </Stack>
        )}
      </Modal>

      <Modal
        open={isRetractModalOpen}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        onRequestClose={handleCloseRetractModal}
        onRequestSubmit={handleRetractAction}
        modalHeading={intl.formatMessage(
          { id: "coldStorage.corrective.retractTitle" },
          { id: selectedAction?.id || "" },
        )}
        primaryButtonText={intl.formatMessage({
          id: "coldStorage.corrective.retract",
        })}
        secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
        danger
        primaryButtonDisabled={!retractionReason.trim() || submitting}
        size="sm"
      >
        <Stack gap={5}>
          <InlineNotification
            statusIconDescription={intl.formatMessage({
              id: "carbon.notification.warning",
            })}
            kind="warning"
            title={intl.formatMessage({ id: "label.warning" })}
            subtitle={intl.formatMessage({
              id: "coldStorage.corrective.retractWarning",
            })}
            lowContrast
            hideCloseButton
          />

          <TextArea
            id="retraction-reason"
            labelText={intl.formatMessage({
              id: "coldStorage.corrective.retractionReasonRequired",
            })}
            placeholder={intl.formatMessage({
              id: "coldStorage.corrective.retractionReasonPlaceholder",
            })}
            rows={4}
            value={retractionReason}
            onChange={(e) => setRetractionReason(e.target.value)}
            required
          />
        </Stack>
      </Modal>
    </div>
  );
}
