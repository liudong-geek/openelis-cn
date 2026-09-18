import React, { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import { Column, Grid, Search } from "@carbon/react";
import { ArrowRight } from "@carbon/icons-react";
import { ADMIN_NAVIGATION_DOMAINS } from "./adminNavigation";

export const ADMIN_DASHBOARD_DOMAINS = ADMIN_NAVIGATION_DOMAINS;

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
