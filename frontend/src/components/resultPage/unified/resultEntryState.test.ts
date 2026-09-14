import {
  canResumeDraft,
  entryBlocked,
  entryReason,
  entrySession,
  sessionReady,
  newEntryDraft,
  restrictTubes,
} from "./resultEntryState";
const row = {
  id: "0",
  analysisId: "101",
  sampleItemId: "201",
  testId: "301",
  accessionNumber: "SIM-401",
  analysisLastupdated: "1000",
  resultType: "N",
  resultValue: "0",
  dictionaryResults: [{ id: "1", value: "阴性" }],
};
test.each([
  "resultType",
  "unitsOfMeasure",
  "dictionaryResults",
  "testResultComponentId",
  "analysisLastupdated",
  "patientId",
  "sampleItemId",
  "testId",
  "accessionNumber",
])("%s 变化不回填旧输入", (key) => {
  const draft = newEntryDraft(row);
  draft.held = true;
  expect(canResumeDraft(draft, { ...row })).toBe(true);
  expect(
    canResumeDraft(draft, {
      ...row,
      [key]:
        key === "dictionaryResults"
          ? [{ id: "1", value: "新定义" }]
          : "SIM-DIFFERENT",
    }),
  ).toBe(false);
});
test.each(["pending", "unknown"] as const)(
  "%s 不凭相同读取值解锁",
  (disposition) => {
    const draft = newEntryDraft(row);
    draft.held = true;
    draft.disposition = disposition;
    expect(canResumeDraft(draft, row)).toBe(false);
  },
);
test("缺少实管身份不能恢复；未知原因只用安全中文键", () => {
  const draft = newEntryDraft({ ...row, sampleItemId: undefined });
  draft.held = true;
  expect(canResumeDraft(draft, draft.row)).toBe(false);
  expect(
    entryReason({ ...row, resultEntryBlockedReason: "PRIVATE-SERVER-MESSAGE" }),
  ).toBe("results.workbench.entryUnavailable");
  expect(entryBlocked({ ...row, readOnly: true })).toBe(true);
  expect(entryBlocked({ ...row, readOnly: false })).toBe(false);
});
test("缺结果定义只锁一行，缺管ID的标本异常仍锁当前分析", () => {
  const one = {
    ...row,
    testResultComponentId: "1",
    resultEntryBlockedReason: "error.results.resultDefinitionMissing",
  };
  const other = { ...row, testResultComponentId: "2" };
  expect(
    restrictTubes([one, other])[1].resultEntryBlockedReason,
  ).toBeUndefined();
  expect(
    restrictTubes([other], {
      ...one,
      sampleItemId: undefined,
      resultEntryBlockedReason: "error.results.specimenRejected",
    })[0].resultEntryBlockedReason,
  ).toBe("error.results.specimenRejected");
});
test.each([false, "false", 1, undefined, null])(
  "非true身份不接受：%s",
  (authenticated) => {
    expect(
      entrySession({
        userSessionDetails: {
          authenticated: authenticated as boolean,
          userId: "701",
          sessionId: "SIM",
          csrf: "SIM",
        },
      }),
    ).toBeNull();
  },
);
test("严格旧会话与可选新代数均核对，不接受换token/暂停", () => {
  localStorage.setItem("CSRF", "SIM-CSRF");
  const context = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM",
      csrf: "SIM-CSRF",
    },
  };
  const stamp = entrySession(context);
  expect(sessionReady(context, stamp)).toBe(true);
  expect(
    sessionReady({ ...context, errorLoadingSessionDetails: true }, stamp),
  ).toBe(false);
  expect(sessionReady({ ...context, sessionPhase: "checking" }, stamp)).toBe(
    false,
  );
  expect(
    sessionReady({ ...context, getSessionCheckGeneration: () => 2 }, stamp),
  ).toBe(false);
  expect(
    sessionReady({ ...context, isSessionWriteAllowed: () => false }, stamp),
  ).toBe(false);
  localStorage.setItem("CSRF", "SIM-CHANGED");
  expect(sessionReady(context, stamp)).toBe(false);
});
