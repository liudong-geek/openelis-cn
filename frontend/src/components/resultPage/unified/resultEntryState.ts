import type { ResultCellRow } from "./PolymorphicResultCell";

export interface EntryRow extends ResultCellRow {
  sampleItemId?: string;
  testId?: string;
  accessionNumber?: string;
  testName?: string;
  analysisLastupdated?: string;
  resultEntryBlockedReason?: unknown;
  readOnly?: unknown;
  [key: string]: unknown;
}
export type DraftDisposition = "editing" | "rejected" | "pending" | "unknown";
export interface EntryDraft {
  row: EntryRow;
  fingerprint: string | null;
  disposition: DraftDisposition;
  held: boolean;
  uncertainOperation?: "signature";
}

// Analysis review restrictions cover its components, not other tests on a tube.
const analysisReasons = new Set([
  "error.results.testIntakeChanged",
  "error.results.reviewedResultLocked",
  "error.results.analysisEntryUnavailable",
]);
export const specimenReasons = new Set([
  ...analysisReasons,
  "error.results.specimenNotEligible",
  "error.results.specimenRejected",
  "error.results.specimenVoided",
  "error.results.specimenCanceled",
  "error.results.specimenDisposed",
  "error.results.specimenIntakeMissing",
  "error.results.specimenIntakeChanged",
]);
export const entryReasons = new Set([
  ...specimenReasons,
  "error.results.analysisMismatch",
  "error.results.resultMismatch",
  "error.results.qualifiedResultMismatch",
  "error.results.testMismatch",
  "error.results.componentMismatch",
  "error.results.resultDefinitionMissing",
  "error.results.orderMismatch",
  "error.results.statusConfigurationInvalid",
]);
export const positiveId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value);
export const entryBlocked = (row: EntryRow) =>
  row.readOnly === true ||
  (row.readOnly !== undefined && row.readOnly !== false) ||
  (row.resultEntryBlockedReason != null && row.resultEntryBlockedReason !== "");
// i18n-keys: error.results.*
export const entryReason = (row: EntryRow): string =>
  typeof row.resultEntryBlockedReason === "string" &&
  entryReasons.has(row.resultEntryBlockedReason)
    ? row.resultEntryBlockedReason
    : "results.workbench.entryUnavailable";
export const sameTube = (left: EntryRow, right: EntryRow) =>
  positiveId(left.sampleItemId)
    ? left.sampleItemId === right.sampleItemId
    : left.analysisId === right.analysisId;

/** Tube facts cover the tube; review/test restrictions cover only that analysis. */
export function restrictTubes<T extends EntryRow>(
  rows: T[],
  extra?: EntryRow,
): T[] {
  const locked = [...rows, ...(extra ? [extra] : [])].filter((row) =>
    specimenReasons.has(String(row.resultEntryBlockedReason)),
  );
  return rows.map((row) => {
    const source = locked.find((other) =>
      analysisReasons.has(String(other.resultEntryBlockedReason))
        ? other.analysisId === row.analysisId
        : sameTube(other, row),
    );
    return source
      ? {
          ...row,
          readOnly: true,
          resultEntryBlockedReason: source.resultEntryBlockedReason,
        }
      : row;
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}

/** Conservative definition/version comparison, not an authorization token. */
export function entryFingerprint(row: EntryRow): string | null {
  if (
    !positiveId(row.analysisId) ||
    !positiveId(row.sampleItemId) ||
    !positiveId(row.testId) ||
    typeof row.analysisLastupdated !== "string" ||
    !row.analysisLastupdated ||
    typeof row.accessionNumber !== "string" ||
    !row.accessionNumber
  )
    return null;
  const { resultEntryBlockedReason, readOnly, ...identityVersionDefinition } =
    row;
  return JSON.stringify(canonical(identityVersionDefinition));
}
export function newEntryDraft(row: EntryRow): EntryDraft {
  return {
    row: JSON.parse(JSON.stringify(row)),
    fingerprint: entryFingerprint(row),
    disposition: "editing",
    held: false,
  };
}
export const canResumeDraft = (
  draft: EntryDraft,
  current?: EntryRow,
): boolean =>
  Boolean(
    current &&
    draft.held &&
    ["editing", "rejected"].includes(draft.disposition) &&
    draft.fingerprint &&
    draft.fingerprint === entryFingerprint(current) &&
    !entryBlocked(current),
  );

export interface EntrySession {
  userSessionDetails?: {
    authenticated?: boolean;
    userId?: string;
    sessionId?: string;
    csrf?: string;
    loginName?: string;
  };
  errorLoadingSessionDetails?: boolean;
  sessionPhase?: string;
  getSessionIdentity?: () => unknown;
  getSessionCheckGeneration?: () => unknown;
  isSessionWriteAllowed?: (identity: string, generation?: number) => unknown;
}
export interface SessionStamp {
  identity: string;
  generation?: number;
  csrf: string;
}
export function entrySession(context: EntrySession): SessionStamp | null {
  try {
    const details = context.userSessionDetails;
    const nonempty = (value: unknown): value is string =>
      typeof value === "string" && Boolean(value.trim());
    if (
      details?.authenticated !== true ||
      !positiveId(details.userId) ||
      !nonempty(details.sessionId) ||
      !nonempty(details.csrf)
    )
      return null;
    const identity =
      typeof context.getSessionIdentity === "function"
        ? context.getSessionIdentity()
        : JSON.stringify([details.userId, details.sessionId]);
    if (typeof identity !== "string" || !identity) return null;
    const generation = context.getSessionCheckGeneration?.();
    if (
      generation !== undefined &&
      (!Number.isSafeInteger(generation) || Number(generation) < 0)
    )
      return null;
    return {
      identity,
      csrf: details.csrf,
      generation: generation as number | undefined,
    };
  } catch {
    return null;
  }
}
export function sessionReady(
  context: EntrySession,
  expected: SessionStamp | null,
): boolean {
  try {
    const current = entrySession(context);
    if (
      !current ||
      !expected ||
      JSON.stringify(current) !== JSON.stringify(expected) ||
      context.errorLoadingSessionDetails ||
      (context.sessionPhase && context.sessionPhase !== "authenticated") ||
      localStorage.getItem("CSRF") !== current.csrf
    )
      return false;
    return (
      !context.isSessionWriteAllowed ||
      context.isSessionWriteAllowed(expected.identity, expected.generation) ===
        true
    );
  } catch {
    return false;
  }
}
