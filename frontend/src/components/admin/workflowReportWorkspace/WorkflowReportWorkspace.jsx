import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, Dropdown, Search, Tag } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";

export const WORKFLOW_REPORT_GROUPS = [
  { id: "all", label: "workspace.workflowReport.group.all" },
  { id: "site", label: "workspace.workflowReport.group.site" },
  { id: "entry", label: "workspace.workflowReport.group.entry" },
  { id: "identity", label: "workspace.workflowReport.group.identity" },
  { id: "report", label: "workspace.workflowReport.group.report" },
];

export const WORKFLOW_REPORT_AREAS = [
  {
    title: "sidenav.label.admin.formEntry.siteInfoconfig",
    description: "workspace.workflowReport.siteInformation.helper",
    path: "SiteInformationMenu",
    group: "site",
  },
  {
    title: "site.branding.title",
    description: "site.branding.description",
    path: "SiteBrandingMenu",
    group: "site",
  },
  {
    title: "sidenav.label.admin.formEntry.sampleEntryconfig",
    description: "workspace.workflowReport.orderEntry.helper",
    path: "SampleEntryConfigurationMenu",
    group: "entry",
  },
  {
    title: "sidenav.label.admin.formEntry.patientconfig",
    description: "workspace.workflowReport.patientEntry.helper",
    path: "PatientConfigurationMenu",
    group: "entry",
  },
  {
    title: "sidenav.label.admin.formEntry.Workplanconfig",
    description: "workspace.workflowReport.workplan.helper",
    path: "WorkPlanConfigurationMenu",
    group: "entry",
  },
  {
    title: "sidenav.label.admin.labNumber",
    description: "workspace.workflowReport.labNumber.helper",
    path: "labNumber",
    group: "identity",
  },
  {
    title: "admin.labelPresets.title",
    description: "workspace.workflowReport.labels.helper",
    path: "labelPresets",
    group: "identity",
  },
  {
    title: "sidenav.label.admin.formEntry.resultConfig",
    description: "workspace.workflowReport.resultEntry.helper",
    path: "ResultConfigurationMenu",
    group: "report",
  },
  {
    title: "sidenav.label.admin.formEntry.validationconfig",
    description: "workspace.workflowReport.validation.helper",
    path: "ValidationConfigurationMenu",
    group: "report",
  },
  {
    title: "sidenav.label.admin.formEntry.PrintedReportsconfig",
    description: "workspace.workflowReport.printedReports.helper",
    path: "PrintedReportsConfigurationMenu",
    group: "report",
  },
  {
    title: "resultreporting.browse.title",
    description: "workspace.workflowReport.delivery.helper",
    path: "resultReportingConfiguration",
    group: "report",
  },
  {
    title: "testnotificationconfig.browse.title",
    description: "workspace.workflowReport.notification.helper",
    path: "testNotificationConfigMenu",
    group: "report",
  },
];

export default function WorkflowReportWorkspace() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(WORKFLOW_REPORT_GROUPS[0]);

  const visibleAreas = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return WORKFLOW_REPORT_AREAS.filter((area) => {
      if (selectedGroup.id !== "all" && area.group !== selectedGroup.id) {
        return false;
      }
      if (!query) return true;
      return [area.title, area.description].some((messageId) =>
        intl
          .formatMessage({ id: messageId })
          .toLocaleLowerCase()
          .includes(query),
      );
    });
  }, [intl, searchText, selectedGroup]);

  const clearFilters = () => {
    setSearchText("");
    setSelectedGroup(WORKFLOW_REPORT_GROUPS[0]);
  };

  return (
    <div className="adminPageContent workflow-report-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.workflowReport.title" />}
        subtitle={<FormattedMessage id="workspace.workflowReport.helper" />}
      />
      <section
        className="workflow-report-workspace__filters"
        aria-label={intl.formatMessage({
          id: "workspace.workflowReport.filters.label",
        })}
      >
        <Search
          id="workflow-report-search"
          labelText={intl.formatMessage({
            id: "workspace.workflowReport.search.label",
          })}
          placeholder={intl.formatMessage({
            id: "workspace.workflowReport.search.placeholder",
          })}
          closeButtonLabelText={intl.formatMessage({
            id: "workspace.workflowReport.search.clear",
          })}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Dropdown
          id="workflow-report-group"
          titleText={intl.formatMessage({
            id: "workspace.workflowReport.group.label",
          })}
          label={intl.formatMessage({
            id: "workspace.workflowReport.group.label",
          })}
          items={WORKFLOW_REPORT_GROUPS}
          itemToString={(item) =>
            item ? intl.formatMessage({ id: item.label }) : ""
          }
          selectedItem={selectedGroup}
          onChange={({ selectedItem }) =>
            setSelectedGroup(selectedItem || WORKFLOW_REPORT_GROUPS[0])
          }
        />
      </section>
      <p className="workflow-report-workspace__summary" role="status">
        <FormattedMessage
          id="workspace.workflowReport.results"
          values={{ count: visibleAreas.length }}
        />
      </p>
      {visibleAreas.length === 0 ? (
        <section className="workflow-report-workspace__empty">
          <h2>
            <FormattedMessage id="workspace.workflowReport.empty.title" />
          </h2>
          <p>
            <FormattedMessage id="workspace.workflowReport.empty.helper" />
          </p>
          <Button kind="tertiary" size="sm" onClick={clearFilters}>
            <FormattedMessage id="workspace.workflowReport.clearFilters" />
          </Button>
        </section>
      ) : (
        <div className="workflow-report-workspace__grid">
          {visibleAreas.map((area) => (
            <section
              className="workflow-report-workspace__card"
              data-testid="workflow-report-area"
              key={area.path}
            >
              <Tag type="cool-gray" size="sm">
                <FormattedMessage
                  id={
                    WORKFLOW_REPORT_GROUPS.find(
                      (group) => group.id === area.group,
                    )?.label
                  }
                />
              </Tag>
              <h2>
                <Link to={`${base}/${area.path}`}>
                  <FormattedMessage id={area.title} />
                </Link>
              </h2>
              <p>
                <FormattedMessage id={area.description} />
              </p>
              <Button
                as={Link}
                to={`${base}/${area.path}`}
                kind="primary"
                size="sm"
                renderIcon={ArrowRight}
              >
                <FormattedMessage id="common.openManagement" />
              </Button>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
