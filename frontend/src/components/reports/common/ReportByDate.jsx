import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Form,
  FormLabel,
  Grid,
  Column,
  Section,
  SelectItem,
  Select,
  Button,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import "../../Style.css";
import CustomDatePicker from "../../common/CustomDatePicker";
import config from "../../../config.json";
import { Roles, getFromOpenElisServer } from "../../utils/Utils";
import { ConfigurationContext } from "../../layout/Layout";
import {
  buildReportUrl,
  isReportDateRangeValid,
  openReportWindow,
} from "./reportLaunch";

const REPORT_OPTION_CONFIG = {
  activityReportByTest: {
    endpoint: "/rest/test-list",
    labelId: "input.placeholder.selectTest",
    required: true,
  },
  activityReportByPanel: {
    endpoint: "/rest/displayList/PANELS",
    labelId: "input.placeholder.selectPanel",
    required: true,
  },
  activityReportByTestSection: {
    endpoint: `/rest/user-test-sections/${Roles.REPORTS}`,
    labelId: "input.placeholder.selectTestSection",
    required: true,
  },
  CISampleRoutineExport: {
    endpoint: "/rest/user-test-sections/ALL",
    labelId: "input.placeholder.selectTestSection",
    required: false,
  },
};

const ReportByDate = (props) => {
  const intl = useIntl();
  const configuration = useContext(ConfigurationContext);
  const dateLocale =
    configuration?.configurationProperties?.DEFAULT_DATE_LOCALE || "fr-FR";
  const optionConfig = REPORT_OPTION_CONFIG[props.report];
  const [list, setList] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(Boolean(optionConfig));
  const [optionsError, setOptionsError] = useState(false);
  const [launchError, setLaunchError] = useState(false);
  const [reportFormValues, setReportFormValues] = useState({
    startDate: "",
    endDate: "",
    value: "",
    error: "",
  });

  const loadOptions = useCallback(
    (signal = null) => {
      setList([]);
      setOptionsError(false);
      if (!optionConfig) {
        setOptionsLoading(false);
        return;
      }

      setOptionsLoading(true);
      getFromOpenElisServer(
        optionConfig.endpoint,
        (data) => {
          setOptionsLoading(false);
          if (!Array.isArray(data)) {
            setOptionsError(true);
            setList([]);
            return;
          }
          setList(data);
        },
        signal,
      );
    },
    [optionConfig],
  );

  useEffect(() => {
    const controller = new AbortController();
    setReportFormValues((current) => ({
      ...current,
      value: "",
      error: "",
    }));
    setLaunchError(false);
    loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions]);

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
    const { startDate, endDate, value } = reportFormValues;
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
    if (optionConfig?.required && !value) {
      setReportFormValues((current) => ({
        ...current,
        error: "reports.query.validation.selection",
      }));
      return;
    }

    const params = {
      report: props.report,
      upperDateRange: endDate,
      lowerDateRange: startDate,
    };
    if (optionConfig?.required) {
      params.type = "indicator";
      params["selectList.selection"] = value;
    } else if (props.report === "CISampleRoutineExport") {
      params.type = "routine";
      if (value) params["selectList.selection"] = value;
    } else {
      params.type = "patient";
    }

    setReportFormValues((current) => ({ ...current, error: "" }));
    setLaunchError(
      !openReportWindow(buildReportUrl(config.serverBaseUrl, params)),
    );
  };

  const requiredOptionsUnavailable =
    optionConfig?.required &&
    (optionsLoading || optionsError || list.length === 0);

  return (
    <>
      <Grid fullWidth>
        <Column lg={8} md={8} sm={4}>
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
              <Column lg={16} md={8} sm={4}>
                <Section>
                  <br />
                  <br />
                  <h5>
                    <FormattedMessage id="label.select.dateRange" />
                  </h5>
                </Section>
              </Column>
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
              {optionConfig && (
                <Column lg={8} md={8} sm={4}>
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
                        onClick={() => loadOptions()}
                      >
                        <FormattedMessage id="button.retry" />
                      </Button>
                    </>
                  )}
                  {!optionsLoading && !optionsError && list.length === 0 && (
                    <InlineNotification
                      kind="info"
                      lowContrast
                      hideCloseButton
                      title={intl.formatMessage({
                        id: "reports.query.options.empty",
                      })}
                    />
                  )}
                  {!optionsLoading && !optionsError && list.length > 0 && (
                    <Select
                      id="type"
                      labelText={intl.formatMessage({
                        id: "label.form.searchby",
                      })}
                      value={reportFormValues.value}
                      onChange={(event) => {
                        const value = event.target.value;
                        setLaunchError(false);
                        setReportFormValues((current) => ({
                          ...current,
                          value,
                          error: "",
                        }));
                      }}
                    >
                      <SelectItem
                        value=""
                        text={intl.formatMessage({ id: optionConfig.labelId })}
                      />
                      {list.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                          text={option.value}
                        />
                      ))}
                    </Select>
                  )}
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
                  requiredOptionsUnavailable
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

export default ReportByDate;
