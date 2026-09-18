import React from "react";
import { ContentSwitcher, Switch } from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";
import "./testing-workspace-switcher.scss";

export const TESTING_WORKSPACE_VIEWS = Object.freeze([
  {
    id: "results",
    path: "/Results?scope=pending",
    labelId: "banner.menu.results.unified",
  },
  {
    id: "referred",
    path: "/ReferredOutTests",
    labelId: "referral.label.referredOutTests",
  },
  {
    id: "workplan",
    path: "/WorkPlanByTest?type=test",
    labelId: "banner.menu.workplan",
  },
]);

export const getTestingWorkspaceViewIndex = (activeView) =>
  Math.max(
    0,
    TESTING_WORKSPACE_VIEWS.findIndex((view) => view.id === activeView),
  );

export default function TestingWorkspaceSwitcher({ activeView }) {
  const history = useHistory();
  const intl = useIntl();

  const handleChange = ({ index }) => {
    const nextView = TESTING_WORKSPACE_VIEWS[index];
    if (nextView && nextView.id !== activeView) {
      history.push(nextView.path);
    }
  };

  return (
    <nav
      className="testing-workspace-switcher"
      aria-label={intl.formatMessage({ id: "banner.menu.results" })}
    >
      <ContentSwitcher
        selectedIndex={getTestingWorkspaceViewIndex(activeView)}
        onChange={handleChange}
        size="md"
      >
        {TESTING_WORKSPACE_VIEWS.map((view) => (
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
