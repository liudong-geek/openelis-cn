import React, { useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  DataTable,
  InlineLoading,
  Loading,
  Modal,
  Pagination,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from "@carbon/react";
import { Edit } from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer } from "../../../utils/Utils";
import { NotificationContext } from "../../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../../common/CustomNotification";
import PageBreadCrumb from "../../../common/PageBreadCrumb";
import ProductPageHeader from "../../../common/ProductPageHeader";
import GenericConfigEdit from "./GenericConfigEdit";
import "../../AdminListWorkspace.css";

interface ConfigMenuDisplayProps {
  id: string;
  label: string;
  menuType: string;
}

interface ConfigLocalization {
  localesAndValuesOfLocalesWithValues?: string;
}

export interface ConfigMenuItem {
  id: string;
  name?: string;
  description?: string;
  value?: string;
  valueType?: string;
  tag?: string;
  localization?: ConfigLocalization;
}

interface ConfigMenuResponse {
  menuList?: ConfigMenuItem[];
}

interface ConfigTableRow {
  id: string;
  name: string;
  description: string;
  value: string;
  valueType: string;
}

interface CarbonTableCell {
  id: string;
  value: string;
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

export const normalizeConfigRows = (
  items: ConfigMenuItem[] = [],
): ConfigTableRow[] =>
  items.map((item) => ({
    id: String(item.id),
    name: String(item.name || ""),
    description: String(item.description || ""),
    value:
      item.valueType === "text" && item.tag === "localization"
        ? String(
            item.localization?.localesAndValuesOfLocalesWithValues ||
              item.value ||
              "",
          )
        : String(item.value || ""),
    valueType: String(item.valueType || "text"),
  }));

const getEditorMenuType = (menuType: string) => menuType.replace(/Menu$/, "");

function ConfigMenuDisplay(props: ConfigMenuDisplayProps) {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext) as unknown as NotificationContextValue;
  const intl = useIntl();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState("");
  const [rows, setRows] = useState<ConfigTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingRow, setEditingRow] = useState<ConfigTableRow | null>(null);

  const breadcrumbs = [
    { label: "home.label", link: "/" },
    { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
    { label: props.id, link: `/MasterListsPage/${props.menuType}` },
  ];

  const showLoadError = () => {
    setNotificationVisible(true);
    addNotification({
      kind: NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "server.error.msg" }),
    });
  };

  const loadConfigurations = (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    getFromOpenElisServer(
      `/rest/${props.menuType}`,
      (response?: ConfigMenuResponse) => {
        if (!response || !Array.isArray(response.menuList)) {
          setRows([]);
          showLoadError();
        } else {
          setRows(normalizeConfigRows(response.menuList));
        }
        setLoading(false);
        setRefreshing(false);
      },
    );
  };

  useEffect(() => {
    loadConfigurations();
    // The route component is remounted when menuType changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.menuType]);

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.name, row.description, row.value]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [rows, searchText]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleRows.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [page, pageSize, visibleRows.length]);

  const booleanCount = rows.filter((row) => row.valueType === "boolean").length;
  const optionCount = rows.filter(
    (row) => row.valueType === "dictionary",
  ).length;

  const renderCell = (
    cell: CarbonTableCell,
    row: CarbonTableRow,
  ): ReactNode => {
    const sourceRow = rows.find((item) => item.id === row.id);
    if (cell.info.header === "valueType") {
      const typeLabels: Record<string, string> = {
        boolean: intl.formatMessage({ id: "config.workspace.type.switch" }),
        dictionary: intl.formatMessage({ id: "config.workspace.type.option" }),
        logoUpload: intl.formatMessage({ id: "config.workspace.type.image" }),
        freeText: intl.formatMessage({ id: "config.workspace.type.text" }),
        text: intl.formatMessage({ id: "config.workspace.type.text" }),
      };
      return (
        <TableCell key={cell.id}>
          <Tag type="cool-gray" size="sm">
            {typeLabels[cell.value] || typeLabels.text}
          </Tag>
        </TableCell>
      );
    }
    if (cell.info.header === "value") {
      if (sourceRow?.valueType === "boolean") {
        const enabled = ["true", "y", "yes", "1"].includes(
          cell.value.toLocaleLowerCase(),
        );
        return (
          <TableCell key={cell.id}>
            <Tag type={enabled ? "green" : "cool-gray"} size="sm">
              {intl.formatMessage({
                id: enabled
                  ? "config.workspace.boolean.true"
                  : "config.workspace.boolean.false",
              })}
            </Tag>
          </TableCell>
        );
      }
      return (
        <TableCell key={cell.id}>
          <span className="config-workspace__value" title={cell.value}>
            {cell.value || "—"}
          </span>
        </TableCell>
      );
    }
    if (cell.info.header === "actions") {
      return (
        <TableCell key={cell.id}>
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Edit}
            onClick={() => sourceRow && setEditingRow(sourceRow)}
          >
            <FormattedMessage id="config.workspace.edit" />
          </Button>
        </TableCell>
      );
    }
    return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
  };

  const tableRows = visibleRows
    .slice((page - 1) * pageSize, page * pageSize)
    .map((row) => ({ ...row, actions: row.id }));

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && (
        <Loading
          description={intl.formatMessage({ id: "loading.description" })}
        />
      )}
      <div className="adminPageContent admin-list-workspace config-workspace">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id={props.id} />}
          subtitle={<FormattedMessage id="config.workspace.subtitle" />}
        />

        <div className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="config.workspace.total" />
            </span>
            <strong>{rows.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="config.workspace.switches" />
            </span>
            <strong>{booleanCount}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="config.workspace.options" />
            </span>
            <strong>{optionCount}</strong>
          </article>
        </div>

        <section className="admin-list-workspace__surface">
          <header className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="config.workspace.list.title" />
              </h2>
              <p>
                <FormattedMessage id="config.workspace.list.description" />
              </p>
            </div>
          </header>
          <div className="admin-list-workspace__filters admin-list-workspace__filters--search-only">
            <Search
              id="config-workspace-search"
              labelText={intl.formatMessage({ id: "config.workspace.search" })}
              placeholder={intl.formatMessage({
                id: "config.workspace.search.placeholder",
              })}
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPage(1);
              }}
              closeButtonLabelText={intl.formatMessage({
                id: "admin.dashboard.search.clear",
              })}
            />
            <p>
              <FormattedMessage
                id="config.workspace.visibleCount"
                values={{ count: visibleRows.length }}
              />
            </p>
            {refreshing && (
              <InlineLoading
                className="admin-list-workspace__refreshing"
                description={intl.formatMessage({ id: "loading.description" })}
              />
            )}
          </div>

          {visibleRows.length === 0 && !loading ? (
            <div className="admin-list-workspace__empty" role="status">
              <div>0</div>
              <h3>
                <FormattedMessage id="config.workspace.empty.title" />
              </h3>
              <p>
                <FormattedMessage id="config.workspace.empty.description" />
              </p>
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={tableRows}
                  headers={[
                    {
                      key: "name",
                      header: intl.formatMessage({
                        id: "admin.page.configuration.formEntryConfigMenu.name",
                      }),
                    },
                    {
                      key: "description",
                      header: intl.formatMessage({
                        id: "admin.page.configuration.formEntryConfigMenu.description",
                      }),
                    },
                    {
                      key: "value",
                      header: intl.formatMessage({
                        id: "admin.page.configuration.formEntryConfigMenu.value",
                      }),
                    },
                    {
                      key: "valueType",
                      header: intl.formatMessage({
                        id: "config.workspace.type",
                      }),
                    },
                    {
                      key: "actions",
                      header: intl.formatMessage({
                        id: "config.workspace.actions",
                      }),
                    },
                  ]}
                >
                  {({
                    rows: renderedRows,
                    headers,
                    getHeaderProps,
                    getTableProps,
                  }) => (
                    <TableContainer className="admin-list-workspace__table">
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            {headers.map((header) => (
                              <TableHeader {...getHeaderProps({ header })}>
                                {header.header}
                              </TableHeader>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {renderedRows.map((row) => (
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
                onChange={({ page: nextPage, pageSize: nextPageSize }) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                }}
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20, 30, 50]}
                totalItems={visibleRows.length}
                forwardText={intl.formatMessage({ id: "pagination.forward" })}
                backwardText={intl.formatMessage({ id: "pagination.backward" })}
                itemRangeText={(min, max, total) =>
                  intl.formatMessage(
                    { id: "pagination.item-range" },
                    { min, max, total },
                  )
                }
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.items-per-page",
                })}
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
            </>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(editingRow)}
        passiveModal
        size="md"
        modalHeading={intl.formatMessage({
          id: "config.workspace.edit.heading",
        })}
        modalLabel={editingRow?.name || ""}
        onRequestClose={() => setEditingRow(null)}
      >
        {editingRow && (
          <GenericConfigEdit
            menuType={getEditorMenuType(props.menuType)}
            ID={editingRow.id}
            embedded
            onCancel={() => setEditingRow(null)}
            onSaved={() => {
              setEditingRow(null);
              loadConfigurations(true);
            }}
          />
        )}
      </Modal>
    </>
  );
}

export default ConfigMenuDisplay;
