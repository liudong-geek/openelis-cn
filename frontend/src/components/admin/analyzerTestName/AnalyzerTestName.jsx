import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Button,
  DataTable,
  Dropdown,
  Loading,
  Modal,
  Pagination,
  Search,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectAll,
  TableSelectRow,
  TextInput,
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
import "../AdminListWorkspace.css";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "sidenav.label.admin.analyzerTest",
    link: "/MasterListsPage/AnalyzerTestName",
  },
];

function AnalyzerTestName() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { reloadConfiguration } = useContext(ConfigurationContext);
  const intl = useIntl();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState([]);
  const [totalRecordCount, setTotalRecordCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAnalyzer, setFilterAnalyzer] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [testName, setTestName] = useState("");
  const [analyzerList, setAnalyzerList] = useState([]);
  const [testList, setTestList] = useState([]);
  const [selectedAnalyzer, setSelectedAnalyzer] = useState(null);
  const [selectedAnalyzerId, setSelectedAnalyzerId] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [originalAnalyzerId, setOriginalAnalyzerId] = useState(null);
  const [originalAnalyzerTestName, setOriginalAnalyzerTestName] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);

  const loadMappings = () => {
    setLoading(true);
    getFromOpenElisServer(
      `/rest/AnalyzerTestNameMenu?analyzerId=${encodeURIComponent(filterAnalyzer)}`,
      (response) => {
        const menuList = response?.menuList || [];
        setMappings(
          menuList.map((item) => ({
            id: String(item.uniqueId),
            analyzerName: item.analyzerName || "",
            analyzerTestName: item.analyzerTestName || "",
            actualTestName: item.actualTestName || "",
          })),
        );
        setTotalRecordCount(
          Number(response?.totalRecordCount || menuList.length || 0),
        );
        setLoading(false);
      },
    );
  };

  useEffect(() => {
    loadMappings();
    setPage(1);
    setSelectedRowIds([]);
  }, [filterAnalyzer]);

  useEffect(() => {
    getFromOpenElisServer(
      "/rest/AnalyzerTestName?ID=0&startingRecNo=1",
      (response) => {
        const analyzers = response?.analyzerList || [];
        setAnalyzerList(analyzers);
        if (response && analyzers.length === 0) {
          setNotificationVisible(true);
          addNotification({
            kind: NotificationKinds.warning,
            title: intl.formatMessage({ id: "notification.title" }),
            message: intl.formatMessage({ id: "message.noPluginFound" }),
          });
        }
      },
    );
    getFromOpenElisServer("/rest/test-list", (response) => {
      setTestList(Array.isArray(response) ? response : []);
    });
  }, []);

  const filteredMappings = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return mappings;
    return mappings.filter((item) =>
      [item.analyzerName, item.analyzerTestName, item.actualTestName].some(
        (value) => value.toLowerCase().includes(query),
      ),
    );
  }, [mappings, searchTerm]);

  const visibleMappings = filteredMappings.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const selectedCount = selectedRowIds.length;
  const analyzerCount = new Set(mappings.map((item) => item.analyzerName)).size;

  const showNotificationForResponse = (response) => {
    setNotificationVisible(true);
    const success = response?.status === 200 || response?.status === 201;
    addNotification({
      kind: success ? NotificationKinds.success : NotificationKinds.error,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({
        id: success ? "save.config.success.msg" : "server.error.msg",
      }),
    });
    if (success) {
      reloadConfiguration();
      setSelectedRowIds([]);
      loadMappings();
    } else {
      setLoading(false);
    }
  };

  const resetEditor = () => {
    setTestName("");
    setSelectedAnalyzer(null);
    setSelectedAnalyzerId(null);
    setSelectedTest(null);
    setSelectedTestId(null);
    setOriginalAnalyzerId(null);
    setOriginalAnalyzerTestName("");
    setEditingItemId(null);
  };

  const openAddModal = () => {
    resetEditor();
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    resetEditor();
  };

  const openUpdateModal = () => {
    if (selectedCount !== 1) return;
    const selectedItem = mappings.find((item) => item.id === selectedRowIds[0]);
    if (!selectedItem) return;

    const analyzer = analyzerList.find(
      (item) => item.name === selectedItem.analyzerName,
    );
    const test = testList.find((item) => {
      const value = String(item.value || "")
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim();
      return (
        value === selectedItem.actualTestName ||
        item.name === selectedItem.actualTestName ||
        item.label === selectedItem.actualTestName
      );
    });

    setEditingItemId(selectedItem.id);
    setTestName(selectedItem.analyzerTestName);
    setSelectedAnalyzer(analyzer || null);
    setSelectedAnalyzerId(analyzer?.id || null);
    setOriginalAnalyzerId(analyzer?.id || null);
    setOriginalAnalyzerTestName(selectedItem.analyzerTestName);
    setSelectedTest(test || null);
    setSelectedTestId(test?.id || null);
    setIsUpdateModalOpen(true);
  };

  const closeUpdateModal = () => {
    setIsUpdateModalOpen(false);
    resetEditor();
  };

  const combinationExists = () =>
    mappings.some(
      (item) =>
        item.id !== editingItemId &&
        item.analyzerName === selectedAnalyzer?.name &&
        item.analyzerTestName === testName.trim(),
    );

  const handleAddAnalyzer = () => {
    if (combinationExists()) {
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "analyzer.combinationName.notification",
        }),
      });
      return;
    }
    setLoading(true);
    postToOpenElisServerFullResponse(
      "/rest/AnalyzerTestName",
      JSON.stringify({
        analyzerId: selectedAnalyzerId,
        analyzerTestName: testName.trim(),
        testId: selectedTestId,
        newMapping: true,
      }),
      showNotificationForResponse,
    );
    setIsAddModalOpen(false);
  };

  const handleUpdateAnalyzer = () => {
    if (!originalAnalyzerId || !originalAnalyzerTestName || !selectedTestId) {
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "error.required.fields" }),
      });
      return;
    }
    setLoading(true);
    postToOpenElisServerFullResponse(
      "/rest/AnalyzerTestName",
      JSON.stringify({
        analyzerId: originalAnalyzerId,
        analyzerTestName: originalAnalyzerTestName,
        testId: selectedTestId,
        newMapping: false,
      }),
      showNotificationForResponse,
    );
    setIsUpdateModalOpen(false);
  };

  const deleteDeactivateAnalyzer = () => {
    if (selectedCount === 0) return;
    setLoading(true);
    postToOpenElisServerFullResponse(
      `/rest/DeleteAnalyzerTestName?ID=${selectedRowIds.join(",")}&startingRecNo=1`,
      JSON.stringify({ selectedIDs: selectedRowIds }),
      showNotificationForResponse,
    );
  };

  const toggleRow = (rowId) => {
    setSelectedRowIds((current) =>
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId],
    );
  };

  const renderCell = (cell, row) => {
    if (cell.info.header === "select") {
      return (
        <TableSelectRow
          key={cell.id}
          id={cell.id}
          checked={selectedRowIds.includes(row.id)}
          name="selectRowCheckbox"
          ariaLabel={intl.formatMessage({ id: "analyzerTestName.row.select" })}
          onSelect={() => toggleRow(row.id)}
        />
      );
    }
    return <TableCell key={cell.id}>{cell.value || "—"}</TableCell>;
  };

  if (loading) return <Loading />;

  const hasFilters = Boolean(filterAnalyzer || searchTerm.trim());
  const currentPageIds = visibleMappings.map((item) => item.id);
  const allCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedRowIds.includes(id));
  const someCurrentPageSelected = currentPageIds.some((id) =>
    selectedRowIds.includes(id),
  );

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <div className="adminPageContent admin-list-workspace analyzer-test-name-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="sidenav.label.admin.analyzerTest" />}
          subtitle={<FormattedMessage id="analyzerTestName.subtitle" />}
          actions={
            <Button size="sm" onClick={openAddModal}>
              <FormattedMessage id="analyzerTestName.action.add" />
            </Button>
          }
        />

        <section className="admin-list-workspace__overview">
          <article>
            <span>
              <FormattedMessage id="analyzerTestName.metric.total" />
            </span>
            <strong>{totalRecordCount || mappings.length}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="analyzerTestName.metric.analyzers" />
            </span>
            <strong>{analyzerCount}</strong>
          </article>
          <article>
            <span>
              <FormattedMessage id="analyzerTestName.metric.selected" />
            </span>
            <strong>{selectedCount}</strong>
          </article>
        </section>

        <section className="admin-list-workspace__surface">
          <div className="admin-list-workspace__section-heading">
            <div>
              <h2>
                <FormattedMessage id="analyzerTestName.list.title" />
              </h2>
              <p>
                <FormattedMessage id="analyzerTestName.list.subtitle" />
              </p>
            </div>
            <div className="admin-list-workspace__selection-actions">
              <span>
                <FormattedMessage
                  id="analyzerTestName.selected"
                  values={{ count: selectedCount }}
                />
              </span>
              <Button
                kind="ghost"
                size="sm"
                disabled={selectedCount !== 1}
                onClick={openUpdateModal}
              >
                <FormattedMessage id="analyzerTestName.action.edit" />
              </Button>
              <Button
                kind="danger--ghost"
                size="sm"
                disabled={selectedCount === 0}
                onClick={deleteDeactivateAnalyzer}
              >
                <FormattedMessage id="analyzerTestName.action.deactivate" />
              </Button>
            </div>
          </div>

          <div className="admin-list-workspace__filters">
            <Search
              size="lg"
              id="analyzer-mapping-search"
              labelText={intl.formatMessage({ id: "analyzerTestName.search" })}
              placeholder={intl.formatMessage({
                id: "analyzerTestName.search.placeholder",
              })}
              closeButtonLabelText={intl.formatMessage({
                id: "analyzerTestName.search.clear",
              })}
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
                setSelectedRowIds([]);
              }}
            />
            <Select
              id="analyzer-filter"
              labelText={intl.formatMessage({ id: "select.label.analyzer" })}
              value={filterAnalyzer}
              onChange={(event) => setFilterAnalyzer(event.target.value)}
            >
              <SelectItem
                value=""
                text={intl.formatMessage({
                  id: "analyzerTestName.filter.allAnalyzers",
                })}
              />
              {analyzerList.map((analyzer) => (
                <SelectItem
                  text={analyzer.name}
                  value={analyzer.id}
                  key={analyzer.id}
                />
              ))}
            </Select>
            <div className="admin-list-workspace__filter-checks">
              <span>
                <FormattedMessage
                  id="analyzerTestName.filter.summary"
                  values={{ count: filteredMappings.length }}
                />
              </span>
            </div>
          </div>

          {filteredMappings.length === 0 ? (
            <div className="admin-list-workspace__empty" role="status">
              <div aria-hidden="true">0</div>
              <h3>
                <FormattedMessage
                  id={
                    hasFilters
                      ? "analyzerTestName.empty.filtered.title"
                      : "analyzerTestName.empty.title"
                  }
                />
              </h3>
              <p>
                <FormattedMessage
                  id={
                    hasFilters
                      ? "analyzerTestName.empty.filtered.subtitle"
                      : "analyzerTestName.empty.subtitle"
                  }
                />
              </p>
              {!hasFilters && (
                <Button size="sm" onClick={openAddModal}>
                  <FormattedMessage id="analyzerTestName.action.add" />
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="admin-list-workspace__table-scroll">
                <DataTable
                  rows={visibleMappings}
                  headers={[
                    {
                      key: "select",
                      header: intl.formatMessage({
                        id: "admin.page.configuration.formEntryConfigMenu.select",
                      }),
                    },
                    {
                      key: "analyzerName",
                      header: intl.formatMessage({
                        id: "analyzerTestName.header.analyzer",
                      }),
                    },
                    {
                      key: "analyzerTestName",
                      header: intl.formatMessage({
                        id: "analyzerTestName.header.sourceCode",
                      }),
                    },
                    {
                      key: "actualTestName",
                      header: intl.formatMessage({
                        id: "label.actualTestName",
                      }),
                    },
                  ]}
                >
                  {({ rows, headers, getHeaderProps, getTableProps }) => (
                    <TableContainer className="admin-list-workspace__table">
                      <Table {...getTableProps()}>
                        <TableHead>
                          <TableRow>
                            <TableSelectAll
                              id="analyzer-mapping-select-all"
                              checked={allCurrentPageSelected}
                              indeterminate={
                                someCurrentPageSelected &&
                                !allCurrentPageSelected
                              }
                              onSelect={() => {
                                setSelectedRowIds((current) =>
                                  allCurrentPageSelected
                                    ? current.filter(
                                        (id) => !currentPageIds.includes(id),
                                      )
                                    : [
                                        ...new Set([
                                          ...current,
                                          ...currentPageIds,
                                        ]),
                                      ],
                                );
                              }}
                            />
                            {headers
                              .filter((header) => header.key !== "select")
                              .map((header) => (
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
                              onClick={() => toggleRow(row.id)}
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
                onChange={({ page: nextPage, pageSize: nextPageSize }) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                  setSelectedRowIds([]);
                }}
                page={page}
                pageSize={pageSize}
                pageSizes={[10, 20]}
                totalItems={filteredMappings.length}
                forwardText={intl.formatMessage({ id: "pagination.forward" })}
                backwardText={intl.formatMessage({ id: "pagination.backward" })}
                itemsPerPageText={intl.formatMessage({
                  id: "pagination.items-per-page",
                })}
                pageNumberText={intl.formatMessage({
                  id: "pagination.page-number",
                })}
              />
            </>
          )}
        </section>

        <Modal
          open={isAddModalOpen}
          size="sm"
          modalHeading={intl.formatMessage({
            id: "analyzerTestName.modal.add.heading",
          })}
          primaryButtonText={intl.formatMessage({ id: "label.button.add" })}
          secondaryButtonText={intl.formatMessage({
            id: "label.button.cancel",
          })}
          primaryButtonDisabled={
            !selectedAnalyzerId || !selectedTestId || !testName.trim()
          }
          onRequestSubmit={handleAddAnalyzer}
          onRequestClose={closeAddModal}
        >
          <Dropdown
            id="analyzer-add-dropdown"
            titleText={intl.formatMessage({
              id: "banner.menu.results.analyzer",
            })}
            items={analyzerList}
            itemToString={(item) => (item ? item.name : "")}
            selectedItem={selectedAnalyzer}
            onChange={({ selectedItem }) => {
              setSelectedAnalyzer(selectedItem);
              setSelectedAnalyzerId(selectedItem?.id || null);
            }}
          />
          <br />
          <Dropdown
            id="test-add-dropdown"
            titleText={intl.formatMessage({ id: "label.actualTestName" })}
            items={testList}
            itemToString={(item) => (item ? item.value : "")}
            selectedItem={selectedTest}
            onChange={({ selectedItem }) => {
              setSelectedTest(selectedItem);
              setSelectedTestId(selectedItem?.id || null);
            }}
          />
          <br />
          <TextInput
            id="analyzer-test-name-add"
            labelText={intl.formatMessage({
              id: "analyzerTestName.field.sourceCode",
            })}
            value={testName}
            onChange={(event) => setTestName(event.target.value)}
            required
          />
        </Modal>

        <Modal
          open={isUpdateModalOpen}
          size="sm"
          modalHeading={intl.formatMessage({
            id: "analyzerTestName.modal.update.heading",
          })}
          primaryButtonText={intl.formatMessage({ id: "label.button.update" })}
          secondaryButtonText={intl.formatMessage({
            id: "label.button.cancel",
          })}
          primaryButtonDisabled={!selectedTestId}
          onRequestSubmit={handleUpdateAnalyzer}
          onRequestClose={closeUpdateModal}
        >
          <Dropdown
            id="analyzer-update-dropdown"
            titleText={intl.formatMessage({
              id: "banner.menu.results.analyzer",
            })}
            items={analyzerList}
            itemToString={(item) => (item ? item.name : "")}
            selectedItem={selectedAnalyzer}
            disabled
          />
          <br />
          <Dropdown
            id="test-update-dropdown"
            titleText={intl.formatMessage({ id: "label.actualTestName" })}
            items={testList}
            itemToString={(item) => (item ? item.value : "")}
            selectedItem={selectedTest}
            onChange={({ selectedItem }) => {
              setSelectedTest(selectedItem);
              setSelectedTestId(selectedItem?.id || null);
            }}
          />
          <br />
          <TextInput
            id="analyzer-test-name-update"
            labelText={intl.formatMessage({
              id: "analyzerTestName.field.sourceCode",
            })}
            value={testName}
            readOnly
          />
        </Modal>
      </div>
    </>
  );
}

export default injectIntl(AnalyzerTestName);
