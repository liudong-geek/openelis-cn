import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  json,
  clone,
} from "../../patient/resultsViewer/__tests__/reportFixtures";
import {
  getGroupingRules,
  getReportingChannels,
  readReportingForm,
  sameChannelConfiguration,
  saveReportingChannels,
  readOutboxMessages,
  ReportingApiError,
} from "./result-reporting-api";
const context = {
  stamp: { identity: "report-admin", csrf: "token" },
  current: () => true,
};
export const form = {
  reports: [
    {
      enabledId: "11",
      urlId: "12",
      enabled: "disable",
      url: "disable",
      title: "Result Reporting",
      connectionTestIdentifier: "resultReport",
      isScheduled: true,
      schedulerId: "13",
      scheduleHours: "14",
      scheduleMin: "37",
      showAuthentication: false,
      backlogSize: "0",
    },
  ],
  hourList: [],
  minList: [],
};
beforeEach(() => localStorage.setItem("CSRF", "token"));
afterEach(() => vi.unstubAllGlobals());
it("preserves opaque original URL and exact scheduler minute", () => {
  const parsed = readReportingForm(clone(form));
  expect(parsed.reports[0].url).toBe("disable");
  expect(parsed.reports[0].scheduleMin).toBe("37");
});
it.each([
  {},
  { ...form, reports: [{}] },
  { ...form, reports: [...form.reports, ...form.reports] },
  { ...form, reports: [{ ...form.reports[0], enabledId: "011" }] },
  { ...form, reports: [{ ...form.reports[0], scheduleMin: "61" }] },
])("rejects incomplete, duplicate or ambiguous channel identity", (value) =>
  expect(() => readReportingForm(value)).toThrow(ReportingApiError),
);
it("matches channel identity independent of ordering while detecting scheduler drift", () => {
  const other = {
    ...form.reports[0],
    enabledId: "21",
    urlId: "22",
    schedulerId: "23",
  };
  const a = readReportingForm({ ...form, reports: [...form.reports, other] });
  expect(
    sameChannelConfiguration(a, { ...a, reports: [...a.reports].reverse() }),
  ).toBe(true);
  expect(
    sameChannelConfiguration(a, {
      ...a,
      reports: [{ ...a.reports[0], scheduleMin: "30" }, other],
    }),
  ).toBe(false);
});
it("returns missing grouping only with explicit absence code", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ error: "REPORT_GROUPS_NOT_CONFIGURED" }, 409)),
  );
  await expect(getGroupingRules(context)).rejects.toMatchObject({
    status: 409,
    code: "REPORT_GROUPS_NOT_CONFIGURED",
  });
});
it.each([400, 401, 403, 409, 422])(
  "does not interpret HTTP %i error JSON as a saved form",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: "rejected", ...form }, status)),
    );
    await expect(
      saveReportingChannels(readReportingForm(form), context),
    ).rejects.toMatchObject({ kind: "rejected", status });
  },
);
it.each([500, 502])(
  "keeps HTTP %i write outcomes unconfirmed",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(form, status)),
    );
    await expect(
      saveReportingChannels(readReportingForm(form), context),
    ).rejects.toMatchObject({ kind: "unknown", status });
  },
);
it("rejects a successful HTML redirect body and disables automatic redirects", async () => {
  const fetcher = vi.fn(
    async (_url: any, _options: any) =>
      new Response("login", { headers: { "Content-Type": "text/html" } }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    saveReportingChannels(readReportingForm(form), context),
  ).rejects.toMatchObject({ kind: "unknown" });
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: "manual",
    credentials: "include",
    cache: "no-store",
    headers: { "X-CSRF-Token": "token" },
  });
});
it("rejects malformed reads and a session change after response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ reports: [] })),
  );
  await expect(getReportingChannels(context)).rejects.toMatchObject({
    kind: "contract",
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      localStorage.setItem("CSRF", "other");
      return json(form);
    }),
  );
  await expect(getReportingChannels(context)).rejects.toMatchObject({
    kind: "session",
  });
});
it("rejects duplicate and malformed outbox rows", () => {
  const row = {
    id: 1,
    businessId: "REPORT-1",
    status: "FAILED",
    eventType: "REPORT",
    attemptCount: 1,
    maxAttempts: 3,
  };
  expect(readOutboxMessages([row])).toHaveLength(1);
  expect(() => readOutboxMessages([row, row])).toThrow();
  expect(() => readOutboxMessages([{ ...row, id: "1" }])).toThrow();
});
