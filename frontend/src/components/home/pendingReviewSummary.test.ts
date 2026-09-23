import config from "../../config.json";
import {
  parsePendingReviewSummary,
  readPendingReviewSummary,
} from "./pendingReviewSummary";
import { PendingSummaryError } from "./pendingResultSummary";

const empty = {
  scope: "pending",
  state: "ready",
  analysisCount: 0,
  accessionCount: 0,
  displayRowCount: 0,
  qcBlockedAnalysisCount: 0,
  generatedAt: "2026-09-23T06:20:00.123456789Z",
};
const partial = {
  ...empty,
  state: "partial",
  analysisCount: 7,
  accessionCount: 2,
  displayRowCount: null,
  qcBlockedAnalysisCount: null,
};
const json = (value: unknown = empty, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
afterEach(() => vi.unstubAllGlobals());

test("review counts retain known analysis tasks and unknown light-summary units", () => {
  expect(parsePendingReviewSummary(empty)).toEqual(empty);
  expect(parsePendingReviewSummary(partial)).toEqual(partial);
  expect(
    parsePendingReviewSummary({
      ...partial,
      analysisCount: null,
      accessionCount: null,
    }),
  ).toHaveProperty("analysisCount", null);
});

test.each([
  null,
  {},
  [],
  "<html>login</html>",
  { ...empty, scope: "filtered" },
  {
    ...empty,
    state: "unqueried",
    analysisCount: null,
    accessionCount: null,
    displayRowCount: null,
    qcBlockedAnalysisCount: null,
  },
  { ...empty, analysisCount: undefined },
  { ...empty, analysisCount: "0" },
  { ...empty, accessionCount: undefined },
  { ...empty, displayRowCount: undefined },
  { ...empty, qcBlockedAnalysisCount: undefined },
  { ...empty, analysisCount: -1 },
  { ...empty, analysisCount: 0.5 },
  { ...empty, analysisCount: Number.MAX_SAFE_INTEGER + 1 },
  { ...partial, state: "ready" },
  { ...partial, qcBlockedAnalysisCount: 8 },
])("malformed or non-pending review summary is unavailable: %j", (value) => {
  expect(() => parsePendingReviewSummary(value)).toThrow(PendingSummaryError);
});

test("reads exactly the small review endpoint without actor override, clinical rows or cache", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(partial)));
  const signal = new AbortController().signal;
  await expect(readPendingReviewSummary(signal)).resolves.toEqual(partial);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    config.serverBaseUrl + "/rest/review/pending/summary",
    expect.objectContaining({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal,
    }),
  );
});

test.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
  [404, "unavailable"],
  [503, "unavailable"],
])("review HTTP %s never becomes a valid zero", async (status, kind) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(json(empty, status as number)),
  );
  await expect(
    readPendingReviewSummary(new AbortController().signal),
  ).rejects.toMatchObject({ kind });
});

test("an HTML login response and an already aborted read cannot return review statistics", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("<html>login</html>", {
        headers: { "content-type": "text/html" },
      }),
    ),
  );
  await expect(
    readPendingReviewSummary(new AbortController().signal),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(readPendingReviewSummary(controller.signal)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
