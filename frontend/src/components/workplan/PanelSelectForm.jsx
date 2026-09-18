import React from "react";
import WorkplanFilterSelect from "./WorkplanFilterSelect";

export default function PanelSelectForm({ title, value }) {
  return (
    <WorkplanFilterSelect
      id="workplan-panel-filter"
      endpoint="/rest/displayList/PANELS"
      queryParameter="panelId"
      placeholderId="input.placeholder.selectPanel"
      title={title}
      value={value}
    />
  );
}
