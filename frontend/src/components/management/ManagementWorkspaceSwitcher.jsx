import React, { useContext } from "react";
import { ContentSwitcher, Switch } from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import "./management-workspace-switcher.scss";

const MANAGEMENT_ROLES = Object.freeze({
  GLOBAL_ADMIN: "Global Administrator",
  AUDIT_TRAIL: "Audit Trail",
  ANALYSER_IMPORT: "Analyser Import",
  REPORTS: "Reports",
});

export const MANAGEMENT_WORKSPACE_VIEWS = Object.freeze([
  {
    id: "tat",
    path: "/TATReport",
    labelId: "reports.tat.title",
    roles: [MANAGEMENT_ROLES.REPORTS],
  },
  {
    id: "audit",
    path: "/AuditTrailReport?type=system",
    labelId: "sideNav.title.audittrail",
    roles: [MANAGEMENT_ROLES.GLOBAL_ADMIN, MANAGEMENT_ROLES.AUDIT_TRAIL],
  },
  {
    id: "configuration",
    path: "/MasterListsPage",
    labelId: "admin.dashboard.title",
    roles: [MANAGEMENT_ROLES.GLOBAL_ADMIN],
  },
  {
    id: "analyzers",
    path: "/analyzers",
    labelId: "analyzer.page.title",
    roles: [MANAGEMENT_ROLES.ANALYSER_IMPORT],
  },
]);

const canOpenView = (roles, view) =>
  view.roles.some((role) => roles?.includes(role));

export const getManagementWorkspaceViews = (roles, activeView) =>
  MANAGEMENT_WORKSPACE_VIEWS.filter(
    (view) => view.id === activeView || canOpenView(roles, view),
  );

export default function ManagementWorkspaceSwitcher({ activeView }) {
  const history = useHistory();
  const intl = useIntl();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const roles = userSessionDetails?.roles;
  const availableViews = getManagementWorkspaceViews(roles, activeView);

  if (availableViews.length <= 1) return null;

  const selectedIndex = Math.max(
    0,
    availableViews.findIndex((view) => view.id === activeView),
  );
  const handleChange = ({ index }) => {
    const nextView = availableViews[index];
    if (
      nextView &&
      nextView.id !== activeView &&
      canOpenView(roles, nextView)
    ) {
      history.push(nextView.path);
    }
  };

  return (
    <nav
      className="management-workspace-switcher"
      aria-label={intl.formatMessage({ id: "sidenav.workspace.configuration" })}
    >
      <ContentSwitcher
        selectedIndex={selectedIndex}
        onChange={handleChange}
        size="md"
      >
        {availableViews.map((view) => (
          <Switch
            key={view.id}
            name={view.id}
            text={intl.formatMessage({ id: view.labelId })}
          />
        ))}
      </ContentSwitcher>
    </nav>
  );
}
