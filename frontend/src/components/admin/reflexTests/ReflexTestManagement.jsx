import React from "react";
import RulesWorkspace from "../rulesWorkspace/RulesWorkspace";
// Compatibility entry for existing bookmarks; one list/editor owns the rules.
export default function ReflexTestManagement() {
  return <RulesWorkspace defaultType="reflex" />;
}
