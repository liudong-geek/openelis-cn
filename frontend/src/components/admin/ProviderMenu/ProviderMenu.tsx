import React, { useContext, useState, useEffect } from "react";
import type { ChangeEvent, ReactNode, SyntheticEvent } from "react";
import {
  Loading,
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
  Dropdown,
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
  lastName: string;
  firstName: string;
  workPhone?: string;
  fax?: string;
  email?: string;
}

interface ProviderRecord {
  id: string;
  fhirUuid: string;
  person: ProviderPerson;
  active: boolean;
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
  active: boolean;
  telephone?: string;
  fax?: string;
  email?: string;
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
function ProviderMenu() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;
  const { reloadConfiguration, configurationProperties } = useContext(
    ConfigurationContext,
  ) as unknown as ConfigurationContextValue;

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modifyButton, setModifyButton] = useState(true);
  const [deactivateButton, setDeactivateButton] = useState(true);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserve the original state tuple
  const [fhirUuid, setFhirUuid] = useState("");
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

  const yesOrNo: YesNoOption[] = [
    { id: "yes", value: intl.formatMessage({ id: "label.yes" }) },
    { id: "no", value: intl.formatMessage({ id: "label.no" }) },
  ];

  const handleMenuItems = (res?: ProviderMenuResponse) => {
    setProviderMenuList(res || { providers: [], totalRecordCount: "0" });
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    const endpoint = panelSearchTerm
      ? `/rest/SearchProviderMenu?search=Y&startingRecNo=1&searchString=${encodeURIComponent(
          panelSearchTerm,
        )}`
      : "/rest/ProviderMenu?paging=1&startingRecNo=1";
    getFromOpenElisServer(endpoint, handleMenuItems);
  }, [panelSearchTerm]);

  useEffect(() => {
    if (providerMenuList.providers) {
      const newProviderMenuList = providerMenuList.providers.map((item) => {
        return {
          id: item.id,
          fhirUuid: item.fhirUuid,
          lastName: item.person.lastName,
          firstName: item.person.firstName,
          active: item.active,
          telephone: item.person.workPhone,
          fax: item.person.fax,
          email: item.person.email,
        };
      });
      setTotalRecordCount(providerMenuList.totalRecordCount || "0");
      setProviderMenuListShow(newProviderMenuList);
    }
  }, [providerMenuList]);

  useEffect(() => {
    if (selectedRowIds.length === 1) {
      setModifyButton(false);
    } else {
      setModifyButton(true);
    }
    if (selectedRowIds.length === 0) {
      setDeactivateButton(true);
    } else {
      setDeactivateButton(false);
    }
  }, [selectedRowIds]);

  async function displayStatus(res?: Response) {
    setNotificationVisible(true);
    if (res?.status === 201 || res?.status === 200) {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "save.config.success.msg" }),
      });
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
    }
    reloadConfiguration();
  }

  function deleteDeactivateProvider(event: SyntheticEvent) {
    event.preventDefault();
    setLoading(true);
    postToOpenElisServerFullResponse(
      `/rest/DeleteProvider?ID=${selectedRowIds.join(",")}&startingRecNo=1`,
      JSON.stringify(providerMenuListShow),
      () => {
        setLoading(false);
        refreshCurrentRoute();
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
    setLoading(true);
    setPage(1);
    const query = event.target.value.toLowerCase();
    setPanelSearchTerm(query);
    setSelectedRowIds([]);
  };

  const openAddModal = () => {
    setLastName("");
    setFirstName("");
    setTelephone("");
    setFax("");
    setEmail("");
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
    setTelephone(provider.telephone);
    setFax(provider.fax);
    setEmail(provider.email || "");
    setIsActive(
      provider.active
        ? { id: "yes", value: intl.formatMessage({ id: "label.yes" }) }
        : { id: "no", value: intl.formatMessage({ id: "label.no" }) },
    );
    setIsUpdateModalOpen(true);
  };

  const closeUpdateModal = () => {
    setIsUpdateModalOpen(false);
  };

  const handleAddProvider = () => {
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

    closeAddModal();
    refreshCurrentRoute();
  };

  const handleUpdateProvider = () => {
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

    closeUpdateModal();
    refreshCurrentRoute();
  };

  const handleLastNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || /^[A-Za-z\s]+$/.test(value)) {
      setLastName(value);
    }
  };

  const handleFirstNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || /^[A-Za-z\s]+$/.test(value)) {
      setFirstName(value);
    }
  };

  const handleTelephoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTelephone(event.target.value);
  };

  const handlePhoneValidation = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserve original migration behavior
  const handleFaxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value === "" || (/^\d+$/.test(value) && value.length <= 10)) {
      setFax(value);
    }
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
          <Tag type={cell.value ? "green" : "cool-gray"} size="sm">
            <FormattedMessage id={cell.value ? "label.yes" : "label.no"} />
          </Tag>
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
  const activeProviders = providerMenuListShow.filter(
    (provider) => provider.active,
  ).length;
  const selectedCount = selectedRowIds.length;

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
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
              <FormattedMessage id="provider.management.metric.selected" />
            </span>
            <strong>{selectedCount}</strong>
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
                kind="ghost"
                size="sm"
                disabled={modifyButton}
                onClick={() => openUpdateModal(selectedRowIds[0])}
              >
                <FormattedMessage id="externalconnections.action.edit" />
              </Button>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={deactivateButton}
                onClick={deleteDeactivateProvider}
              >
                <FormattedMessage id="externalconnections.action.deactivate" />
              </Button>
            </div>
          </div>

          <div className="admin-list-workspace__filters admin-list-workspace__filters--search-only">
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
            <p role="status">
              <FormattedMessage
                id="provider.management.results"
                values={{ count: providerMenuListShow.length }}
              />
            </p>
          </div>

          {providerMenuListShow.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    panelSearchTerm
                      ? "provider.management.empty.search.title"
                      : "provider.management.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    panelSearchTerm
                      ? "provider.management.empty.search.subtitle"
                      : "provider.management.empty.subtitle"
                  }
                />
              </p>
              {!panelSearchTerm && (
                <Button size="sm" onClick={openAddModal}>
                  <FormattedMessage id="provider.management.action.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={providerMenuListShow.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({ id: "provider.select" }),
                    },
                    {
                      key: "lastName",
                      header: intl.formatMessage({
                        id: "provider.providerLastName",
                      }),
                    },
                    {
                      key: "firstName",
                      header: intl.formatMessage({
                        id: "provider.providerFirstName",
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
                      key: "fax",
                      header: intl.formatMessage({ id: "provider.fax" }),
                    },
                    {
                      key: "email",
                      header: intl.formatMessage({ id: "provider.email" }),
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
                            <TableRow
                              key={row.id}
                              onClick={() => {
                                const id = row.id;
                                setSelectedRowIds(
                                  selectedRowIds.includes(id)
                                    ? selectedRowIds.filter(
                                        (selectedId) => selectedId !== id,
                                      )
                                    : [...selectedRowIds, id],
                                );
                              }}
                            >
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
                totalItems={totalProviders}
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
        onRequestSubmit={handleAddProvider}
        onRequestClose={closeAddModal}
      >
        <TextInput
          id="lastName"
          labelText={intl.formatMessage({ id: "provider.providerLastName" })}
          value={lastName}
          onChange={(e) => handleLastNameChange(e)}
          required
        />
        <TextInput
          id="firstName"
          labelText={intl.formatMessage({ id: "provider.providerFirstName" })}
          value={firstName}
          onChange={(e) => handleFirstNameChange(e)}
          required
        />
        <TextInput
          id="telephone"
          labelText={intl.formatMessage(
            {
              id: "patient.label.primaryphone",
            },
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
          id="email"
          labelText={intl.formatMessage({ id: "provider.email" })}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={(e) => handleEmailValidation(e)}
          invalid={!emailValidation.status}
          invalidText={emailValidation.status ? "" : emailValidation.body}
        />

        <Dropdown
          className="dropdown-list"
          id="isActive"
          titleText={intl.formatMessage({ id: "label.active" })}
          label={intl.formatMessage({ id: "provider.select" })}
          items={yesOrNo}
          itemToString={(item) => (item ? item.value : "")}
          selectedItem={isActive}
          onChange={({ selectedItem }) =>
            setIsActive(selectedItem as YesNoOption)
          }
        />
        <TextInput
          id="fax"
          labelText={intl.formatMessage({ id: "provider.fax" })}
          value={fax}
          onChange={(e) => setFax(e.target.value)}
        />
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
        onRequestSubmit={handleUpdateProvider}
        onRequestClose={closeUpdateModal}
      >
        <TextInput
          id="lastName"
          labelText={intl.formatMessage({ id: "provider.providerLastName" })}
          value={lastName}
          onChange={(e) => handleLastNameChange(e)}
          required
        />
        <TextInput
          id="firstName"
          labelText={intl.formatMessage({ id: "provider.providerFirstName" })}
          value={firstName}
          onChange={(e) => handleFirstNameChange(e)}
          required
        />
        <TextInput
          id="telephone"
          labelText={intl.formatMessage(
            {
              id: "patient.label.primaryphone",
            },
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
          id="updateEmail"
          labelText={intl.formatMessage({ id: "provider.email" })}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={(e) => handleEmailValidation(e)}
          invalid={!emailValidation.status}
          invalidText={emailValidation.status ? "" : emailValidation.body}
        />
        <Dropdown
          id="isActive"
          titleText={intl.formatMessage({ id: "label.active" })}
          label={intl.formatMessage({ id: "provider.select" })}
          items={yesOrNo}
          itemToString={(item) => (item ? item.value : "")}
          selectedItem={isActive}
          onChange={({ selectedItem }) =>
            setIsActive(selectedItem as YesNoOption)
          }
        />
        <TextInput
          id="fax"
          labelText={intl.formatMessage({ id: "provider.fax" })}
          value={fax}
          onChange={(e) => setFax(e.target.value)}
        />
      </Modal>
    </>
  );
}

export default injectIntl(ProviderMenu);
