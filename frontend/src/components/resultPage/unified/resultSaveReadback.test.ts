import {
  confirmedResultReadback,
  resultReadbackPath,
} from "./resultSaveReadback";
const row = {
  id: "0",
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  patientId: "501",
  accessionNumber: "SIM-RESULT-301",
  resultType: "N",
  resultValue: "0",
  resultId: "",
  analysisLastupdated: "1000",
  analysisStatusId: "4",
};
const receipt = { analysisLastupdated: "2000", analysisStatusId: "15" };
const saved = { ...row, ...receipt, resultId: "601", rawResultValue: "0" };
const verify = (value: unknown) =>
  confirmedResultReadback(row, receipt, value, [row]);
test("readback preserves the complete accession with encoded query characters", () => {
  const path = resultReadbackPath({ ...row, accessionNumber: "SIM-301&A=2" })!;
  const params = new URLSearchParams(path.split("?")[1]);
  expect(params.get("labNumber")).toBe("SIM-301&A=2");
  expect(params.get("doRange")).toBe("false");
  expect(params.has("A")).toBe(false);
});
test("binds a new zero result to its independently read real ID", () =>
  expect(verify({ testResult: [saved] })).toEqual([saved]));
test.each([
  undefined,
  null,
  {},
  [],
  { testResult: [] },
  { testResult: [saved, saved] },
])("rejects missing/ambiguous rows: %j", (value) =>
  expect(verify(value)).toBeNull(),
);
test.each([
  { analysisId: "102" },
  { sampleItemId: "202" },
  { testId: "402" },
  { patientId: "502" },
  { accessionNumber: "SIM-OTHER" },
  { analysisLastupdated: "1000" },
  { analysisStatusId: "4" },
  { resultId: "" },
  { resultId: "0" },
  { resultId: null },
  { rawResultValue: "8" },
  { rawResultValue: 0 },
  { rawResultValue: undefined },
  { resultType: "A" },
  { testResultComponentId: "other" },
  { hasQualifiedResult: true },
])("rejects a mismatched readback: %j", (change) =>
  expect(verify({ testResult: [{ ...saved, ...change }] })).toBeNull(),
);
test("an existing result cannot be replaced by another result ID", () =>
  expect(
    confirmedResultReadback(
      { ...row, resultId: "602" },
      receipt,
      { testResult: [saved] },
      [row],
    ),
  ).toBeNull());
test("旧待录入列表未提供患者编号时允许独立查询补全，但不能放宽已有编号或实管绑定", () => {
  const pending = { ...row, patientId: null };
  expect(
    confirmedResultReadback(pending, receipt, { testResult: [saved] }, [
      pending,
    ]),
  ).toEqual([saved]);
  expect(
    confirmedResultReadback(
      pending,
      receipt,
      { testResult: [{ ...saved, sampleItemId: "202" }] },
      [pending],
    ),
  ).toBeNull();
  expect(
    confirmedResultReadback(
      pending,
      receipt,
      { testResult: [{ ...saved, patientId: "invalid" }] },
      [pending],
    ),
  ).toBeNull();
  expect(verify({ testResult: [{ ...saved, patientId: "502" }] })).toBeNull();
});
test.each([
  ["N", "5", "5.00"],
  ["A", "反应(复检)", "反应"],
])("%s核对原始值而非格式化展示", (resultType, resultValue, display) => {
  const submitted = { ...row, resultType, resultValue };
  const actual = {
    ...saved,
    resultType,
    resultValue: display,
    rawResultValue: resultValue,
  };
  expect(
    confirmedResultReadback(submitted, receipt, { testResult: [actual] }, [
      submitted,
    ]),
  ).toEqual([actual]);
  expect(
    confirmedResultReadback(
      submitted,
      receipt,
      { testResult: [{ ...actual, rawResultValue: display }] },
      [submitted],
    ),
  ).toBeNull();
});
test.each(["M", "C"])(
  "compares %s selections as sets within their exact group",
  (resultType) => {
    const submitted = {
      ...row,
      resultType,
      multiSelectResultValues: '{"0":"10,11"}',
    };
    const actual = {
      ...saved,
      resultType,
      resultValue: "display",
      multiSelectResultValues: '{"0":"11,10"}',
    };
    expect(
      confirmedResultReadback(submitted, receipt, { testResult: [actual] }, [
        submitted,
      ]),
    ).toEqual([actual]);
    expect(
      confirmedResultReadback(
        submitted,
        receipt,
        {
          testResult: [{ ...actual, multiSelectResultValues: '{"1":"11,10"}' }],
        },
        [submitted],
      ),
    ).toBeNull();
  },
);
test("qualified values need an actual child result identity", () => {
  const submitted = {
    ...row,
    hasQualifiedResult: true,
    qualifiedResultValue: "5",
  };
  expect(
    confirmedResultReadback(submitted, receipt, { testResult: [saved] }, [
      submitted,
    ]),
  ).toBeNull();
  const actual = {
    ...saved,
    hasQualifiedResult: true,
    qualifiedResultValue: "5",
    qualifiedResultId: "602",
  };
  expect(
    confirmedResultReadback(submitted, receipt, { testResult: [actual] }, [
      submitted,
    ]),
  ).toEqual([actual]);
  expect(
    confirmedResultReadback(
      submitted,
      receipt,
      { testResult: [{ ...actual, qualifiedResultId: "601" }] },
      [submitted],
    ),
  ).toBeNull();
  expect(
    confirmedResultReadback(
      { ...submitted, qualifiedResultId: "603" },
      receipt,
      { testResult: [actual] },
      [submitted],
    ),
  ).toBeNull();
});
test.each(["M", "C"])(
  "%s replacement can select a new server representative ID",
  (resultType) => {
    const submitted = {
      ...row,
      resultType,
      resultId: "601",
      multiSelectResultValues: '{"0":"11"}',
    };
    const actual = {
      ...saved,
      resultType,
      resultId: "602",
      multiSelectResultValues: '{"0":"11"}',
    };
    expect(
      confirmedResultReadback(submitted, receipt, { testResult: [actual] }, [
        submitted,
      ]),
    ).toEqual([actual]);
  },
);
