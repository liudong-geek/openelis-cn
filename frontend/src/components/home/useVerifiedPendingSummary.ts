import { useCallback, useEffect, useRef, useState } from "react";
import type { UserSessionDetailsContextValue } from "../../UserSessionDetailsContext";
import { PendingSummaryError, SummaryFailure } from "./pendingResultSummary";
import {
  pendingSummarySessionKey,
  readPendingSummarySession,
} from "./pendingSummarySession";

type SummaryStatus = "loading" | "ready" | "partial" | SummaryFailure;
interface PendingSummaryValue {
  state: "ready" | "partial";
  generatedAt: string;
}

interface SummaryState<T extends PendingSummaryValue> {
  sessionKey: string | null;
  storageRevision: number;
  status: SummaryStatus;
  summary: T | null;
  lastSuccessAt: string | null;
}

function summarySession(
  context: UserSessionDetailsContextValue,
  requiredRole: "Results" | "Validation",
): {
  key: string | null;
  status: SummaryStatus;
} {
  const user = context.userSessionDetails;
  if (context.errorLoadingSessionDetails)
    return { key: null, status: "unavailable" };
  if (user?.authenticated === undefined)
    return { key: null, status: "loading" };
  try {
    return {
      key: pendingSummarySessionKey(user, requiredRole),
      status: "loading",
    };
  } catch (error) {
    return {
      key: null,
      status: error instanceof PendingSummaryError ? error.kind : "unavailable",
    };
  }
}

const emptyState = <T extends PendingSummaryValue>(
  sessionKey: string | null,
  status: SummaryStatus,
  storageRevision: number,
): SummaryState<T> => ({
  sessionKey,
  storageRevision,
  status,
  summary: null,
  lastSuccessAt: null,
});

export function useVerifiedPendingSummary<T extends PendingSummaryValue>(
  context: UserSessionDetailsContextValue,
  readSummary: (signal: AbortSignal) => Promise<T>,
  requiredRole: "Results" | "Validation" = "Results",
) {
  const contextRef = useRef(context);
  contextRef.current = context;
  const [attempt, setAttempt] = useState(0);
  const [storageRevision, setStorageRevision] = useState(0);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const session = summarySession(context, requiredRole);
  const [state, setState] = useState<SummaryState<T>>(() =>
    emptyState<T>(session.key, "loading", storageRevision),
  );

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === "CSRF" || event.key === null) {
        // Another tab may have refreshed only its CSRF mask, or changed the
        // actual account. Hide first, then ask the server; never infer logout.
        ++generation.current;
        activeRequest.current?.abort();
        setStorageRevision((value) => value + 1);
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    const key = session.key;
    if (!key) {
      setState(emptyState<T>(null, session.status, storageRevision));
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    let disposed = false;
    let settled = false;
    const current = () =>
      !disposed &&
      !settled &&
      generation.current === currentGeneration &&
      summarySession(contextRef.current, requiredRole).key === key;
    setState((previous) => ({
      ...emptyState<T>(key, "loading", storageRevision),
      lastSuccessAt:
        previous.sessionKey === key &&
        previous.storageRevision === storageRevision
          ? previous.lastSuccessAt
          : null,
    }));
    const fail = (error: unknown) => {
      if (!current()) return;
      settled = true;
      setState((previous) => ({
        ...emptyState<T>(
          key,
          error instanceof PendingSummaryError ? error.kind : "unavailable",
          storageRevision,
        ),
        lastSuccessAt:
          previous.sessionKey === key ? previous.lastSuccessAt : null,
      }));
    };
    const timer = setTimeout(() => {
      fail(new PendingSummaryError("unavailable"));
      controller.abort();
    }, 30000);
    const readVerified = async () => {
      const before = await readPendingSummarySession(
        controller.signal,
        requiredRole,
      );
      if (!current()) return null;
      if (before !== key) throw new PendingSummaryError("unavailable");
      const summary = await readSummary(controller.signal);
      if (!current()) return null;
      const after = await readPendingSummarySession(
        controller.signal,
        requiredRole,
      );
      if (!current()) return null;
      if (after !== key) throw new PendingSummaryError("unavailable");
      return summary;
    };
    void readVerified()
      .then((summary) => {
        if (!current() || !summary) return;
        settled = true;
        setState({
          sessionKey: key,
          storageRevision,
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
      if (activeRequest.current === controller) activeRequest.current = null;
    };
  }, [
    session.key,
    session.status,
    attempt,
    storageRevision,
    readSummary,
    requiredRole,
  ]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  // Hide the previous user's data during render, before effect cleanup runs.
  const visible = session.key
    ? state.sessionKey === session.key &&
      state.storageRevision === storageRevision
      ? state
      : emptyState<T>(session.key, "loading", storageRevision)
    : emptyState<T>(null, session.status, storageRevision);
  return { ...visible, refresh };
}
