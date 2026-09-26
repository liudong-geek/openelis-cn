import React, { useState } from "react";
import { Button, InlineNotification } from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import config from "../../../config.json";
import { openReportWindow } from "../common/reportLaunch";

const ValidationBacklogReport = () => {
  const intl = useIntl();
  const [launchError, setLaunchError] = useState(false);
  const reportUrl = `${String(config.serverBaseUrl || "").replace(
    /\/$/,
    "",
  )}/ReportPrint?type=indicator&report=validationBacklog`;

  return (
    <section className="routine-report-workspace__simple-report">
      <h1>
        <FormattedMessage id="sideNav.label.delayedvalidation" />
      </h1>
      {launchError && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={intl.formatMessage({ id: "reports.query.error.title" })}
          subtitle={intl.formatMessage({ id: "reports.query.popupBlocked" })}
        />
      )}
      <Button
        type="button"
        onClick={() => setLaunchError(!openReportWindow(reportUrl))}
      >
        <FormattedMessage id="label.button.generatePrintableVersion" />
      </Button>
    </section>
  );
};

export default ValidationBacklogReport;
