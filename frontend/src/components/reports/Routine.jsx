import React from "react";
import GlobalSideBar from "../common/GlobalSideBar";
import { FormattedMessage, injectIntl } from "react-intl";
import {
  IbmWatsonDiscovery,
  IbmWatsonNaturalLanguageUnderstanding,
  Microscope,
} from "@carbon/icons-react";
import config from "../../config.json";
import PageBreadCrumb from "../common/PageBreadCrumb";
import ProductPageHeader from "../common/ProductPageHeader";

let breadcrumbs = [{ label: "home.label", link: "/" }];
export const RoutineReportsMenu = {
  className: "resultSideNav",
  sideNavMenuItems: [
    {
      title: <FormattedMessage id="sidenav.title.statusreport" />,
      icon: IbmWatsonDiscovery,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=patient&report=patientCILNSP_vreduit",
          label: <FormattedMessage id="sidenav.label.statusreport" />,
        },
      ],
    },
    {
      title: <FormattedMessage id="sidenav.title.aggregatereport" />,
      icon: Microscope,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=indicator&report=statisticsReport",
          label: <FormattedMessage id="sidenav.label.statisticsreport" />,
        },
        {
          link: "/RoutineReport?type=indicator&report=indicatorHaitiLNSPAllTests",
          label: <FormattedMessage id="sidenav.label.testsummary" />,
        },
        {
          link: "/RoutineReport?type=indicator&report=indicatorCDILNSPHIV",
          label: <FormattedMessage id="sideNav.label.hivtestsummary" />,
        },
      ],
    },
    {
      title: <FormattedMessage id="sideNav.title.rejectionreport" />,
      icon: IbmWatsonNaturalLanguageUnderstanding,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=indicator&report=sampleRejectionReport",
          label: <FormattedMessage id="sideNav.label.rejectionreport" />,
          securityRestricted: true,
        },
      ],
    },
    {
      title: <FormattedMessage id="sideNav.title.activityreport" />,
      icon: IbmWatsonNaturalLanguageUnderstanding,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=indicator&report=activityReportByTest",
          label: <FormattedMessage id="sideNav.label.bytesttype" />,
          securityRestricted: true,
        },
        {
          link: "/RoutineReport?type=indicator&report=activityReportByPanel",
          label: <FormattedMessage id="sideNav.label.bypaneltype" />,
          securityRestricted: true,
        },
        {
          link: "/RoutineReport?type=indicator&report=activityReportByTestSection",
          label: <FormattedMessage id="sideNav.label.byunit" />,
          securityRestricted: true,
        },
      ],
    },
    {
      title: <FormattedMessage id="sideNav.title.referredtestreport" />,
      icon: IbmWatsonNaturalLanguageUnderstanding,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=patient&report=referredOut",
          label: <FormattedMessage id="sideNav.label.referredtestreport" />,
        },
      ],
    },
    {
      title: <FormattedMessage id="sideNav.title.noncomformityreports" />,
      icon: IbmWatsonNaturalLanguageUnderstanding,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=patient&report=haitiNonConformityByDate",
          label: (
            <FormattedMessage id="sideNav.label.noncomformityreportsbydate" />
          ),
          securityRestricted: true,
        },
        {
          link: "/RoutineReport?type=patient&report=haitiNonConformityBySectionReason",
          label: (
            <FormattedMessage id="sideNav.label.noncomformityreportsbyunit" />
          ),
        },
      ],
    },
    {
      title: <FormattedMessage id="sideNav.title.delayedvalidation" />,
      icon: IbmWatsonNaturalLanguageUnderstanding,
      SideNavMenuItem: [
        {
          link:
            config.serverBaseUrl +
            "/ReportPrint?type=indicator&report=validationBacklog",
          label: <FormattedMessage id="sideNav.label.delayedvalidation" />,
          icon: IbmWatsonNaturalLanguageUnderstanding,
        },
      ],
    },
    {
      title: <FormattedMessage id="sideNav.title.exportcsvfile" />,
      icon: IbmWatsonNaturalLanguageUnderstanding,
      SideNavMenuItem: [
        {
          link: "/RoutineReport?type=routine&report=CISampleRoutineExport",
          label: <FormattedMessage id="sideNav.label.exportcsvfile" />,
          securityRestricted: true,
        },
      ],
    },
  ],
  contentRoutes: [],
};
const Routine = () => {
  return (
    <>
      <PageBreadCrumb breadcrumbs={breadcrumbs} />
      <ProductPageHeader
        title={
          <>
            <FormattedMessage id="sidenav.label.reports" /> ·{" "}
            <FormattedMessage id="sidenav.label.reports.routine" />
          </>
        }
      />
      <GlobalSideBar sideNav={RoutineReportsMenu} />
    </>
  );
};

export default injectIntl(Routine);
