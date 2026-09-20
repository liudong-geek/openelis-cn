import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
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
  Toggle,
} from "@carbon/react";
import { Save } from "@carbon/icons-react";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { NotificationContext } from "../../layout/Layout";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "./SecurityConfiguration.css";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "sidenav.label.admin.menu.global",
    link: "/MasterListsPage/globalMenuManagement",
  },
];

export const flattenMenuTree = (items = [], depth = 0) =>
  items.flatMap((item) => [
    {
      id: String(item?.menu?.elementId || `menu-${depth}`),
      elementId: String(item?.menu?.elementId || ""),
      displayKey: String(item?.menu?.displayKey || ""),
      isActive: Boolean(item?.menu?.isActive),
      depth,
      childCount: Array.isArray(item?.childMenus) ? item.childMenus.length : 0,
    },
    ...flattenMenuTree(item?.childMenus || [], depth + 1),
  ]);

const setSubtreeActive = (item, active) => ({
  ...item,
  menu: { ...item.menu, isActive: active },
  childMenus: (item.childMenus || []).map((child) =>
    setSubtreeActive(child, active),
  ),
});

export const updateMenuTree = (items = [], elementId, active) =>
  items.map((item) => {
    if (item?.menu?.elementId === elementId) {
      return setSubtreeActive(item, active);
    }
    return {
      ...item,
      childMenus: updateMenuTree(item?.childMenus || [], elementId, active),
    };
  });

const humanizeElementId = (elementId = "") =>
  elementId
    .replace(/^menu_?/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Unnamed menu";

function GlobalMenuManagement() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const intl = useIntl();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showChildren, setShowChildren] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [menuTree, setMenuTree] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const menuLabel = (row) =>
    row.displayKey
      ? intl.formatMessage({
          id: row.displayKey,
          defaultMessage: humanizeElementId(row.elementId),
        })
      : humanizeElementId(row.elementId);

  const loadMenu = () => {
    setLoading(true);
    getFromOpenElisServer("/rest/menu", (response) => {
      setLoading(false);
      if (!Array.isArray(response)) {
        setNotificationVisible(true);
        addNotification({
          kind: NotificationKinds.error,
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({ id: "server.error.msg" }),
        });
        return;
      }
      setMenuTree(response);
      setDirty(false);
      setPage(1);
    });
  };

  useEffect(() => {
    loadMenu();
    // The endpoint is stable for the lifetime of this route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allRows = useMemo(() => flattenMenuTree(menuTree), [menuTree]);
  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return allRows.filter((row) => {
      if (!showChildren && row.depth > 0) return false;
      if (!query) return true;
      return [menuLabel(row), row.elementId]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    });
    // menuLabel depends on the current intl locale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, intl, searchText, showChildren]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(visibleRows.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [page, pageSize, visibleRows.length]);

  const activeCount = allRows.filter((row) => row.isActive).length;
  const inactiveCount = allRows.length - activeCount;
  const pagedRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);

  const changeMenu = (elementId, active) => {
    setMenuTree((current) => updateMenuTree(current, elementId, active));
    setDirty(true);
  };

  const displayStatus = async (response) => {
    setNotificationVisible(true);
    setIsSubmitting(false);
    if (Number(response?.status) >= 200 && Number(response?.status) < 300) {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "success.add.edited.msg" }),
      });
      try {
        const body = await response.json();
        if (Array.isArray(body)) setMenuTree(body);
      } catch (_error) {
        // Some deployments return no body after a successful update.
      }
      setDirty(false);
      return;
    }
    addNotification({
      kind: NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "error.add.edited.msg" }),
    });
  };

  const submitMenu = () => {
    setConfirmOpen(false);
    setIsSubmitting(true);
    postToOpenElisServerFullResponse(
      "/rest/menu",
      JSON.stringify(menuTree),
      displayStatus,
    );
  };

  return (
    <>
      {notificationVisible && <AlertDialog />}
      {loading && (
        <Loading
          description={intl.formatMessage({ id: "loading.description" })}
        />
      )}
      <div className="adminPageContent admin-list-workspace security-menu-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="menu.global.title" />}
          subtitle={<FormattedMessage id="security.menu.subtitle" />}
          actions={
            <>
              <Button
                kind="secondary"
                disabled={!dirty || isSubmitting}
                onClick={loadMenu}
              >
                <FormattedMessage id="security.menu.discard" />
              </Button>
              <Button
                renderIcon={Save}
                disabled={!dirty || isSubmitting}
                onClick={() => setConfirmOpen(true)}
              >
                <FormattedMessage id="security.menu.save" />
              </Button>
            </>
          }
        />

        <div className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="security.menu.total" />
            </span>
            <strong>{allRows.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="security.menu.active" />
            </span>
            <strong>{activeCount}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="security.menu.inactive" />
            </span>
            <strong>{inactiveCount}</strong>
          </article>
        </div>

        <section className="admin-list-workspace__surface">
          <header className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="security.menu.list.title" />
              </h2>
              <p>
                <FormattedMessage id="security.menu.list.description" />
              </p>
            </div>
            {isSubmitting && (
              <InlineLoading
                description={intl.formatMessage({
                  id: "config.workspace.saving",
                })}
              />
            )}
          </header>
          <div className="admin-list-workspace__filters security-menu-page__filters">
            <Search
              id="security-menu-search"
              labelText={intl.formatMessage({ id: "security.menu.search" })}
              placeholder={intl.formatMessage({
                id: "security.menu.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "admin.dashboard.search.clear",
              })}
              value={searchText}
              onChange={(event) => {
                setSearchText(event.target.value);
                setPage(1);
              }}
            />
            <Toggle
              id="toggleShowChildren"
              labelText={intl.formatMessage({ id: "label.showChildren" })}
              labelA={intl.formatMessage({
                id: "config.workspace.boolean.false",
              })}
              labelB={intl.formatMessage({
                id: "config.workspace.boolean.true",
              })}
              toggled={showChildren}
              onToggle={(value) => {
                setShowChildren(value);
                setPage(1);
              }}
            />
            <p>
              <FormattedMessage
                id="security.menu.visibleCount"
                values={{ count: visibleRows.length }}
              />
            </p>
          </div>

          {visibleRows.length === 0 && !loading ? (
            <div className="admin-list-workspace__empty" role="status">
              <div>0</div>
              <h3>
                <FormattedMessage id="security.menu.empty.title" />
              </h3>
              <p>
                <FormattedMessage id="security.menu.empty.description" />
              </p>
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <TableContainer className="admin-list-workspace__table">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeader>
                          <FormattedMessage id="security.menu.name" />
                        </TableHeader>
                        <TableHeader>
                          <FormattedMessage id="security.menu.identifier" />
                        </TableHeader>
                        <TableHeader>
                          <FormattedMessage id="security.menu.level" />
                        </TableHeader>
                        <TableHeader>
                          <FormattedMessage id="security.menu.status" />
                        </TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pagedRows.map((row) => {
                        const label = menuLabel(row);
                        const levelLabel = intl.formatMessage({
                          id: row.depth
                            ? "security.menu.child"
                            : "security.menu.primary",
                        });
                        const statusLabel = intl.formatMessage({
                          id: row.isActive
                            ? "security.menu.enabled"
                            : "security.menu.disabled",
                        });

                        return (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div
                                className="security-menu-page__menu-name"
                                style={{ "--menu-depth": row.depth || 0 }}
                              >
                                <Checkbox
                                  id={`menu-active-${row.elementId}`}
                                  aria-label={label}
                                  labelText={label}
                                  checked={Boolean(row.isActive)}
                                  onChange={(_event, { checked }) =>
                                    changeMenu(row.elementId, checked)
                                  }
                                />
                              </div>
                            </TableCell>
                            <TableCell>{row.elementId || "—"}</TableCell>
                            <TableCell>
                              <Tag type="cool-gray" size="sm">
                                {levelLabel}
                              </Tag>
                            </TableCell>
                            <TableCell>
                              <Tag
                                type={row.isActive ? "green" : "gray"}
                                size="sm"
                              >
                                {statusLabel}
                              </Tag>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </div>
              <Pagination
                className="admin-list-workspace__pagination"
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 30, 50, 100]}
                totalItems={visibleRows.length}
                onChange={({ page: nextPage, pageSize: nextPageSize }) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                }}
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
        open={confirmOpen}
        danger
        modalHeading={intl.formatMessage({ id: "security.menu.confirm.title" })}
        primaryButtonText={intl.formatMessage({
          id: "security.menu.confirm.save",
        })}
        secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
        onRequestClose={() => setConfirmOpen(false)}
        onRequestSubmit={submitMenu}
      >
        <p>
          <FormattedMessage id="security.menu.confirm.description" />
        </p>
      </Modal>
    </>
  );
}

export default GlobalMenuManagement;
