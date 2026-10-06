import React from "react";
import WorkplanFilterSelect from "./WorkplanFilterSelect";

export default function PrioritySelectForm({ title, value }) {
  return (
    <WorkplanFilterSelect
      id="workplan-priority-filter"
      endpoint="/rest/displayList/ORDER_PRIORITY"
      queryParameter="priority"
      localizePriority
      placeholderId="input.placeholder.selectPriority"
      title={title}
      value={value}
    />
  );
}
