import React, { useContext, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, Dropdown, Search, Tag } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";

const ANALYSER_IMPORT_ROLE = "Analyser Import";

export const INTERFACE_GROUPS = [
  { id: "all", label: "workspace.interface.group.all" },
  { id: "analyzer", label: "workspace.interface.group.analyzer" },
  { id: "external", label: "workspace.interface.group.external" },
  { id: "monitor", label: "workspace.interface.group.monitor" },
];

export const INTERFACE_AREAS = [
  {
    title: "analyzer.page.title",
    description: "workspace.interface.analyzers.helper",
    path: "/analyzers",
    group: "analyzer",
    externalRoute: true,
    requiredRole: ANALYSER_IMPORT_ROLE,
  },
  {
    title: "sidenav.label.admin.analyzerTest",
    description: "workspace.interface.mapping.helper",
    path: "AnalyzerTestName",
    group: "analyzer",
  },
  {
    title: "externalconnections.browse.title",
    description: "workspace.interface.connections.helper",
    path: "externalConnections",
    group: "external",
  },
  {
    title: "dataexport.status.title",
    description: "workspace.interface.monitor.helper",
    path: "dataExportStatus",
    group: "monitor",
  },
];

export default function InterfaceWorkspace() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const roles = userSessionDetails?.roles || [];
  const [searchText, setSearchText] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(INTERFACE_GROUPS[0]);

  const availableAreas = useMemo(
    () =>
      INTERFACE_AREAS.filter(
        (area) => !area.requiredRole || roles.includes(area.requiredRole),
      ),
    [roles],
  );

  const visibleAreas = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return availableAreas.filter((area) => {
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
  }, [availableAreas, intl, searchText, selectedGroup]);

  const clearFilters = () => {
    setSearchText("");
    setSelectedGroup(INTERFACE_GROUPS[0]);
  };

  return (
    <div className="adminPageContent interface-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.interface.title" />}
        subtitle={<FormattedMessage id="workspace.interface.helper" />}
      />
      <section
        className="interface-workspace__filters"
        aria-label={intl.formatMessage({
          id: "workspace.interface.filters.label",
        })}
      >
        <Search
          id="interface-workspace-search"
          labelText={intl.formatMessage({
            id: "workspace.interface.search.label",
          })}
          placeholder={intl.formatMessage({
            id: "workspace.interface.search.placeholder",
          })}
          closeButtonLabelText={intl.formatMessage({
            id: "workspace.interface.search.clear",
          })}
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Dropdown
          id="interface-workspace-group"
          titleText={intl.formatMessage({
            id: "workspace.interface.group.label",
          })}
          label={intl.formatMessage({ id: "workspace.interface.group.label" })}
          items={INTERFACE_GROUPS}
          itemToString={(item) =>
            item ? intl.formatMessage({ id: item.label }) : ""
          }
          selectedItem={selectedGroup}
          onChange={({ selectedItem }) =>
            setSelectedGroup(selectedItem || INTERFACE_GROUPS[0])
          }
        />
      </section>
      <p className="interface-workspace__summary" role="status">
        <FormattedMessage
          id="workspace.interface.results"
          values={{ count: visibleAreas.length }}
        />
      </p>
      {visibleAreas.length === 0 ? (
        <section className="interface-workspace__empty">
          <h2>
            <FormattedMessage id="workspace.interface.empty.title" />
          </h2>
          <p>
            <FormattedMessage id="workspace.interface.empty.helper" />
          </p>
          <Button kind="tertiary" size="sm" onClick={clearFilters}>
            <FormattedMessage id="workspace.interface.clearFilters" />
          </Button>
        </section>
      ) : (
        <div className="interface-workspace__grid">
          {visibleAreas.map((area) => {
            const target = area.externalRoute
              ? area.path
              : `${base}/${area.path}`;
            return (
              <section
                className="interface-workspace__card"
                data-testid="interface-workspace-area"
                key={area.path}
              >
                <Tag type="cool-gray" size="sm">
                  <FormattedMessage
                    id={
                      INTERFACE_GROUPS.find((group) => group.id === area.group)
                        ?.label
                    }
                  />
                </Tag>
                <h2>
                  <Link to={target}>
                    <FormattedMessage id={area.title} />
                  </Link>
                </h2>
                <p>
                  <FormattedMessage id={area.description} />
                </p>
                <Button
                  as={Link}
                  to={target}
                  kind="primary"
                  size="sm"
                  renderIcon={ArrowRight}
                >
                  <FormattedMessage id="common.openManagement" />
                </Button>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
