import React from "react";
import WorkplanFilterSelect from "./WorkplanFilterSelect";

export default function TestSelectForm({ title, value }) {
  return (
    <WorkplanFilterSelect
      id="workplan-test-filter"
      endpoint="/rest/displayList/ALL_TESTS"
      queryParameter="testId"
      placeholderId="input.placeholder.selectTest"
      title={title}
      value={value}
    />
  );
}
