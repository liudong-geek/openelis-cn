import { validateCalculationExpression } from "../calculatedValue/calculationExpression";

export const cloneRule = (value) => JSON.parse(JSON.stringify(value));
export const validRuleId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const emptyCondition = () => ({
  id: null,
  sampleId: "",
  testName: "",
  testId: "",
  relation: "",
  value: "0",
  value2: "0",
  testAnalyteId: null,
});
export const emptyAction = () => ({
  id: null,
  sampleId: "",
  reflexTestName: "",
  reflexTestId: "",
  internalNote: "",
  externalNote: "",
  addNotification: "Y",
  testReflexId: null,
});
export const emptyOperation = (type = "TEST_RESULT") => ({
  id: null,
  order: null,
  type,
  value: "",
  sampleId: null,
});
export const newRule = (type) =>
  type === "reflex"
    ? {
        id: null,
        ruleName: "",
        overall: "ALL",
        toggled: true,
        active: true,
        analyteId: null,
        conditions: [emptyCondition()],
        actions: [emptyAction()],
      }
    : {
        id: null,
        name: "",
        sampleId: null,
        testId: null,
        result: "",
        note: "",
        toggled: true,
        active: true,
        operations: [emptyOperation()],
      };
export const ruleName = (type, record) =>
  String(type === "reflex" ? record.ruleName || "" : record.name || "");

const withinLength = (value, limit) =>
  value == null || String(value).length <= limit;
const requiredName = (value) =>
  typeof value === "string" && Boolean(value.trim()) && value.length <= 64;
// Limits mirror the persisted source and derived tables. Existing text is kept
// verbatim; invalid legacy content must be corrected explicitly before saving.
export const conditionValueLimit = (condition, resultType) =>
  ["INSIDE_NORMAL_RANGE", "OUTSIDE_NORMAL_RANGE"].includes(
    condition.relation,
  ) ||
  (resultType && !["N", "D"].includes(resultType))
    ? 50
    : 64;
export const ruleFieldLengthsValid = (
  type,
  draft,
  resultType = () => undefined,
) =>
  type === "reflex"
    ? requiredName(draft.ruleName) &&
      draft.conditions.every(
        (item) =>
          requiredName(item.testName) &&
          withinLength(
            item.value,
            conditionValueLimit(item, resultType(item)),
          ) &&
          withinLength(item.value2, 64),
      ) &&
      draft.actions.every(
        (item) =>
          requiredName(item.reflexTestName) &&
          withinLength(item.internalNote, 50) &&
          withinLength(item.externalNote, 50),
      )
    : requiredName(draft.name) &&
      withinLength(draft.note, 64) &&
      withinLength(draft.result, 64) &&
      draft.operations.every((item) => withinLength(item.value, 64));

const hasFields = (item, keys) =>
  Boolean(
    item &&
    !Array.isArray(item) &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(item, key)),
  );
const nullableScalar = (value) =>
  value == null ||
  typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value));
const validChildren = (record, type) =>
  type === "reflex"
    ? record.conditions.every(
        (item) =>
          hasFields(item, [
            "id",
            "sampleId",
            "testId",
            "testName",
            "relation",
            "value",
            "value2",
            "testAnalyteId",
          ]) &&
          validRuleId(item.id) &&
          validRuleId(item.sampleId) &&
          validRuleId(item.testId) &&
          typeof item.testName === "string" &&
          typeof item.relation === "string" &&
          nullableScalar(item.value) &&
          nullableScalar(item.value2) &&
          (item.testAnalyteId == null || validRuleId(item.testAnalyteId)),
      ) &&
      record.actions.every(
        (item) =>
          hasFields(item, [
            "id",
            "sampleId",
            "reflexTestId",
            "reflexTestName",
            "internalNote",
            "externalNote",
            "addNotification",
            "testReflexId",
          ]) &&
          validRuleId(item.id) &&
          validRuleId(item.sampleId) &&
          validRuleId(item.reflexTestId) &&
          typeof item.reflexTestName === "string" &&
          nullableScalar(item.internalNote) &&
          nullableScalar(item.externalNote) &&
          ["Y", "N"].includes(item.addNotification) &&
          (item.testReflexId == null || validRuleId(item.testReflexId)),
      )
    : hasFields(record, ["sampleId", "testId", "result", "note"]) &&
      validRuleId(record.sampleId) &&
      validRuleId(record.testId) &&
      nullableScalar(record.result) &&
      nullableScalar(record.note) &&
      record.operations.every(
        (item) =>
          hasFields(item, ["id", "order", "type", "value", "sampleId"]) &&
          validRuleId(item.id) &&
          Number.isInteger(item.order) &&
          [
            "TEST_RESULT",
            "MATH_FUNCTION",
            "INTEGER",
            "PATIENT_ATTRIBUTE",
          ].includes(item.type) &&
          nullableScalar(item.value) &&
          (item.sampleId == null || validRuleId(item.sampleId)),
      );

export const isRuleDetail = (type, record, id) =>
  Boolean(
    record &&
    !Array.isArray(record) &&
    validRuleId(record.id) &&
    (id == null || String(record.id) === String(id)) &&
    typeof record.active === "boolean" &&
    ((typeof record.lastupdated === "string" && record.lastupdated.length) ||
      (typeof record.lastupdated === "number" &&
        Number.isFinite(record.lastupdated) &&
        record.lastupdated > 0)) &&
    typeof record.configurationVersion === "string" &&
    record.configurationVersion.length &&
    typeof (type === "reflex" ? record.ruleName : record.name) === "string" &&
    (type === "reflex"
      ? Array.isArray(record.conditions) &&
        Array.isArray(record.actions) &&
        record.conditions.length > 0 &&
        record.actions.length > 0
      : Array.isArray(record.operations) && record.operations.length > 0) &&
    validChildren(record, type),
  );

const scalar = (value) => (value == null ? "" : String(value));
const project = (item, keys) => keys.map((key) => scalar(item[key]));
const sorted = (items, keys) =>
  items.map((item) => JSON.stringify(project(item, keys))).sort();
const conditionDefinition = [
  "sampleId",
  "testId",
  "testName",
  "relation",
  "value",
  "value2",
];
const actionDefinition = [
  "sampleId",
  "reflexTestId",
  "reflexTestName",
  "internalNote",
  "externalNote",
  "addNotification",
];
// Compare the requested definition, not just an ID or name. Generated linkage
// identities may change after the backend rebuilds the rule's derived data.
export const ruleMatches = (type, actual, wanted) => {
  if (!isRuleDetail(type, actual, wanted.id) || actual.active !== wanted.active)
    return false;
  if (type === "reflex")
    return (
      actual.ruleName === wanted.ruleName &&
      actual.overall === wanted.overall &&
      JSON.stringify(sorted(actual.conditions, conditionDefinition)) ===
        JSON.stringify(sorted(wanted.conditions, conditionDefinition)) &&
      JSON.stringify(sorted(actual.actions, actionDefinition)) ===
        JSON.stringify(sorted(wanted.actions, actionDefinition))
    );
  return (
    JSON.stringify(
      project(actual, ["name", "sampleId", "testId", "result", "note"]),
    ) ===
      JSON.stringify(
        project(wanted, ["name", "sampleId", "testId", "result", "note"]),
      ) &&
    JSON.stringify(
      actual.operations.map((op) =>
        project(op, ["order", "type", "value", "sampleId"]),
      ),
    ) ===
      JSON.stringify(
        wanted.operations.map((op) =>
          project(op, ["order", "type", "value", "sampleId"]),
        ),
      )
  );
};

export const rulePayload = (type, draft) => {
  const result = cloneRule(draft);
  if (type === "calculation")
    result.operations = result.operations.map((op, order) => ({
      ...op,
      order,
    }));
  return result;
};
export const readRuleContext = (search, defaultType = "all") => {
  const params = new URLSearchParams(search);
  const type = params.get("type");
  const state = params.get("state");
  const page = Number(params.get("page"));
  return {
    q: (params.get("q") || "").slice(0, 200),
    type: ["all", "reflex", "calculation"].includes(type) ? type : defaultType,
    state: ["active", "inactive"].includes(state) ? state : "all",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
};
export const ruleContextSearch = (context) => {
  const params = new URLSearchParams();
  if (context.q) params.set("q", context.q);
  // Explicit all preserves the chosen category on legacy entry routes.
  params.set("type", context.type);
  if (context.state !== "all") params.set("state", context.state);
  if (context.page > 1) params.set("page", String(context.page));
  return `?${params}`;
};
export const formulaSyntaxValid = (operations) => {
  const expression = operations
    .map((op) => (op.type === "TEST_RESULT" ? "0" : op.value))
    .join(" ")
    .replace(/\b(?:AGE|WEIGHT)\b/g, "0")
    .replace(/IS_IN_NORMAL_RANGE/g, ">=0 && 1<=10")
    .replace(/IS_OUTSIDE_NORMAL_RANGE/g, "<0 || 1>10");
  try {
    validateCalculationExpression(expression);
    return true;
  } catch {
    return false;
  }
};
export const numericValueValid = (value) =>
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value)) &&
  Number.isFinite(Number(value));
