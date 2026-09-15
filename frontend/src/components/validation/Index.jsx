import React, { useCallback, useContext, useRef, useState } from "react";
import SearchForm from "./SearchForm";
import Validation from "./Validation";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import "./Validation.css";

let breadcrumbs = [{ label: "home.label", link: "/" }];

const Index = () => {
  const { notificationVisible, addNotification, setNotificationVisible } =
    useContext(NotificationContext);
  const intl = useIntl();
  const [results, setResults] = useState({ resultList: [] });
  const [params, setParams] = useState("");
  const [queryVersion, setQueryVersion] = useState(0);
  const loadedResults = useRef({ resultList: [] });
  const reviewBaseline = useRef([]);
  const replaceResults = useCallback((nextResults) => {
    loadedResults.current = nextResults;
    // Validation mutates this batch in place without notifying its parent.
    // Copy the editable values, so the baseline cannot change with that object.
    reviewBaseline.current = (nextResults?.resultList || []).map((row) => [
      row.isAccepted,
      row.isRejected,
      row.note,
    ]);
    setResults(nextResults);
    // The legacy table contains uncontrolled fields and local pagination.
    // Rebuild that state when a query starts or returns a different payload.
    setQueryVersion((version) => version + 1);
  }, []);
  const beforeQuery = useCallback(() => {
    const currentRows = loadedResults.current?.resultList || [];
    const changed =
      currentRows.length !== reviewBaseline.current.length ||
      currentRows.some((row, index) => {
        const original = reviewBaseline.current[index];
        return (
          row.isAccepted !== original[0] ||
          row.isRejected !== original[1] ||
          row.note !== original[2]
        );
      });
    if (!changed) return true;
    addNotification({
      kind: NotificationKinds.warning,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "validation.search.unsaved" }),
    });
    setNotificationVisible(true);
    return false;
  }, [addNotification, intl, setNotificationVisible]);
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="validation-page-title"
        title={<FormattedMessage id="sidenav.label.validation" />}
        subtitle={<FormattedMessage id="validation.page.subtitle" />}
      />
      <div className="orderLegendBody">
        {notificationVisible === true ? <AlertDialog /> : ""}
        <SearchForm
          setParams={setParams}
          setResults={replaceResults}
          beforeQuery={beforeQuery}
        />
        <Validation key={queryVersion} params={params} results={results} />
      </div>
    </>
  );
};

export default Index;
