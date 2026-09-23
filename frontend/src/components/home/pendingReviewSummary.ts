import { parseReviewQuerySummary } from "../validation/reviewQuerySummary";
import {
  PendingSummaryError,
  readPendingSummaryJson,
} from "./pendingResultSummary";

export interface PendingReviewSummary {
  scope: "pending";
  state: "ready" | "partial";
  analysisCount: number | null;
  accessionCount: number | null;
  displayRowCount: number | null;
  qcBlockedAnalysisCount: number | null;
  generatedAt: string;
}

export function parsePendingReviewSummary(
  value: unknown,
): PendingReviewSummary {
  const summary = parseReviewQuerySummary(value, "pending");
  if (!summary || summary.state === "unqueried")
    throw new PendingSummaryError("unavailable");
  return summary as PendingReviewSummary;
}

export async function readPendingReviewSummary(
  signal: AbortSignal,
): Promise<PendingReviewSummary> {
  return parsePendingReviewSummary(
    await readPendingSummaryJson("/rest/review/pending/summary", signal),
  );
}
