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
  Button,
  Tag,
  Select,
  SelectItem,
  Modal,
} from "@carbon/react";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import {
  navigateToInternalPath,
  refreshCurrentRoute,
} from "../../utils/NavigationUtils";
import "../AdminListWorkspace.css";

interface OrganizationMenuItem {
  id: string;
  organizationName: string;
  organization?: { organizationName?: string };
  shortName?: string;
  isActive?: boolean | string;
  internetAddress?: string;
  streetAddress?: string;
  city?: string;
  cliaNum?: string;
}

interface OrganizationMenuResponse {
  menuList: OrganizationMenuItem[];
  fromRecordCount: string;
  toRecordCount: string;
  totalRecordCount: string;
}

interface OrganizationTableRow {
  id: string;
  orgName: string;
  parentOrg: string;
  orgPrefix: string;
  active: boolean | string;
  location: string;
  actions: string;
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

interface ActionResponse {
  error?: unknown;
  status?: number | string;
}

// eslint-disable-next-line prefer-const -- preserve the original JavaScript runtime declaration
let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "organization.main.title",
    link: "/MasterListsPage/organizationManagement",
  },
];

const isEnabledValue = (value: ReactNode) =>
  value === true ||
  ["true", "y", "yes", "1"].includes(String(value).toLowerCase());

function OrganizationManagement() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedRowIdsPost, setSelectedRowIdsPost] = useState<
    string[] | { selectedIDs: string[] }
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [organizationsManagmentList, setOrganizationsManagmentList] =
    useState<OrganizationMenuResponse>();
  const [organizationsManagmentListShow, setOrganizationsManagmentListShow] =
    useState<OrganizationTableRow[]>([]);

  function deleteDeactivateOrganizationManagament() {
    setConfirmDeactivateOpen(false);
    setRefreshing(true);
    postToOpenElisServerJsonResponse<ActionResponse>(
      `/rest/DeleteOrganization?ID=${selectedRowIds.join(",")}&startingRecNo=1`,
      JSON.stringify(selectedRowIdsPost),
      (res) => {
        deleteDeactivateOrganizationManagamentCallback(res);
      },
    );
  }

  const handlePanelSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setPanelSearchTerm(query);
    setSelectedRowIds([]);
  };

  const deleteDeactivateOrganizationManagamentCallback = (
    res?: ActionResponse,
  ) => {
    const succeeded =
      res && !res.error && (!res.status || Number(res.status) < 400);
    setRefreshing(false);
    setNotificationVisible(true);
    if (succeeded) {
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "notification.organization.post.delete.success",
        }),
        kind: NotificationKinds.success,
      });
      setTimeout(() => refreshCurrentRoute(), 200);
    } else {
      addNotification({
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
        kind: NotificationKinds.error,
      });
    }
  };

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

  const handleMenuItems = (res?: OrganizationMenuResponse) => {
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
    setOrganizationsManagmentList(res);
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
    if (organizationsManagmentList) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const endpoint = appliedSearchTerm
      ? `/rest/SearchOrganizationMenu?search=Y&startingRecNo=1&searchString=${encodeURIComponent(
          appliedSearchTerm,
        )}`
      : "/rest/OrganizationMenu?paging=1&startingRecNo=1";
    getFromOpenElisServer(endpoint, handleMenuItems);
  }, [appliedSearchTerm]);

  useEffect(() => {
    if (organizationsManagmentList) {
      const newOrganizationsManagementList =
        organizationsManagmentList.menuList.map((item) => {
          const location = [item.city, item.streetAddress]
            .filter(Boolean)
            .join(" · ");
          return {
            id: item.id,
            orgName: item.organizationName,
            parentOrg: item.organization?.organizationName || "",
            orgPrefix: item.shortName || "",
            active: item.isActive || "",
            location,
            actions: item.id,
          };
        });
      const newOrganizationsManagementListArray = Object.values(
        newOrganizationsManagementList,
      );
      setTotalRecordCount(organizationsManagmentList.totalRecordCount);
      setOrganizationsManagmentListShow(newOrganizationsManagementListArray);
    }
  }, [organizationsManagmentList]);

  useEffect(() => {
    const selectedIDsObject = {
      selectedIDs: selectedRowIds,
    };

    setSelectedRowIdsPost(selectedIDsObject);
  }, [selectedRowIds, organizationsManagmentListShow]);

  const renderCell = (cell: CarbonTableCell, row: CarbonTableRow) => {
    if (cell.info.header === "select") {
      return (
        <TableSelectRow
          key={cell.id}
          id={cell.id}
          checked={selectedRowIds.includes(row.id)}
          name="selectRowCheckbox"
          ariaLabel="selectRows"
          onSelect={() => {
            if (selectedRowIds.includes(row.id)) {
              setSelectedRowIds(selectedRowIds.filter((id) => id !== row.id));
            } else {
              setSelectedRowIds([...selectedRowIds, row.id]);
            }
          }}
        />
      );
    }
    if (cell.info.header === "active") {
      const active = isEnabledValue(cell.value);
      return (
        <TableCell key={cell.id}>
          <Tag type={active ? "green" : "cool-gray"} size="sm">
            <FormattedMessage id={active ? "label.yes" : "label.no"} />
          </Tag>
        </TableCell>
      );
    }
    if (cell.info.header === "actions") {
      return (
        <TableCell key={cell.id}>
          <Button
            kind="ghost"
            size="sm"
            onClick={() =>
              navigateToInternalPath(
                `/MasterListsPage/organizationEdit?ID=${row.id}&startingRecNo=1`,
              )
            }
          >
            <FormattedMessage id="externalconnections.action.edit" />
          </Button>
        </TableCell>
      );
    }
    return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
  };

  if (loading) {
    return (
      <>
        <Loading />
      </>
    );
  }

  const visibleOrganizations = organizationsManagmentListShow.filter(
    (organization) =>
      statusFilter === "all" ||
      (statusFilter === "active"
        ? isEnabledValue(organization.active)
        : !isEnabledValue(organization.active)),
  );
  const totalOrganizations = Number(
    totalRecordCount || organizationsManagmentListShow.length || 0,
  );
  const activeOrganizations = organizationsManagmentListShow.filter(
    (organization) => isEnabledValue(organization.active),
  ).length;
  const inactiveOrganizations = Math.max(
    organizationsManagmentListShow.length - activeOrganizations,
    0,
  );
  const selectedCount = selectedRowIds.length;

  const openAddOrganization = () =>
    navigateToInternalPath("/MasterListsPage/organizationEdit?ID=0");

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <Modal
        open={confirmDeactivateOpen}
        danger
        modalHeading={intl.formatMessage({
          id: "organization.management.deactivate.confirm.title",
        })}
        primaryButtonText={intl.formatMessage({
          id: "externalconnections.action.deactivate",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setConfirmDeactivateOpen(false)}
        onRequestSubmit={deleteDeactivateOrganizationManagament}
        preventCloseOnClickOutside
      >
        <FormattedMessage
          id="organization.management.deactivate.confirm.message"
          values={{ count: selectedCount }}
        />
      </Modal>
      <div className="adminPageContent admin-list-workspace organization-management-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="organization.main.title" />}
          subtitle={<FormattedMessage id="organization.management.subtitle" />}
          actions={
            <Button size="sm" onClick={openAddOrganization}>
              <FormattedMessage id="organization.management.action.add" />
            </Button>
          }
        />

        <section className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="organization.management.metric.total" />
            </span>
            <strong>{totalOrganizations}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="organization.management.metric.active" />
            </span>
            <strong>{activeOrganizations}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="organization.management.metric.inactive" />
            </span>
            <strong>{inactiveOrganizations}</strong>
          </article>
        </section>

        <section className="admin-list-workspace__surface">
          <div className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="organization.management.list.title" />
              </h2>
              <p>
                <FormattedMessage id="organization.management.list.subtitle" />
              </p>
            </div>
            <div className="admin-list-workspace__selection-actions">
              <span>
                <FormattedMessage
                  id="organization.management.selected"
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
              id="org-name-search-bar"
              labelText={
                <FormattedMessage id="organization.search.byorgname" />
              }
              placeholder={intl.formatMessage({
                id: "organization.search.placeHolder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "organization.management.search.clear",
              })}
              onChange={handlePanelSearchChange}
              value={panelSearchTerm}
            />
            <Select
              id="organization-status-filter"
              labelText={intl.formatMessage({
                id: "organization.management.filter.status",
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
                  id: "organization.management.filter.all",
                })}
              />
              <SelectItem
                value="active"
                text={intl.formatMessage({
                  id: "organization.management.filter.active",
                })}
              />
              <SelectItem
                value="inactive"
                text={intl.formatMessage({
                  id: "organization.management.filter.inactive",
                })}
              />
            </Select>
            <p role="status">
              <FormattedMessage
                id="organization.management.results"
                values={{ count: visibleOrganizations.length }}
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

          {visibleOrganizations.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    appliedSearchTerm || statusFilter !== "all"
                      ? "organization.management.empty.filtered.title"
                      : "organization.management.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    appliedSearchTerm || statusFilter !== "all"
                      ? "organization.management.empty.filtered.subtitle"
                      : "organization.management.empty.subtitle"
                  }
                />
              </p>
              {!appliedSearchTerm && statusFilter === "all" && (
                <Button size="sm" onClick={openAddOrganization}>
                  <FormattedMessage id="organization.management.action.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={visibleOrganizations.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({ id: "organization.select" }),
                    },
                    {
                      key: "orgName",
                      header: intl.formatMessage({
                        id: "organization.organizationName",
                      }),
                    },
                    {
                      key: "parentOrg",
                      header: intl.formatMessage({ id: "organization.parent" }),
                    },
                    {
                      key: "orgPrefix",
                      header: intl.formatMessage({
                        id: "organization.short.CI",
                      }),
                    },
                    {
                      key: "active",
                      header: intl.formatMessage({
                        id: "organization.isActive",
                      }),
                    },
                    {
                      key: "location",
                      header: intl.formatMessage({
                        id: "organization.management.column.location",
                      }),
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
                totalItems={visibleOrganizations.length}
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
    </>
  );
}

export default injectIntl(OrganizationManagement);
