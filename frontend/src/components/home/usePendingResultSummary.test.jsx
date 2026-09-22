import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { usePendingResultSummary } from "./usePendingResultSummary";
import {
  readPendingResultSummary,
  PendingSummaryError,
} from "./pendingResultSummary";

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

beforeEach(() => {
  vi.clearAllMocks();
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
  fireEvent.click(screen.getByText("Refresh"));
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
    await resolve(next, summary(2, "2026-09-23T06:22:00Z"));
    expect(read("count")).toBe("2");
  },
);

test("role removal clears an in-flight count without requesting another summary", async () => {
  const pending = deferred();
  readPendingResultSummary.mockReturnValue(pending.promise);
  const { rerender } = render(<Probe context={initialContext()} />);
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

test("CSRF replacement before session refresh prevents a late response from showing", async () => {
  const pending = deferred();
  readPendingResultSummary.mockReturnValue(pending.promise);
  render(<Probe context={initialContext()} />);
  localStorage.setItem("CSRF", "replacement-csrf");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "CSRF" })));
  expect(read("status")).toBe("unauthenticated");
  await resolve(pending, summary(99));
  expect(read("count")).toBe("unknown");
  expect(read("time")).toBe("never");
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
