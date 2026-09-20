import React, { useContext, useState, useEffect } from "react";
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
  Select,
  SelectItem,
  Button,
  Tag,
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
import CustomCheckBox from "../../common/CustomCheckBox";
import ProductPageHeader from "../../common/ProductPageHeader";
import {
  navigateToInternalPath,
  refreshCurrentRoute,
} from "../../utils/NavigationUtils";
import "../AdminListWorkspace.css";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "unifiedSystemUser.browser.title",
    link: "/MasterListsPage/userManagement",
  },
];

const isEnabledValue = (value) =>
  value === true ||
  ["true", "y", "yes", "1"].includes(String(value).toLowerCase());

function UserManagement() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [selectedRowCombinedUserID, setSelectedRowCombinedUserID] = useState(
    [],
  );
  const [selectedRowCombinedUserIDPost, setSelectedRowCombinedUserIDPost] =
    useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [filters, setFilters] = useState([]);
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [userManagementList, setUserManagementList] = useState();
  const [userManagementListShow, setUserManagementListShow] = useState([]);
  const [testSectionsShow, setTestSectionsShow] = useState({});

  function deleteDeactivateUserManagement() {
    setConfirmDeactivateOpen(false);
    setRefreshing(true);
    postToOpenElisServerJsonResponse(
      `/rest/DeleteUnifiedSystemUser?ID=${selectedRowCombinedUserID.join(
        ",",
      )}&startingRecNo=1`,
      JSON.stringify(selectedRowCombinedUserIDPost),
      (res) => {
        deleteDeactivateUserManagementCallback(res);
      },
    );
  }

  useEffect(() => {
    const selectedRowCombinedUserIDObject = {
      selectedIDs: selectedRowCombinedUserID,
    };

    setSelectedRowCombinedUserIDPost(selectedRowCombinedUserIDObject);
  }, [selectedRowCombinedUserID, userManagementListShow]);

  function deleteDeactivateUserManagementCallback(res) {
    const succeeded =
      res && !res.error && (!res.status || Number(res.status) < 400);
    setRefreshing(false);
    if (succeeded) {
      setNotificationVisible(true);
      addNotification({
        title: intl.formatMessage({
          id: "notification.title",
        }),
        message: intl.formatMessage({
          id: "notification.user.post.delete.success",
        }),
        kind: NotificationKinds.success,
      });
      setTimeout(() => refreshCurrentRoute(), 200);
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
      setNotificationVisible(true);
    }
  }

  const handlePageChange = ({ page: nextPage, pageSize: nextPageSize }) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
    setSelectedRowIds([]);
    setSelectedRowCombinedUserID([]);
  };

  const handleMenuItems = (res) => {
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
    setUserManagementList(res);
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
    if (userManagementList) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const searchMode = appliedSearchTerm ? "Y" : "N";
    const searchParameter = appliedSearchTerm
      ? `&searchString=${encodeURIComponent(appliedSearchTerm)}`
      : "";
    getFromOpenElisServer(
      `/rest/SearchUnifiedSystemUserMenu?search=${searchMode}&startingRecNo=1${searchParameter}&filter=${filters.join(
        ",",
      )}&roleFilter=${encodeURIComponent(roleFilter)}`,
      handleMenuItems,
    );
  }, [filters, appliedSearchTerm, roleFilter]);

  useEffect(() => {
    if (userManagementListShow) {
      if (selectedRowIds.length > 0) {
        const combinedIds = selectedRowIds.map((id) => {
          const selectedRow = userManagementListShow.find(
            (row) => row.id === id,
          );
          return selectedRow.combinedUserID;
        });
        setSelectedRowCombinedUserID(combinedIds);
      } else {
        setSelectedRowCombinedUserID([]);
      }
    }
  }, [selectedRowIds, userManagementListShow]);

  useEffect(() => {
    if (userManagementList) {
      setTotalRecordCount(userManagementList.totalRecordCount || "0");

      const newUserManagementList = userManagementList.menuList.map((item) => {
        const displayName = [item.firstName, item.lastName]
          .filter(Boolean)
          .join(" ");
        const accountStatus = isEnabledValue(item.disabled)
          ? "disabled"
          : isEnabledValue(item.locked)
            ? "locked"
            : isEnabledValue(item.active)
              ? "active"
              : "inactive";
        return {
          id: item.systemUserId,
          combinedUserID: item.combinedUserID,
          displayName,
          loginName: item.loginName,
          expDate: item.expDate,
          accountStatus,
          timeout: item.timeout,
          active: item.active,
          locked: item.locked,
          actions: item.combinedUserID,
        };
      });
      const newUserManagementListArray = Object.values(newUserManagementList);
      setUserManagementListShow(newUserManagementListArray);

      const testSections = (userManagementList.testSections || []).map(
        (item) => {
          return {
            id: item.id,
            value: item.value,
          };
        },
      );

      setTestSectionsShow(testSections);
    }
  }, [userManagementList]);

  const renderCell = (cell, row) => {
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
    if (cell.info.header === "accountStatus") {
      const statusStyles = {
        active: ["green", "user.management.status.active"],
        inactive: ["cool-gray", "user.management.status.inactive"],
        locked: ["magenta", "user.management.status.locked"],
        disabled: ["red", "user.management.status.disabled"],
      };
      const [type, messageId] =
        statusStyles[cell.value] || statusStyles.inactive;
      return (
        <TableCell key={cell.id}>
          <Tag type={type} size="sm">
            <FormattedMessage id={messageId} />
          </Tag>
        </TableCell>
      );
    }
    if (cell.info.header === "actions") {
      const selectedUser = userManagementListShow.find(
        (user) => user.id === row.id,
      );
      return (
        <TableCell key={cell.id}>
          <Button
            kind="ghost"
            size="sm"
            onClick={() =>
              navigateToInternalPath(
                `/MasterListsPage/userEdit?ID=${selectedUser?.combinedUserID}&startingRecNo=1&roleFilter=`,
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

  const handlePanelSearchChange = (event) => {
    const query = event.target.value;
    setPanelSearchTerm(query);
    setSelectedRowIds([]);
  };

  function handleTestSectionsSelectChange(e) {
    setPage(1);
    setRoleFilter(e.target.value);
  }

  if (loading) {
    return (
      <>
        <Loading />
      </>
    );
  }

  const totalUsers = Number(
    totalRecordCount || userManagementListShow.length || 0,
  );
  const activeUsers = userManagementListShow.filter((user) =>
    isEnabledValue(user.active),
  ).length;
  const lockedUsers = userManagementListShow.filter((user) =>
    isEnabledValue(user.locked),
  ).length;
  const selectedCount = selectedRowIds.length;

  const openAddUser = () =>
    navigateToInternalPath(
      "/MasterListsPage/userEdit?ID=0&startingRecNo=1&roleFilter=",
    );

  const updateFilter = (filterName, enabled) => {
    setPage(1);
    setFilters((currentFilters) =>
      enabled
        ? [...new Set([...currentFilters, filterName])]
        : currentFilters.filter((filter) => filter !== filterName),
    );
  };

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <Modal
        open={confirmDeactivateOpen}
        danger
        modalHeading={intl.formatMessage({
          id: "user.management.deactivate.confirm.title",
        })}
        primaryButtonText={intl.formatMessage({
          id: "externalconnections.action.deactivate",
        })}
        secondaryButtonText={intl.formatMessage({ id: "label.button.cancel" })}
        onRequestClose={() => setConfirmDeactivateOpen(false)}
        onRequestSubmit={deleteDeactivateUserManagement}
        preventCloseOnClickOutside
      >
        <FormattedMessage
          id="user.management.deactivate.confirm.message"
          values={{ count: selectedCount }}
        />
      </Modal>
      <div className="adminPageContent admin-list-workspace user-management-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="unifiedSystemUser.browser.title" />}
          subtitle={<FormattedMessage id="user.management.subtitle" />}
          actions={
            <Button size="sm" onClick={openAddUser}>
              <FormattedMessage id="unifiedSystemUser.browser.button.add" />
            </Button>
          }
        />

        <section className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="user.management.metric.total" />
            </span>
            <strong>{totalUsers}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="user.management.metric.active" />
            </span>
            <strong>{activeUsers}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="user.management.metric.locked" />
            </span>
            <strong>{lockedUsers}</strong>
          </article>
        </section>

        <section className="admin-list-workspace__surface">
          <div className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="user.management.list.title" />
              </h2>
              <p>
                <FormattedMessage id="user.management.list.subtitle" />
              </p>
            </div>
            <div className="admin-list-workspace__selection-actions">
              <span>
                <FormattedMessage
                  id="user.management.selected"
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

          <div className="admin-list-workspace__filters">
            <Search
              size="lg"
              id="user-name-search-bar"
              labelText={
                <FormattedMessage id="unifiedSystemUser.browser.search" />
              }
              placeholder={intl.formatMessage({
                id: "unifiedSystemUser.browser.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "user.management.search.clear",
              })}
              onChange={handlePanelSearchChange}
              value={panelSearchTerm}
            />
            <Select
              id="filters"
              labelText={<FormattedMessage id="menu.label.filter.role" />}
              value={roleFilter}
              onChange={handleTestSectionsSelectChange}
            >
              <SelectItem
                key=""
                value=""
                text={intl.formatMessage({ id: "user.management.role.all" })}
              />
              {testSectionsShow && testSectionsShow.length > 0 ? (
                testSectionsShow.map((section) => (
                  <SelectItem
                    key={section.id}
                    value={section.id}
                    text={section.value}
                  />
                ))
              ) : (
                <SelectItem
                  key="no-option-available"
                  value=""
                  text={intl.formatMessage({
                    id: "label.no.options.available",
                  })}
                />
              )}
            </Select>
            <div className="admin-list-workspace__filter-checks">
              <span>
                <FormattedMessage id="user.management.quickFilters" />
              </span>
              <CustomCheckBox
                id="only-active"
                label={<FormattedMessage id="menu.label.filter.active" />}
                onChange={(isChecked) => updateFilter("isActive", isChecked)}
              />
              <CustomCheckBox
                id="only-administrator"
                label={<FormattedMessage id="menu.label.filter.admin" />}
                onChange={(isChecked) => updateFilter("isAdmin", isChecked)}
              />
            </div>
            {refreshing && (
              <InlineLoading
                className="admin-list-workspace__refreshing"
                description={intl.formatMessage({
                  id: "admin.list.refreshing",
                })}
              />
            )}
          </div>

          {userManagementListShow.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    appliedSearchTerm || roleFilter || filters.length > 0
                      ? "user.management.empty.filtered.title"
                      : "user.management.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    appliedSearchTerm || roleFilter || filters.length > 0
                      ? "user.management.empty.filtered.subtitle"
                      : "user.management.empty.subtitle"
                  }
                />
              </p>
              {!appliedSearchTerm && !roleFilter && filters.length === 0 && (
                <Button size="sm" onClick={openAddUser}>
                  <FormattedMessage id="unifiedSystemUser.browser.button.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={userManagementListShow.slice(
                    (page - 1) * pageSize,
                    page * pageSize,
                  )}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({
                        id: "unifiedSystemUser.select",
                      }),
                    },
                    {
                      key: "displayName",
                      header: intl.formatMessage({
                        id: "user.management.column.name",
                      }),
                    },
                    {
                      key: "loginName",
                      header: intl.formatMessage({
                        id: "user.management.column.loginName",
                      }),
                    },
                    {
                      key: "expDate",
                      header: intl.formatMessage({
                        id: "user.management.column.expiration",
                      }),
                    },
                    {
                      key: "accountStatus",
                      header: intl.formatMessage({
                        id: "user.management.column.status",
                      }),
                    },
                    {
                      key: "timeout",
                      header: intl.formatMessage({
                        id: "user.management.column.timeout",
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
                totalItems={userManagementListShow.length}
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

export default injectIntl(UserManagement);
