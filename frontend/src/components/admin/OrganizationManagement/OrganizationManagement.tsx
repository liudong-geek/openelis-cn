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
  Button,
  Tag,
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
  internetAddress: string;
  streetAddress: string;
  city: string;
  cliaNumber: string;
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
  const [deactivateButton, setDeactivateButton] = useState(true);
  const [modifyButton, setModifyButton] = useState(true);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [selectedRowIdsPost, setSelectedRowIdsPost] = useState<
    string[] | { selectedIDs: string[] }
  >([]);
  const [loading, setLoading] = useState(true);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [organizationsManagmentList, setOrganizationsManagmentList] =
    useState<OrganizationMenuResponse>();
  const [organizationsManagmentListShow, setOrganizationsManagmentListShow] =
    useState<OrganizationTableRow[]>([]);

  function deleteDeactivateOrganizationManagament(event: SyntheticEvent) {
    event.preventDefault();
    setLoading(true);
    postToOpenElisServerJsonResponse(
      `/rest/DeleteOrganization?ID=${selectedRowIds.join(",")}&startingRecNo=1`,
      JSON.stringify(selectedRowIdsPost),
      () => {
        deleteDeactivateOrganizationManagamentCallback();
      },
    );
  }

  const handlePanelSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLoading(true);
    setPage(1);
    const query = event.target.value;
    setPanelSearchTerm(query);
    setSelectedRowIds([]);
  };

  const deleteDeactivateOrganizationManagamentCallback = () => {
    setLoading(false);
    setNotificationVisible(true);
    addNotification({
      title: intl.formatMessage({
        id: "notification.title",
      }),
      message: intl.formatMessage({
        id: "notification.organization.post.delete.success",
      }),
      kind: NotificationKinds.success,
    });
    setTimeout(() => {
      refreshCurrentRoute();
    }, 200);
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
    setOrganizationsManagmentList(
      res || {
        menuList: [],
        fromRecordCount: "0",
        toRecordCount: "0",
        totalRecordCount: "0",
      },
    );
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    const endpoint = panelSearchTerm
      ? `/rest/SearchOrganizationMenu?search=Y&startingRecNo=1&searchString=${encodeURIComponent(
          panelSearchTerm,
        )}`
      : "/rest/OrganizationMenu?paging=1&startingRecNo=1";
    getFromOpenElisServer(endpoint, handleMenuItems);
  }, [panelSearchTerm]);

  useEffect(() => {
    if (organizationsManagmentList) {
      const newOrganizationsManagementList =
        organizationsManagmentList.menuList.map((item) => {
          return {
            id: item.id,
            orgName: item.organizationName,
            parentOrg: item.organization?.organizationName || "",
            orgPrefix: item.shortName || "",
            active: item.isActive || "",
            internetAddress: item.internetAddress || "",
            streetAddress: item.streetAddress || "",
            city: item.city || "",
            cliaNumber: item.cliaNum || "",
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

  useEffect(() => {
    if (selectedRowIds.length == 0) {
      setDeactivateButton(true);
    } else {
      setDeactivateButton(false);
    }
    if (selectedRowIds.length === 1) {
      setModifyButton(false);
    } else {
      setModifyButton(true);
    }
  }, [selectedRowIds]);

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
    return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
  };

  if (loading) {
    return (
      <>
        <Loading />
      </>
    );
  }

  const totalOrganizations = Number(
    totalRecordCount || organizationsManagmentListShow.length || 0,
  );
  const activeOrganizations = organizationsManagmentListShow.filter(
    (organization) => isEnabledValue(organization.active),
  ).length;
  const selectedCount = selectedRowIds.length;

  const openAddOrganization = () =>
    navigateToInternalPath("/MasterListsPage/organizationEdit?ID=0");

  const openSelectedOrganization = () => {
    if (selectedCount === 1) {
      navigateToInternalPath(
        `/MasterListsPage/organizationEdit?ID=${selectedRowIds[0]}&startingRecNo=1`,
      );
    }
  };

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
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
              <FormattedMessage id="organization.management.metric.selected" />
            </span>
            <strong>{selectedCount}</strong>
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
                kind="ghost"
                size="sm"
                disabled={modifyButton}
                onClick={openSelectedOrganization}
              >
                <FormattedMessage id="externalconnections.action.edit" />
              </Button>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={deactivateButton}
                onClick={deleteDeactivateOrganizationManagament}
              >
                <FormattedMessage id="externalconnections.action.deactivate" />
              </Button>
            </div>
          </div>

          <div className="admin-list-workspace__filters admin-list-workspace__filters--search-only">
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
            <p role="status">
              <FormattedMessage
                id="organization.management.results"
                values={{ count: organizationsManagmentListShow.length }}
              />
            </p>
          </div>

          {organizationsManagmentListShow.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    panelSearchTerm
                      ? "organization.management.empty.search.title"
                      : "organization.management.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    panelSearchTerm
                      ? "organization.management.empty.search.subtitle"
                      : "organization.management.empty.subtitle"
                  }
                />
              </p>
              {!panelSearchTerm && (
                <Button size="sm" onClick={openAddOrganization}>
                  <FormattedMessage id="organization.management.action.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={organizationsManagmentListShow.slice(
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
                      key: "internetAddress",
                      header: intl.formatMessage({
                        id: "organization.internetaddress",
                      }),
                    },
                    {
                      key: "streetAddress",
                      header: intl.formatMessage({
                        id: "organization.streetAddress",
                      }),
                    },
                    {
                      key: "city",
                      header: intl.formatMessage({ id: "organization.city" }),
                    },
                    {
                      key: "cliaNumber",
                      header: intl.formatMessage({
                        id: "organization.clia.number",
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
                totalItems={totalOrganizations}
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
