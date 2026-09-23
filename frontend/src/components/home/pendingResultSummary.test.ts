import config from "../../config.json";
import {
  parsePendingResultSummary,
  PendingSummaryError,
  readPendingResultSummary,
} from "./pendingResultSummary";

const empty = {
  scope: "pending",
  state: "ready",
  analysisCount: 0,
  specimenCount: 0,
  displayRowCount: 0,
  missingSpecimenAnalysisCount: 0,
  generatedAt: "2026-09-23T06:20:00.123456789Z",
};
const json = (value: unknown = empty, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

afterEach(() => vi.unstubAllGlobals());

test("accepts a confirmed empty queue and a partial summary with unknown display rows", () => {
  expect(parsePendingResultSummary(empty)).toEqual(empty);
  const partial = {
    ...empty,
    state: "partial",
    analysisCount: 7,
    specimenCount: null,
    displayRowCount: null,
    missingSpecimenAnalysisCount: 1,
  };
  expect(parsePendingResultSummary(partial)).toEqual(partial);
  expect(
    parsePendingResultSummary({
      ...partial,
      analysisCount: null,
      specimenCount: null,
    }),
  ).toHaveProperty("analysisCount", null);
});

test.each([
  null,
  [],
  "0",
  {},
  { ...empty, scope: "all" },
  { ...empty, state: "error" },
  { ...empty, state: {} },
  { ...empty, analysisCount: undefined },
  { ...empty, analysisCount: null },
  { ...empty, analysisCount: -1 },
  { ...empty, analysisCount: 0.5 },
  { ...empty, analysisCount: "0" },
  { ...empty, analysisCount: Number.MAX_SAFE_INTEGER + 1 },
  { ...empty, analysisCount: NaN },
  { ...empty, analysisCount: Infinity },
  { ...empty, specimenCount: undefined },
  { ...empty, specimenCount: null },
  { ...empty, displayRowCount: undefined },
  { ...empty, displayRowCount: null },
  { ...empty, missingSpecimenAnalysisCount: undefined },
  { ...empty, missingSpecimenAnalysisCount: null },
  { ...empty, missingSpecimenAnalysisCount: -1 },
  { ...empty, missingSpecimenAnalysisCount: 0.1 },
  { ...empty, missingSpecimenAnalysisCount: 1 },
  { ...empty, state: "partial", missingSpecimenAnalysisCount: 1 },
  { ...empty, specimenCount: 2 },
  { ...empty, analysisCount: 2, displayRowCount: 1 },
  {
    ...empty,
    state: "partial",
    analysisCount: 7,
    specimenCount: 2,
    displayRowCount: null,
    missingSpecimenAnalysisCount: 1,
  },
  { ...empty, generatedAt: undefined },
  { ...empty, generatedAt: 123 },
  { ...empty, generatedAt: "yesterday" },
  { ...empty, generatedAt: "2026-09-23T06:20:00+08:00" },
  { ...empty, generatedAt: "2026-13-23T06:20:00Z" },
])("rejects malformed or misleading summary %#", (value) => {
  expect(() => parsePendingResultSummary(value)).toThrow(PendingSummaryError);
});

test("reads one small, uncached summary without fetching clinical rows", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json()));
  const controller = new AbortController();
  expect(await readPendingResultSummary(controller.signal)).toEqual(empty);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    config.serverBaseUrl + "/rest/results-entry/pending/summary",
    expect.objectContaining({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    }),
  );
});

test.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
  [404, "unavailable"],
  [409, "unavailable"],
  [500, "unavailable"],
  [302, "unavailable"],
])(
  "uses real HTTP %s even if the body looks like a valid zero",
  async (status, kind) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(empty, status)));
    await expect(
      readPendingResultSummary(new AbortController().signal),
    ).rejects.toMatchObject({ kind });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test.each([
  "html",
  "invalid-json",
  "invalid-utf8",
  "oversize",
  "redirected",
  "missing-fields",
])("does not invent a count for %s responses", async (mode) => {
  const response =
    mode === "html"
      ? new Response("<html>Login</html>", {
          headers: { "content-type": "text/html" },
        })
      : mode === "invalid-json"
        ? new Response("{", { headers: { "content-type": "application/json" } })
        : mode === "invalid-utf8"
          ? new Response(new Uint8Array([255]), {
              headers: { "content-type": "application/json" },
            })
          : json(
              mode === "oversize"
                ? { ...empty, padding: "x".repeat(32 * 1024) }
                : mode === "missing-fields"
                  ? {}
                  : empty,
            );
  if (mode === "redirected")
    Object.defineProperty(response, "redirected", { value: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(
    readPendingResultSummary(new AbortController().signal),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("a cancelled request cannot return a successful summary", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json()));
  const controller = new AbortController();
  controller.abort();
  await expect(readPendingResultSummary(controller.signal)).rejects.toThrow();
});
