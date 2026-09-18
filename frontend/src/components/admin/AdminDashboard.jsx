import React, { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import { Column, Grid, Search } from "@carbon/react";
import {
  ArrowRight,
  Catalog,
  DataReference,
  Flow,
  Network_3,
  Security,
  UserMultiple,
} from "@carbon/icons-react";

export const ADMIN_DASHBOARD_DOMAINS = [
  {
    id: "catalog",
    titleId: "admin.dashboard.domain.catalog",
    descriptionId: "admin.dashboard.domain.catalog.description",
    icon: Catalog,
    links: [
      ["master.lists.page.test.management", "testManagementConfigMenu"],
      ["sidenav.label.admin.testmgt.reflex", "reflex"],
      ["dictionary.label.modify", "DictionaryMenu"],
    ],
  },
  {
    id: "organization",
    titleId: "admin.dashboard.domain.organization",
    descriptionId: "admin.dashboard.domain.organization.description",
    icon: UserMultiple,
    links: [
      ["unifiedSystemUser.browser.title", "userManagement"],
      ["organization.main.title", "organizationManagement"],
    ],
  },
  {
    id: "workflow",
    titleId: "admin.dashboard.domain.workflow",
    descriptionId: "admin.dashboard.domain.workflow.description",
    icon: Flow,
    links: [
      ["admin.formEntryConfig", "SiteInformationMenu"],
      ["sidenav.label.admin.labNumber", "labNumber"],
      ["sidenav.label.admin.barcodeconfiguration", "barcodeConfiguration"],
    ],
  },
  {
    id: "interfaces",
    titleId: "admin.dashboard.domain.interfaces",
    descriptionId: "admin.dashboard.domain.interfaces.description",
    icon: Network_3,
    links: [["externalconnections.browse.title", "externalConnections"]],
  },
  {
    id: "security",
    titleId: "admin.dashboard.domain.security",
    descriptionId: "admin.dashboard.domain.security.description",
    icon: Security,
    links: [
      ["sidenav.label.admin.menu", "globalMenuManagement"],
      ["sidenav.label.admin.commonproperties", "commonproperties"],
    ],
  },
  {
    id: "data",
    titleId: "admin.dashboard.domain.data",
    descriptionId: "admin.dashboard.domain.data.description",
    icon: DataReference,
    links: [
      ["masterData.title", "masterDataIdentity"],
      ["sidenav.label.admin.program", "program"],
    ],
  },
];

const normalizeSearchText = (value) =>
  String(value || "")
    .trim()
    .toLocaleLowerCase();

export default function AdminDashboard({ basePath }) {
  const history = useHistory();
  const intl = useIntl();
  const [searchText, setSearchText] = useState("");

  const visibleDomains = useMemo(() => {
    const query = normalizeSearchText(searchText);
    if (!query) return ADMIN_DASHBOARD_DOMAINS;

    return ADMIN_DASHBOARD_DOMAINS.map((domain) => {
      const domainMatches = [domain.titleId, domain.descriptionId].some((id) =>
        normalizeSearchText(intl.formatMessage({ id })).includes(query),
      );
      const matchingLinks = domain.links.filter(([messageId]) =>
        normalizeSearchText(intl.formatMessage({ id: messageId })).includes(
          query,
        ),
      );
      return {
        ...domain,
        links: domainMatches ? domain.links : matchingLinks,
      };
    }).filter((domain) => domain.links.length > 0);
  }, [intl, searchText]);

  const openConfiguration = (path) => (event) => {
    event.preventDefault();
    history.push(`${basePath}/${path}`);
  };

  return (
    <section className="admin-dashboard" data-testid="admin-dashboard">
      <h2>
        <FormattedMessage id="admin.dashboard.title" />
      </h2>
      <p className="admin-dashboard__subtitle">
        <FormattedMessage id="admin.dashboard.subtitle" />
      </p>
      <Search
        className="admin-dashboard__search"
        id="admin-dashboard-search"
        labelText={intl.formatMessage({ id: "admin.dashboard.search.label" })}
        placeholder={intl.formatMessage({
          id: "admin.dashboard.search.placeholder",
        })}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        closeButtonLabelText={intl.formatMessage({
          id: "admin.dashboard.search.clear",
        })}
      />

      {visibleDomains.length === 0 ? (
        <p className="admin-dashboard__empty" role="status">
          <FormattedMessage id="admin.dashboard.search.empty" />
        </p>
      ) : (
        <Grid className="admin-dashboard__grid">
          {visibleDomains.map((domain) => {
            const Icon = domain.icon;
            return (
              <Column key={domain.id} lg={5} md={4} sm={4}>
                <section
                  className="admin-dashboard__domain"
                  data-testid="admin-dashboard-domain"
                >
                  <header className="admin-dashboard__domain-header">
                    <Icon className="admin-dashboard__tile-icon" size={24} />
                    <span>
                      <h3>
                        <FormattedMessage id={domain.titleId} />
                      </h3>
                      <p>
                        <FormattedMessage id={domain.descriptionId} />
                      </p>
                    </span>
                  </header>
                  <ul className="admin-dashboard__domain-links">
                    {domain.links.map(([messageId, path]) => (
                      <li key={path}>
                        <a
                          href={`${basePath}/${path}`}
                          onClick={openConfiguration(path)}
                        >
                          <FormattedMessage id={messageId} />
                          <ArrowRight size={16} aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              </Column>
            );
          })}
        </Grid>
      )}
    </section>
  );
}
