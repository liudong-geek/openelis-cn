import { usePendingResultSummary } from "./usePendingResultSummary";
import { readPendingResultSummary } from "./pendingResultSummary";
import { definePendingSummaryHookContract } from "./testUtils/pendingSummaryHookContract";

vi.mock("./pendingSummarySession", async () => ({
  ...(await vi.importActual("./pendingSummarySession")),
  readPendingSummarySession: vi.fn(),
}));

vi.mock("./pendingResultSummary", async () => ({
  ...(await vi.importActual("./pendingResultSummary")),
  readPendingResultSummary: vi.fn(),
}));

const summary = (count = 7, generatedAt = "2026-09-23T06:20:00Z") => ({
  scope: "pending",
  state: "partial",
  analysisCount: count,
  specimenCount: 2,
  displayRowCount: null,
  missingSpecimenAnalysisCount: 0,
  generatedAt,
});

definePendingSummaryHookContract({
  useSummary: usePendingResultSummary,
  readSummary: readPendingResultSummary,
  role: "Results",
  summary,
  emptySummary: () => ({
    ...summary(0),
    state: "ready",
    specimenCount: 0,
    displayRowCount: 0,
  }),
});
