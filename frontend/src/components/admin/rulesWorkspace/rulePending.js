import {
  pendingReportKey,
  readPendingReport,
  rememberPendingReport,
  clearPendingReport,
} from "../../patient/resultsViewer/reportWorkspaceState";
// Keep only an opaque operation marker, never rule names, formulas or drafts.
// Unknown creation has no reliable ID and must not be repeated after remount.
export const creationPendingKey = (type, session) =>
  pendingReportKey(session.stamp.identity, `rules:create:${type}`);
export const readCreationPending = (type, session) =>
  readPendingReport(creationPendingKey(type, session));
export const rememberCreation = (type, session) =>
  rememberPendingReport(
    creationPendingKey(type, session),
    { kind: "rules" },
    session,
  );
export const clearCreationPending = (type, session) =>
  clearPendingReport(creationPendingKey(type, session));
