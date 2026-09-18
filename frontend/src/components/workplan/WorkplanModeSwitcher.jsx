import React from "react";
import { ContentSwitcher, Switch } from "@carbon/react";
import { useIntl } from "react-intl";
import { useHistory } from "react-router-dom";

export const WORKPLAN_MODES = Object.freeze([
  {
    type: "test",
    path: "/WorkPlanByTest?type=test",
    labelId: "banner.menu.workplan.test",
  },
  {
    type: "panel",
    path: "/WorkPlanByPanel?type=panel",
    labelId: "banner.menu.workplan.panel",
  },
  {
    type: "unit",
    path: "/WorkPlanByTestSection?type=unit",
    labelId: "banner.menu.workplan.bench",
  },
  {
    type: "priority",
    path: "/WorkPlanByPriority?type=priority",
    labelId: "banner.menu.workplan.priority",
  },
]);

export const getWorkplanModeIndex = (type) =>
  Math.max(
    0,
    WORKPLAN_MODES.findIndex((mode) => mode.type === type),
  );

export default function WorkplanModeSwitcher({ type }) {
  const history = useHistory();
  const intl = useIntl();

  const handleChange = ({ index }) => {
    const nextMode = WORKPLAN_MODES[index];
    if (nextMode && nextMode.type !== type) {
      history.push(nextMode.path);
    }
  };

  return (
    <section
      className="oe-workplan-modes"
      aria-label={intl.formatMessage({ id: "banner.menu.workplan" })}
    >
      <ContentSwitcher
        selectedIndex={getWorkplanModeIndex(type)}
        onChange={handleChange}
        size="md"
      >
        {WORKPLAN_MODES.map((mode) => (
          <Switch
            key={mode.type}
            name={mode.type}
            text={intl.formatMessage({ id: mode.labelId })}
          />
        ))}
      </ContentSwitcher>
    </section>
  );
}
