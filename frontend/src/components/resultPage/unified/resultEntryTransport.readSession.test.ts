import { readResultWorkbench } from "./resultEntryTransport";
import { pendingSummarySessionKey } from "../../home/pendingSummarySession";
const initial = {
  authenticated: true,
  userId: "701",
  sessionId: "SIM-SESSION",
  roles: ["Results"],
  loginLabUnit: "4",
  userLabRolesMap: { 4: ["Results"] },
  csrf: "SIM-MASK-A",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const rows = {
  testResult: [{ analysisId: "101", patientName: "SIM-PRIVATE" }],
};
let actor: Record<string, unknown> = initial;
let controller: AbortController;
let current: boolean;
let clinical: () => Promise<Response>;
let requests: string[];
const guard = () => ({
  sessionKey: pendingSummarySessionKey(initial),
  signal: controller.signal,
  current: () => current,
});
const read = () =>
  new Promise<{ data: unknown; error: unknown }>((resolve) =>
    readResultWorkbench(
      "/rest/results-entry/pending",
      (data, error) => resolve({ data, error }),
      guard(),
    ),
  );
beforeEach(() => {
  actor = { ...initial };
  controller = new AbortController();
  current = true;
  requests = [];
  clinical = async () => json(rows);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const path = new URL(String(url), "http://localhost").pathname;
      requests.push(path);
      if (path.endsWith("/session"))
        return json({ ...actor, csrf: `SIM-MASK-${requests.length}` });
      return clinical();
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
test("verified clinical read compares stable identity before and after without rewriting a shared token", async () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  expect(await read()).toEqual({ data: rows, error: undefined });
  expect(requests.map((s) => s.endsWith("/session"))).toEqual([
    true,
    false,
    true,
  ]);
  expect(write).not.toHaveBeenCalled();
  for (const [, init] of vi.mocked(fetch).mock.calls)
    expect(init).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
    });
});
test.each([
  { userId: "702" },
  { sessionId: "SIM-NEW" },
  { roles: ["Results", "Validation"] },
  { loginLabUnit: "5" },
  { userLabRolesMap: { 5: ["Results"] } },
])(
  "pre-read actor/scope mismatch never starts a clinical request: %j",
  async (change) => {
    actor = { ...initial, ...change };
    expect(await read()).toMatchObject({
      data: undefined,
      error: { sessionUnconfirmed: true },
    });
    expect(requests).toHaveLength(1);
  },
);
test.each([
  { userId: "702" },
  { sessionId: "SIM-NEW" },
  { roles: ["Results", "Validation"] },
  { loginLabUnit: "5" },
  { userLabRolesMap: { 5: ["Results"] } },
])(
  "post-read actor/scope mismatch never releases patient rows: %j",
  async (change) => {
    clinical = async () => {
      actor = { ...initial, ...change };
      return json(rows);
    };
    const result = await read();
    expect(result).toMatchObject({
      data: undefined,
      error: { sessionUnconfirmed: true },
    });
    expect(JSON.stringify(result)).not.toContain("SIM-PRIVATE");
    expect(requests).toHaveLength(3);
  },
);
test.each([401, 403])(
  "server session status %s stays explicit and does not become empty success",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, status)),
    );
    expect(await read()).toMatchObject({
      data: undefined,
      error: { status, sessionUnconfirmed: true },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
test("abort or a stale generation cannot release a late clinical result", async () => {
  let complete!: (value: Response) => void;
  clinical = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const pending = read();
  for (let i = 0; i < 20 && !complete; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  current = false;
  controller.abort();
  complete(json(rows));
  expect(await pending).toMatchObject({ data: undefined });
  expect(requests).toHaveLength(2);
});
test.each(["before", "after"])(
  "a hung %s identity verification is bounded and cannot later publish",
  async (phase) => {
    vi.useFakeTimers();
    let release!: (value: Response) => void;
    let checks = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).endsWith("/session")) {
          checks++;
          if (checks === (phase === "before" ? 1 : 2))
            return new Promise<Response>((resolve) => {
              release = resolve;
            });
          return json(initial);
        }
        return json(rows);
      }),
    );
    const callback = vi.fn();
    readResultWorkbench("/rest/results-entry/pending", callback, guard());
    await vi.advanceTimersByTimeAsync(30001);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeUndefined();
    release(json(initial));
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
  },
);
test("a failed clinical response still verifies the identity before returning its error", async () => {
  clinical = async () => {
    actor = { ...initial, userId: "702" };
    return json({}, 500);
  };
  expect(await read()).toMatchObject({
    data: undefined,
    error: { sessionUnconfirmed: true },
  });
  expect(requests).toHaveLength(3);
});

test.each([401, 403])(
  "an actual late HTTP %s refusal is preserved for captured-credential revocation",
  async (status) => {
    let complete!: (value: Response) => void;
    clinical = () =>
      new Promise((resolve) => {
        complete = resolve;
      });
    const pending = read();
    for (let i = 0; i < 20 && !complete; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
    current = false;
    controller.abort();
    complete(json({}, status));
    expect(await pending).toMatchObject({ data: undefined, error: { status } });
    expect(requests).toHaveLength(2);
  },
);
