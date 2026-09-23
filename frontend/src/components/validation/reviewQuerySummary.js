const countKeys = [
  "analysisCount",
  "accessionCount",
  "displayRowCount",
  "qcBlockedAnalysisCount",
];

// The summary describes the complete server query, never the current page.
// Missing/malformed statistics cannot be replaced by visible row counts.
export const parseReviewQuerySummary = (value, expectedScope) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !["pending", "filtered"].includes(value.scope) ||
    value.scope !== expectedScope ||
    !["unqueried", "partial", "ready"].includes(value.state) ||
    typeof value.generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
      value.generatedAt,
    ) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !countKeys.every(
      (key) =>
        value[key] === null ||
        (Number.isSafeInteger(value[key]) && value[key] >= 0),
    )
  )
    return null;
  const values = countKeys.map((key) => value[key]);
  const {
    analysisCount,
    accessionCount,
    displayRowCount,
    qcBlockedAnalysisCount,
  } = value;
  if (
    (value.state === "ready" && values.some((count) => count === null)) ||
    (value.state === "partial" && values.every((count) => count !== null)) ||
    (value.state === "unqueried" &&
      (value.scope !== "filtered" || values.some((count) => count !== null))) ||
    (analysisCount !== null &&
      ((accessionCount !== null && accessionCount > analysisCount) ||
        (displayRowCount !== null && displayRowCount < analysisCount) ||
        (qcBlockedAnalysisCount !== null &&
          qcBlockedAnalysisCount > analysisCount) ||
        (analysisCount === 0 &&
          values.some((count) => count !== null && count !== 0))))
  )
    return null;
  return Object.fromEntries(
    ["scope", "state", ...countKeys, "generatedAt"].map((key) => [
      key,
      value[key],
    ]),
  );
};

export const reviewReadOnlyMessage = (row) => {
  if (!row.readOnly) return null;
  const reason = row.reviewReadOnlyReason;
  return ["released", "printed", "released_and_printed"].includes(reason)
    ? `validation.readOnly.${reason}`
    : "validation.readOnly.existing";
};
