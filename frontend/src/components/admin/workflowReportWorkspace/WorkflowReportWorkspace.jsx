import React, { useEffect, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Select, SelectItem } from "@carbon/react";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import ConfigMenuDisplay from "../generalConfig/common/ConfigMenuDisplay";
import "../AdminEntryWorkspace.css";

export const WORKFLOW_PARAMETER_CATEGORIES = [
  {
    id: "SiteInformationMenu",
    label: "sidenav.label.admin.formEntry.siteInfoconfig",
  },
  {
    id: "SampleEntryConfigMenu",
    label: "sidenav.label.admin.formEntry.sampleEntryconfig",
  },
  {
    id: "PatientConfigurationMenu",
    label: "sidenav.label.admin.formEntry.patientconfig",
  },
  {
    id: "WorkplanConfigurationMenu",
    label: "sidenav.label.admin.formEntry.Workplanconfig",
  },
  {
    id: "ResultConfigurationMenu",
    label: "sidenav.label.admin.formEntry.resultConfig",
  },
  {
    id: "ValidationConfigurationMenu",
    label: "sidenav.label.admin.formEntry.validationconfig",
  },
  {
    id: "PrintedReportsConfigurationMenu",
    label: "sidenav.label.admin.formEntry.PrintedReportsconfig",
  },
  {
    id: "NonConformityConfigurationMenu",
    label: "sidenav.label.admin.formEntry.nonconformityconfig",
  },
  {
    id: "MenuStatementConfigMenu",
    label: "sidenav.label.admin.formEntry.menustatementconfig",
  },
];

export default function WorkflowReportWorkspace() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const history = useHistory();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const [categoryId, setCategoryId] = useState(
    WORKFLOW_PARAMETER_CATEGORIES[0].id,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(
    () => history.block(() => (editorOpen ? false : undefined)),
    [history, editorOpen],
  );
  useEffect(() => {
    const beforeUnload = (event) => {
      if (editorOpen) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [editorOpen]);
  const category = WORKFLOW_PARAMETER_CATEGORIES.find(
    (item) => item.id === categoryId,
  );
  return (
    <div className="adminPageContent admin-entry-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="admin.entry.workflow.title" />}
        subtitle={<FormattedMessage id="admin.entry.workflow.description" />}
      />
      <div className="admin-entry-workspace__category">
        <Select
          id="workflow-parameter-category"
          labelText={intl.formatMessage({ id: "admin.entry.category" })}
          value={categoryId}
          disabled={editorOpen}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {WORKFLOW_PARAMETER_CATEGORIES.map((item) => (
            <SelectItem
              key={item.id}
              value={item.id}
              text={intl.formatMessage({ id: item.label })}
            />
          ))}
        </Select>
      </div>
      <ConfigMenuDisplay
        key={category.id}
        id={category.label}
        label={intl.formatMessage({ id: category.label })}
        menuType={category.id}
        embedded
        onEditorStateChange={setEditorOpen}
      />
    </div>
  );
}
