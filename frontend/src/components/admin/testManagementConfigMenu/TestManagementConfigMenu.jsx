import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, Dropdown, Search, Tag } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";

export const MASTER_DATA_GROUPS = [
  { id: "all", label: "workspace.masterData.group.all" },
  { id: "catalog", label: "workspace.masterData.group.catalog" },
  { id: "reference", label: "workspace.masterData.group.reference" },
  { id: "rules", label: "workspace.masterData.group.rules" },
];

// Organize by master-data object, never by CRUD verb. The test editor owns
// create, rename, active/orderable status; the retired URLs remain compatible.
export const MASTER_DATA_AREAS = [
  {
    title: "label.testCatalog.list",
    description: "workspace.catalog.helper",
    path: "TestCatalogList",
    group: "catalog",
    tools: [],
  },
  {
    title: "configuration.sampleType.manage",
    description: "configuration.sampleType.manage.explain",
    path: "SampleTypeManagement",
    group: "catalog",
    tools: [],
  },
  {
    title: "configuration.panel.manage",
    description: "configuration.panel.manage.explain",
    path: "PanelManagement",
    group: "catalog",
    tools: [["PanelRenameEntry", "configuration.panel.rename"]],
  },
  {
    title: "configuration.testUnit.manage",
    description: "configuration.testUnit.manage.explain",
    path: "TestSectionManagement",
    group: "reference",
    tools: [["TestSectionRenameEntry", "configuration.testSection.rename"]],
  },
  {
    title: "configuration.uom.manage",
    description: "configuration.uom.manage.explain",
    path: "UomManagement",
    group: "reference",
    tools: [["UomRenameEntry", "configuration.uom.rename"]],
  },
  {
    title: "configuration.method",
    description: "configuration.method.explain",
    path: "MethodManagement",
    group: "reference",
    tools: [["MethodRenameEntry", "configuration.method.rename"]],
  },
  {
    title: "configuration.selectList.add",
    description: "configuration.selectList.add.explain",
    path: "ResultSelectListAdd",
    group: "reference",
    tools: [["SelectListRenameEntry", "configuration.selectList.rename"]],
  },
  {
    title: "sidenav.label.admin.testmgt",
    description: "workspace.rules.helper",
    path: "reflex",
    group: "rules",
    tools: [["calculatedValue", "sidenav.label.admin.testmgt.calculated"]],
  },
];

export default function TestManagementConfigMenu() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(MASTER_DATA_GROUPS[0]);

  const visibleAreas = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return MASTER_DATA_AREAS.filter((area) => {
      if (selectedGroup.id !== "all" && area.group !== selectedGroup.id) {
        return false;
      }
      if (!query) return true;
      const messages = [
        area.title,
        area.description,
        ...area.tools.map(([, label]) => label),
      ];
      return messages.some((messageId) =>
        intl
          .formatMessage({ id: messageId })
          .toLocaleLowerCase()
          .includes(query),
      );
    });
  }, [intl, searchText, selectedGroup]);

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
      <section
        className="master-data-workspace__filters"
        aria-label={intl.formatMessage({
          id: "workspace.masterData.filters.label",
        })}
      >
        <Search
          id="master-data-search"
          labelText={intl.formatMessage({
            id: "workspace.masterData.search.label",
          })}
          placeholder={intl.formatMessage({
            id: "workspace.masterData.search.placeholder",
          })}
          closeButtonLabelText={intl.formatMessage({
            id: "workspace.masterData.search.clear",
          })}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Dropdown
          id="master-data-group"
          titleText={intl.formatMessage({
            id: "workspace.masterData.group.label",
          })}
          label={intl.formatMessage({
            id: "workspace.masterData.group.label",
          })}
          items={MASTER_DATA_GROUPS}
          itemToString={(item) =>
            item ? intl.formatMessage({ id: item.label }) : ""
          }
          selectedItem={selectedGroup}
          onChange={({ selectedItem }) =>
            setSelectedGroup(selectedItem || MASTER_DATA_GROUPS[0])
          }
        />
      </section>
      <p className="master-data-workspace__summary" role="status">
        <FormattedMessage
          id="workspace.masterData.results"
          values={{ count: visibleAreas.length }}
        />
      </p>
      {visibleAreas.length === 0 ? (
        <section className="master-data-workspace__empty">
          <h2>
            <FormattedMessage id="workspace.masterData.empty.title" />
          </h2>
          <p>
            <FormattedMessage id="workspace.masterData.empty.helper" />
          </p>
          <Button
            kind="tertiary"
            size="sm"
            onClick={() => {
              setSearchText("");
              setSelectedGroup(MASTER_DATA_GROUPS[0]);
            }}
          >
            <FormattedMessage id="workspace.masterData.clearFilters" />
          </Button>
        </section>
      ) : (
        <div className="master-data-workspace__grid">
          {visibleAreas.map((area) => (
            <section
              className="master-data-workspace__card"
              data-testid="master-data-area"
              key={area.path}
            >
              <Tag type="cool-gray" size="sm">
                <FormattedMessage
                  id={
                    MASTER_DATA_GROUPS.find((group) => group.id === area.group)
                      ?.label
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
              <div className="master-data-workspace__actions">
                <Button
                  as={Link}
                  to={`${base}/${area.path}`}
                  kind="primary"
                  size="sm"
                  renderIcon={ArrowRight}
                >
                  <FormattedMessage id="common.openManagement" />
                </Button>
                {area.tools.map(([route, label]) => (
                  <Button
                    as={Link}
                    key={route}
                    to={`${base}/${route}`}
                    kind="ghost"
                    size="sm"
                  >
                    <FormattedMessage id={label} />
                  </Button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
