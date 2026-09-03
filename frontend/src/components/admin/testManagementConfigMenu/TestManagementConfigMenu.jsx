import React from "react";
import { Link, useLocation } from "react-router-dom";
import { FormattedMessage } from "react-intl";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";

// Organize by master-data object, never by CRUD verb. The test editor owns
// create, rename, active/orderable status; the retired URLs remain compatible.
export const MASTER_DATA_AREAS = [
  {
    title: "label.testCatalog.list",
    description: "workspace.catalog.helper",
    path: "TestCatalogList",
    tools: [],
  },
  {
    title: "configuration.sampleType.manage",
    description: "configuration.sampleType.manage.explain",
    path: "SampleTypeManagement",
    tools: [],
  },
  {
    title: "configuration.panel.manage",
    description: "configuration.panel.manage.explain",
    path: "PanelManagement",
    tools: [["PanelRenameEntry", "configuration.panel.rename"]],
  },
  {
    title: "configuration.testUnit.manage",
    description: "configuration.testUnit.manage.explain",
    path: "TestSectionManagement",
    tools: [["TestSectionRenameEntry", "configuration.testSection.rename"]],
  },
  {
    title: "configuration.uom.manage",
    description: "configuration.uom.manage.explain",
    path: "UomManagement",
    tools: [["UomRenameEntry", "configuration.uom.rename"]],
  },
  {
    title: "configuration.method",
    description: "configuration.method.explain",
    path: "MethodManagement",
    tools: [["MethodRenameEntry", "configuration.method.rename"]],
  },
  {
    title: "configuration.selectList.add",
    description: "configuration.selectList.add.explain",
    path: "ResultSelectListAdd",
    tools: [["SelectListRenameEntry", "configuration.selectList.rename"]],
  },
  {
    title: "sidenav.label.admin.testmgt",
    description: "workspace.rules.helper",
    path: "reflex",
    tools: [["calculatedValue", "sidenav.label.admin.testmgt.calculated"]],
  },
];

export default function TestManagementConfigMenu() {
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  return (
    <div className="adminPageContent master-data-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.masterData.title" />}
        subtitle={<FormattedMessage id="workspace.masterData.helper" />}
      />
      <div className="master-data-workspace__grid">
        {MASTER_DATA_AREAS.map((area) => (
          <section className="master-data-workspace__card" key={area.path}>
            <h2>
              <Link to={`${base}/${area.path}`}>
                <FormattedMessage id={area.title} />
              </Link>
            </h2>
            <p>
              <FormattedMessage id={area.description} />
            </p>
            <div className="master-data-workspace__actions">
              <Link to={`${base}/${area.path}`}>
                <FormattedMessage id="common.openManagement" />
              </Link>
              {area.tools.map(([route, label]) => (
                <Link key={route} to={`${base}/${route}`}>
                  <FormattedMessage id={label} />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
