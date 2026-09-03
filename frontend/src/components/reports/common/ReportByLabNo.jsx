import React, { useState } from "react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import {
  Form,
  Grid,
  Column,
  Section,
  Button,
  InlineNotification,
} from "@carbon/react";
import CustomLabNumberInput from "../../common/CustomLabNumberInput";
import config from "../../../config.json";
import { buildReportUrl, openReportWindow } from "./reportLaunch";

function ReportByLabNo(props) {
  const intl = useIntl();
  const [values, setValues] = useState({ from: "", to: "" });
  const [validationError, setValidationError] = useState("");
  const [launchError, setLaunchError] = useState(false);

  const handleChange = (fieldName, event, rawValue) => {
    const value = rawValue ?? event?.target?.value ?? "";
    setValues((prevState) => ({
      ...prevState,
      [fieldName]: value,
    }));
    setValidationError("");
    setLaunchError(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const from = values.from.trim();
    const to = values.to.trim();
    if (!from && !to) {
      setValidationError(
        intl.formatMessage({ id: "reports.query.validation.labNumber" }),
      );
      return;
    }

    // A single number is an exact query. A two-value entry is a range.
    const url = buildReportUrl(config.serverBaseUrl, {
      report: props.report,
      type: "patient",
      accessionDirect: from || to,
      highAccessionDirect: to || from,
    });
    setValidationError("");
    setLaunchError(!openReportWindow(url));
  };

  return (
    <>
      <Form onSubmit={handleSubmit}>
        {launchError && (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "reports.query.error.title" })}
            subtitle={intl.formatMessage({
              id: "reports.query.popupBlocked",
            })}
          />
        )}
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <h3>
                <FormattedMessage id={props.id} />
              </h3>
            </Section>
          </Column>
        </Grid>
        <Grid fullWidth={true}>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <h5>
                <FormattedMessage id="report.enter.labNumber.headline" />
              </h5>
              <p>
                <FormattedMessage id="sample.search.scanner.instructions" />
              </p>
            </Section>
          </Column>
        </Grid>
        <br />
        <Grid fullWidth={true}>
          <Column lg={7} md={4} sm={3}>
            <CustomLabNumberInput
              name="from"
              value={values.from}
              labelText={intl.formatMessage({
                id: "reports.query.labNumber.from",
              })}
              id="from"
              onChange={(event, rawValue) =>
                handleChange("from", event, rawValue)
              }
              invalid={!!validationError}
              invalidText={validationError}
            />
          </Column>
          <Column lg={7} md={4} sm={3}>
            <CustomLabNumberInput
              name="to"
              value={values.to}
              labelText={intl.formatMessage({
                id: "reports.query.labNumber.to",
              })}
              id="to"
              onChange={(event, rawValue) =>
                handleChange("to", event, rawValue)
              }
              invalid={!!validationError}
              invalidText={validationError}
            />
          </Column>
        </Grid>
        <br />
        <br />
        <Grid fullWidth={true}>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <Button data-cy="printableVersion" type="submit">
                <FormattedMessage id="label.button.generatePrintableVersion" />
              </Button>
            </Section>
          </Column>
        </Grid>
      </Form>
    </>
  );
}

export default injectIntl(ReportByLabNo);
