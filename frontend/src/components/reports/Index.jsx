import React, { useContext } from "react";
import { AlertDialog } from "../common/CustomNotification";
import { NotificationContext } from "../layout/Layout";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import { Redirect, useLocation } from "react-router-dom";
import { InlineNotification } from "@carbon/react";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";
import { StudyReports } from "./study/index";
import { RoutineReports } from "./routine/Index";
import { isSecurityRestrictedReport } from "./reportAvailability";

const ReportIndex = () => {
  const intl = useIntl();
  const location = useLocation();
  const { notificationVisible } = useContext(NotificationContext);
  const params = new URLSearchParams(location.search);
  const type = params.get("type");
  const report = params.get("report");

  // /Report is a report renderer, not a report picker. Old bookmarks and
  // dashboard links without a template should land in the report centre.
  if (!type || !report) {
    return <Redirect to="/RoutineReports" />;
  }

  if (isSecurityRestrictedReport(report)) {
    return (
      <>
        <PageBreadCrumb breadcrumbs={[{ label: "home.label", link: "/" }]} />
        <ProductPageHeader
          title={<FormattedMessage id="reports.securityReview.title" />}
          subtitle={
            <FormattedMessage id="reports.securityReview.description" />
          }
        />
        <div className="orderLegendBody">
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={intl.formatMessage({ id: "reports.securityReview.title" })}
            subtitle={intl.formatMessage({
              id: "reports.securityReview.description",
            })}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageBreadCrumb breadcrumbs={[{ label: "home.label", link: "/" }]} />
      <div className="orderLegendBody">
        {notificationVisible === true && <AlertDialog />}
        <RoutineReports type={type} report={report} />
        <StudyReports type={type} report={report} />
      </div>
    </>
  );
};

export default injectIntl(ReportIndex);
