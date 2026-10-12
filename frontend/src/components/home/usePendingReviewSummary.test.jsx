import React from "react";
import { render } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { usePendingReviewSummary } from "./usePendingReviewSummary";
import { readPendingReviewSummary } from "./pendingReviewSummary";
import { readPendingSummarySession } from "./pendingSummarySession";
import { definePendingSummaryHookContract } from "./testUtils/pendingSummaryHookContract";

vi.mock("./pendingSummarySession", async () => ({
  ...(await vi.importActual("./pendingSummarySession")),
  readPendingSummarySession: vi.fn(),
}));

vi.mock("./pendingReviewSummary", async () => ({
  ...(await vi.importActual("./pendingReviewSummary")),
  readPendingReviewSummary: vi.fn(),
}));

const summary = (count = 7, generatedAt = "2026-09-23T06:20:00Z") => ({
  scope: "pending",
  state: "partial",
  analysisCount: count,
  accessionCount: 2,
  displayRowCount: null,
  qcBlockedAnalysisCount: null,
  generatedAt,
});

const { Probe, initialContext, read } = definePendingSummaryHookContract({
  useSummary: usePendingReviewSummary,
  readSummary: readPendingReviewSummary,
  role: "Validation",
  summary,
  emptySummary: () => ({
    ...summary(0),
    state: "ready",
    accessionCount: 0,
    displayRowCount: 0,
    qcBlockedAnalysisCount: 0,
  }),
});

test("review verifies the explicit Validation role before and after its count without writing shared CSRF", async () => {
  readPendingReviewSummary.mockResolvedValue(summary());
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(<Probe context={initialContext()} />);
  await waitFor(() => expect(read("count")).toBe("7"));
  expect(readPendingSummarySession).toHaveBeenCalledTimes(2);
  for (const args of readPendingSummarySession.mock.calls)
    expect(args[1]).toBe("Validation");
  expect(write).not.toHaveBeenCalled();
  write.mockRestore();
});
