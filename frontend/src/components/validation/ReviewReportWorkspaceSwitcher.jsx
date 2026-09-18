import React, { useContext } from "react";
import { ContentSwitcher, Switch } from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { hasRole, Roles } from "../utils/Utils";
import "./review-report-workspace-switcher.scss";

export const REVIEW_REPORT_WORKSPACE_VIEWS = Object.freeze([
  {
    id: "review",
    path: "/validation?type=routine",
    labelId: "review.workspace.queue",
    role: Roles.VALIDATION,
  },
  {
    id: "reports",
    path: "/RoutineReports",
    labelId: "review.workspace.reports",
    role: Roles.REPORTS,
  },
]);

export const getReviewReportWorkspaceViews = (roles, activeView) =>
  REVIEW_REPORT_WORKSPACE_VIEWS.filter(
    (view) => view.id === activeView || roles?.includes(view.role),
  );

export default function ReviewReportWorkspaceSwitcher({ activeView }) {
  const history = useHistory();
  const intl = useIntl();
  const { userSessionDetails } = useContext(UserSessionDetailsContext);
  const availableViews = getReviewReportWorkspaceViews(
    userSessionDetails?.roles,
    activeView,
  );
  const selectedIndex = Math.max(
    0,
    availableViews.findIndex((view) => view.id === activeView),
  );

  const handleChange = ({ index }) => {
    const nextView = availableViews[index];
    if (
      nextView &&
      nextView.id !== activeView &&
      hasRole(userSessionDetails, nextView.role)
    ) {
      history.push(nextView.path);
    }
  };

  return (
    <nav
      className="review-report-workspace-switcher"
      aria-label={intl.formatMessage({ id: "sidenav.workspace.reports" })}
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
