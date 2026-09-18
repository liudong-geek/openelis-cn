import React from "react";
import { Roles } from "../utils/Utils";
import WorkplanFilterSelect from "./WorkplanFilterSelect";

export default function TestSectionSelectForm({ title, value }) {
  return (
    <WorkplanFilterSelect
      id="workplan-section-filter"
      endpoint={`/rest/user-test-sections/${Roles.RESULTS}`}
      queryParameter="testSectionId"
      placeholderId="input.placeholder.selectTestSection"
      title={title}
      value={value}
    />
  );
}
