import React, { useContext, useState, useEffect } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Loading,
  InlineLoading,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableBody,
  TableHeader,
  TableCell,
  TableSelectRow,
  TableContainer,
  Pagination,
  Search,
  Modal,
  TextInput,
  Select,
  SelectItem,
  Button,
  Tag,
} from "@carbon/react";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { getPhoneFormatHint } from "../../patient/phoneFormatHint";
import { refreshCurrentRoute } from "../../utils/NavigationUtils";
import "../AdminListWorkspace.css";

interface ProviderPerson {
  lastName?: string;
  firstName?: string;
  workPhone?: string;
  fax?: string;
  email?: string;
}

interface ProviderRecord {
  id: string;
  fhirUuid: string;
  person: ProviderPerson;
  active: boolean | string;
}

interface ProviderMenuResponse {
  providers?: ProviderRecord[];
  fromRecordCount?: string;
  toRecordCount?: string;
  totalRecordCount?: string;
}

interface ProviderTableRow {
  id: string;
  fhirUuid: string;
  lastName: string;
  firstName: string;
  displayName: string;
  active: boolean | string;
  telephone?: string;
  fax?: string;
  email?: string;
  actions: string;
}

interface YesNoOption {
  id: "yes" | "no";
  value: string;
}

interface ValidationResult {
  body: string;
  status: boolean;
}

interface CarbonTableCell {
  id: string;
  value: ReactNode;
  info: { header: string };
}

interface CarbonTableRow {
  id: string;
}

interface NotificationContextValue {
  notificationVisible: boolean;
  setNotificationVisible: (visible: boolean) => void;
  addNotification: (notification: {
    kind: string;
    title: string;
    message: string;
  }) => void;
}

interface ConfigurationContextValue {
  reloadConfiguration: () => void;
  configurationProperties: Record<string, string>;
}

// eslint-disable-next-line prefer-const -- preserve the original JavaScript runtime declaration
let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "provider.browse.title",
    link: "/MasterListsPage/providerMenu",
  },
];

const isEnabledValue = (value: ReactNode) =>
  value === true ||
  ["true", "y", "yes", "1"].includes(String(value).toLowerCase());

function ProviderMenu() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;
  const { reloadConfiguration, configurationProperties } = useContext(
    ConfigurationContext,
  ) as unknown as ConfigurationContextValue;

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [providerMenuList, setProviderMenuList] =
    useState<ProviderMenuResponse>({});
  const [providerMenuListShow, setProviderMenuListShow] = useState<
    ProviderTableRow[]
  >([]);
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [currentProvider, setCurrentProvider] =
    useState<ProviderTableRow | null>(null);
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [telephone, setTelephone] = useState<string | undefined>("");
  const [fax, setFax] = useState<string | undefined>("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState<YesNoOption>({
    id: "yes",
    value: intl.formatMessage({ id: "label.yes" }),
  });
  const [phoneValidation, setPhoneValidation] = useState<ValidationResult>({
    body: "",
    status: true,
  });
  const [emailValidation, setEmailValidation] = useState<ValidationResult>({
    body: "",
    status: true,
  });

  const handleMenuItems = (res?: ProviderMenuResponse) => {
    if (!res) {
      setLoading(false);
      setRefreshing(false);
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
      return;
    }
    setProviderMenuList(res);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    const debounce = window.setTimeout(() => {
      setPage(1);
      setAppliedSearchTerm(panelSearchTerm.trim());
    }, 300);
    return () => window.clearTimeout(debounce);
  }, [panelSearchTerm]);

  useEffect(() => {
    if (providerMenuList.providers) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const endpoint = appliedSearchTerm
      ? `/rest/SearchProviderMenu?search=Y&startingRecNo=1&searchString=${encodeURIComponent(
          appliedSearchTerm,
        )}`
      : "/rest/ProviderMenu?paging=1&startingRecNo=1";
    getFromOpenElisServer(endpoint, handleMenuItems);
  }, [appliedSearchTerm]);

  useEffect(() => {
    if (providerMenuList.providers) {
      const newProviderMenuList = providerMenuList.providers.map((item) => {
        const displayName = [item.person.lastName, item.person.firstName]
          .filter(Boolean)
          .join(" ");
        return {
          id: item.id,
          fhirUuid: item.fhirUuid,
          lastName: item.person.lastName || "",
          firstName: item.person.firstName || "",
          displayName,
          active: item.active,
          telephone: item.person.workPhone,
          fax: item.person.fax,
          email: item.person.email,
          actions: item.id,
        };
      });
      setTotalRecordCount(providerMenuList.totalRecordCount || "0");
      setProviderMenuListShow(newProviderMenuList);
    }
  }, [providerMenuList]);

  async function displayStatus(res?: Response) {
    setSaving(false);
    setNotificationVisible(true);
    if (res?.status === 201 || res?.status === 200) {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "save.config.success.msg" }),
      });
      setIsAddModalOpen(false);
      setIsUpdateModalOpen(false);
      reloadConfiguration();
      setTimeout(() => refreshCurrentRoute(), 200);
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
    }
  }

  function deleteDeactivateProvider() {
    setConfirmDeactivateOpen(false);
    setRefreshing(true);
    postToOpenElisServerFullResponse(
      `/rest/DeleteProvider?ID=${selectedRowIds.join(",")}&startingRecNo=1`,
      JSON.stringify({ selectedIDs: selectedRowIds }),
      (res) => {
        setRefreshing(false);
        setNotificationVisible(true);
        if (res?.ok) {
          addNotification({
            kind: NotificationKinds.success,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({
              id: "provider.management.deactivate.success",
            }),
          });
          setTimeout(() => refreshCurrentRoute(), 200);
        } else {
          addNotification({
            kind: NotificationKinds.error,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({ id: "server.error.msg" }),
          });
        }
      },
    );
  }

  const handlePageChange = ({
    page: nextPage,
    pageSize: nextPageSize,
  }: {
    page: number;
    pageSize: number;
  }) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
    setSelectedRowIds([]);
  };

  const handlePanelSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setPanelSearchTerm(query);
    setSelectedRowIds([]);
  };

  const openAddModal = () => {
    setSaving(false);
    setLastName("");
    setFirstName("");
    setTelephone("");
    setFax("");
    setEmail("");
    setPhoneValidation({ body: "", status: true });
    setEmailValidation({ body: "", status: true });
    setIsActive({
      id: "yes",
      value: intl.formatMessage({ id: "label.yes" }),
    });
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
  };

  const openUpdateModal = (providerId: string) => {
    const provider = providerMenuListShow.find((p) => p.id === providerId)!;
    setCurrentProvider(provider);
    setLastName(provider.lastName);
    setFirstName(provider.firstName);
    setTelephone(provider.telephone || "");
    setFax(provider.fax || "");
    setEmail(provider.email || "");
    setPhoneValidation({ body: "", status: true });
    setEmailValidation({ body: "", status: true });
    setSaving(false);
    setIsActive(
      isEnabledValue(provider.active)
        ? { id: "yes", value: intl.formatMessage({ id: "label.yes" }) }
        : { id: "no", value: intl.formatMessage({ id: "label.no" }) },
    );
    setIsUpdateModalOpen(true);
  };

  const closeUpdateModal = () => {
    setIsUpdateModalOpen(false);
  };

  const handleAddProvider = () => {
    setSaving(true);
    const newProvider = {
      person: {
        lastName,
        firstName,
        workPhone: telephone,
        fax,
        email,
      },
      active: isActive.id === "yes",
    };
    postToOpenElisServerFullResponse(
      "/rest/Provider/FhirUuid?fhirUuid=",
      JSON.stringify(newProvider),
      displayStatus,
    );
  };

  const handleUpdateProvider = () => {
    setSaving(true);
    const updatedProvider = {
      fhirUuid: currentProvider!.fhirUuid,
      person: {
        lastName,
        firstName,
        workPhone: telephone,
        fax,
        email,
      },
      active: isActive.id === "yes",
    };
    postToOpenElisServerFullResponse(
      "/rest/Provider/FhirUuid?fhirUuid=" + currentProvider!.fhirUuid,
      JSON.stringify(updatedProvider),
      displayStatus,
    );
  };

  const handleLastNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || /^[\p{L}\p{M}.'·\-\s]+$/u.test(value)) {
      setLastName(value);
    }
  };

  const handleFirstNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || /^[\p{L}\p{M}.'·\-\s]+$/u.test(value)) {
      setFirstName(value);
    }
  };

  const handleTelephoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTelephone(event.target.value);
  };

  const handlePhoneValidation = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setPhoneValidation({ body: "", status: true });
      return;
    }
    getFromOpenElisServer(
      "/rest/PhoneNumberValidationProvider?fieldId=patientPhone&value=" +
        encodeURIComponent(value),
      (resp?: ValidationResult) => {
        setPhoneValidation(
          resp || {
            body: intl.formatMessage({ id: "server.error.msg" }),
            status: false,
          },
        );
      },
    );
  };

  const handleEmailValidation = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (!value) {
      setEmailValidation({ body: "", status: true });
      return;
    }
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    setEmailValidation({
      body: valid ? "" : intl.formatMessage({ id: "error.invalid.email" }),
      status: valid,
    });
  };

  const renderCell = (cell: CarbonTableCell, row: CarbonTableRow) => {
    if (cell.info.header === "select") {
      return (
        <TableSelectRow
          key={cell.id}
          id={cell.id}
          checked={selectedRowIds.includes(row.id)}
          name="selectRowCheckbox"
          ariaLabel={intl.formatMessage({ id: "provider.select" })}
          onSelect={(e) => {
            e.stopPropagation();
            if (selectedRowIds.includes(row.id)) {
              setSelectedRowIds(selectedRowIds.filter((id) => id !== row.id));
            } else {
              setSelectedRowIds([...selectedRowIds, row.id]);
            }
          }}
        />
      );
    } else if (cell.info.header === "active") {
      return (
        <TableCell key={cell.id}>
          <Tag
            type={isEnabledValue(cell.value) ? "green" : "cool-gray"}
            size="sm"
          >
            <FormattedMessage
              id={isEnabledValue(cell.value) ? "label.yes" : "label.no"}
            />
          </Tag>
        </TableCell>
      );
    } else if (cell.info.header === "actions") {
      return (
        <TableCell key={cell.id}>
          <Button
            kind="ghost"
            size="sm"
            onClick={() => openUpdateModal(row.id)}
          >
            <FormattedMessage id="externalconnections.action.edit" />
          </Button>
        </TableCell>
      );
    } else {
      return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
    }
  };

  if (loading) {
    return (
      <>
        <Loading />
      </>
    );
  }

  const totalProviders = Number(
    totalRecordCount || providerMenuListShow.length || 0,
  );
  const activeProviders = providerMenuListShow.filter((provider) =>
    isEnabledValue(provider.active),
  ).length;
  const inactiveProviders = Math.max(
    providerMenuListShow.length - activeProviders,
    0,
  );
  const visibleProviders = providerMenuListShow.filter(
    (provider) =>
      statusFilter === "all" ||
      (statusFilter === "active"
        ? isEnabledValue(provider.active)
        : !isEnabledValue(provider.active)),
  );
  const selectedCount = selectedRowIds.length;
  const formValid =
    String(lastName || "").trim().length > 0 &&
    String(firstName || "").trim().length > 0 &&
    phoneValidation.status &&
    emailValidation.status;

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <Modal
        open={confirmDeactivateOpen}
        danger
        modalHeading={intl.formatMessage({
          id: "provider.management.deactivate.confirm.title",
        })}
        primaryButtonText={intl.formatMessage({
          id: "externalconnections.action.deactivate",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setConfirmDeactivateOpen(false)}
        onRequestSubmit={deleteDeactivateProvider}
        preventCloseOnClickOutside
      >
        <FormattedMessage
          id="provider.management.deactivate.confirm.message"
          values={{ count: selectedCount }}
        />
      </Modal>
      <div className="adminPageContent admin-list-workspace provider-management-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="provider.browse.title" />}
          subtitle={<FormattedMessage id="provider.management.subtitle" />}
          actions={
            <Button size="sm" onClick={openAddModal}>
              <FormattedMessage id="provider.management.action.add" />
            </Button>
          }
        />

        <section className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="provider.management.metric.total" />
            </span>
            <strong>{totalProviders}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="provider.management.metric.active" />
            </span>
            <strong>{activeProviders}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="provider.management.metric.inactive" />
            </span>
            <strong>{inactiveProviders}</strong>
          </article>
        </section>

        <section className="admin-list-workspace__surface">
          <div className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="provider.management.list.title" />
              </h2>
              <p>
                <FormattedMessage id="provider.management.list.subtitle" />
              </p>
            </div>
            <div className="admin-list-workspace__selection-actions">
              <span>
                <FormattedMessage
                  id="provider.management.selected"
                  values={{ count: selectedCount }}
                />
              </span>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={selectedCount === 0 || refreshing}
                onClick={() => setConfirmDeactivateOpen(true)}
              >
                <FormattedMessage id="externalconnections.action.deactivate" />
              </Button>
            </div>
          </div>

          <div className="admin-list-workspace__filters admin-list-workspace__filters--organization">
            <Search
              size="lg"
              id="provider-search-bar"
              labelText={<FormattedMessage id="provider.search" />}
              placeholder={intl.formatMessage({
                id: "provider.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "provider.management.search.clear",
              })}
              onChange={handlePanelSearchChange}
              value={panelSearchTerm}
            />
            <Select
              id="provider-status-filter"
              labelText={intl.formatMessage({
                id: "provider.management.filter.status",
              })}
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setSelectedRowIds([]);
                setStatusFilter(event.target.value);
              }}
            >
              <SelectItem
                value="all"
                text={intl.formatMessage({
                  id: "provider.management.filter.all",
                })}
              />
              <SelectItem
                value="active"
                text={intl.formatMessage({
                  id: "provider.management.filter.active",
                })}
              />
              <SelectItem
                value="inactive"
                text={intl.formatMessage({
                  id: "provider.management.filter.inactive",
                })}
              />
            </Select>
            <p role="status">
              <FormattedMessage
                id="provider.management.results"
                values={{ count: visibleProviders.length }}
              />
            </p>
            {refreshing && (
              <InlineLoading
                className="admin-list-workspace__refreshing"
                description={intl.formatMessage({
                  id: "admin.list.refreshing",
                })}
              />
            )}
          </div>

          {visibleProviders.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    appliedSearchTerm || statusFilter !== "all"
                      ? "provider.management.empty.filtered.title"
                      : "provider.management.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    appliedSearchTerm || statusFilter !== "all"
                      ? "provider.management.empty.filtered.subtitle"
                      : "provider.management.empty.subtitle"
                  }
                />
              </p>
              {!appliedSearchTerm && statusFilter === "all" && (
                <Button size="sm" onClick={openAddModal}>
                  <FormattedMessage id="provider.management.action.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={visibleProviders.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({ id: "provider.select" }),
                    },
                    {
                      key: "displayName",
                      header: intl.formatMessage({
                        id: "provider.management.column.name",
                      }),
                    },
                    {
                      key: "active",
                      header: intl.formatMessage({ id: "provider.isActive" }),
                    },
                    {
                      key: "telephone",
                      header: intl.formatMessage({ id: "provider.telephone" }),
                    },
                    {
                      key: "email",
                      header: intl.formatMessage({ id: "provider.email" }),
                    },
                    {
                      key: "actions",
                      header: intl.formatMessage({
                        id: "admin.list.column.actions",
                      }),
                    },
                  ]}
                >
                  {({ rows, headers, getHeaderProps, getTableProps }) => (
                    <TableContainer className="admin-list-workspace__table">
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => (
                              <TableHeader
                                {...getHeaderProps({ header })}
                                key={header.key}
                              >
                                {header.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {rows.map((row) => (
                            <TableRow key={row.id}>
                              {row.cells.map((cell) => renderCell(cell, row))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </DataTable>
              </div>
              <Pagination
                className="admin-list-workspace__pagination"
                onChange={handlePageChange}
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20]}
                totalItems={visibleProviders.length}
                forwardText={intl.formatMessage({ id: "pagination.forward" })}
                backwardText={intl.formatMessage({ id: "pagination.backward" })}
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
                pageText={(currentPage, pagesUnknown) =>
                  intl.formatMessage(
                    { id: "pagination.page" },
                    { page: pagesUnknown ? "" : currentPage },
                  )
                }
              />
            </>
          )}
        </section>
      </div>
      <Modal
        open={isAddModalOpen}
        modalHeading={intl.formatMessage({
          id: "provider.modal.add.heading",
        })}
        primaryButtonText={intl.formatMessage({ id: "label.button.add" })}
        secondaryButtonText={intl.formatMessage({
          id: "label.button.cancel",
        })}
        primaryButtonDisabled={!formValid || saving}
        onRequestSubmit={handleAddProvider}
        onRequestClose={closeAddModal}
      >
        <div className="provider-editor-form">
          <TextInput
            id="provider-add-last-name"
            labelText={intl.formatMessage({ id: "provider.providerLastName" })}
            value={lastName}
            onChange={(e) => handleLastNameChange(e)}
            required
          />
          <TextInput
            id="provider-add-first-name"
            labelText={intl.formatMessage({ id: "provider.providerFirstName" })}
            value={firstName}
            onChange={(e) => handleFirstNameChange(e)}
            required
          />
          <TextInput
            id="provider-add-telephone"
            labelText={intl.formatMessage(
              { id: "patient.label.primaryphone" },
              { PHONE_FORMAT: "" },
            )}
            helperText={getPhoneFormatHint(intl, configurationProperties)}
            value={telephone}
            onChange={(e) => handleTelephoneChange(e)}
            onBlur={(e) => handlePhoneValidation(e)}
            invalid={!phoneValidation.status}
            invalidText={phoneValidation.status ? "" : phoneValidation.body}
          />
          <TextInput
            id="provider-add-email"
            labelText={intl.formatMessage({ id: "provider.email" })}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => handleEmailValidation(e)}
            invalid={!emailValidation.status}
            invalidText={emailValidation.status ? "" : emailValidation.body}
          />
          <Select
            id="provider-add-active"
            labelText={intl.formatMessage({ id: "label.active" })}
            value={isActive.id}
            onChange={(event) =>
              setIsActive({
                id: event.target.value as "yes" | "no",
                value: intl.formatMessage({
                  id: event.target.value === "yes" ? "label.yes" : "label.no",
                }),
              })
            }
          >
            <SelectItem
              value="yes"
              text={intl.formatMessage({ id: "label.yes" })}
            />
            <SelectItem
              value="no"
              text={intl.formatMessage({ id: "label.no" })}
            />
          </Select>
          <TextInput
            id="provider-add-fax"
            labelText={intl.formatMessage({ id: "provider.fax" })}
            value={fax}
            onChange={(e) => setFax(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={isUpdateModalOpen}
        modalHeading={intl.formatMessage({
          id: "provider.modal.update.heading",
        })}
        primaryButtonText={intl.formatMessage({ id: "label.button.update" })}
        secondaryButtonText={intl.formatMessage({
          id: "label.button.cancel",
        })}
        primaryButtonDisabled={!formValid || saving}
        onRequestSubmit={handleUpdateProvider}
        onRequestClose={closeUpdateModal}
      >
        <div className="provider-editor-form">
          <TextInput
            id="provider-update-last-name"
            labelText={intl.formatMessage({ id: "provider.providerLastName" })}
            value={lastName}
            onChange={(e) => handleLastNameChange(e)}
            required
          />
          <TextInput
            id="provider-update-first-name"
            labelText={intl.formatMessage({ id: "provider.providerFirstName" })}
            value={firstName}
            onChange={(e) => handleFirstNameChange(e)}
            required
          />
          <TextInput
            id="provider-update-telephone"
            labelText={intl.formatMessage(
              { id: "patient.label.primaryphone" },
              { PHONE_FORMAT: "" },
            )}
            helperText={getPhoneFormatHint(intl, configurationProperties)}
            value={telephone}
            onChange={(e) => handleTelephoneChange(e)}
            onBlur={(e) => handlePhoneValidation(e)}
            invalid={!phoneValidation.status}
            invalidText={phoneValidation.status ? "" : phoneValidation.body}
          />
          <TextInput
            id="provider-update-email"
            labelText={intl.formatMessage({ id: "provider.email" })}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => handleEmailValidation(e)}
            invalid={!emailValidation.status}
            invalidText={emailValidation.status ? "" : emailValidation.body}
          />
          <Select
            id="provider-update-active"
            labelText={intl.formatMessage({ id: "label.active" })}
            value={isActive.id}
            onChange={(event) =>
              setIsActive({
                id: event.target.value as "yes" | "no",
                value: intl.formatMessage({
                  id: event.target.value === "yes" ? "label.yes" : "label.no",
                }),
              })
            }
          >
            <SelectItem
              value="yes"
              text={intl.formatMessage({ id: "label.yes" })}
            />
            <SelectItem
              value="no"
              text={intl.formatMessage({ id: "label.no" })}
            />
          </Select>
          <TextInput
            id="provider-update-fax"
            labelText={intl.formatMessage({ id: "provider.fax" })}
            value={fax}
            onChange={(e) => setFax(e.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}

export default injectIntl(ProviderMenu);
