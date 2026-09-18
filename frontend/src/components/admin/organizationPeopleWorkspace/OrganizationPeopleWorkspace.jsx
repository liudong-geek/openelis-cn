import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FormattedMessage, useIntl } from "react-intl";
import { Button, Search, Tag } from "@carbon/react";
import {
  ArrowRight,
  Enterprise,
  UserAdmin,
  UserProfile,
} from "@carbon/icons-react";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";

export const ORGANIZATION_PEOPLE_AREAS = [
  {
    title: "unifiedSystemUser.browser.title",
    description: "workspace.organizationPeople.users.helper",
    path: "userManagement",
    category: "workspace.organizationPeople.category.access",
    Icon: UserAdmin,
  },
  {
    title: "organization.main.title",
    description: "workspace.organizationPeople.organizations.helper",
    path: "organizationManagement",
    category: "workspace.organizationPeople.category.organization",
    Icon: Enterprise,
  },
  {
    title: "provider.browse.title",
    description: "workspace.organizationPeople.providers.helper",
    path: "providerMenu",
    category: "workspace.organizationPeople.category.clinical",
    Icon: UserProfile,
  },
];

export default function OrganizationPeopleWorkspace() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  const [searchText, setSearchText] = useState("");

  const visibleAreas = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    if (!query) return ORGANIZATION_PEOPLE_AREAS;

    return ORGANIZATION_PEOPLE_AREAS.filter((area) =>
      [area.title, area.description, area.category].some((messageId) =>
        intl
          .formatMessage({ id: messageId })
          .toLocaleLowerCase()
          .includes(query),
      ),
    );
  }, [intl, searchText]);

  return (
    <div className="adminPageContent organization-people-workspace">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.organizationPeople.title" />}
        subtitle={<FormattedMessage id="workspace.organizationPeople.helper" />}
      />
      <Search
        className="organization-people-workspace__search"
        id="organization-people-search"
        labelText={intl.formatMessage({
          id: "workspace.organizationPeople.search.label",
        })}
        placeholder={intl.formatMessage({
          id: "workspace.organizationPeople.search.placeholder",
        })}
        closeButtonLabelText={intl.formatMessage({
          id: "workspace.organizationPeople.search.clear",
        })}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
      />
      <p className="organization-people-workspace__summary" role="status">
        <FormattedMessage
          id="workspace.organizationPeople.results"
          values={{ count: visibleAreas.length }}
        />
      </p>
      {visibleAreas.length === 0 ? (
        <section className="organization-people-workspace__empty">
          <h2>
            <FormattedMessage id="workspace.organizationPeople.empty.title" />
          </h2>
          <p>
            <FormattedMessage id="workspace.organizationPeople.empty.helper" />
          </p>
          <Button kind="tertiary" size="sm" onClick={() => setSearchText("")}>
            <FormattedMessage id="workspace.organizationPeople.clearSearch" />
          </Button>
        </section>
      ) : (
        <div className="organization-people-workspace__grid">
          {visibleAreas.map((area) => {
            const Icon = area.Icon;
            return (
              <section
                className="organization-people-workspace__card"
                data-testid="organization-people-area"
                key={area.path}
              >
                <header>
                  <Icon size={24} aria-hidden="true" />
                  <Tag type="cool-gray" size="sm">
                    <FormattedMessage id={area.category} />
                  </Tag>
                </header>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
