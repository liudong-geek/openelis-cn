import React from "react";
import RulesWorkspace from "../rulesWorkspace/RulesWorkspace";
// Compatibility entry; safe expression parsing remains in calculationExpression.
export default function CalculatedValueForm() {
  return <RulesWorkspace defaultType="calculation" />;
}
