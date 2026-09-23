import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { usePendingResultSummary } from "./usePendingResultSummary";
import {
  readPendingResultSummary,
  PendingSummaryError,
} from "./pendingResultSummary";

import {
  pendingSummarySessionKey,
  readPendingSummarySession,
} from "./pendingSummarySession";

vi.mock("./pendingSummarySession", async () => ({
  ...(await vi.importActual("./pendingSummarySession")),
  readPendingSummarySession: vi.fn(),
}));

vi.mock("./pendingResultSummary", async () => ({
  ...(await vi.importActual("./pendingResultSummary")),
  readPendingResultSummary: vi.fn(),
}));

const initialContext = () => ({
  userSessionDetails: {
    authenticated: true,
    userId: "17",
    sessionId: "synthetic-session",
    csrf: "synthetic-csrf",
    roles: ["Results"],
    loginLabUnit: "4",
    userLabRolesMap: { 4: ["Results"] },
  },
});
const summary = (count = 7, generatedAt = "2026-09-23T06:20:00Z") => ({
  scope: "pending",
  state: "partial",
  analysisCount: count,
  specimenCount: 2,
  displayRowCount: null,
  missingSpecimenAnalysisCount: 0,
  generatedAt,
});
function Probe({ context }) {
  const state = usePendingResultSummary(context);
  return (
    <>
      <span data-testid="status">{state.status}</span>
      <span data-testid="count">
        {state.summary?.analysisCount ?? "unknown"}
      </span>
      <span data-testid="time">{state.lastSuccessAt ?? "never"}</span>
      <button onClick={state.refresh}>Refresh</button>
    </>
  );
}
const read = (key) => screen.getByTestId(key).textContent;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const resolve = async (pending, value) => {
  await act(async () => {
    pending.resolve(value);
    await pending.promise;
  });
};

let serverUser;
beforeEach(() => {
  vi.resetAllMocks();
  serverUser = initialContext().userSessionDetails;
  readPendingSummarySession.mockImplementation(async () =>
    pendingSummarySessionKey(serverUser),
  );
  localStorage.clear();
  localStorage.setItem("CSRF", "synthetic-csrf");
});
afterEach(() => vi.useRealTimers());

test("starts unknown and failed refresh preserves the last success time but not a stale count", async () => {
  const first = deferred();
  readPendingResultSummary
    .mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new PendingSummaryError("unavailable"));
  render(<Probe context={initialContext()} />);
  expect(read("status")).toBe("loading");
  expect(read("count")).toBe("unknown");
  expect(read("time")).toBe("never");
  await resolve(first, summary());
  expect(read("count")).toBe("7");
  expect(read("time")).toBe("2026-09-23T06:20:00Z");
  fireEvent.click(screen.getByText("Refresh"));
  await waitFor(() => expect(read("status")).toBe("unavailable"));
  expect(read("count")).toBe("unknown");
  expect(read("time")).toBe("2026-09-23T06:20:00Z");
});

test("an older refresh cannot overwrite a newer successful response", async () => {
  const older = deferred();
  const newer = deferred();
  readPendingResultSummary
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  render(<Probe context={initialContext()} />);
  await waitFor(() =>
    expect(readPendingResultSummary).toHaveBeenCalledTimes(1),
  );
  fireEvent.click(screen.getByText("Refresh"));
  await waitFor(() =>
    expect(readPendingResultSummary).toHaveBeenCalledTimes(2),
  );
  expect(readPendingResultSummary.mock.calls[0][0].aborted).toBe(true);
  await resolve(newer, summary(3, "2026-09-23T06:21:00Z"));
  await resolve(older, summary(99));
  expect(read("count")).toBe("3");
  expect(read("time")).toBe("2026-09-23T06:21:00Z");
});

test.each([
  { userId: "18" },
  { sessionId: "other-session" },
  { loginLabUnit: "5" },
  { userLabRolesMap: { 5: ["Results"] } },
])(
  "identity or permission scope change clears cached counts and ignores late responses: %j",
  async (change) => {
    const previous = deferred();
    const next = deferred();
    readPendingResultSummary
      .mockResolvedValueOnce(summary())
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(next.promise);
    const context = initialContext();
    const { rerender } = render(<Probe context={context} />);
    await waitFor(() => expect(read("count")).toBe("7"));
    fireEvent.click(screen.getByText("Refresh"));
    await waitFor(() =>
      expect(readPendingResultSummary).toHaveBeenCalledTimes(2),
    );
    serverUser = { ...context.userSessionDetails, ...change };
    rerender(
      <Probe
        context={{
          userSessionDetails: { ...context.userSessionDetails, ...change },
        }}
      />,
    );
    expect(read("count")).toBe("unknown");
    expect(read("time")).toBe("never");
    await resolve(previous, summary(99));
    expect(read("count")).toBe("unknown");
    await waitFor(() =>
      expect(readPendingResultSummary).toHaveBeenCalledTimes(3),
    );
    await resolve(next, summary(2, "2026-09-23T06:22:00Z"));
    expect(read("count")).toBe("2");
  },
);

test("role removal clears an in-flight count without requesting another summary", async () => {
  const pending = deferred();
  readPendingResultSummary.mockReturnValue(pending.promise);
  const { rerender } = render(<Probe context={initialContext()} />);
  await waitFor(() =>
    expect(readPendingResultSummary).toHaveBeenCalledTimes(1),
  );
  rerender(
    <Probe
      context={{
        userSessionDetails: {
          ...initialContext().userSessionDetails,
          roles: [],
        },
      }}
    />,
  );
  expect(read("status")).toBe("forbidden");
  await resolve(pending, summary(99));
  expect(read("count")).toBe("unknown");
  expect(readPendingResultSummary).toHaveBeenCalledTimes(1);
});

test("a CSRF change in another tab hides counts and rechecks the same identity without accepting an old response", async () => {
  const old = deferred();
  const fresh = deferred();
  readPendingResultSummary
    .mockResolvedValueOnce(summary())
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(fresh.promise);
  render(<Probe context={initialContext()} />);
  await waitFor(() => expect(read("count")).toBe("7"));
  fireEvent.click(screen.getByText("Refresh"));
  await waitFor(() =>
    expect(readPendingResultSummary).toHaveBeenCalledTimes(2),
  );
  localStorage.setItem("CSRF", "other-valid-mask");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "CSRF" })));
  expect(read("status")).toBe("loading");
  expect(read("count")).toBe("unknown");
  expect(read("time")).toBe("never");
  expect(readPendingResultSummary.mock.calls[1][0].aborted).toBe(true);
  await waitFor(() =>
    expect(readPendingResultSummary).toHaveBeenCalledTimes(3),
  );
  await resolve(old, summary(99));
  expect(read("count")).toBe("unknown");
  await resolve(fresh, summary(2));
  expect(read("count")).toBe("2");
  expect(read("status")).toBe("partial");
  expect(localStorage.getItem("CSRF")).toBe("other-valid-mask");
});

test.each([
  [{}, "loading"],
  [{ userSessionDetails: { authenticated: false } }, "unauthenticated"],
  [{ ...initialContext(), errorLoadingSessionDetails: true }, "unavailable"],
  [
    { userSessionDetails: { authenticated: true, roles: ["Results"] } },
    "unavailable",
  ],
])(
  "unconfirmed session %# never fetches or invents a zero",
  (context, status) => {
    render(<Probe context={context} />);
    expect(read("status")).toBe(status);
    expect(read("count")).toBe("unknown");
    expect(readPendingResultSummary).not.toHaveBeenCalled();
  },
);

test("a hung request times out once, keeps its number unknown and ignores eventual success", async () => {
  vi.useFakeTimers();
  const pending = deferred();
  readPendingResultSummary.mockReturnValue(pending.promise);
  render(<Probe context={initialContext()} />);
  await act(async () => vi.advanceTimersByTimeAsync(30001));
  expect(read("status")).toBe("unavailable");
  expect(read("count")).toBe("unknown");
  expect(read("time")).toBe("never");
  expect(readPendingResultSummary.mock.calls[0][0].aborted).toBe(true);
  await resolve(pending, summary(99));
  expect(read("status")).toBe("unavailable");
  expect(read("count")).toBe("unknown");
  expect(readPendingResultSummary).toHaveBeenCalledTimes(1);
});

test("initial login accepts a different CSRF mask in storage and context without ordinary-render retries", async () => {
  localStorage.setItem("CSRF", "other-valid-mask");
  readPendingResultSummary.mockResolvedValue(summary(25));
  const { rerender } = render(<Probe context={initialContext()} />);
  await waitFor(() => expect(read("count")).toBe("25"));
  expect(readPendingSummarySession).toHaveBeenCalledTimes(2);
  rerender(
    <Probe
      context={{
        userSessionDetails: {
          ...initialContext().userSessionDetails,
          csrf: "third-valid-mask",
        },
      }}
    />,
  );
  expect(read("count")).toBe("25");
  expect(readPendingResultSummary).toHaveBeenCalledTimes(1);
  expect(readPendingSummarySession).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem("CSRF")).toBe("other-valid-mask");
});

test.each([
  { userId: "18" },
  { sessionId: "new-login-session" },
  { loginLabUnit: "other-unit" },
  { roles: ["Results", "Reception"] },
  { userLabRolesMap: { 5: ["Results"] } },
])(
  "a different server identity or permission scope before the read never requests or shows a summary: %j",
  async (change) => {
    serverUser = { ...serverUser, ...change };
    render(<Probe context={initialContext()} />);
    await waitFor(() => expect(read("status")).toBe("unavailable"));
    expect(read("count")).toBe("unknown");
    expect(readPendingResultSummary).not.toHaveBeenCalled();
  },
);

test.each([
  { userId: "18" },
  { sessionId: "new-login-session" },
  { loginLabUnit: "other-unit" },
  { roles: ["Results", "Reception"] },
  { userLabRolesMap: { 5: ["Results"] } },
])(
  "a session or permission change during the summary read prevents publication: %j",
  async (change) => {
    const pending = deferred();
    readPendingResultSummary.mockReturnValue(pending.promise);
    render(<Probe context={initialContext()} />);
    await waitFor(() =>
      expect(readPendingResultSummary).toHaveBeenCalledTimes(1),
    );
    serverUser = { ...serverUser, ...change };
    await resolve(pending, summary(99));
    expect(read("status")).toBe("unavailable");
    expect(read("count")).toBe("unknown");
    expect(read("time")).toBe("never");
  },
);

test.each(["unavailable", "unauthenticated", "forbidden"])(
  "failed post-read session verification stays %s and cannot invent zero",
  async (kind) => {
    readPendingSummarySession
      .mockResolvedValueOnce(pendingSummarySessionKey(serverUser))
      .mockRejectedValueOnce(new PendingSummaryError(kind));
    readPendingResultSummary.mockResolvedValue({
      ...summary(0),
      state: "ready",
      specimenCount: 0,
      displayRowCount: 0,
    });
    render(<Probe context={initialContext()} />);
    await waitFor(() => expect(read("status")).toBe(kind));
    expect(read("count")).toBe("unknown");
    expect(read("time")).toBe("never");
  },
);

test("a late session verification after logout cannot start a clinical read", async () => {
  const pending = deferred();
  const key = pendingSummarySessionKey(serverUser);
  readPendingSummarySession.mockReturnValue(pending.promise);
  const { rerender } = render(<Probe context={initialContext()} />);
  rerender(
    <Probe context={{ userSessionDetails: { authenticated: false } }} />,
  );
  expect(readPendingSummarySession.mock.calls[0][0].aborted).toBe(true);
  await resolve(pending, key);
  expect(read("status")).toBe("unauthenticated");
  expect(read("count")).toBe("unknown");
  expect(readPendingResultSummary).not.toHaveBeenCalled();
});

test("a storage clear aborts an old post-verification and rejects a different account cookie", async () => {
  const oldCheck = deferred();
  const oldKey = pendingSummarySessionKey(serverUser);
  readPendingSummarySession
    .mockResolvedValueOnce(oldKey)
    .mockReturnValueOnce(oldCheck.promise);
  readPendingResultSummary.mockResolvedValue(summary(99));
  render(<Probe context={initialContext()} />);
  await waitFor(() =>
    expect(readPendingSummarySession).toHaveBeenCalledTimes(2),
  );
  serverUser = { ...serverUser, userId: "18", sessionId: "new-session" };
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  expect(read("count")).toBe("unknown");
  expect(readPendingSummarySession.mock.calls[1][0].aborted).toBe(true);
  await resolve(oldCheck, oldKey);
  await waitFor(() => expect(read("status")).toBe("unavailable"));
  expect(read("count")).toBe("unknown");
  expect(readPendingResultSummary).toHaveBeenCalledTimes(1);
});

test.each(["before", "after"])(
  "a hung %s session check times out without publishing or accepting a late verification",
  async (phase) => {
    vi.useFakeTimers();
    const pending = deferred();
    const key = pendingSummarySessionKey(serverUser);
    if (phase === "before")
      readPendingSummarySession.mockReturnValue(pending.promise);
    else
      readPendingSummarySession
        .mockResolvedValueOnce(key)
        .mockReturnValueOnce(pending.promise);
    readPendingResultSummary.mockResolvedValue(summary(99));
    render(<Probe context={initialContext()} />);
    await act(async () => {});
    expect(read("count")).toBe("unknown");
    await act(async () => vi.advanceTimersByTimeAsync(30001));
    expect(read("status")).toBe("unavailable");
    expect(readPendingSummarySession.mock.calls.at(-1)[0].aborted).toBe(true);
    await resolve(pending, key);
    expect(read("status")).toBe("unavailable");
    expect(read("count")).toBe("unknown");
    expect(read("time")).toBe("never");
    expect(readPendingResultSummary).toHaveBeenCalledTimes(
      phase === "before" ? 0 : 1,
    );
  },
);
