import React, { useContext, useState, useEffect } from "react";
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
import ExternalConnectionSimulation from "./ExternalConnectionSimulation";
import "./ExternalConnectionMenu.css";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "externalconnections.browse.title",
    link: "/MasterListsPage/externalConnections",
  },
];

function ExternalConnectionMenu() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deactivateButton, setDeactivateButton] = useState(true);
  const [modifyButton, setModifyButton] = useState(true);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [startingRecNo, setStartingRecNo] = useState(1);
  const [paging, setPaging] = useState(1);
  const [connectionList, setConnectionList] = useState();
  const [connectionListShow, setConnectionListShow] = useState([]);
  const [simulationOpen, setSimulationOpen] = useState(false);

  function deactivateConnection(event) {
    event.preventDefault();
    setLoading(true);
    postToOpenElisServerJsonResponse(
      `/rest/DeactivateExternalConnection?ID=${selectedRowIds.join(",")}`,
      JSON.stringify({ selectedIDs: selectedRowIds }),
      () => {
        deactivateCallback();
      },
    );
  }

  const deactivateCallback = () => {
    setLoading(false);
    setNotificationVisible(true);
    addNotification({
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({
        id: "externalconnections.deactivate.success",
      }),
      kind: NotificationKinds.success,
    });
    setTimeout(() => {
      refreshCurrentRoute();
    }, 200);
  };

  const handleSearchChange = (event) => {
    setLoading(true);
    setPaging(1);
    setStartingRecNo(1);
    const query = event.target.value;
    setSearchTerm(query);
    setSelectedRowIds([]);
  };

  const handlePageChange = ({ page: nextPage, pageSize: nextPageSize }) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
    setPaging(nextPage);
    setStartingRecNo((nextPage - 1) * nextPageSize + 1);
    setSelectedRowIds([]);
  };

  const handleMenuItems = (res) => {
    setConnectionList(res || { menuList: [] });
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    const endpoint = searchTerm
      ? `/rest/SearchExternalConnectionMenu?search=Y&startingRecNo=${startingRecNo}&searchString=${encodeURIComponent(
          searchTerm,
        )}`
      : `/rest/ExternalConnectionMenu?paging=${paging}&startingRecNo=${startingRecNo}`;
    getFromOpenElisServer(endpoint, handleMenuItems);
  }, [paging, searchTerm, startingRecNo]);

  useEffect(() => {
    if (connectionList) {
      const list = connectionList.menuList.map((item) => {
        return {
          id: String(item.id),
          name:
            item.nameLocalization && item.nameLocalization.localizedValue
              ? item.nameLocalization.localizedValue
              : "",
          programmedConnection: item.programmedConnection || "",
          uri: item.uri || "",
          authType: item.activeAuthenticationType || "",
          active: item.active != null ? String(item.active) : "",
        };
      });
      setTotalRecordCount(connectionList.totalRecordCount);
      setConnectionListShow(list);
    }
  }, [connectionList]);

  useEffect(() => {
    if (selectedRowIds.length === 0) {
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
    if (cell.info.header === "active") {
      const active = String(cell.value).toLowerCase() === "true";
      return (
        <TableCell key={cell.id}>
          <Tag type={active ? "green" : "cool-gray"} size="sm">
            <FormattedMessage
              id={
                active
                  ? "externalconnections.status.active"
                  : "externalconnections.status.inactive"
              }
            />
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

  const totalConnections = Number(
    totalRecordCount || connectionListShow.length || 0,
  );
  const activeConnections = connectionListShow.filter(
    (connection) => String(connection.active).toLowerCase() === "true",
  ).length;
  const selectedCount = selectedRowIds.length;

  const openAddConnection = () =>
    navigateToInternalPath("/MasterListsPage/externalConnectionEdit?ID=0");

  const openSelectedConnection = () => {
    if (selectedCount === 1) {
      navigateToInternalPath(
        `/MasterListsPage/externalConnectionEdit?ID=${selectedRowIds[0]}&startingRecNo=1`,
      );
    }
  };

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <div className="adminPageContent external-connections-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="externalconnections.browse.title" />}
          subtitle={
            <FormattedMessage id="externalconnections.browse.subtitle" />
          }
          actions={
            <>
              <Button
                kind="tertiary"
                size="sm"
                onClick={() => setSimulationOpen(true)}
                data-testid="external-connection-simulation-open"
              >
                <FormattedMessage id="externalconnections.simulation.open" />
              </Button>
              <Button size="sm" onClick={openAddConnection}>
                <FormattedMessage id="externalconnections.action.add" />
              </Button>
            </>
          }
        />

        <section className="external-connections-page__overview">
          <article>
            <span>
              <FormattedMessage id="externalconnections.metric.total" />
            </span>
            <strong>{totalConnections}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="externalconnections.metric.active" />
            </span>
            <strong>{activeConnections}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="externalconnections.metric.selected" />
            </span>
            <strong>{selectedCount}</strong>
          </article>
        </section>

        <section className="external-connections-page__surface">
          <div className="external-connections-page__section-heading">
            <div>
              <h2>
                <FormattedMessage id="externalconnections.list.title" />
              </h2>
              <p>
                <FormattedMessage id="externalconnections.list.subtitle" />
              </p>
            </div>
            <div className="external-connections-page__selection-actions">
              <Button
                kind="ghost"
                size="sm"
                disabled={modifyButton}
                onClick={openSelectedConnection}
              >
                <FormattedMessage id="externalconnections.action.edit" />
              </Button>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={deactivateButton}
                onClick={deactivateConnection}
              >
                <FormattedMessage id="externalconnections.action.deactivate" />
              </Button>
            </div>
          </div>

          <div className="external-connections-page__toolbar">
            <Search
              size="lg"
              id="ext-conn-search-bar"
              labelText={<FormattedMessage id="externalconnections.search" />}
              placeholder={intl.formatMessage({
                id: "externalconnections.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "externalconnections.search.clear",
              })}
              onChange={handleSearchChange}
              value={searchTerm || ""}
            />
            <p role="status">
              <FormattedMessage
                id="externalconnections.list.results"
                values={{ count: connectionListShow.length }}
              />
            </p>
          </div>

          {connectionListShow.length === 0 ? (
            <div className="external-connections-page__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    searchTerm
                      ? "externalconnections.empty.search.title"
                      : "externalconnections.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    searchTerm
                      ? "externalconnections.empty.search.subtitle"
                      : "externalconnections.empty.subtitle"
                  }
                />
              </p>
              {!searchTerm && (
                <Button size="sm" onClick={openAddConnection}>
                  <FormattedMessage id="externalconnections.action.addFirst" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <DataTable
                rows={connectionListShow}
                headers={[
                  {
                    key: "select",
                    header: intl.formatMessage({
                      id: "externalconnections.select",
                    }),
                  },
                  {
                    key: "name",
                    header: intl.formatMessage({
                      id: "externalconnections.name",
                    }),
                  },
                  {
                    key: "programmedConnection",
                    header: intl.formatMessage({
                      id: "externalconnections.programmedconnection",
                    }),
                  },
                  {
                    key: "uri",
                    header: intl.formatMessage({
                      id: "externalconnections.uri",
                    }),
                  },
                  {
                    key: "authType",
                    header: intl.formatMessage({
                      id: "externalconnections.authtype",
                    }),
                  },
                  {
                    key: "active",
                    header: intl.formatMessage({
                      id: "externalconnections.active",
                    }),
                  },
                ]}
              >
                {({ rows, headers, getHeaderProps, getTableProps }) => (
                  <TableContainer className="external-connections-page__table">
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
                            onClick={() => {
                              const id = row.id;
                              const isSelected = selectedRowIds.includes(id);
                              if (isSelected) {
                                setSelectedRowIds(
                                  selectedRowIds.filter(
                                    (selectedId) => selectedId !== id,
                                  ),
                                );
                              } else {
                                setSelectedRowIds([...selectedRowIds, id]);
                              }
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
              <Pagination
                className="external-connections-page__pagination"
                onChange={handlePageChange}
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20]}
                totalItems={totalConnections}
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
            </>
          )}
        </section>
      </div>
      <ExternalConnectionSimulation
        open={simulationOpen}
        onClose={() => setSimulationOpen(false)}
      />
    </>
  );
}

export default injectIntl(ExternalConnectionMenu);
