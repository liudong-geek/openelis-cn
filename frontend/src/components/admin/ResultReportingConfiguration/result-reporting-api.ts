import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";
import {
  assertReportRequest,
  readRules,
  ReportApiError,
} from "../../patient/resultsViewer/patient-report-release-api";
import type { ReportRequest } from "../../patient/resultsViewer/patient-report-release-api";

export class ReportingApiError extends ReportApiError {
  constructor(
    kind: "session" | "rejected" | "unknown" | "read" | "contract",
    status = 0,
    public code = "",
  ) {
    super(kind, status);
  }
}
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9][0-9]*$/.test(value);
const requireValue = (valid: unknown) => {
  if (!valid) throw new ReportingApiError("contract");
};
export interface ReportingChannel {
  enabledId: string;
  urlId: string;
  enabled: "enable" | "disable";
  url: string;
  title?: string;
  connectionTestIdentifier?: string;
  isScheduled?: boolean;
  schedulerId?: string | null;
  scheduleHours?: string | null;
  scheduleMin?: string | null;
  showAuthentication?: boolean;
  showBacklog?: boolean;
  backlogSize?: string;
  [key: string]: any;
}
export interface ReportingForm {
  reports: ReportingChannel[];
  hourList: { id: string; value: string }[];
  minList: { id: string; value: string }[];
  [key: string]: any;
}
export const channelIdentity = (channel: ReportingChannel) =>
  `${channel.enabledId}:${channel.urlId}`;
export function readReportingForm(value: unknown): ReportingForm {
  requireValue(
    object(value) &&
      Array.isArray(value.reports) &&
      Array.isArray(value.hourList) &&
      Array.isArray(value.minList),
  );
  const form = value as ReportingForm;
  requireValue(
    form.reports.every(
      (channel) =>
        object(channel) &&
        id(channel.enabledId) &&
        id(channel.urlId) &&
        ["enable", "disable"].includes(channel.enabled) &&
        typeof channel.url === "string" &&
        (channel.title == null || typeof channel.title === "string") &&
        (channel.connectionTestIdentifier == null ||
          typeof channel.connectionTestIdentifier === "string") &&
        (channel.showBacklog == null ||
          typeof channel.showBacklog === "boolean") &&
        (channel.showAuthentication == null ||
          typeof channel.showAuthentication === "boolean") &&
        (channel.backlogSize == null ||
          (typeof channel.backlogSize === "string" &&
            /^[0-9]+$/.test(channel.backlogSize))) &&
        (channel.isScheduled == null ||
          typeof channel.isScheduled === "boolean") &&
        (!channel.isScheduled ||
          (id(channel.schedulerId) &&
            (channel.scheduleHours == null ||
              channel.scheduleHours === "" ||
              /^(?:[01]?[0-9]|2[0-3])$/.test(channel.scheduleHours)) &&
            (channel.scheduleMin == null ||
              channel.scheduleMin === "" ||
              /^[0-5]?[0-9]$/.test(channel.scheduleMin)))),
    ),
  );
  requireValue(
    new Set(form.reports.map(channelIdentity)).size === form.reports.length &&
      new Set(form.reports.map((channel) => channel.enabledId)).size ===
        form.reports.length &&
      new Set(form.reports.map((channel) => channel.urlId)).size ===
        form.reports.length,
  );
  return form;
}
const schedule = (channel: ReportingChannel) =>
  channel.isScheduled
    ? [
        channel.schedulerId,
        channel.scheduleHours ?? "",
        channel.scheduleMin ?? "",
      ]
    : [];
export function sameChannelConfiguration(
  expected: ReportingForm,
  actual: ReportingForm,
): boolean {
  return (
    expected.reports.length === actual.reports.length &&
    expected.reports.every((channel) => {
      const current = actual.reports.find(
        (row) => channelIdentity(row) === channelIdentity(channel),
      );
      return (
        current &&
        current.enabled === channel.enabled &&
        current.url === channel.url &&
        JSON.stringify(schedule(current)) === JSON.stringify(schedule(channel))
      );
    })
  );
}
export async function reportingRequest<T>(
  path: string,
  context: ReportRequest,
  parse: (value: unknown) => T,
  method = "GET",
  body?: unknown,
): Promise<T> {
  assertReportRequest(context);
  const writing = method !== "GET";
  try {
    const response = await fetch(config.serverBaseUrl + path, {
      method,
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: context.signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
        ...(writing
          ? {
              "Content-Type": "application/json",
              "X-CSRF-Token": context.stamp.csrf,
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      let code = "";
      try {
        const payload = await response.json();
        if (object(payload) && typeof payload.error === "string")
          code = payload.error;
      } catch {
        /* An unreadable rejection remains an HTTP rejection. */
      }
      throw new ReportingApiError(
        [400, 401, 403, 404, 409, 422].includes(response.status)
          ? "rejected"
          : writing
            ? "unknown"
            : "read",
        response.status,
        code,
      );
    }
    if (!response.headers.get("Content-Type")?.includes("application/json"))
      throw new ReportingApiError(writing ? "unknown" : "contract");
    const value = await response.json();
    assertReportRequest(context);
    return parse(value);
  } catch (error) {
    if (
      error instanceof ReportApiError &&
      (!writing || error.kind === "rejected" || error.kind === "unknown")
    )
      throw error;
    throw new ReportingApiError(
      writing
        ? "unknown"
        : error instanceof ReportApiError
          ? error.kind
          : "read",
    );
  }
}
export const getReportingChannels = (context: ReportRequest) =>
  reportingRequest(
    "/rest/ResultReportingConfiguration",
    context,
    readReportingForm,
  );
export const saveReportingChannels = (
  form: ReportingForm,
  context: ReportRequest,
) =>
  reportingRequest(
    "/rest/ResultReportingConfiguration",
    context,
    readReportingForm,
    "POST",
    form,
  );
export const getGroupingRules = (context: ReportRequest) =>
  reportingRequest("/rest/reports/group-rules", context, readRules);

export const OUTBOX_STATUSES = [
  "PENDING",
  "FAILED",
  "ACKNOWLEDGED",
  "DEAD_LETTER",
  "CLOSED",
] as const;
export function readOutboxMessage(value: unknown): Record<string, any> {
  requireValue(
    object(value) &&
      Number.isSafeInteger(value.id) &&
      value.id > 0 &&
      typeof value.businessId === "string" &&
      value.businessId.trim() &&
      OUTBOX_STATUSES.includes(value.status) &&
      ["REPORT", "RESULT", "AMENDMENT", "WITHDRAWAL"].includes(
        value.eventType,
      ) &&
      Number.isSafeInteger(value.attemptCount) &&
      value.attemptCount >= 0 &&
      Number.isSafeInteger(value.maxAttempts) &&
      value.maxAttempts > 0,
  );
  return value as Record<string, any>;
}
export function readOutboxMessages(value: unknown): Record<string, any>[] {
  requireValue(Array.isArray(value));
  const rows = (value as unknown[]).map(readOutboxMessage);
  requireValue(new Set(rows.map((row) => row.id)).size === rows.length);
  return rows;
}
export const getOutboxMessages = (status: string, context: ReportRequest) =>
  reportingRequest(
    `/rest/his-result-outbox?${new URLSearchParams({ ...(status ? { status } : {}), limit: "100" })}`,
    context,
    readOutboxMessages,
  );
export const changeOutboxMessage = (
  id: number,
  action: "retry" | "close",
  body: unknown,
  context: ReportRequest,
) =>
  reportingRequest(
    `/rest/his-result-outbox/${id}/${action}`,
    context,
    (value) => {
      const saved = readOutboxMessage(value);
      requireValue(
        saved.id === id &&
          saved.status === (action === "retry" ? "PENDING" : "CLOSED"),
      );
      return saved;
    },
    "PUT",
    body,
  );
export const simulateOutboxMessage = (
  body: Record<string, any>,
  context: ReportRequest,
) =>
  reportingRequest(
    "/rest/his-result-outbox/simulate",
    context,
    (value) => {
      const saved = readOutboxMessage(value);
      requireValue(
        saved.idempotencyKey === body.idempotencyKey &&
          saved.status === body.outcome,
      );
      return saved;
    },
    "POST",
    body,
  );
