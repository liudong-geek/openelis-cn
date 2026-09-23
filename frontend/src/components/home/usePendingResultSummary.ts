import type { UserSessionDetailsContextValue } from "../../UserSessionDetailsContext";
import { readPendingResultSummary } from "./pendingResultSummary";
import { useVerifiedPendingSummary } from "./useVerifiedPendingSummary";

export function usePendingResultSummary(
  context: UserSessionDetailsContextValue,
) {
  return useVerifiedPendingSummary(context, readPendingResultSummary);
}
