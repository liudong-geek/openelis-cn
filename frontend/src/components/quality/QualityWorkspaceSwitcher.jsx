import React, { useContext } from "react";
import { ContentSwitcher, Switch } from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { Roles } from "../utils/Utils";
import "./quality-workspace-switcher.scss";

export const QUALITY_WORKSPACE_VIEWS = Object.freeze([
  {
    id: "nonconformity",
    path: "/NceDashboard",
    labelId: "banner.menu.nonconformity",
    roles: [Roles.RECEPTION, Roles.VALIDATION],
  },
  {
    id: "alerts",
    path: "/Alerts",
    labelId: "alerts.dashboard.title",
    roles: [Roles.RECEPTION, Roles.RESULTS],
  },
  {
    id: "qc",
    path: "/analyzers/qc/db",
    labelId: "qc.dashboard.title",
    roles: [Roles.LAB_SUPERVISOR],
  },
]);

const canOpenView = (roles, view) =>
  view.roles.some((role) => roles?.includes(role));

export const getQualityWorkspaceViews = (roles, activeView) =>
  QUALITY_WORKSPACE_VIEWS.filter(
    (view) => view.id === activeView || canOpenView(roles, view),
  );

export default function QualityWorkspaceSwitcher({ activeView }) {
  const history = useHistory();
  const intl = useIntl();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const availableViews = getQualityWorkspaceViews(
    userSessionDetails?.roles,
    activeView,
  );

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
      canOpenView(userSessionDetails?.roles, nextView)
    ) {
      history.push(nextView.path);
    }
  };

  return (
    <nav
      className="quality-workspace-switcher"
      aria-label={intl.formatMessage({ id: "sidenav.workspace.quality" })}
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
