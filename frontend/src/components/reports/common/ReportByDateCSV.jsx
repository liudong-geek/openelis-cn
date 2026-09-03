import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Form,
  FormLabel,
  Grid,
  Column,
  Section,
  Button,
  Select,
  SelectItem,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import "../../Style.css";
import CustomDatePicker from "../../common/CustomDatePicker";
import config from "../../../config.json";
import { getFromOpenElisServer } from "../../utils/Utils";
import { ConfigurationContext } from "../../layout/Layout";
import {
  buildReportUrl,
  isReportDateRangeValid,
  openReportWindow,
} from "./reportLaunch";

const ReportByDateCSV = (props) => {
  const intl = useIntl();
  const configuration = useContext(ConfigurationContext);
  const dateLocale =
    configuration?.configurationProperties?.DEFAULT_DATE_LOCALE || "fr-FR";
  const [statusOptions, setStatusOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);
  const [launchError, setLaunchError] = useState(false);
  const [reportFormValues, setReportFormValues] = useState({
    startDate: "",
    endDate: "",
    error: "",
    studyType: "",
    dateType: "",
  });

  const loadStudyOptions = useCallback(
    (signal = null) => {
      setOptionsLoading(true);
      setOptionsError(false);
      setStatusOptions([]);
      const endpoint =
        props.report === "CIStudyExport"
          ? "/rest/projects"
          : "/rest/trendsprojects";
      getFromOpenElisServer(
        endpoint,
        (data) => {
          setOptionsLoading(false);
          if (!Array.isArray(data)) {
            setOptionsError(true);
            setStatusOptions([]);
            return;
          }
          setStatusOptions(data);
        },
        signal,
      );
    },
    [props.report],
  );

  useEffect(() => {
    const controller = new AbortController();
    setReportFormValues((current) => ({
      ...current,
      studyType: "",
      dateType: "",
      error: "",
    }));
    setLaunchError(false);
    loadStudyOptions(controller.signal);
    return () => controller.abort();
  }, [loadStudyOptions]);

  const handleDatePickerChangeDate = (datePicker, date) => {
    setLaunchError(false);
    setReportFormValues((current) => ({
      ...current,
      [datePicker]: date,
      error: "",
    }));
  };

  const handleSubmit = (event) => {
    event?.preventDefault();
    const { startDate, endDate, studyType, dateType } = reportFormValues;
    if (!startDate || !endDate) {
      setReportFormValues((current) => ({
        ...current,
        error: "reports.error.dateRangeRequired",
      }));
      return;
    }
    if (!isReportDateRangeValid(startDate, endDate, dateLocale)) {
      setReportFormValues((current) => ({
        ...current,
        error: "reports.error.invalidDateRange",
      }));
      return;
    }
    if (!studyType) {
      setReportFormValues((current) => ({
        ...current,
        error: "error.report.csv.study",
      }));
      return;
    }
    if (props.report === "CIStudyExport" && !dateType) {
      setReportFormValues((current) => ({
        ...current,
        error: "error.report.csv.dateType",
      }));
      return;
    }

    const params = {
      report: props.report,
      type: "patient",
      upperDateRange: endDate,
      lowerDateRange: startDate,
    };
    if (props.report === "CIStudyExport") {
      params.projectCode = studyType;
      params.dateType = dateType;
    } else {
      params.vlStudyType = studyType;
    }

    setReportFormValues((current) => ({ ...current, error: "" }));
    setLaunchError(
      !openReportWindow(buildReportUrl(config.serverBaseUrl, params)),
    );
  };

  const dateOptions = [
    {
      text: intl.formatMessage({ id: "reports.query.dateType.order" }),
      value: "ORDER_DATE",
    },
    {
      text: intl.formatMessage({ id: "reports.query.dateType.result" }),
      value: "RESULT_DATE",
    },
    {
      text: intl.formatMessage({ id: "reports.query.dateType.print" }),
      value: "PRINT_DATE",
    },
  ];

  return (
    <>
      <Grid>
        <Column lg={16} md={8} sm={4}>
          <FormLabel>
            <Section>
              <Section>
                <h1>
                  <FormattedMessage id={props.id ?? props.report} />
                </h1>
              </Section>
            </Section>
          </FormLabel>
        </Column>
      </Grid>
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <Form onSubmit={handleSubmit}>
            <Grid fullWidth>
              <Column lg={4} md={4} sm={4}>
                <CustomDatePicker
                  id="startDate"
                  labelText={intl.formatMessage({ id: "eorder.date.start" })}
                  disallowFutureDate
                  autofillDate
                  value={reportFormValues.startDate}
                  onChange={(date) =>
                    handleDatePickerChangeDate("startDate", date)
                  }
                />
              </Column>
              <Column lg={4} md={4} sm={4}>
                <CustomDatePicker
                  id="endDate"
                  labelText={intl.formatMessage({ id: "eorder.date.end" })}
                  disallowFutureDate
                  autofillDate
                  value={reportFormValues.endDate}
                  onChange={(date) =>
                    handleDatePickerChangeDate("endDate", date)
                  }
                />
              </Column>
              <Column lg={16}>
                <br />
              </Column>
              <Column lg={8} md={4} sm={4}>
                {optionsLoading && (
                  <InlineLoading
                    description={intl.formatMessage({
                      id: "reports.query.options.loading",
                    })}
                  />
                )}
                {optionsError && (
                  <>
                    <InlineNotification
                      kind="error"
                      lowContrast
                      hideCloseButton
                      title={intl.formatMessage({
                        id: "reports.query.options.loadError.title",
                      })}
                      subtitle={intl.formatMessage({
                        id: "reports.query.options.loadError.subtitle",
                      })}
                    />
                    <Button
                      type="button"
                      kind="tertiary"
                      size="sm"
                      onClick={() => loadStudyOptions()}
                    >
                      <FormattedMessage id="button.retry" />
                    </Button>
                  </>
                )}
                {!optionsLoading &&
                  !optionsError &&
                  statusOptions.length === 0 && (
                    <InlineNotification
                      kind="info"
                      lowContrast
                      hideCloseButton
                      title={intl.formatMessage({
                        id: "reports.query.options.empty",
                      })}
                    />
                  )}
                {!optionsLoading &&
                  !optionsError &&
                  statusOptions.length > 0 && (
                    <Select
                      id="studyType"
                      labelText={intl.formatMessage({
                        id: "report.select.studttype",
                      })}
                      value={reportFormValues.studyType}
                      onChange={(event) => {
                        const studyType = event.target.value;
                        setLaunchError(false);
                        setReportFormValues((current) => ({
                          ...current,
                          studyType,
                          error: "",
                        }));
                      }}
                    >
                      <SelectItem
                        value=""
                        text={intl.formatMessage({
                          id: "reports.query.study.placeholder",
                        })}
                      />
                      {statusOptions.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                          text={option.value}
                        />
                      ))}
                    </Select>
                  )}
              </Column>
              <Column lg={16}>
                <br />
              </Column>
              {props.report === "CIStudyExport" && (
                <Column lg={8} md={4} sm={4}>
                  <Select
                    id="dateType"
                    labelText={intl.formatMessage({
                      id: "report.label.site.dateType",
                    })}
                    value={reportFormValues.dateType}
                    onChange={(event) => {
                      const dateType = event.target.value;
                      setLaunchError(false);
                      setReportFormValues((current) => ({
                        ...current,
                        dateType,
                        error: "",
                      }));
                    }}
                  >
                    <SelectItem
                      value=""
                      text={intl.formatMessage({
                        id: "reports.query.dateType.placeholder",
                      })}
                    />
                    {dateOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        text={option.text}
                      />
                    ))}
                  </Select>
                </Column>
              )}
            </Grid>
            <Section>
              <br />
              {reportFormValues.error && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title={intl.formatMessage({
                    id: "reports.query.validation.title",
                  })}
                  subtitle={intl.formatMessage({
                    id: reportFormValues.error,
                  })}
                />
              )}
              {launchError && (
                <InlineNotification
                  kind="error"
                  lowContrast
                  hideCloseButton
                  title={intl.formatMessage({
                    id: "reports.query.error.title",
                  })}
                  subtitle={intl.formatMessage({
                    id: "reports.query.popupBlocked",
                  })}
                />
              )}
              <Button
                data-cy="printableVersion"
                type="submit"
                disabled={
                  !reportFormValues.startDate ||
                  !reportFormValues.endDate ||
                  optionsLoading ||
                  optionsError ||
                  statusOptions.length === 0
                }
              >
                <FormattedMessage id="label.button.generatePrintableVersion" />
              </Button>
            </Section>
          </Form>
        </Column>
      </Grid>
    </>
  );
};

export default ReportByDateCSV;
