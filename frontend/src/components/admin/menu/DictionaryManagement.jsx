import { ArrowLeft, ArrowRight } from "@carbon/icons-react";
import {
  Button,
  DataTable,
  Dropdown,
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
  TableSelectRow,
  TextInput,
} from "@carbon/react";
import React, { useContext, useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import "../../Style.css";
import "../AdminListWorkspace.css";
import {
  getFromOpenElisServer,
  postToOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { refreshCurrentRoute } from "../../utils/NavigationUtils";

function DictionaryManagement() {
  const intl = useIntl();
  const componentMounted = useRef(false);
  const dirtyFieldsRef = useRef(new Set());

  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { reloadConfiguration } = useContext(ConfigurationContext);
  const [dictionaryMenuList, setDictionaryMenuList] = useState([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);

  const [categoryDescription, setCategoryDescription] = useState([]);

  const [category, setCategory] = useState("");
  const [dictionaryNumber, setDictionaryNumber] = useState("");
  const [dictionaryEntry, setDictionaryEntry] = useState("");
  const [localAbbreviation, setLocalAbbreviation] = useState("");
  const [isActive, setIsActive] = useState("");
  const [loincCode, setLoincCode] = useState("");

  const [fromRecordCount, setFromRecordCount] = useState("1");
  const [toRecordCount, setToRecordCount] = useState("");
  const [totalRecordCount, setTotalRecordCount] = useState("");
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [modifyButton, setModifyButton] = useState(true);
  const [deactivateButton, setDeactivateButton] = useState(true);
  const [editMode, setEditMode] = useState(true);

  const [paging, setPaging] = useState(null);
  const [startingRecNo, setStartingRecNo] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [panelSearchTerm, setPanelSearchTerm] = useState("");
  const [searchedMenuList, setSearchedMenuList] = useState([]);

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer(
      `/rest/DictionaryMenu?paging=${paging}&startingRecNo=${startingRecNo}`,
      fetchedDictionaryMenu,
    );
    return () => {
      componentMounted.current = false;
    };
  }, [paging, startingRecNo]);

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

  const handleNextPage = () => {
    setPaging((pager) => Math.max(pager, 2));
    setStartingRecNo(fromRecordCount);
    setSelectedRowIds([]);
  };

  const handlePreviousPage = () => {
    setPaging((pager) => Math.max(pager - 1, 1));
    setStartingRecNo(Math.max(fromRecordCount, 1));
    setSelectedRowIds([]);
  };

  const yesOrNo = [
    {
      id: "Y",
      value: "Y",
    },
    {
      id: "N",
      value: "N",
    },
  ];

  const handlePageChange = (pageInfo) => {
    if (page != pageInfo.page) {
      setPage(pageInfo.page);
    }

    if (pageSize != pageInfo.pageSize) {
      setPageSize(pageInfo.pageSize);
    }
  };

  const fetchedDictionaryMenu = (res) => {
    if (componentMounted.current) {
      if (res) {
        if (
          res.toRecordCount !== undefined &&
          res.fromRecordCount !== undefined &&
          res.totalRecordCount !== undefined
        ) {
          setToRecordCount(res.toRecordCount);
          setFromRecordCount(res.fromRecordCount);
          setTotalRecordCount(res.totalRecordCount);
        }
        if (res.menuList) {
          const menuList = res.menuList.map((item) => ({
            id: item.id,
            dictEntry: item.dictEntry,
            localAbbreviation: item.localAbbreviation,
            isActive: item.isActive,
            loincCode: item.loincCode || "",
            categoryName: item.dictionaryCategory
              ? item.dictionaryCategory.categoryName
              : intl.formatMessage({ id: "not.available" }),
            lastupdated: item.lastupdated,
          }));
          setDictionaryMenuList(menuList);
        }
      }
    }
  };

  const fetchedDictionaryCategory = (category) => {
    if (componentMounted.current) {
      setCategoryDescription(category);
    }
  };

  useEffect(() => {
    if (panelSearchTerm) {
      getFromOpenElisServer(
        `/rest/SearchDictionaryMenu?search=Y&startingRecNo=1&searchString=${panelSearchTerm}`,
        fetchedSearchedDictionaryMenu,
      );
    } else {
      setSearchedMenuList([]);
    }
  }, [panelSearchTerm]);

  const fetchedSearchedDictionaryMenu = (res) => {
    if (componentMounted.current) {
      if (res) {
        if (
          res.toRecordCount !== undefined &&
          res.fromRecordCount !== undefined &&
          res.totalRecordCount !== undefined
        ) {
          setToRecordCount(res.toRecordCount);
          setFromRecordCount(res.fromRecordCount);
          setTotalRecordCount(res.totalRecordCount);
        }
        if (res.menuList) {
          const menuList = res.menuList.map((item) => ({
            id: item.id,
            dictEntry: item.dictEntry,
            localAbbreviation: item.localAbbreviation,
            isActive: item.isActive,
            loincCode: item.loincCode || "",
            categoryName: item.dictionaryCategory
              ? item.dictionaryCategory.categoryName
              : intl.formatMessage({ id: "not.available" }),
            lastupdated: item.lastupdated,
          }));
          setSearchedMenuList(menuList);
        }
      }
    }
  };

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer("/rest/DictionaryMenu", fetchedDictionaryMenu);
    return () => {
      componentMounted.current = false;
    };
  }, []);

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer(
      "/rest/dictionary-categories",
      fetchedDictionaryCategory,
    );
    return () => {
      componentMounted.current = false;
    };
  }, []);

  const postData = {
    id: dictionaryNumber,
    selectedDictionaryCategoryId: category?.id,
    dictEntry: dictionaryEntry,
    localAbbreviation: localAbbreviation,
    isActive: isActive.id,
    loincCode: loincCode.trim() || null,
    dirtyFormFields: "",
  };

  async function displayStatus(res) {
    setNotificationVisible(true);
    if (res.status == "201" || res.status == "200") {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "success.add.edited.msg" }),
      });
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "error.add.edited.msg" }),
      });
    }
    refreshCurrentRoute();
  }

  const handleSubmitModal = (e) => {
    e.preventDefault();
    postToOpenElisServerFullResponse(
      "/rest/Dictionary",
      JSON.stringify(postData),
      displayStatus,
    );
    setOpen(false);
    setEditMode(true);
  };

  const handleUpdateModal = (e) => {
    e.preventDefault();

    if (!componentMounted.current[dictionaryEntry]) {
      dirtyFieldsRef.current.add("dictEntry");
    }

    if (!componentMounted.current[isActive]) {
      dirtyFieldsRef.current.add("isActive");
    }

    if (!componentMounted.current[localAbbreviation]) {
      dirtyFieldsRef.current.add("localAbbreviation");
    }

    const dirtyFields =
      dirtyFieldsRef.current.size > 0
        ? `;${[...dirtyFieldsRef.current].join(";")}`
        : "";

    const updateData = {
      id: dictionaryNumber,
      selectedDictionaryCategoryId: category.id,
      dictEntry: dictionaryEntry,
      localAbbreviation: localAbbreviation,
      isActive: isActive.id,
      loincCode: loincCode.trim() || null,
      dirtyFormFields: dirtyFields,
    };

    postToOpenElisServerFullResponse(
      `/rest/Dictionary?ID=${selectedRowIds[0]}&startingRecNo=${startingRecNo}`,
      JSON.stringify(updateData),
      displayStatus,
    );
    setOpen(false);
    setEditMode(true);
  };

  const renderCell = (cell, row) => {
    if (cell.info.header === "select") {
      return (
        <TableSelectRow
          key={cell.id}
          id={cell.id}
          checked={selectedRowIds.includes(row.id)}
          name="selectRowRadio"
          ariaLabel={intl.formatMessage({
            id: "admin.page.configuration.formEntryConfigMenu.select",
          })}
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
    } else if (
      cell.info.header === "value" &&
      typeof cell.value === "string" &&
      cell.value.startsWith("data:image")
    ) {
      return (
        <TableCell key={cell.id}>
          <img
            src={cell.value}
            alt={intl.formatMessage({ id: "dictionary.image.alt" })}
            style={{ maxWidth: "50px" }}
          />
        </TableCell>
      );
    }
    return (
      <TableCell key={cell.id} data-cy={`cell-${cell.info.header}-${row.id}`}>
        {cell.value}
      </TableCell>
    );
  };

  const handleDictionaryMenuItems = (res) => {
    if (componentMounted.current) {
      setDictionaryNumber(res.id);
      setCategory(res.dictionaryCategory);
      setDictionaryEntry(res.dictEntry);
      setIsActive(yesOrNo.find((item) => item.id === res.isActive));
      setLocalAbbreviation(res.localAbbreviation);
      setLoincCode(res.loincCode || "");
    }
  };

  const handleOnClickOnModification = async (event) => {
    event.preventDefault();
    if (selectedRowIds.length == 1) {
      const selectedItem = dictionaryMenuList.find(
        (item) => item.id === selectedRowIds[0],
      );

      if (selectedItem) {
        setDictionaryNumber(selectedItem.id);
        setCategory(selectedItem.category);
        setDictionaryEntry(selectedItem.dictEntry);
        setLocalAbbreviation(selectedItem.localAbbreviation);
        setIsActive(yesOrNo.find((item) => item.id === selectedItem.isActive));
        setLoincCode(selectedItem.loincCode);
        setOpen(true);
        setEditMode(false);
      }

      getFromOpenElisServer(
        `/rest/Dictionary?ID=${selectedRowIds[0]}&startingRecNo=${startingRecNo}`,
        handleDictionaryMenuItems,
      );
      setOpen(true);
      setEditMode(false);
    }
  };

  const handleDeactivation = async (event) => {
    event.preventDefault();
    if (selectedRowIds) {
      postToOpenElisServer(
        `/rest/DeleteDictionary?ID=${selectedRowIds.join(",")}`,
        {},
        handleDelete,
      );
    }
    reloadConfiguration();
  };

  const handleDelete = (status) => {
    setNotificationVisible(true);
    if (status == "200") {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "dictionary.menu.deactivate.success",
        }),
      });
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "dictionary.menu.deactivate.fail" }),
      });
    }
    refreshCurrentRoute();
  };

  const handlePanelSearchChange = (event) => {
    const query = event.target.value;
    setPanelSearchTerm(query);
    setPage(1);
    if (query) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  };

  const visibleDictionaryRows = isSearching
    ? searchedMenuList
    : dictionaryMenuList;

  return (
    <div className="adminPageContent admin-list-workspace admin-list-workspace--compact dictionary-management-page">
      {notificationVisible === true ? <AlertDialog /> : ""}
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
          {
            label: "dictionary.label.modify",
            link: "/MasterListsPage/DictionaryMenu",
          },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="dictionary.label.modify" />}
        subtitle={<FormattedMessage id="dictionary.workspace.subtitle" />}
        actions={
          <Button
            data-cy="addButton"
            onClick={() => {
              setDictionaryNumber("");
              setCategory("");
              setDictionaryEntry("");
              setLocalAbbreviation("");
              setIsActive("");
              setLoincCode("");
              setEditMode(true);
              setOpen(true);
            }}
          >
            <FormattedMessage id="admin.page.configuration.formEntryConfigMenu.button.add" />
          </Button>
        }
      />

      <section className="admin-list-workspace__surface">
        <header className="admin-list-workspace__section-heading">
          <div>
            <h2>
              <FormattedMessage id="dictionary.workspace.list.title" />
            </h2>
            <p>
              <FormattedMessage id="dictionary.workspace.list.description" />
            </p>
          </div>
          <div className="admin-list-workspace__selection-actions">
            <span>
              <FormattedMessage
                id="dictionary.workspace.selected"
                values={{ count: selectedRowIds.length }}
              />
            </span>
            <Button
              data-cy="modifyButton"
              kind="secondary"
              size="sm"
              disabled={modifyButton}
              type="button"
              onClick={handleOnClickOnModification}
            >
              <FormattedMessage id="admin.page.configuration.formEntryConfigMenu.button.modify" />
            </Button>
            <Button
              data-cy="deactivateButton"
              kind="danger--tertiary"
              size="sm"
              disabled={deactivateButton}
              onClick={handleDeactivation}
              type="button"
            >
              <FormattedMessage id="admin.page.configuration.formEntryConfigMenu.button.deactivate" />
            </Button>
          </div>
        </header>

        <div className="admin-list-workspace__filters admin-list-workspace__filters--search-only dictionary-management-page__filters">
          <Search
            size="lg"
            id="dictionary-entry-search"
            labelText={intl.formatMessage({
              id: "search.by.dictionary.entry",
            })}
            placeholder={intl.formatMessage({
              id: "search.by.dictionary.entry",
            })}
            closeButtonLabelText={intl.formatMessage({
              id: "admin.dashboard.search.clear",
            })}
            onChange={handlePanelSearchChange}
            value={panelSearchTerm || ""}
          />
          <div className="dictionary-management-page__server-pagination">
            <p>
              <FormattedMessage id="showing" /> {fromRecordCount}–
              {toRecordCount} <FormattedMessage id="of" /> {totalRecordCount}
            </p>
            <div>
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                iconDescription={intl.formatMessage({
                  id: "organization.previous",
                })}
                disabled={parseInt(fromRecordCount) <= 1}
                onClick={handlePreviousPage}
                renderIcon={ArrowLeft}
              />
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                iconDescription={intl.formatMessage({
                  id: "organization.next",
                })}
                renderIcon={ArrowRight}
                onClick={handleNextPage}
                disabled={parseInt(toRecordCount) >= parseInt(totalRecordCount)}
              />
            </div>
          </div>
        </div>

        <div className="admin-list-workspace__table-scroll">
          <DataTable
            size="sm"
            rows={visibleDictionaryRows.slice(
              (page - 1) * pageSize,
              page * pageSize,
            )}
            headers={[
              {
                key: "select",
                header: intl.formatMessage({
                  id: "admin.page.configuration.formEntryConfigMenu.select",
                }),
              },
              {
                key: "categoryName",
                header: intl.formatMessage({
                  id: "dictionary.category.name",
                }),
              },
              {
                key: "dictEntry",
                header: intl.formatMessage({ id: "dictionary.dictEntry" }),
              },
              {
                key: "localAbbreviation",
                header: intl.formatMessage({
                  id: "dictionary.category.localAbbreviation",
                }),
              },
              {
                key: "isActive",
                header: intl.formatMessage({
                  id: "dictionary.category.isActive",
                }),
              },
              {
                key: "loincCode",
                header: intl.formatMessage({ id: "dictionary.loincCode" }),
              },
            ]}
            isSortable
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
          totalItems={visibleDictionaryRows.length}
          forwardText={intl.formatMessage({ id: "pagination.forward" })}
          backwardText={intl.formatMessage({ id: "pagination.backward" })}
          size="sm"
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
      </section>

      <Modal
        open={open}
        size="sm"
        onRequestClose={() => {
          setOpen(false);
          setEditMode(true);
        }}
        modalHeading={
          editMode
            ? intl.formatMessage({ id: "dictionary.modal.add.heading" })
            : intl.formatMessage({ id: "dictionary.modal.edit.heading" })
        }
        primaryButtonText={
          editMode
            ? intl.formatMessage({ id: "label.button.add" })
            : intl.formatMessage({ id: "label.button.update" })
        }
        secondaryButtonText={intl.formatMessage({
          id: "label.button.cancel",
        })}
        onRequestSubmit={editMode ? handleSubmitModal : handleUpdateModal}
      >
        <div className="dictionary-management-page__editor">
          <TextInput
            data-modal-primary-focus
            id="dictNumber"
            labelText={intl.formatMessage({ id: "dictionary.number.label" })}
            disabled
            value={dictionaryNumber}
            onChange={(event) => setDictionaryNumber(event.target.value)}
          />
          <Dropdown
            id="description"
            label=""
            type="default"
            items={categoryDescription}
            titleText={intl.formatMessage({
              id: "dictionary.category.label",
            })}
            itemToString={(item) => (item ? item.description : "")}
            onChange={({ selectedItem }) => setCategory(selectedItem)}
            selectedItem={category}
            size="md"
          />
          <TextInput
            id="dictEntry"
            labelText={intl.formatMessage({ id: "dictionary.dictEntry" })}
            value={dictionaryEntry}
            onChange={(event) => setDictionaryEntry(event.target.value)}
          />
          <Dropdown
            id="isActive"
            type="default"
            label=""
            items={yesOrNo}
            titleText={intl.formatMessage({
              id: "dictionary.category.isActive",
            })}
            itemToString={(item) => (item ? item.id : "")}
            onChange={({ selectedItem }) => setIsActive(selectedItem)}
            selectedItem={isActive}
            size="md"
          />
          <TextInput
            id="localAbbrev"
            labelText={intl.formatMessage({
              id: "dictionary.category.localAbbreviation",
            })}
            value={localAbbreviation}
            onChange={(event) => setLocalAbbreviation(event.target.value)}
          />
          <TextInput
            id="loincCode"
            labelText={intl.formatMessage({ id: "dictionary.loincCode" })}
            value={loincCode}
            onChange={(event) => setLoincCode(event.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}

export default DictionaryManagement;
