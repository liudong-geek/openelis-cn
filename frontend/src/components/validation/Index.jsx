import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import SearchForm from "./SearchForm";
import Validation from "./Validation";
import { AlertDialog, NotificationKinds } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";
import { FormattedMessage, useIntl } from "react-intl";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import "./Validation.css";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ReviewReportWorkspaceSwitcher from "./ReviewReportWorkspaceSwitcher";

let breadcrumbs = [{ label: "home.label", link: "/" }];

const Index = () => {
  const { notificationVisible, addNotification, setNotificationVisible } =
    useContext(NotificationContext);
  const intl = useIntl();
  const sessionContext = useContext(UserSessionDetailsContext);
  const { userSessionDetails, sessionPhase, errorLoadingSessionDetails } =
    sessionContext;
  const sessionAvailable =
    userSessionDetails?.authenticated !== false &&
    !errorLoadingSessionDetails &&
    (!sessionPhase || sessionPhase === "authenticated");
  const sessionKey = JSON.stringify([
    userSessionDetails?.authenticated,
    userSessionDetails?.userId,
    userSessionDetails?.sessionId,
    sessionPhase,
    Boolean(errorLoadingSessionDetails),
    userSessionDetails?.loginName,
    userSessionDetails?.csrf,
    [...(userSessionDetails?.roles || [])].sort(),
  ]);
  const resultsSession = useRef(sessionKey);
  const lastSession = useRef(sessionKey);
  const [results, setResults] = useState({ resultList: [] });
  const [params, setParams] = useState("");
  const [queryVersion, setQueryVersion] = useState(0);
  const loadedResults = useRef({ resultList: [] });
  const reviewBaseline = useRef([]);
  const submissionPending = useRef(false);
  const replaceResults = useCallback(
    (nextResults) => {
      resultsSession.current = sessionKey;
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
    },
    [sessionKey],
  );
  useEffect(() => {
    if (lastSession.current === sessionKey) return;
    lastSession.current = sessionKey;
    submissionPending.current = false;
    replaceResults({ resultList: [] });
    addNotification({
      kind: NotificationKinds.warning,
      title: intl.formatMessage({ id: "notification.title" }),
      message: intl.formatMessage({ id: "validation.query.permissionChanged" }),
    });
    setNotificationVisible(true);
  }, [
    sessionKey,
    replaceResults,
    addNotification,
    intl,
    setNotificationVisible,
  ]);
  const beforeQuery = useCallback(() => {
    if (!sessionAvailable) {
      addNotification({
        kind: NotificationKinds.warning,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({
          id: "validation.query.permissionChanged",
        }),
      });
      setNotificationVisible(true);
      return false;
    }
    if (submissionPending.current) {
      addNotification({
        kind: NotificationKinds.warning,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "validation.query.submitting" }),
      });
      setNotificationVisible(true);
      return false;
    }
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
  }, [sessionAvailable, addNotification, intl, setNotificationVisible]);
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        titleId="validation-page-title"
        title={<FormattedMessage id="sidenav.label.validation" />}
        subtitle={<FormattedMessage id="validation.page.subtitle" />}
      />
      <div className="orderLegendBody">
        <ReviewReportWorkspaceSwitcher activeView="review" />
        {notificationVisible === true ? <AlertDialog /> : ""}
        <SearchForm
          key={sessionKey}
          disabled={!sessionAvailable}
          setParams={setParams}
          setResults={replaceResults}
          beforeQuery={beforeQuery}
        />
        <Validation
          key={`${sessionKey}:${queryVersion}`}
          params={params}
          results={
            sessionAvailable && resultsSession.current === sessionKey
              ? results
              : { resultList: [] }
          }
          onContextInvalid={() => replaceResults({ resultList: [] })}
          onSubmissionChange={(pending) => {
            submissionPending.current = pending;
          }}
        />
      </div>
    </>
  );
};

export default Index;
