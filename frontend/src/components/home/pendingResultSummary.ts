import { readOpenElisResponse } from "../utils/readOpenElisResponse";

export interface PendingResultSummary {
  scope: "pending";
  state: "ready" | "partial";
  analysisCount: number | null;
  specimenCount: number | null;
  displayRowCount: number | null;
  missingSpecimenAnalysisCount: number;
  generatedAt: string;
}

export type SummaryFailure = "unauthenticated" | "forbidden" | "unavailable";

export class PendingSummaryError extends Error {
  constructor(public readonly kind: SummaryFailure) {
    super(kind);
    this.name = "PendingSummaryError";
  }
}

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parsePendingResultSummary(
  value: unknown,
): PendingResultSummary {
  if (!isRecord(value)) throw new PendingSummaryError("unavailable");
  const { analysisCount, specimenCount, displayRowCount } = value;
  const counts = [analysisCount, specimenCount, displayRowCount];
  if (
    value.scope !== "pending" ||
    (value.state !== "ready" && value.state !== "partial") ||
    !counts.every((count) => count === null || isCount(count)) ||
    !isCount(value.missingSpecimenAnalysisCount) ||
    (isCount(analysisCount) &&
      value.missingSpecimenAnalysisCount > analysisCount) ||
    (isCount(analysisCount) &&
      isCount(specimenCount) &&
      specimenCount > analysisCount) ||
    (isCount(analysisCount) &&
      isCount(displayRowCount) &&
      displayRowCount < analysisCount) ||
    (value.missingSpecimenAnalysisCount > 0 && specimenCount !== null) ||
    (value.state === "ready" &&
      (!counts.every(isCount) || value.missingSpecimenAnalysisCount !== 0)) ||
    typeof value.generatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(
      value.generatedAt,
    ) ||
    !Number.isFinite(Date.parse(value.generatedAt))
  ) {
    throw new PendingSummaryError("unavailable");
  }
  return {
    scope: "pending",
    state: value.state as PendingResultSummary["state"],
    analysisCount: analysisCount as number | null,
    specimenCount: specimenCount as number | null,
    displayRowCount: displayRowCount as number | null,
    missingSpecimenAnalysisCount: value.missingSpecimenAnalysisCount,
    generatedAt: value.generatedAt,
  };
}

// A summary is a small JSON document. Do not follow login redirects, cache it,
// load clinical rows for counting, log response bodies, or retry in the background.
export async function readPendingResultSummary(
  signal: AbortSignal,
): Promise<PendingResultSummary> {
  const response = await readOpenElisResponse(
    "/rest/results-entry/pending/summary",
    signal,
  );
  if (response.status === 401) throw new PendingSummaryError("unauthenticated");
  if (response.status === 403) throw new PendingSummaryError("forbidden");
  const limit = 32 * 1024;
  if (
    response.status !== 200 ||
    response.redirected ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    Number(response.headers.get("content-length")) > limit ||
    !response.body
  ) {
    throw new PendingSummaryError("unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > limit)
        throw new PendingSummaryError("unavailable");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw new PendingSummaryError("unavailable");
    return parsePendingResultSummary(JSON.parse(text));
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
