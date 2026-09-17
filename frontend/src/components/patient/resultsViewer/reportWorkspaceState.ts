import { useContext, useEffect, useRef, useState } from "react";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import {
  entrySession,
  sessionReady,
} from "../../resultPage/unified/resultEntryState";
import type { EntrySession } from "../../resultPage/unified/resultEntryState";
import { Roles } from "../../utils/Utils";
import type { ReportRequest } from "./patient-report-release-api";

export function useReportSession(admin = false) {
  const context = useContext(UserSessionDetailsContext);
  const latest = useRef(context);
  latest.current = context;
  const [, refresh] = useState(0);
  useEffect(() => {
    const changed = () => refresh((v) => v + 1);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", changed);
    document.addEventListener("visibilitychange", changed);
    const timer = window.setInterval(changed, 1000);
    return () => {
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", changed);
      document.removeEventListener("visibilitychange", changed);
      window.clearInterval(timer);
    };
  }, []);
  const stamp = entrySession(context as EntrySession);
  const current = () =>
    sessionReady(latest.current as EntrySession, stamp) &&
    latest.current.userSessionDetails?.roles?.includes(
      admin ? Roles.GLOBAL_ADMIN : Roles.REPORTS,
    ) === true;
  const valid = current();
  return {
    stamp,
    current,
    key: valid ? JSON.stringify(stamp) : "unavailable",
    valid,
  };
}
export type PendingReportOperation = {
  kind: "document" | "draft" | "freeze" | "issue" | "void" | "print" | "rules";
  sampleId?: string;
  groupKey?: string;
  docId?: string;
  releaseId?: number;
  beforeVersion?: number;
  expectedHash?: string;
  beforePrintCount?: number;
};
// Only opaque scope identifiers and operation metadata are retained. Never
// persist patient names, report contents, reasons, passwords, or session IDs.
export function pendingReportKey(identity: string, scope: string): string {
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (const ch of identity + ":" + scope) {
    a = Math.imul(a ^ ch.charCodeAt(0), 0x01000193);
    b = Math.imul(b ^ ch.charCodeAt(0), 0x85ebca6b);
  }
  return `report.pending.v1.${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}
export function readPendingReport(key: string): PendingReportOperation | null {
  try {
    const value = sessionStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (
      parsed &&
      [
        "document",
        "draft",
        "freeze",
        "issue",
        "void",
        "print",
        "rules",
      ].includes(parsed.kind)
    )
      return parsed;
  } catch {
    /* Unreadable evidence also blocks writes. */
  }
  return { kind: "rules" };
}
export function rememberPendingReport(
  key: string,
  operation: PendingReportOperation,
  c: ReportRequest,
) {
  if (!c.current() || readPendingReport(key))
    throw new Error("report.release.error.unknown");
  sessionStorage.setItem(key, JSON.stringify(operation));
}
export function clearPendingReport(key: string) {
  sessionStorage.removeItem(key);
}
