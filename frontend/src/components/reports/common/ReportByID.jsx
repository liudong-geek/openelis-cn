import React, { useState } from "react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import {
  Form,
  Grid,
  Column,
  Section,
  Button,
  InlineNotification,
  TextInput,
} from "@carbon/react";
import config from "../../../config.json";
import { buildReportUrl, openReportWindow } from "./reportLaunch";

function ReportByID(props) {
  const intl = useIntl();
  const [nationalId, setNationalId] = useState("");
  const [errors, setErrors] = useState({});
  const [launchError, setLaunchError] = useState(false);

  const handleSubmit = (event) => {
    event?.preventDefault();
    const normalizedNationalId = nationalId.trim();
    if (!normalizedNationalId) {
      setErrors({
        nationalId: intl.formatMessage({
          id: "reports.query.validation.nationalId",
        }),
      });
      return;
    }

    const url = buildReportUrl(config.serverBaseUrl, {
      report: props.report,
      type: "patient",
      patientNumberDirect: normalizedNationalId,
    });
    const opened = openReportWindow(url);
    setErrors({});
    setLaunchError(!opened);
  };

  // Function to handle changes in the input field
  const handleInputChange = (event) => {
    setErrors({});
    setLaunchError(false);
    setNationalId(event?.target?.value ?? "");
  };

  return (
    <>
      <br />
      <Form onSubmit={handleSubmit}>
        <Grid>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <Section>
                <h3>
                  <FormattedMessage id={props.id} />
                </h3>
              </Section>
            </Section>
          </Column>
        </Grid>
        <br />
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
        <Grid fullWidth={true}>
          <Column lg={16} md={8} sm={4}>
            <Section>
              <FormattedMessage id="label.report.byNationalId" />
            </Section>
          </Column>
        </Grid>
        <br />
        <Grid fullWidth={true}>
          <Column lg={6} md={4} sm={4}>
            <TextInput
              id="nationalID"
              labelText={intl.formatMessage({
                id: "nationalID.title",
              })}
              value={nationalId}
              onChange={handleInputChange}
              invalid={!!errors.nationalId}
              invalidText={errors.nationalId}
            />
          </Column>
        </Grid>
        <br />
        <br />
        <Grid fullWidth={true}>
          <Column lg={16}>
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

export default injectIntl(ReportByID);
