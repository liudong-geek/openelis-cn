import React, { useMemo, useState } from "react";
import { Button, Search, Tag } from "@carbon/react";
import {
  AppConnectivity,
  ArrowRight,
  Clean,
  Document,
  Language,
  SearchLocate,
  Settings,
} from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { Link, useLocation } from "react-router-dom";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "../OperationsHub.css";

const tools = [
  {
    path: "loggingManagement",
    title: "sidenav.label.admin.loggingManagement",
    help: "workspace.system.logs",
    icon: Document,
    risk: "read",
  },
  {
    path: "SearchIndexManagement",
    title: "sidenav.label.admin.searchIndexManagement",
    help: "workspace.system.search",
    icon: SearchLocate,
    risk: "controlled",
  },
  {
    path: "DatabaseCleaning",
    title: "sidenav.label.admin.databaseCleaning",
    help: "workspace.system.clean",
    icon: Clean,
    risk: "controlled",
  },
  {
    path: "languageManagement",
    title: "sidenav.label.admin.languageManagement",
    help: "workspace.system.languages",
    icon: Language,
    risk: "config",
  },
  {
    path: "translationManagement",
    title: "sidenav.label.admin.translationManagement",
    help: "workspace.system.translations",
    icon: Language,
    risk: "config",
  },
  {
    path: "PluginFile",
    title: "sidenav.label.admin.pluginFile",
    help: "workspace.system.plugins",
    icon: AppConnectivity,
    risk: "controlled",
  },
  {
    path: "commonproperties",
    title: "sidenav.label.admin.commonproperties",
    help: "workspace.system.properties",
    icon: Settings,
    risk: "config",
  },
];

export default function SystemOperationsWorkspace() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () =>
      tools.filter(
        (tool) =>
          !query.trim() ||
          `${intl.formatMessage({ id: tool.title })} ${intl.formatMessage({ id: tool.help })}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [intl, query],
  );
  return (
    <div className="adminPageContent operations-hub">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
          { label: "workspace.system.title", link: `${base}/systemOperations` },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.system.title" />}
        subtitle={<FormattedMessage id="workspace.system.subtitle" />}
      />
      <Search
        id="system-operation-search"
        labelText={intl.formatMessage({ id: "workspace.system.searchLabel" })}
        placeholder={intl.formatMessage({
          id: "workspace.system.searchPlaceholder",
        })}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="operations-hub__count" role="status">
        <FormattedMessage
          id="workspace.system.count"
          values={{ count: visible.length }}
        />
      </p>
      <div className="operations-hub__grid">
        {visible.map((tool) => {
          const Icon = tool.icon;
          return (
            <article className="operations-hub__card" key={tool.path}>
              <div className="operations-hub__icon">
                <Icon size={24} />
              </div>
              <Tag
                type={
                  tool.risk === "read"
                    ? "green"
                    : tool.risk === "config"
                      ? "blue"
                      : "warm-gray"
                }
              >
                <FormattedMessage id={`workspace.system.risk.${tool.risk}`} />
              </Tag>
              <h2>
                <FormattedMessage id={tool.title} />
              </h2>
              <p>
                <FormattedMessage id={tool.help} />
              </p>
              <Button
                as={Link}
                to={`${base}/${tool.path}`}
                size="sm"
                renderIcon={ArrowRight}
              >
                {intl.formatMessage({ id: "common.openManagement" })}
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
