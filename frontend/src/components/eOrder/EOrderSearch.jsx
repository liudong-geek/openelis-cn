import {
  Button,
  Checkbox,
  Column,
  InlineLoading,
  Link,
  Select,
  SelectItem,
  TextInput,
} from "@carbon/react";
import { React, useEffect, useState, useContext } from "react";
import CustomDatePicker from "../common/CustomDatePicker";
import { ArrowLeft, ArrowRight, Filter } from "@carbon/react/icons";
import { FormattedMessage, useIntl } from "react-intl";
import { getFromOpenElisServer } from "../utils/Utils";
import { NotificationContext } from "../layout/Layout";
import { NotificationKinds, AlertDialog } from "../common/CustomNotification";

// 电子申请处理状态的中文映射（中国医院版本地化）
// 兼容两种来源值：数据库名（getDefaultLocalizedName）与 message_en 翻译（getLocalizedName）
const ORDER_STATUS_LABELS = {
  Entered: "已录入",
  Cancelled: "已取消",
  Realized: "已实现",
  NonConforming: "不符合",
  AwaitingSpecimen: "待确定标本",
  "Awaiting specimen": "待确定标本",
  "Non-conforming order": "不符合",
};

function mapOrderStatusLabel(value) {
  const trimmed = (value || "").trim();
  return ORDER_STATUS_LABELS[trimmed] || value;
}

const EOrderSearch = ({
  setEOrders = (eOrders) => {
    console.debug("set EOrders default");
  },
  eOrderRef,
}) => {
  const intl = useIntl();

  const [searchMode, setSearchMode] = useState("identifier");
  const [searchValue, setSearchValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusId, setStatusId] = useState("");
  const [statusOptions, setStatusOptions] = useState([]);
  const [allInfo, setAllInfo] = useState(false);
  const [allInfo2, setAllInfo2] = useState(false);
  const [nextPage, setNextPage] = useState(null);
  const [previousPage, setPreviousPage] = useState(null);
  const [pagination, setPagination] = useState(false);
  const [currentApiPage, setCurrentApiPage] = useState(null);
  const [totalApiPages, setTotalApiPages] = useState(null);
  const [loading, setLoading] = useState(true);
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  useEffect(() => {
    loadDefaultOrders();
    getFromOpenElisServer(
      "/rest/displayList/ELECTRONIC_ORDER_STATUSES",
      handleOrderStatus,
    );
  }, []);

  const handleOrderStatus = (response) => {
    setStatusOptions(Array.isArray(response) ? response : []);
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
  };

  function loadDefaultOrders() {
    const params = new URLSearchParams({
      searchType: "DATE_STATUS",
      startDate: "",
      endDate: "",
      statusId: "",
      useAllInfo: "false",
    });
    setLoading(true);
    getFromOpenElisServer(
      "/rest/ElectronicOrders?" + params.toString(),
      (response) => parseEOrders(response, { notifyEmpty: false }),
    );
  }

  function searchByIdentifier() {
    if (!searchValue.trim()) {
      loadDefaultOrders();
      return;
    }
    const params = new URLSearchParams({
      searchType: "IDENTIFIER",
      searchValue: searchValue.trim(),
      useAllInfo: allInfo,
    });
    setLoading(true);
    getFromOpenElisServer(
      "/rest/ElectronicOrders?" + params.toString(),
      parseEOrders,
    );
  }

  function searchByDateAndStatus() {
    const params = new URLSearchParams({
      searchType: "DATE_STATUS",
      startDate: startDate,
      endDate: endDate,
      statusId: statusId,
      useAllInfo: allInfo2,
    });
    setLoading(true);
    getFromOpenElisServer(
      "/rest/ElectronicOrders?" + params.toString(),
      parseEOrders,
    );
  }

  const parseEOrders = (response, { notifyEmpty = true } = {}) => {
    const orders = Array.isArray(response?.eOrders) ? response.eOrders : [];
    if (response && response.paging) {
      const { totalPages, currentPage } = response.paging;
      if (totalPages > 1) {
        setPagination(true);
        setCurrentApiPage(currentPage);
        setTotalApiPages(totalPages);
        if (parseInt(currentPage) < parseInt(totalPages)) {
          setNextPage(parseInt(currentPage) + 1);
        } else {
          setNextPage(null);
        }

        if (parseInt(currentPage) > 1) {
          setPreviousPage(parseInt(currentPage) - 1);
        } else {
          setPreviousPage(null);
        }
      } else {
        setNextPage(null);
        setPreviousPage(null);
        setPagination(false);
      }
    }
    setEOrders(
      orders.map((item) => {
        return { ...item, id: item.electronicOrderId };
      }),
    );
    if (eOrderRef?.current) {
      window.scrollTo({
        top: eOrderRef.current.offsetTop - 50,
        left: 0,
        behavior: "smooth",
      });
    }
    if (orders.length === 0 && notifyEmpty) {
      addNotification({
        kind: NotificationKinds.warning,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "eorder.search.noresults",
        }),
      });
      setNotificationVisible(true);
    }
    setLoading(false);
  };

  const loadNextResultsPage = () => {
    setLoading(true);
    getFromOpenElisServer(
      "/rest/ElectronicOrders?page=" + nextPage,
      parseEOrders,
    );
  };

  const loadPreviousResultsPage = () => {
    setLoading(true);
    getFromOpenElisServer(
      "/rest/ElectronicOrders?page=" + previousPage,
      parseEOrders,
    );
  };

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : ""}
      <Column lg={16} md={8} sm={4}>
        <section
          className="eorder-search-panel"
          aria-labelledby="eorder-search-title"
        >
          <div className="eorder-search-panel__heading">
            <div>
              <h2 id="eorder-search-title">
                <FormattedMessage id="eorder.search.title" />
              </h2>
              <p>
                <FormattedMessage
                  id={
                    searchMode === "identifier"
                      ? "eorder.search1.text"
                      : "eorder.search2.text"
                  }
                />
              </p>
            </div>
            <div
              className="eorder-search-modes"
              role="group"
              aria-label={intl.formatMessage({ id: "eorder.search.mode" })}
            >
              <Button
                type="button"
                size="sm"
                kind={searchMode === "identifier" ? "primary" : "ghost"}
                onClick={() => setSearchMode("identifier")}
              >
                <FormattedMessage id="eorder.search.mode.identifier" />
              </Button>
              <Button
                type="button"
                size="sm"
                kind={searchMode === "dateStatus" ? "primary" : "ghost"}
                renderIcon={Filter}
                onClick={() => setSearchMode("dateStatus")}
              >
                <FormattedMessage id="eorder.search.mode.dateStatus" />
              </Button>
            </div>
          </div>

          {searchMode === "identifier" ? (
            <div className="eorder-search-controls eorder-search-controls--identifier">
              <TextInput
                id="searchValue"
                labelText={intl.formatMessage({ id: "eorder.searchValue" })}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchByIdentifier();
                }}
              />
              <Checkbox
                id="allInfo1"
                labelText={intl.formatMessage({ id: "eorder.allInfo" })}
                checked={allInfo}
                onChange={(e) => setAllInfo(e.currentTarget.checked)}
              />
              <Button onClick={searchByIdentifier}>
                <FormattedMessage id="label.button.search" />
              </Button>
            </div>
          ) : (
            <div className="eorder-search-controls eorder-search-controls--date-status">
              <CustomDatePicker
                id="eOrder_startDate"
                labelText={intl.formatMessage({ id: "eorder.date.start" })}
                value={startDate}
                className="inputDate"
                onChange={(date) => setStartDate(date)}
              />
              <CustomDatePicker
                id="eOrder_endDate"
                labelText={intl.formatMessage({ id: "eorder.date.end" })}
                value={endDate}
                className="inputDate"
                onChange={(date) => setEndDate(date)}
              />
              <Select
                id="statusId"
                labelText={intl.formatMessage({ id: "eorder.status" })}
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
              >
                <SelectItem
                  value=""
                  text={intl.formatMessage({ id: "order.status.all" })}
                />
                {statusOptions.map((statusOption, index) => (
                  <SelectItem
                    key={index}
                    value={statusOption.id}
                    text={mapOrderStatusLabel(statusOption.value)}
                  />
                ))}
              </Select>
              <Checkbox
                id="allInfo2"
                labelText={intl.formatMessage({ id: "eorder.allInfo" })}
                checked={allInfo2}
                onChange={(e) => setAllInfo2(e.currentTarget.checked)}
              />
              <Button onClick={searchByDateAndStatus}>
                <FormattedMessage id="label.button.search" />
              </Button>
            </div>
          )}

          <div className="eorder-search-feedback" aria-live="polite">
            {loading && (
              <InlineLoading
                description={intl.formatMessage({ id: "loading.description" })}
              />
            )}
          </div>

          {pagination && (
            <div className="eorder-search-pagination">
              <Link
                aria-label={intl.formatMessage(
                  { id: "pagination.page" },
                  { page: currentApiPage },
                )}
              >
                {currentApiPage} / {totalApiPages}
              </Link>
              <div>
                <Button
                  hasIconOnly
                  id="loadpreviousresults"
                  onClick={loadPreviousResultsPage}
                  disabled={previousPage != null ? false : true}
                  renderIcon={ArrowLeft}
                  iconDescription={intl.formatMessage({
                    id: "pagination.previous",
                  })}
                ></Button>
                <Button
                  hasIconOnly
                  id="loadnextresults"
                  onClick={loadNextResultsPage}
                  disabled={nextPage != null ? false : true}
                  renderIcon={ArrowRight}
                  iconDescription={intl.formatMessage({
                    id: "pagination.next",
                  })}
                ></Button>
              </div>
            </div>
          )}
        </section>
      </Column>
    </>
  );
};

export default EOrderSearch;
