import { getReviewResults, postReviewResults } from "./reviewTransport";

const response = (
  status = 200,
  body = { queryId: "query-test" },
  extra = {},
) => ({
  ok: status >= 200 && status < 300,
  status,
  redirected: false,
  headers: new Headers({ "content-type": "application/json" }),
  json: vi.fn(async () => body),
  text: vi.fn(async () => JSON.stringify(body)),
  ...extra,
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each([401, 403, 409, 500])(
  "GET exposes HTTP %s without accepting JSON as result rows",
  async (status) => {
    const callback = vi.fn();
    const reply = response(status, { queryId: "q", resultList: [] });
    fetch.mockResolvedValue(reply);
    await getReviewResults(
      "/rest/AccessionValidation",
      callback,
      new AbortController().signal,
    );
    expect(callback).toHaveBeenCalledWith(undefined, status);
    expect(reply.json).not.toHaveBeenCalled();
  },
);
test("GET passes valid JSON, session credentials and cancellation", async () => {
  const callback = vi.fn();
  const reply = response(200, { queryId: "q", resultList: [] });
  fetch.mockResolvedValue(reply);
  const signal = new AbortController().signal;
  await getReviewResults("/rest/AccessionValidation", callback, signal);
  expect(callback).toHaveBeenCalledWith({ queryId: "q", resultList: [] }, 200);
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    }),
  );
});
test.each([
  ["redirect", response(200, {}, { redirected: true }), 401],
  [
    "HTML",
    response(
      200,
      {},
      { headers: new Headers({ "content-type": "text/html" }) },
    ),
    0,
  ],
  ["wrong query", response(200, { queryId: "other" }), 0],
  ["permission", response(403), 403],
  ["expired", response(409), 409],
])("POST rejects %s without success or retry", async (_case, reply, status) => {
  const callback = vi.fn();
  fetch.mockResolvedValue(reply);
  await postReviewResults({ queryId: "query-test", resultList: [] }, callback);
  expect(callback).toHaveBeenCalledExactlyOnceWith(status);
  expect(fetch).toHaveBeenCalledTimes(1);
});
test("POST completes the response and preserves the full form, query and order", async () => {
  const callback = vi.fn();
  fetch.mockResolvedValue(response());
  const payload = {
    queryId: "query-test",
    doRange: false,
    resultList: [{ analysisId: "B" }, { analysisId: "A" }],
  };
  await postReviewResults(payload, callback);
  expect(callback).toHaveBeenCalledWith(200);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
});

describe("bounded current review reads", () => {
  test.each(["fetch", "body"])(
    "a hanging %s read completes once and ignores late data",
    async (phase) => {
      vi.useFakeTimers();
      let resolve;
      const deferred = new Promise((done) => {
        resolve = done;
      });
      fetch.mockImplementation(() =>
        phase === "fetch"
          ? deferred
          : Promise.resolve(response(200, {}, { json: () => deferred })),
      );
      const callback = vi.fn();
      const reading = getReviewResults(
        "/rest/AccessionValidation",
        callback,
        new AbortController().signal,
      );
      await vi.advanceTimersByTimeAsync(30000);
      expect(callback).toHaveBeenCalledExactlyOnceWith(undefined, 0);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      resolve(
        phase === "fetch"
          ? response(200, { queryId: "late" })
          : { queryId: "late" },
      );
      await reading;
      await Promise.resolve();
      expect(callback).toHaveBeenCalledTimes(1);
    },
  );
  test("cancelled reads settle without callback even if fetch ignores abort", async () => {
    const owner = new AbortController();
    let resolve;
    fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const callback = vi.fn();
    const reading = getReviewResults(
      "/rest/AccessionValidation",
      callback,
      owner.signal,
    );
    owner.abort();
    resolve(response(200, { queryId: "stale" }));
    await reading;
    expect(callback).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  test("already cancelled query does not start a read", async () => {
    const owner = new AbortController();
    owner.abort();
    const callback = vi.fn();
    await getReviewResults("/rest/AccessionValidation", callback, owner.signal);
    expect(fetch).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
  test("rejects JSON lookalike content type without reading the body", async () => {
    const reply = response(
      200,
      { queryId: "not-json" },
      { headers: new Headers({ "content-type": "application/jsonp" }) },
    );
    fetch.mockResolvedValue(reply);
    const callback = vi.fn();
    await getReviewResults("/rest/AccessionValidation", callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(undefined, 0);
    expect(reply.json).not.toHaveBeenCalled();
  });
});
