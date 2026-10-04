import { pendingReportKey } from "../patient/resultsViewer/reportWorkspaceState";
import { validSampleId } from "./sampleStatus";

export const cancellationPendingKey = (actorId, sampleItemId, analysisId) =>
  validSampleId(actorId) &&
  validSampleId(sampleItemId) &&
  validSampleId(analysisId)
    ? pendingReportKey(
        `sample-cancel:account:${actorId}`,
        `${sampleItemId}:${analysisId}`,
      )
    : null;

export const cancellationPending = (key) => {
  if (!key) return true;
  try {
    return sessionStorage.getItem(key) !== null;
  } catch {
    return true;
  }
};

export const rememberCancellation = (key, requestContext) => {
  if (!key || requestContext?.current?.() !== true || cancellationPending(key))
    throw new Error("cancellation unavailable");
  // Only an opaque operation marker is stored. No clinical data or credentials.
  sessionStorage.setItem(key, JSON.stringify({ pending: true }));
  if (!cancellationPending(key))
    throw new Error("cancellation marker unavailable");
};

export const clearCancellation = (key) => {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Keep the action blocked. */
  }
};

export const canceledTestConfirmed = (test) =>
  validSampleId(test?.analysisId) &&
  validSampleId(test?.testId) &&
  test.statusCode === "Canceled" &&
  test.canCancelByStatus === false;

export const reconcileCancellations = (actorId, response) => {
  for (const sample of response?.sampleItems || []) {
    if (!validSampleId(sample.id)) continue;
    for (const test of sample.orderedTests || []) {
      if (canceledTestConfirmed(test))
        clearCancellation(
          cancellationPendingKey(actorId, sample.id, test.analysisId),
        );
    }
  }
};
