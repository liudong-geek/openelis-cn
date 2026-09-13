import { entrySubmissionError, validOrderId } from "./orderEntryReceipt";
import { receiptInstant } from "./specimenReceipt";

export const QA_SCOPE = "ALL_CURRENT_TUBES_CHECKLIST";
export const qaFailure = (key = "unknown") =>
  entrySubmissionError(`order.qaReview.${key}`);
export const qaUuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
export const qaHash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const text = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const timestamp = (v) => {
  try {
    if (typeof v !== "string" || !Boolean(receiptInstant(v))) return false;
    const fraction = v.match(/\.(\d+)Z$/)?.[1];
    return (
      !fraction ||
      ((fraction.length === 3 || fraction.length === 6) &&
        !fraction.endsWith("000"))
    );
  } catch {
    return false;
  }
};
const sameIds = (a, b) =>
  a.length === b.length &&
  [...a].sort().every((id, i) => id === [...b].sort()[i]);
const blocked = () => ({
  schema: 1,
  scope: QA_SCOPE,
  state: "BLOCKED",
  currentFactsDigest: null,
  checklistVersion: null,
  specimenIds: [],
  checklistItems: null,
  confirmationId: null,
  reviewedAt: null,
  reviewerId: null,
  currentAcceptanceVerified: false,
  reason: null,
});

// An unusable optional QA projection blocks QA only, not the authorized patient
// and collection read. Never propagate server-supplied commands/capabilities.
export function verifyQaReview(review, current) {
  if (review === undefined) return undefined;
  try {
    if (
      !review ||
      review.schema !== 1 ||
      review.scope !== QA_SCOPE ||
      review.currentAcceptanceVerified !== false ||
      ![
        "NOT_CONFIRMED",
        "MATCHED_CONFIRMATION",
        "STALE_CONFIRMATION",
        "INVALID_CONFIRMATION",
        "BLOCKED",
      ].includes(review.state) ||
      !text(review.reason, 2000)
    )
      throw qaFailure();
    if (review.state === "BLOCKED" || review.state === "INVALID_CONFIRMATION")
      return { ...blocked(), state: review.state, reason: review.reason };
    const ids = review.specimenIds,
      items = review.checklistItems;
    if (
      current.workflowType !== "clinical" ||
      !current.patient ||
      !qaHash(review.currentFactsDigest) ||
      !(
        review.checklistVersion === null || timestamp(review.checklistVersion)
      ) ||
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      !ids.every((id) => typeof id === "string" && validOrderId(id)) ||
      new Set(ids).size !== ids.length ||
      !sameIds(
        ids,
        current.physicalSpecimens.map((t) => t.id),
      ) ||
      current.requestedSpecimens.some((t) => t.status === "REQUESTED") ||
      current.physicalSpecimens.some(
        (t) =>
          !timestamp(t.receivedDate) ||
          !timestamp(t.collectionDate) ||
          t.voided ||
          t.rejected ||
          typeof t.sortOrder !== "string" ||
          !/^[1-9]\d{0,4}$/.test(t.sortOrder),
      ) ||
      new Set(current.physicalSpecimens.map((t) => t.sortOrder)).size !==
        ids.length ||
      !Array.isArray(items) ||
      !items.length ||
      items.length > 100 ||
      !items.every(
        (item) =>
          item &&
          validOrderId(item.id) &&
          text(item.key, 255) &&
          text(item.label, 4000) &&
          (item.sortOrder === null || Number.isSafeInteger(item.sortOrder)) &&
          timestamp(item.lastUpdated),
      ) ||
      new Set(items.map((item) => item.key)).size !== items.length ||
      new Set(items.map((item) => item.id)).size !== items.length
    )
      throw qaFailure();
    if (
      review.state !== "NOT_CONFIRMED" &&
      (!qaUuid(review.confirmationId) ||
        !timestamp(review.reviewedAt) ||
        !Number.isSafeInteger(review.reviewerId) ||
        review.reviewerId <= 0 ||
        review.checklistVersion === null)
    )
      throw qaFailure();
    return {
      schema: 1,
      scope: QA_SCOPE,
      state: review.state,
      reason: review.reason,
      currentFactsDigest: review.currentFactsDigest,
      checklistVersion: review.checklistVersion,
      specimenIds: [...ids],
      checklistItems: items.map(
        ({ id, key, label, sortOrder, lastUpdated }) => ({
          id,
          key,
          label,
          sortOrder,
          lastUpdated,
        }),
      ),
      confirmationId: qaUuid(review.confirmationId)
        ? review.confirmationId
        : null,
      reviewedAt: timestamp(review.reviewedAt) ? review.reviewedAt : null,
      reviewerId:
        Number.isSafeInteger(review.reviewerId) && review.reviewerId > 0
          ? review.reviewerId
          : null,
      currentAcceptanceVerified: false,
    };
  } catch {
    return blocked();
  }
}
export function qaCanConfirm(result) {
  const review = result?.current?.qaReview;
  return Boolean(
    review &&
    ["NOT_CONFIRMED", "STALE_CONFIRMATION"].includes(review.state) &&
    qaHash(review.currentFactsDigest),
  );
}
export function buildQaConfirmation(result, checked) {
  if (
    !qaCanConfirm(result) ||
    !Array.isArray(checked) ||
    new Set(checked).size !== checked.length ||
    !sameIds(
      checked,
      result.current.qaReview.checklistItems.map((i) => i.key),
    )
  )
    throw qaFailure("incomplete");
  const review = result.current.qaReview;
  return {
    sampleId: result.current.sampleId,
    confirmationId: crypto.randomUUID(),
    expectedFactsDigest: review.currentFactsDigest,
    expectedChecklistVersion: review.checklistVersion,
    specimenIds: [...review.specimenIds],
    verifiedItems: Object.fromEntries(checked.map((key) => [key, true])),
  };
}
export function verifyQaAck(data, command) {
  if (
    !data ||
    data.sampleId !== command.sampleId ||
    data.confirmationId !== command.confirmationId ||
    data.scope !== QA_SCOPE ||
    typeof data.replayed !== "boolean" ||
    data.readbackRequired !== true ||
    data.currentAcceptanceVerified !== false
  )
    throw qaFailure();
}
export function verifyQaReadback(result, command) {
  const review = result?.current?.qaReview;
  if (
    result?.current?.sampleId !== command.sampleId ||
    review?.state !== "MATCHED_CONFIRMATION" ||
    review.confirmationId !== command.confirmationId ||
    review.currentFactsDigest !== command.expectedFactsDigest ||
    !sameIds(review.specimenIds, command.specimenIds) ||
    !timestamp(review.checklistVersion) ||
    review.checklistVersion === command.expectedChecklistVersion ||
    !timestamp(review.reviewedAt) ||
    !Number.isSafeInteger(review.reviewerId) ||
    review.reviewerId <= 0 ||
    review.currentAcceptanceVerified !== false
  )
    throw qaFailure();
}
