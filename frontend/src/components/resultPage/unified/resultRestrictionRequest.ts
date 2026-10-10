import { lookupSpecimen } from "../../order/api/specimenLookupApi";
import { readPendingSummarySession } from "../../home/pendingSummarySession";
import { readOpenElisResponse } from "../../utils/readOpenElisResponse";
import {
  RestrictionIdentity,
  restrictionId,
  restrictionIdentity,
} from "./resultRestrictionHandoff";
export type RestrictionFailure =
  | "invalid"
  | "unauthenticated"
  | "forbidden"
  | "scope"
  | "changed"
  | "notFound"
  | "timeout"
  | "unavailable";
export class ResultRestrictionError extends Error {
  constructor(public readonly kind: RestrictionFailure) {
    super(kind);
    this.name = "ResultRestrictionError";
  }
}
// Only this vocabulary may reach restricted-workspace message IDs.
export function restrictionFailure(error: unknown): RestrictionFailure {
  const kind = (error as { kind?: string } | null)?.kind;
  if (["ambiguous", "unsupported", "conflict"].includes(kind || ""))
    return "changed";
  if (
    [
      "invalid",
      "unauthenticated",
      "forbidden",
      "scope",
      "changed",
      "notFound",
      "timeout",
      "unavailable",
    ].includes(kind || "")
  )
    return kind as RestrictionFailure;
  return "unavailable";
}
export interface Fact {
  state: "RECORDED" | "MISSING" | "INCONSISTENT" | "UNKNOWN";
  value?: string | null;
  id?: string | null;
  statusCode?: string | null;
  decision?: string | null;
}
export interface RestrictionStatus {
  statusId: string | null;
  statusType: "SAMPLE" | "ANALYSIS";
  actualStatusType: string | null;
  statusCode: string | null;
  statusName: string | null;
  known: boolean;
}
export interface ResultRestriction {
  queryVersion: "2";
  currentUserId: string;
  readOnly: true;
  query: RestrictionIdentity;
  identity: RestrictionIdentity & {
    sampleId: string;
    sampleLastupdated: string | null;
    sampleItemLastupdated: string | null;
  };
  specimenStatus: RestrictionStatus;
  analysisStatus: RestrictionStatus;
  blockedReason: string | null;
  facts: { collection: Fact; receipt: Fact; request: Fact; acceptance: Fact };
  diagnosticCodes: string[];
  warningCodes: string[];
  canOpenIntake: boolean;
  canEditIntake: boolean;
  intakeEditUnavailableReason: string | null;
  actionUnavailableReason: string | null;
  target:
    | (Omit<RestrictionIdentity, "analysisLastupdated"> & {
        sampleId: string;
        requestId: string;
        lookupCode: string;
      })
    | null;
  intakeLookup: any;
}
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const nullableText = (v: unknown) =>
  v === null ||
  (typeof v === "string" &&
    v.length > 0 &&
    v.length <= 255 &&
    !/[\x00-\x1f\x7f]/.test(v));
const codes = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 100 &&
  new Set(v).size === v.length &&
  v.every(
    (x) => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_.]{0,99}$/.test(x),
  );
const instant = (v: unknown) =>
  v === null ||
  (typeof v === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(v) &&
    Number.isFinite(Date.parse(v)));
const version = (v: unknown) =>
  v === null ||
  (typeof v === "string" &&
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d{1,9})?$/.test(v));
const sameIdentity = (a: unknown, b: RestrictionIdentity) =>
  record(a) && Object.entries(b).every(([k, v]) => a[k] === v);
function status(v: unknown, type: string): boolean {
  return (
    record(v) &&
    v.statusType === type &&
    (v.statusId === null || restrictionId(v.statusId)) &&
    nullableText(v.actualStatusType) &&
    nullableText(v.statusCode) &&
    nullableText(v.statusName) &&
    typeof v.known === "boolean" &&
    (!v.known ||
      (typeof v.actualStatusType === "string" &&
        v.actualStatusType.toUpperCase() === type &&
        typeof v.statusCode === "string"))
  );
}
function fact(v: unknown, kind: string): boolean {
  if (
    !record(v) ||
    !["RECORDED", "MISSING", "INCONSISTENT", "UNKNOWN"].includes(v.state)
  )
    return false;
  if (kind === "date")
    return v.state === "INCONSISTENT"
      ? nullableText(v.value)
      : instant(v.value) &&
          (v.state === "RECORDED" ? v.value !== null : v.value === null);
  if (v.id !== null && !restrictionId(v.id)) return false;
  return kind === "request"
    ? (v.statusCode === null ||
        ["REQUESTED", "COLLECTED", "CANCELLED"].includes(v.statusCode)) &&
        (v.state === "RECORDED"
          ? v.id !== null && v.statusCode !== null
          : v.id === null && v.statusCode === null)
    : (v.decision === null || ["ACCEPTED", "REJECTED"].includes(v.decision)) &&
        (v.state === "RECORDED"
          ? v.id !== null && v.decision !== null
          : v.id === null && v.decision === null);
}
export function lookupMatches(
  value: unknown,
  target: NonNullable<ResultRestriction["target"]>,
): boolean {
  if (
    !record(value) ||
    value.version !== 1 ||
    value.source !== "specimen_lookup" ||
    value.readOnly !== true ||
    value.matchedKind !== "specimen" ||
    !record(value.current) ||
    !record(value.selection)
  )
    return false;
  const c = value.current,
    s = value.selection;
  if (
    c.sampleId !== target.sampleId ||
    c.labNo !== target.labNumber ||
    s.sampleId !== target.sampleId ||
    s.sampleItemId !== target.sampleItemId ||
    s.requestId !== target.requestId ||
    typeof c.patientMasked !== "boolean" ||
    (c.patient !== null && !record(c.patient)) ||
    !Array.isArray(c.requestedSpecimens) ||
    !Array.isArray(c.physicalSpecimens)
  )
    return false;
  if (
    c.intakeReasons != null &&
    (!record(c.intakeReasons) ||
      !["READY", "EMPTY", "UNAVAILABLE"].includes(c.intakeReasons.state) ||
      !Array.isArray(c.intakeReasons.items) ||
      !c.intakeReasons.items.every(
        (reason: unknown) =>
          record(reason) &&
          restrictionId(reason.id) &&
          typeof reason.label === "string" &&
          reason.label.length > 0 &&
          reason.label.length <= 255,
      ))
  )
    return false;
  const requests = c.requestedSpecimens,
    tubes = c.physicalSpecimens;
  if (
    !requests.every(
      (r) =>
        record(r) &&
        restrictionId(r.id) &&
        restrictionId(r.typeOfSampleId) &&
        (r.sampleItemId === null || restrictionId(r.sampleItemId)) &&
        ["REQUESTED", "COLLECTED", "CANCELLED"].includes(r.status),
    ) ||
    !tubes.every(
      (r) =>
        record(r) &&
        restrictionId(r.id) &&
        restrictionId(r.typeOfSampleId) &&
        (r.requestId === null || restrictionId(r.requestId)) &&
        typeof r.sortOrder === "string" &&
        typeof r.voided === "boolean" &&
        typeof r.rejected === "boolean",
    )
  )
    return false;
  if (
    new Set(requests.map((r) => r.id)).size !== requests.length ||
    new Set(tubes.map((r) => r.id)).size !== tubes.length
  )
    return false;
  const r = requests.filter((r) => r.id === target.requestId),
    t = tubes.filter((t) => t.id === target.sampleItemId);
  return (
    r.length === 1 &&
    t.length === 1 &&
    r[0].sampleItemId === target.sampleItemId &&
    t[0].requestId === target.requestId
  );
}
export function parseResultRestriction(
  value: unknown,
  expected: RestrictionIdentity,
  userId: string,
): ResultRestriction {
  if (
    !record(value) ||
    value.queryVersion !== "2" ||
    value.readOnly !== true ||
    value.currentUserId !== userId ||
    !sameIdentity(value.query, expected) ||
    !sameIdentity(value.identity, expected) ||
    !restrictionId(value.identity.sampleId) ||
    !version(value.identity.sampleLastupdated) ||
    !version(value.identity.sampleItemLastupdated) ||
    !status(value.specimenStatus, "SAMPLE") ||
    !status(value.analysisStatus, "ANALYSIS") ||
    !nullableText(value.blockedReason) ||
    !record(value.facts) ||
    !fact(value.facts.collection, "date") ||
    !fact(value.facts.receipt, "date") ||
    !fact(value.facts.request, "request") ||
    !fact(value.facts.acceptance, "acceptance") ||
    !codes(value.diagnosticCodes) ||
    !codes(value.warningCodes) ||
    typeof value.canOpenIntake !== "boolean" ||
    typeof value.canEditIntake !== "boolean" ||
    (value.canEditIntake && !value.canOpenIntake) ||
    (value.canEditIntake
      ? value.intakeEditUnavailableReason !== null
      : typeof value.intakeEditUnavailableReason !== "string" ||
        !codes([value.intakeEditUnavailableReason]))
  )
    throw new ResultRestrictionError("unavailable");
  if (value.canOpenIntake) {
    const t = value.target;
    if (
      !record(t) ||
      t.sampleId !== value.identity.sampleId ||
      !restrictionId(t.requestId) ||
      t.analysisId !== expected.analysisId ||
      t.sampleItemId !== expected.sampleItemId ||
      t.testId !== expected.testId ||
      t.labNumber !== expected.labNumber ||
      typeof t.lookupCode !== "string" ||
      t.lookupCode.length > 30 ||
      !t.lookupCode ||
      value.actionUnavailableReason !== null ||
      !lookupMatches(
        value.intakeLookup,
        t as NonNullable<ResultRestriction["target"]>,
      )
    )
      throw new ResultRestrictionError("unavailable");
  } else if (
    value.target !== null ||
    value.intakeLookup !== null ||
    typeof value.actionUnavailableReason !== "string" ||
    !codes([value.actionUnavailableReason])
  )
    throw new ResultRestrictionError("unavailable");
  if (
    !value.canEditIntake &&
    (value.canOpenIntake
      ? value.intakeEditUnavailableReason !==
        "RECEPTION_UPDATE_PERMISSION_REQUIRED"
      : value.intakeEditUnavailableReason !== value.actionUnavailableReason)
  )
    throw new ResultRestrictionError("unavailable");
  return value as ResultRestriction;
}
async function readJson(
  endpoint: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await readOpenElisResponse(endpoint, signal);
  if (response.status === 401)
    throw new ResultRestrictionError("unauthenticated");
  if (response.status === 403) throw new ResultRestrictionError("forbidden");
  if (response.status === 409) throw new ResultRestrictionError("changed");
  if (response.status === 404) throw new ResultRestrictionError("notFound");
  if (response.status === 400) throw new ResultRestrictionError("invalid");
  if (
    response.status !== 200 ||
    response.redirected ||
    response.type === "opaqueredirect" ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    Number(response.headers.get("content-length")) > 4 * 1024 * 1024 ||
    !response.body
  )
    throw new ResultRestrictionError("unavailable");
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0,
    text = "";
  const abortReader = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abortReader, { once: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (signal.aborted || length > 4 * 1024 * 1024)
        throw new ResultRestrictionError("unavailable");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    signal.removeEventListener("abort", abortReader);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function readResultRestriction(
  identity: RestrictionIdentity,
  signal: AbortSignal,
  owner: string,
): Promise<ResultRestriction> {
  if (!restrictionIdentity(identity) || signal.aborted)
    throw new ResultRestrictionError("invalid");
  let actor: string;
  try {
    actor = JSON.parse(owner)[0];
  } catch {
    throw new ResultRestrictionError("scope");
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const work = async () => {
    if ((await readPendingSummarySession(controller.signal)) !== owner)
      throw new ResultRestrictionError("scope");
    const params = new URLSearchParams({
      queryVersion: "2",
      sampleItemId: identity.sampleItemId,
      testId: identity.testId,
      labNumber: identity.labNumber,
      analysisLastupdated: identity.analysisLastupdated,
    });
    const data = parseResultRestriction(
      await readJson(
        `/rest/results-entry/analysis/${identity.analysisId}/restriction?${params}`,
        controller.signal,
      ),
      identity,
      actor,
    );
    if (
      (await readPendingSummarySession(controller.signal)) !== owner ||
      controller.signal.aborted
    )
      throw new ResultRestrictionError("scope");
    return data;
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ResultRestrictionError("timeout"));
          controller.abort();
        }, 20000);
        controller.signal.addEventListener(
          "abort",
          () => reject(new ResultRestrictionError("unavailable")),
          { once: true },
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof ResultRestrictionError) throw error;
    throw new ResultRestrictionError(restrictionFailure(error));
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal.removeEventListener("abort", abort);
  }
}

// A dispatched operation is recovered through its original lookup contract.
// An advancing analysis version must not prevent checking that fixed outcome.
// This read never authorizes a new POST.
export async function readRestrictedIntakeLookup(
  target: NonNullable<ResultRestriction["target"]>,
  signal: AbortSignal,
  owner: string,
): Promise<any> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const work = async () => {
    if (
      signal.aborted ||
      (await readPendingSummarySession(controller.signal)) !== owner
    )
      throw new ResultRestrictionError("scope");
    const found = await lookupSpecimen(target.lookupCode, {
      signal: controller.signal,
    });
    if (!lookupMatches(found, target))
      throw new ResultRestrictionError("changed");
    if (
      (await readPendingSummarySession(controller.signal)) !== owner ||
      controller.signal.aborted
    )
      throw new ResultRestrictionError("scope");
    return found;
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ResultRestrictionError("timeout"));
          controller.abort();
        }, 20000);
        controller.signal.addEventListener(
          "abort",
          () => reject(new ResultRestrictionError("unavailable")),
          { once: true },
        );
      }),
    ]);
  } catch (error) {
    throw new ResultRestrictionError(restrictionFailure(error));
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal.removeEventListener("abort", abort);
  }
}
