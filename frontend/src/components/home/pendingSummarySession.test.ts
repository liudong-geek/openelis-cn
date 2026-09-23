import config from "../../config.json";
import { PendingSummaryError } from "./pendingResultSummary";
import {
  pendingSummarySessionKey,
  readPendingSummarySession,
} from "./pendingSummarySession";

const user = {
  authenticated: true,
  userId: "17",
  sessionId: "synthetic-session",
  roles: ["Results", "Reception"],
  loginLabUnit: "化学组",
  userLabRolesMap: { 化学组: ["Results", "Reception"], 血液组: ["Results"] },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
// Synthetic Spring-compatible XOR masks of one underlying credential. This is
// a fixture only; the product must neither decode nor persist those credentials.
const maskedToken = (seed: number) => {
  const raw = new TextEncoder().encode("synthetic-underlying-csrf");
  const mask = raw.map((_, index) => (seed + index) % 256);
  const encoded = new Uint8Array(raw.length * 2);
  encoded.set(mask);
  encoded.set(
    raw.map((value, index) => value ^ mask[index]),
    raw.length,
  );
  return btoa(String.fromCharCode(...encoded))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
};

test("Validation-only actors can verify review scope without inheriting Results permission", async () => {
  const reviewer = {
    ...user,
    roles: ["Validation"],
    userLabRolesMap: { 化学组: ["Validation"] },
  };
  expect(() => pendingSummarySessionKey(reviewer)).toThrow(
    new PendingSummaryError("forbidden"),
  );
  const key = pendingSummarySessionKey(reviewer, "Validation");
  expect(() => pendingSummarySessionKey(user, "Validation")).toThrow(
    new PendingSummaryError("forbidden"),
  );
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(reviewer)));
  await expect(
    readPendingSummarySession(new AbortController().signal, "Validation"),
  ).resolves.toBe(key);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("two reads of the same Spring session with different XOR masks retain identity without writing storage", async () => {
  const first = maskedToken(19);
  const second = maskedToken(87);
  expect(first).not.toBe(second);
  localStorage.setItem("CSRF", "another-tab-mask");
  const write = vi.spyOn(Storage.prototype, "setItem");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ ...user, csrf: first }))
      .mockResolvedValueOnce(json({ ...user, csrf: second })),
  );
  const controller = new AbortController();
  const initial = await readPendingSummarySession(controller.signal);
  const next = await readPendingSummarySession(controller.signal);
  expect(initial).toBe(next);
  expect(initial).toBe(pendingSummarySessionKey(user));
  expect(write).not.toHaveBeenCalled();
  expect(localStorage.getItem("CSRF")).toBe("another-tab-mask");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenNthCalledWith(
    1,
    config.serverBaseUrl + "/session",
    expect.objectContaining({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    }),
  );
  expect(initial).not.toContain(first);
  expect(initial).not.toContain(second);
});

test("role and lab map ordering is not a change of scope, but account, session and permissions are", () => {
  const original = pendingSummarySessionKey(user);
  expect(
    pendingSummarySessionKey({
      ...user,
      roles: ["Reception", "Results"],
      userLabRolesMap: {
        血液组: ["Results"],
        化学组: ["Reception", "Results", "Results"],
      },
    }),
  ).toBe(original);
  for (const change of [
    { userId: "18" },
    { sessionId: "next-session" },
    { roles: ["Results"] },
    { loginLabUnit: "血液组" },
    { userLabRolesMap: { 化学组: ["Results"] } },
  ])
    expect(pendingSummarySessionKey({ ...user, ...change })).not.toBe(original);
});

test.each([
  null,
  [],
  {},
  { ...user, userId: "0" },
  { ...user, sessionId: " " },
  { ...user, roles: "Results" },
  { ...user, roles: ["Results", null] },
  { ...user, loginLabUnit: 4 },
  { ...user, userLabRolesMap: [] },
  { ...user, userLabRolesMap: { 4: "Results" } },
])("malformed session %# cannot grant a summary identity", (value) => {
  expect(() => pendingSummarySessionKey(value)).toThrow(
    new PendingSummaryError("unavailable"),
  );
});

test("explicit logout and missing Results privilege remain different failures", () => {
  expect(() => pendingSummarySessionKey({ authenticated: false })).toThrow(
    new PendingSummaryError("unauthenticated"),
  );
  expect(() =>
    pendingSummarySessionKey({ ...user, roles: ["Reception"] }),
  ).toThrow(new PendingSummaryError("forbidden"));
});

test.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
  [302, "unavailable"],
  [500, "unavailable"],
])(
  "session HTTP %s is not accepted because the body resembles a user",
  async (status, kind) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(user, status as number)),
    );
    await expect(
      readPendingSummarySession(new AbortController().signal),
    ).rejects.toThrow(
      new PendingSummaryError(
        kind as "unauthenticated" | "forbidden" | "unavailable",
      ),
    );
  },
);

test("an opaque login redirect or HTML login page cannot verify a session", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce({ status: 0 })
      .mockResolvedValueOnce(
        new Response("<html>Login</html>", {
          headers: { "content-type": "text/html" },
        }),
      ),
  );
  await expect(
    readPendingSummarySession(new AbortController().signal),
  ).rejects.toThrow(new PendingSummaryError("unavailable"));
  await expect(
    readPendingSummarySession(new AbortController().signal),
  ).rejects.toThrow(new PendingSummaryError("unavailable"));
});

test("a session with an oversized chunked body is rejected and an aborted read never starts", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(json({ ...user, padding: "x".repeat(32769) })),
  );
  await expect(
    readPendingSummarySession(new AbortController().signal),
  ).rejects.toThrow(new PendingSummaryError("unavailable"));
  const controller = new AbortController();
  controller.abort();
  await expect(readPendingSummarySession(controller.signal)).rejects.toThrow(
    new PendingSummaryError("unavailable"),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
