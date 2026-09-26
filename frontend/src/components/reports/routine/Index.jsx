import React, { useContext, useState, useEffect } from "react";
import { AlertDialog } from "../../common/CustomNotification";
import { NotificationContext } from "../../layout/Layout";
import { Dropdown, Loading } from "@carbon/react";
import { injectIntl, useIntl } from "react-intl";
import PatientStatusReport from "../common/PatientStatusReport";
import StatisticsReport from "./StatisticsReport";
import ReferredOut from "./ReferredOut";
import ReportByDate from "../common/ReportByDate";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import { useHistory, useLocation } from "react-router-dom";
import {
  AGGREGATE_REPORT_OPTIONS,
  DEFAULT_ROUTINE_REPORT_PATH,
  isAggregateReport,
} from "../routineReportNavigation";
import ValidationBacklogReport from "./ValidationBacklogReport";
import "./routine-report-workspace.scss";

export const RoutineReports = (props) => {
  const { type, report } = props;

  return (
    <>
      {type === "patient" && report === "patientCILNSP_vreduit" && (
        <PatientStatusReport
          report={"patientCILNSP_vreduit"}
          id={"openreports.patientTestStatus"}
        />
      )}

      {type === "patient" && report === "referredOut" && <ReferredOut />}

      {type === "patient" && report === "haitiNonConformityBySectionReason" && (
        <ReportByDate
          report={"haitiNonConformityBySectionReason"}
          id={"openreports.mgt.nonconformity.section"}
        />
      )}

      {type === "patient" && report === "haitiNonConformityByDate" && (
        <ReportByDate
          report={"haitiNonConformityByDate"}
          id={"openreports.mgt.nonconformity.date"}
        />
      )}

      {type === "routine" && report === "CISampleRoutineExport" && (
        <ReportByDate
          report={"CISampleRoutineExport"}
          id={"sideNav.label.exportcsvfile"}
        />
      )}

      {type === "indicator" &&
        (report === "activityReportByTest" ||
          report === "activityReportByPanel" ||
          report === "activityReportByTestSection") && (
          <ReportByDate key={report} report={report} />
        )}

      {type === "indicator" && report === "statisticsReport" && (
        <StatisticsReport />
      )}

      {type === "indicator" && report === "indicatorHaitiLNSPAllTests" && (
        <ReportByDate
          report={"indicatorHaitiLNSPAllTests"}
          id={"openreports.all.test.summary.title"}
        />
      )}

      {type === "indicator" && report === "indicatorCDILNSPHIV" && (
        <ReportByDate
          report={"indicatorCDILNSPHIV"}
          id={"sideNav.label.hivtestsummary"}
        />
      )}

      {type === "indicator" && report === "validationBacklog" && (
        <ValidationBacklogReport />
      )}

      {type === "indicator" && report === "sampleRejectionReport" && (
        <ReportByDate
          report={"sampleRejectionReport"}
          id={"openreports.mgt.rejection"}
        />
      )}

      {type === "patient" && report === "ExportWHONETReportByDate" && (
        <ReportByDate
          report={"ExportWHONETReportByDate"}
          id={"header.label.study.ciexport"}
        />
      )}
    </>
  );
};

const RoutineIndex = () => {
  const intl = useIntl();
  const { notificationVisible } = useContext(NotificationContext);
  const history = useHistory();
  const location = useLocation();

  const [type, setType] = useState("");
  const [report, setReport] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const selectedAggregateReport = AGGREGATE_REPORT_OPTIONS.find(
    (option) => option.report === report,
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paramType = params.get("type");
    const paramReport = params.get("report");
    setType(paramType);
    setReport(paramReport);

    if (paramType && paramReport) {
      setIsLoading(false);
    } else {
      history.replace(DEFAULT_ROUTINE_REPORT_PATH);
    }
  }, [history, location.search]);

  return (
    <>
      <br />
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "routine.reports", link: DEFAULT_ROUTINE_REPORT_PATH },
        ]}
      />
      <div className="orderLegendBody">
        {notificationVisible === true && <AlertDialog />}
        {isLoading && (
          <Loading
            description={intl.formatMessage({ id: "loading.description" })}
          />
        )}
        {!isLoading && (
          <div className="routine-report-workspace">
            {isAggregateReport(report) && (
              <section
                className="routine-report-workspace__selector"
                aria-label={intl.formatMessage({ id: "reports.type" })}
              >
                <Dropdown
                  id="aggregate-report-type"
                  titleText={intl.formatMessage({ id: "reports.type" })}
                  label={intl.formatMessage({ id: "reports.type.select" })}
                  items={AGGREGATE_REPORT_OPTIONS}
                  selectedItem={selectedAggregateReport}
                  itemToString={(item) =>
                    item ? intl.formatMessage({ id: item.displayKey }) : ""
                  }
                  onChange={({ selectedItem }) => {
                    if (!selectedItem) return;
                    history.push(
                      `/RoutineReport?type=${selectedItem.type}&report=${selectedItem.report}`,
                    );
                  }}
                />
              </section>
            )}
            <RoutineReports type={type} report={report} />
          </div>
        )}
      </div>
    </>
  );
};

export default injectIntl(RoutineIndex);
