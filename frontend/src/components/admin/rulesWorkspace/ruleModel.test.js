import {
  cloneRule,
  newRule,
  readRuleContext,
  ruleContextSearch,
  isRuleDetail,
  ruleMatches,
  rulePayload,
  formulaSyntaxValid,
  numericValueValid,
  ruleFieldLengthsValid,
} from "./ruleModel";
import { reflexFixture, calculationFixture, copy } from "./testFixture";

test("new drafts have independent child arrays and identities", () => {
  const first = newRule("reflex");
  const second = newRule("reflex");
  first.conditions[0].value = "999";
  first.actions[0].internalNote = "local";
  expect(second.conditions[0].value).toBe("0");
  expect(second.actions[0].internalNote).toBe("");
  expect(second.id).toBeNull();
  const copied = cloneRule(reflexFixture);
  copied.actions[0].externalNote = "new";
  expect(reflexFixture.actions[0].externalNote).toBe("报告备注");
});
test("query accepts only supported categories and safe positive pages; explicit all overrides legacy default", () => {
  expect(
    readRuleContext("?q=test&type=unknown&state=x&page=-2", "reflex"),
  ).toEqual({ q: "test", type: "reflex", state: "all", page: 1 });
  expect(
    readRuleContext("?type=all&page=9007199254740992", "calculation").type,
  ).toBe("all");
  expect(readRuleContext("?page=9007199254740992").page).toBe(1);
  const context = {
    q: "白细胞",
    type: "calculation",
    state: "inactive",
    page: 2,
  };
  expect(readRuleContext(ruleContextSearch(context))).toEqual(context);
});
test("record identity, version and complete child data are required", () => {
  expect(isRuleDetail("reflex", reflexFixture, 1)).toBe(true);
  expect(isRuleDetail("reflex", reflexFixture, 2)).toBe(false);
  expect(
    isRuleDetail("reflex", {
      ...reflexFixture,
      configurationVersion: undefined,
    }),
  ).toBe(false);
  expect(isRuleDetail("reflex", { ...reflexFixture, conditions: [] })).toBe(
    false,
  );
  expect(isRuleDetail("calculation", calculationFixture, 2)).toBe(true);
});
test("unknown-write verification compares the full definition rather than ID/name and ignores generated identities", () => {
  const desired = copy(reflexFixture);
  const actual = copy(reflexFixture);
  actual.conditions[0].testAnalyteId = 999;
  actual.actions[0].testReflexId = 888;
  expect(ruleMatches("reflex", actual, desired)).toBe(true);
  actual.conditions[0].value = "20";
  expect(ruleMatches("reflex", actual, desired)).toBe(false);
  actual.conditions[0].value = "10";
  actual.conditions[0].testName = "other";
  expect(ruleMatches("reflex", actual, desired)).toBe(false);
  actual.conditions[0].testName = desired.conditions[0].testName;
  actual.actions[0].reflexTestName = "other";
  expect(ruleMatches("reflex", actual, desired)).toBe(false);
  actual.actions[0].reflexTestName = desired.actions[0].reflexTestName;
  actual.actions[0].externalNote = "lost";
  expect(ruleMatches("reflex", actual, desired)).toBe(false);
  const changed = copy(calculationFixture);
  changed.operations[0].order = 9;
  expect(ruleMatches("calculation", changed, calculationFixture)).toBe(false);
  changed.operations[0].order = 0;
  changed.operations[0].value = "2";
  expect(ruleMatches("calculation", changed, calculationFixture)).toBe(false);
});
test("calculation payload assigns order without mutating the original draft", () => {
  const draft = copy(calculationFixture);
  draft.operations[0].order = 9;
  const payload = rulePayload("calculation", draft);
  expect(payload.operations[0].order).toBe(0);
  expect(draft.operations[0].order).toBe(9);
  expect(payload.configurationVersion).toBe(draft.configurationVersion);
});
test("restricted expression parser is reused; signed decimals allowed and executable text rejected", () => {
  expect(numericValueValid("-0.5")).toBe(true);
  expect(numericValueValid("Infinity")).toBe(false);
  expect(numericValueValid("2x")).toBe(false);
  expect(
    formulaSyntaxValid([
      { type: "INTEGER", value: "2" },
      { type: "MATH_FUNCTION", value: "+" },
      { type: "TEST_RESULT", value: "10" },
    ]),
  ).toBe(true);
  expect(formulaSyntaxValid([{ type: "INTEGER", value: "1;alert(1)" }])).toBe(
    false,
  );
  expect(formulaSyntaxValid([{ type: "INTEGER", value: "" }])).toBe(false);
});

test("source and derived field limits reject oversized content without truncation", () => {
  const reflex = copy(reflexFixture);
  expect(ruleFieldLengthsValid("reflex", reflex)).toBe(true);
  reflex.actions[0].internalNote = "备注".repeat(26);
  expect(ruleFieldLengthsValid("reflex", reflex)).toBe(false);
  expect(reflex.actions[0].internalNote).toBe("备注".repeat(26));
  reflex.actions[0].internalNote = "备注".repeat(25);
  reflex.conditions[0].value = "1".repeat(65);
  expect(ruleFieldLengthsValid("reflex", reflex)).toBe(false);
  reflex.conditions[0].value = "10";
  reflex.actions[0].reflexTestName = "";
  expect(ruleFieldLengthsValid("reflex", reflex)).toBe(false);
  const calculation = copy(calculationFixture);
  calculation.note = "1".repeat(64);
  expect(ruleFieldLengthsValid("calculation", calculation)).toBe(true);
  calculation.name = "1".repeat(65);
  expect(ruleFieldLengthsValid("calculation", calculation)).toBe(false);
});
