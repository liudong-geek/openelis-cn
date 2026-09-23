import {
  parseReviewQuerySummary,
  reviewReadOnlyMessage,
} from "./reviewQuerySummary";

const summary = (extra = {}) => ({
  scope: "pending",
  state: "ready",
  analysisCount: 4,
  accessionCount: 2,
  displayRowCount: 6,
  qcBlockedAnalysisCount: 1,
  generatedAt: "2026-09-23T12:30:00Z",
  ...extra,
});

test("accepts complete-query units, partial unknowns and confirmed empty counts without deriving one from another", () => {
  expect(parseReviewQuerySummary(summary(), "pending")).toEqual(summary());
  const partial = summary({
    state: "partial",
    displayRowCount: null,
    qcBlockedAnalysisCount: null,
  });
  expect(parseReviewQuerySummary(partial, "pending")).toEqual(partial);
  const empty = summary({
    analysisCount: 0,
    accessionCount: 0,
    displayRowCount: 0,
    qcBlockedAnalysisCount: 0,
  });
  expect(parseReviewQuerySummary(empty, "pending")).toEqual(empty);
});

test("unqueried is only a filtered scope with all four counts unknown", () => {
  const unqueried = summary({
    scope: "filtered",
    state: "unqueried",
    analysisCount: null,
    accessionCount: null,
    displayRowCount: null,
    qcBlockedAnalysisCount: null,
  });
  expect(parseReviewQuerySummary(unqueried, "filtered")).toEqual(unqueried);
  expect(
    parseReviewQuerySummary({ ...unqueried, scope: "pending" }, "pending"),
  ).toBeNull();
  expect(
    parseReviewQuerySummary({ ...unqueried, analysisCount: 0 }, "filtered"),
  ).toBeNull();
});

test.each([
  null,
  "<html>login</html>",
  [],
  {},
  summary({ analysisCount: undefined }),
  summary({ analysisCount: "4" }),
  summary({ analysisCount: -1 }),
  summary({ analysisCount: 1.5 }),
  summary({ analysisCount: Number.MAX_SAFE_INTEGER + 1 }),
  summary({ displayRowCount: null }),
  summary({ state: "partial" }),
  summary({ qcBlockedAnalysisCount: 5 }),
  summary({ accessionCount: 5 }),
  summary({ displayRowCount: 3 }),
  summary({ analysisCount: 0 }),
  summary({ generatedAt: "yesterday" }),
  summary({ generatedAt: "2026-09-23T12:30:00+08:00" }),
  summary({ scope: "filtered" }),
])(
  "rejects malformed or contradictory statistics without fabricating zero: %j",
  (value) => {
    expect(parseReviewQuerySummary(value, "pending")).toBeNull();
  },
);

test("read-only reasons explain server restrictions without imposing restrictions on editable rows", () => {
  for (const reason of ["released", "printed", "released_and_printed"]) {
    expect(
      reviewReadOnlyMessage({ readOnly: true, reviewReadOnlyReason: reason }),
    ).toBe(`validation.readOnly.${reason}`);
    expect(
      reviewReadOnlyMessage({ readOnly: false, reviewReadOnlyReason: reason }),
    ).toBeNull();
  }
  expect(
    reviewReadOnlyMessage({
      readOnly: true,
      reviewReadOnlyReason: "new-reason",
    }),
  ).toBe("validation.readOnly.existing");
});
