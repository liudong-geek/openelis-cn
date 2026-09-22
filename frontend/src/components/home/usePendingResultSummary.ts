import { useCallback, useEffect, useRef, useState } from "react";
import type { UserSessionDetailsContextValue } from "../../UserSessionDetailsContext";
import {
  PendingResultSummary,
  PendingSummaryError,
  readPendingResultSummary,
  SummaryFailure,
} from "./pendingResultSummary";

type SummaryStatus = "loading" | "ready" | "partial" | SummaryFailure;
interface SummaryState {
  sessionKey: string | null;
  status: SummaryStatus;
  summary: PendingResultSummary | null;
  lastSuccessAt: string | null;
}

function summarySession(context: UserSessionDetailsContextValue): {
  key: string | null;
  status: SummaryStatus;
} {
  const user = context.userSessionDetails;
  if (context.errorLoadingSessionDetails)
    return { key: null, status: "unavailable" };
  if (user?.authenticated === undefined)
    return { key: null, status: "loading" };
  if (user.authenticated !== true)
    return { key: null, status: "unauthenticated" };
  if (!Array.isArray(user.roles) || !user.roles.includes("Results"))
    return { key: null, status: "forbidden" };
  if (
    typeof user.userId !== "string" ||
    !/^[1-9]\d*$/.test(user.userId) ||
    typeof user.sessionId !== "string" ||
    !user.sessionId.trim() ||
    typeof user.csrf !== "string" ||
    !user.csrf.trim()
  )
    return { key: null, status: "unavailable" };
  try {
    if (localStorage.getItem("CSRF") !== user.csrf)
      return { key: null, status: "unauthenticated" };
    // This is a freshness key, not a client-side authorization grant. The API
    // still resolves the current actor and lab permissions on every request.
    return {
      key: JSON.stringify([
        user.userId,
        user.sessionId,
        user.csrf,
        user.loginLabUnit,
        [...user.roles].sort(),
        user.userLabRolesMap,
      ]),
      status: "loading",
    };
  } catch {
    return { key: null, status: "unavailable" };
  }
}

const emptyState = (
  sessionKey: string | null,
  status: SummaryStatus,
): SummaryState => ({ sessionKey, status, summary: null, lastSuccessAt: null });

export function usePendingResultSummary(
  context: UserSessionDetailsContextValue,
) {
  const contextRef = useRef(context);
  contextRef.current = context;
  const [attempt, setAttempt] = useState(0);
  const [storageRevision, setStorageRevision] = useState(0);
  const generation = useRef(0);
  const session = summarySession(context);
  const [state, setState] = useState<SummaryState>(() =>
    emptyState(session.key, "loading"),
  );

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === "CSRF" || event.key === null)
        setStorageRevision((value) => value + 1);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const key = session.key;
    if (!key) {
      setState(emptyState(null, session.status));
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    let settled = false;
    const current = () =>
      !disposed &&
      !settled &&
      generation.current === currentGeneration &&
      summarySession(contextRef.current).key === key;
    setState((previous) => ({
      ...emptyState(key, "loading"),
      lastSuccessAt:
        previous.sessionKey === key ? previous.lastSuccessAt : null,
    }));
    const fail = (error: unknown) => {
      if (!current()) return;
      settled = true;
      setState((previous) => ({
        ...emptyState(
          key,
          error instanceof PendingSummaryError ? error.kind : "unavailable",
        ),
        lastSuccessAt:
          previous.sessionKey === key ? previous.lastSuccessAt : null,
      }));
    };
    const timer = setTimeout(() => {
      fail(new PendingSummaryError("unavailable"));
      controller.abort();
    }, 30000);
    void readPendingResultSummary(controller.signal)
      .then((summary) => {
        if (!current()) return;
        settled = true;
        setState({
          sessionKey: key,
          status: summary.state,
          summary,
          lastSuccessAt: summary.generatedAt,
        });
      }, fail)
      .finally(() => clearTimeout(timer));
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [session.key, session.status, attempt, storageRevision]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  // Hide the previous user's data during render, before effect cleanup runs.
  const visible = session.key
    ? state.sessionKey === session.key
      ? state
      : emptyState(session.key, "loading")
    : emptyState(null, session.status);
  return { ...visible, refresh };
}
