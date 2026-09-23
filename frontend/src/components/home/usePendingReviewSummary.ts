import type { UserSessionDetailsContextValue } from "../../UserSessionDetailsContext";
import { readPendingReviewSummary } from "./pendingReviewSummary";
import { useVerifiedPendingSummary } from "./useVerifiedPendingSummary";

export function usePendingReviewSummary(
  context: UserSessionDetailsContextValue,
) {
  return useVerifiedPendingSummary(
    context,
    readPendingReviewSummary,
    "Validation",
  );
}
