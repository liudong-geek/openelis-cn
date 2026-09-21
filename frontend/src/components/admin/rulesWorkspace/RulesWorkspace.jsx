import React from "react";
import { Button, Tag } from "@carbon/react";
import {
  ArrowRight,
  Flow,
  FunctionMath,
  ListChecked,
} from "@carbon/icons-react";
import { FormattedMessage, useIntl } from "react-intl";
import { Link, useLocation } from "react-router-dom";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import ProductPageHeader from "../../common/ProductPageHeader";
import "../OperationsHub.css";

const tools = [
  {
    path: "reflex",
    title: "sidenav.label.admin.testmgt.reflex",
    help: "workspace.rules.reflex.help",
    icon: Flow,
    badge: "workspace.rules.automatic",
  },
  {
    path: "calculatedValue",
    title: "sidenav.label.admin.testmgt.calculated",
    help: "workspace.rules.calculated.help",
    icon: FunctionMath,
    badge: "workspace.rules.formula",
  },
  {
    path: "batchTestReassignment",
    title: "configuration.batch.test.reassignment",
    help: "workspace.rules.batch.help",
    icon: ListChecked,
    badge: "workspace.rules.batch",
  },
];

export default function RulesWorkspace() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/MasterListsPage";
  return (
    <div className="adminPageContent operations-hub">
      <PageBreadCrumb
        breadcrumbs={[
          { label: "home.label", link: "/" },
          { label: "breadcrums.admin.managment", link: base },
          { label: "workspace.rules.title", link: `${base}/rulesWorkspace` },
        ]}
      />
      <ProductPageHeader
        title={<FormattedMessage id="workspace.rules.title" />}
        subtitle={<FormattedMessage id="workspace.rules.subtitle" />}
      />
      <section className="operations-hub__notice">
        <strong>
          <FormattedMessage id="workspace.rules.notice.title" />
        </strong>
        <p>
          <FormattedMessage id="workspace.rules.notice.body" />
        </p>
      </section>
      <div className="operations-hub__grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <article className="operations-hub__card" key={tool.path}>
              <div className="operations-hub__icon">
                <Icon size={24} />
              </div>
              <Tag type="cool-gray">
                <FormattedMessage id={tool.badge} />
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
