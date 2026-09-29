import { Breadcrumb, BreadcrumbItem, Column, Grid } from "@carbon/react";
import React from "react";
import { useIntl } from "react-intl";
import { Link, useLocation } from "react-router-dom";

const SYSTEM_ADMIN_ROUTE_ROOTS = new Set([
  "globalMenuManagement",
  "billingMenuManagement",
  "nonConformityMenuManagement",
  "patientMenuManagement",
  "studyMenuManagement",
  "commonproperties",
  "userManagement",
  "userEdit",
  "SearchIndexManagement",
  "loggingManagement",
  "languageManagement",
  "translationManagement",
  "NotifyUser",
  "DatabaseCleaning",
  "systemOperations",
  "deliveryReadiness",
]);

export const getResolvedLabelId = (labelId, pathname) => {
  if (labelId !== "breadcrums.admin.managment") return labelId;

  const routeRoot = String(pathname || "")
    .replace(/^\/(?:admin|MasterListsPage)\/?/, "")
    .split(/[/?#]/)[0];
  return SYSTEM_ADMIN_ROUTE_ROOTS.has(routeRoot)
    ? "banner.menu.administration"
    : "sidenav.workspace.configuration";
};

// Carbon's BreadcrumbItem with an `href` prop renders a plain <a>, which
// triggers a full page reload on click. Passing a React Router <Link>
// as the BreadcrumbItem child preserves SPA navigation.
//
// Current-page semantics: each breadcrumb entry may set `isCurrentPage`
// explicitly. If no entry sets it AND there are multiple entries, the
// last one is treated as the current page for backward compatibility
// with existing callers that pass `[{Home}, {SubPage}]`. A *single* crumb
// is always rendered as a link — pages that pass just `[{Home}]` (e.g.
// reports/Index.jsx) expect that Home stays clickable.
const PageBreadCrumb = ({ breadcrumbs }) => {
  const intl = useIntl();
  const { pathname } = useLocation();
  const anyExplicitCurrent = breadcrumbs.some((b) => b.isCurrentPage === true);
  const lastIndex = breadcrumbs.length - 1;
  const defaultsLastAsCurrent = !anyExplicitCurrent && breadcrumbs.length > 1;

  return (
    <Grid fullWidth={true} className="oe-page-breadcrumb">
      <Column lg={16} md={8} sm={4}>
        <Breadcrumb>
          {breadcrumbs.map((breadcrumb, index) => {
            const label = intl.formatMessage({
              id: getResolvedLabelId(breadcrumb.label, pathname),
            });
            const isCurrent =
              breadcrumb.isCurrentPage === true ||
              (defaultsLastAsCurrent && index === lastIndex);
            return (
              <BreadcrumbItem
                key={index}
                isCurrentPage={isCurrent}
                aria-current={isCurrent ? "page" : undefined}
              >
                {isCurrent ? (
                  <span>{label}</span>
                ) : (
                  <Link to={breadcrumb.link}>{label}</Link>
                )}
              </BreadcrumbItem>
            );
          })}
        </Breadcrumb>
      </Column>
    </Grid>
  );
};

export default PageBreadCrumb;
