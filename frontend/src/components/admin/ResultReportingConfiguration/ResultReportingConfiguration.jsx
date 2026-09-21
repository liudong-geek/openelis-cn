import React, { useContext, useState, useEffect, useRef } from "react";
import {
  Heading,
  TextInput,
  Button,
  Grid,
  Column,
  Section,
  RadioButton,
  Loading,
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
import ReportGroupingConfiguration from "./ReportGroupingConfiguration";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import { refreshCurrentRoute } from "../../utils/NavigationUtils";
import HisResultOutboxPanel from "./HisResultOutboxPanel";
import ProductPageHeader from "../../common/ProductPageHeader";
import "./ResultReportingConfiguration.css";

let breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "resultreporting.browse.title",
    link: "/MasterListsPage/resultReportingConfiguration",
  },
];

function ResultReportingConfiguration() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);

  const componentMounted = useRef(false);

  const intl = useIntl();

  const [loading, setLoading] = useState(false);
  const [reportsResp, setReportsResp] = useState({});
  const [reportsRespPost, setReportsRespPost] = useState({});
  const [saveButton, setSaveButton] = useState(true);
  const [reportsShow, setReportsShow] = useState([]);
  const [reportsShowMinList, setReportsShowMinList] = useState([]);
  const [reportsShowHourList, setReportsShowHourList] = useState([]);

  const fetchPrograms = (programsList) => {
    if (componentMounted.current) {
      setReportsResp(programsList);
    }
  };

  useEffect(() => {
    if (
      reportsResp &&
      reportsResp.reports &&
      reportsResp.hourList &&
      reportsResp.minList
    ) {
      setReportsShow(reportsResp.reports);
      setReportsShowHourList(reportsResp.hourList);
      setReportsShowMinList(reportsResp.minList);

      const postObject = {
        cancelMethod: reportsResp.cancelMethod,
        cancelAction: reportsResp.cancelAction,
        formMethod: reportsResp.formMethod,
        formName: reportsResp.formName,
        reports: reportsResp.reports,
        hourList: reportsResp.hourList,
        minList: reportsResp.minList,
      };
      setReportsRespPost(postObject);
    }
  }, [reportsResp]);

  useEffect(() => {
    setReportsRespPost((prevState) => ({
      ...prevState,
      reports: reportsShow,
      hourList: reportsShowHourList,
      minList: reportsShowMinList,
    }));
  }, [reportsShow, reportsShowHourList, reportsShowMinList]);

  async function displayStatus(res) {
    setNotificationVisible(true);
    if (res) {
      addNotification({
        kind: NotificationKinds.success,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "save.config.success.msg" }),
      });
    } else {
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
    }
    setLoading(false);
    if (res) {
      setReportsResp((current) => ({ ...current, reports: reportsShow }));
      setSaveButton(true);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    postToOpenElisServerJsonResponse(
      "/rest/ResultReportingConfiguration",
      JSON.stringify(reportsRespPost),
      (res) => {
        displayStatus(res);
      },
    );
  }

  const handleRadioChange = (index, value) => {
    const updatedReports = reportsShow.map((report, i) =>
      i === index ? { ...report, enabled: value } : report,
    );
    setReportsShow(updatedReports);
    setSaveButton(false);
  };

  const handleUrlChange = (index, e) => {
    const value = e.target.value.trim();
    const urlPattern =
      /^(https?:\/\/)?(www\.)?[\w-]+\.[a-z]{2,}(\.[a-z]{2,})?$/i;

    if (value && !urlPattern.test(value)) {
      if (!notificationVisible) {
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({
            id: "notification.title",
          }),
          message: intl.formatMessage({
            id: "notification.organization.post.internetAddress",
          }),
          kind: NotificationKinds.info,
        });
      }
    } else {
      setNotificationVisible(false);
    }

    const updatedReports = reportsShow.map((report, i) =>
      i === index ? { ...report, url: e.target.value } : report,
    );
    setReportsShow(updatedReports);
    setSaveButton(false);
  };

  const resetToDefault = () => {
    setReportsShow(reportsResp.reports);
    setReportsShowHourList(reportsResp.hourList);
    setReportsShowMinList(reportsResp.minList);
    setSaveButton(true);
  };

  useEffect(() => {
    componentMounted.current = true;
    getFromOpenElisServer("/rest/ResultReportingConfiguration", fetchPrograms);

    return () => {
      componentMounted.current = false;
    };
  }, []);

  return (
    <>
      {/* {notificationVisible === true ? <AlertDialog /> : ""} */}
      {loading && <Loading />}
      {notificationVisible && <AlertDialog />}
      <div className="adminPageContent">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={<FormattedMessage id="resultreporting.browse.title" />}
          subtitle={
            <FormattedMessage id="resultreporting.workspace.subtitle" />
          }
        />
        <div className="result-reporting-workspace">
          <ReportGroupingConfiguration />
          <HisResultOutboxPanel />
          <div className="result-reporting-workspace__summary">
            <div>
              <strong>{reportsShow.length}</strong>
              <span>
                <FormattedMessage id="resultreporting.summary.channels" />
              </span>
            </div>
            <div>
              <strong>
                {
                  reportsShow.filter((report) => report.enabled === "enable")
                    .length
                }
              </strong>
              <span>
                <FormattedMessage id="resultreporting.summary.enabled" />
              </span>
            </div>
            <div>
              <strong>
                {reportsShow.reduce(
                  (sum, report) => sum + Number(report.backlogSize || 0),
                  0,
                )}
              </strong>
              <span>
                <FormattedMessage id="resultreporting.summary.backlog" />
              </span>
            </div>
          </div>
          <div className="result-reporting-workspace__channels">
            {reportsShow &&
              reportsShow.map((report, index) => (
                <section
                  className="result-reporting-workspace__channel"
                  key={index}
                >
                  <header>
                    <h2>
                      <FormattedMessage id={report.title} />
                    </h2>
                    <Tag type={report.enabled === "enable" ? "green" : "gray"}>
                      <FormattedMessage
                        id={
                          report.enabled === "enable"
                            ? "resultreporting.enabled"
                            : "resultreporting.disabled"
                        }
                      />
                    </Tag>
                  </header>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <RadioButton
                      id={`enabled-${index}-yes`}
                      labelText={intl.formatMessage({
                        id: "resultreporting.enabled",
                      })}
                      value="enable"
                      checked={report.enabled === "enable"}
                      onChange={() => handleRadioChange(index, "enable")}
                    />
                    <RadioButton
                      id={`enabled-${index}-no`}
                      labelText={intl.formatMessage({
                        id: "resultreporting.disabled",
                      })}
                      value="disable"
                      checked={report.enabled === "disable"}
                      onChange={() => handleRadioChange(index, "disable")}
                    />
                  </div>
                  <Grid fullWidth={true}>
                    <Column lg={16} md={8} sm={4}>
                      <TextInput
                        id={`url-${index}`}
                        className="default"
                        type="text"
                        labelText={intl.formatMessage({
                          id: "resultreporting.config.url",
                        })}
                        placeholder={intl.formatMessage({
                          id: "resultreporting.config.url.placeholder",
                        })}
                        required={true}
                        value={report.url || ""}
                        onChange={(e) => handleUrlChange(index, e)}
                      />
                    </Column>
                  </Grid>
                  <p className="result-reporting-workspace__help">
                    <FormattedMessage id="testnotification.patiententry.info" />
                  </p>
                  <div className="result-reporting-workspace__backlog">
                    <span>
                      <FormattedMessage id="result.report.queue.size" />{" "}
                      {report.backlogSize}
                    </span>
                  </div>
                </section>
              ))}
          </div>
          <Grid fullWidth={true}>
            <Column lg={16} md={8} sm={4}>
              <Button
                data-cy="saveButton"
                disabled={saveButton}
                onClick={handleSubmit}
                type="button"
              >
                <FormattedMessage id="label.button.save" />
              </Button>{" "}
              <Button
                data-cy="cancelButton"
                onClick={resetToDefault}
                kind="tertiary"
                type="button"
              >
                <FormattedMessage id="label.button.cancel" />
              </Button>
            </Column>
          </Grid>
        </div>
      </div>
    </>
  );
}

export default injectIntl(ResultReportingConfiguration);
