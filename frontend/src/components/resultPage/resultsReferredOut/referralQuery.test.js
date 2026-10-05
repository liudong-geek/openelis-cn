import {
  buildReferralParams,
  readReferralRecords,
  recentReferralDraft,
  referralHistoryOwner,
  forgetReferralHistoryOwner,
} from "./referralQuery";
import { pendingSummarySessionKey } from "../../home/pendingSummarySession";
import config from "../../../config.json";

const actor = {
  authenticated: true,
  userId: "17",
  sessionId: "synthetic-referral-session",
  roles: ["Results", "Reception"],
  loginLabUnit: "化学组",
  userLabRolesMap: { 化学组: ["Results", "Reception"], 血液组: ["Results"] },
};
const draft = (patch = {}) => ({
  ...recentReferralDraft(new Date(2026, 9, 5, 0, 30)),
  ...patch,
});
const json = (
  value,
  status = 200,
  contentType = "application/json; charset=utf-8",
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": contentType },
  });
const row = (id = "71") => ({
  analysisId: id,
  accessionNumber: "LAB/71",
  referralStatus: "SENT",
});
const startRead = () =>
  readReferralRecords(
    "searchType=LAB_NUMBER&labNumber=LAB%2F71",
    new AbortController().signal,
    pendingSummarySessionKey(actor),
  );
const mockRead = (response, first = actor, last = actor) =>
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json(first))
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(json(last)),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("referral query parameters", () => {
  test.each([
    [new Date(2026, 9, 5, 0, 30), "2026-09-29", "2026-10-05"],
    [new Date(2026, 0, 2, 23, 59), "2025-12-27", "2026-01-02"],
    [new Date(2024, 2, 3), "2024-02-26", "2024-03-03"],
    [new Date(2026, 2, 3), "2026-02-25", "2026-03-03"],
  ])(
    "uses seven local calendar days including today %#",
    (today, startDate, endDate) => {
      expect(recentReferralDraft(today)).toEqual({
        mode: "TEST_AND_DATES",
        dateType: "SENT",
        startDate,
        endDate,
        testIds: [],
        testUnitIds: [],
        labNumber: "",
        patientId: "",
      });
    },
  );
  test.each([
    ["zh-CN", "2026/09/29", "2026/10/05"],
    ["fr-FR", "29/09/2026", "05/10/2026"],
    ["en-US", "09/29/2026", "10/05/2026"],
  ])(
    "converts ISO calendar dates at the %s backend boundary",
    (locale, startDate, endDate) => {
      const params = buildReferralParams(
        draft({
          dateType: "RESULT",
          testIds: ["31", "42"],
          testUnitIds: ["7", "8"],
          patientId: "99",
          labNumber: "UNRELATED",
        }),
        locale,
      );
      expect(Object.fromEntries(params)).toEqual({
        searchType: "TEST_AND_DATES",
        dateType: "RESULT",
        startDate,
        endDate,
        testIds: "31,42",
        testUnitIds: "7,8",
      });
      expect(params.toString()).toContain(
        "startDate=" + encodeURIComponent(startDate),
      );
    },
  );
  test("patient mode sends only the explicitly selected patient", () => {
    expect(
      Object.fromEntries(
        buildReferralParams(
          draft({
            mode: "PATIENT",
            patientId: "41",
            labNumber: "UNRELATED",
            testIds: ["7"],
          }),
          undefined,
        ),
      ),
    ).toEqual({ searchType: "PATIENT", selPatient: "41" });
  });
  test("lab number mode trims and encodes literal spaces/slashes without unrelated fields", () => {
    const params = buildReferralParams(
      draft({
        mode: "LAB_NUMBER",
        labNumber: "  NO SUCH/1 &x=2  ",
        patientId: "41",
        testIds: ["7"],
      }),
    );
    expect(Object.fromEntries(params)).toEqual({
      searchType: "LAB_NUMBER",
      labNumber: "NO SUCH/1 &x=2",
    });
    expect(new URLSearchParams(params.toString()).get("labNumber")).toBe(
      "NO SUCH/1 &x=2",
    );
  });
  test.each(["", "0", "01", "-1", "1.2", "41&selPatient=42", "P-41"])(
    "rejects unselected or malformed patient %s",
    (patientId) => {
      expect(() =>
        buildReferralParams(draft({ mode: "PATIENT", patientId }), "zh-CN"),
      ).toThrow(expect.objectContaining({ kind: "patient" }));
    },
  );
  test.each(["", " ", "\t"])("rejects empty lab number %#", (labNumber) => {
    expect(() =>
      buildReferralParams(draft({ mode: "LAB_NUMBER", labNumber })),
    ).toThrow(expect.objectContaining({ kind: "number" }));
  });
  test.each([
    { startDate: "2026-02-29" },
    { endDate: "2026-04-31" },
    { startDate: "2026-02-30" },
    { endDate: "2026-13-01" },
    { startDate: "2026-00-01" },
    { endDate: "2026-01-00" },
    { startDate: "2026-1-02" },
    { startDate: "02/01/2026" },
    { startDate: "2026-10-06", endDate: "2026-10-05" },
    { dateType: "CREATED" },
  ])("rejects impossible, reversed or non-ISO dates %#", (patch) => {
    expect(() => buildReferralParams(draft(patch), "zh-CN")).toThrow(
      expect.objectContaining({ kind: "date" }),
    );
  });
  test("does not impose an unconfigured 1900 year boundary on valid historic dates", () => {
    expect(
      buildReferralParams(
        draft({ startDate: "1899-12-31", endDate: "1900-01-01" }),
        "zh-CN",
      ).get("startDate"),
    ).toBe("1899/12/31");
  });
  test("history owner is stable within one account, contains no raw session identity and is forgotten on invalidation", () => {
    const scope = pendingSummarySessionKey(actor);
    const token = referralHistoryOwner(scope);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(token).not.toContain(actor.sessionId);
    expect(referralHistoryOwner(scope)).toBe(token);
    expect(
      referralHistoryOwner(
        pendingSummarySessionKey({ ...actor, userId: "18" }),
      ),
    ).not.toBe(token);
    forgetReferralHistoryOwner(scope);
    expect(referralHistoryOwner(scope)).not.toBe(token);
    expect(referralHistoryOwner("")).toBe("");
  });
  test("waits for installation date configuration", () => {
    expect(() => buildReferralParams(draft())).toThrow(
      expect.objectContaining({ kind: "configuration" }),
    );
  });
  test("rejects an unconstrained record search", () => {
    expect(() =>
      buildReferralParams(draft({ startDate: "", endDate: "" }), "zh-CN"),
    ).toThrow(expect.objectContaining({ kind: "conditions" }));
  });
  test("allows test/section-only query and one-sided date ranges", () => {
    expect(
      Object.fromEntries(
        buildReferralParams(
          draft({ startDate: "", endDate: "", testIds: ["7"] }),
          "zh-CN",
        ),
      ),
    ).toEqual({
      searchType: "TEST_AND_DATES",
      dateType: "SENT",
      startDate: "",
      endDate: "",
      testIds: "7",
      testUnitIds: "",
    });
    expect(
      buildReferralParams(
        draft({ startDate: "", endDate: "2026-10-05" }),
        "zh-CN",
      ).get("endDate"),
    ).toBe("2026/10/05");
  });
  test("rejects unknown query modes", () => {
    expect(() => buildReferralParams(draft({ mode: "ALL" }), "zh-CN")).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
  });
});

describe("referral response and stable session scope", () => {
  test("reads fresh scope before and after clinical rows with GET credentials and no cache or redirects", async () => {
    mockRead(json({ referralDisplayItems: [row()] }));
    const controller = new AbortController();
    const result = await readReferralRecords(
      "searchType=LAB_NUMBER&labNumber=LAB%2F71",
      controller.signal,
      pendingSummarySessionKey(actor),
    );
    expect(result).toEqual({
      rows: [row()],
      owner: pendingSummarySessionKey(actor),
    });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      config.serverBaseUrl + "/session",
      config.serverBaseUrl +
        "/rest/ReferredOutTests?searchType=LAB_NUMBER&labNumber=LAB%2F71",
      config.serverBaseUrl + "/session",
    ]);
    for (const [, options] of fetch.mock.calls)
      expect(options).toMatchObject({
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
  });
  test("refuses a stable server account that differs from the intended context before clinical reads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ ...actor, userId: "18" })),
    );
    await expect(startRead()).rejects.toMatchObject({ kind: "scope" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      config.serverBaseUrl + "/session",
    ]);
  });
  test("refuses a missing expected context even with a valid session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(actor)));
    await expect(
      readReferralRecords(
        "searchType=PATIENT&selPatient=41",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: "scope" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      config.serverBaseUrl + "/session",
    ]);
  });
  test.each([
    { testIds: ["7,8"] },
    { testUnitIds: ["0"] },
    { testIds: "7" },
    { testIds: [7] },
  ])("rejects malformed persisted test and section IDs %#", (patch) => {
    expect(() => buildReferralParams(draft(patch), "zh-CN")).toThrow(
      expect.objectContaining({ kind: "invalid" }),
    );
  });
  test("accepts a genuine empty array only after rechecking scope", async () => {
    mockRead(json({ referralDisplayItems: [] }));
    await expect(startRead()).resolves.toEqual({
      rows: [],
      owner: pendingSummarySessionKey(actor),
    });
  });
  test.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [400, "invalid"],
    [302, "unavailable"],
    [404, "unavailable"],
    [500, "unavailable"],
    [204, "unavailable"],
  ])("HTTP %s remains a distinct failure %#", async (status, kind) => {
    const response =
      status === 204
        ? new Response(null, { status })
        : json({ referralDisplayItems: [] }, status);
    mockRead(response);
    await expect(startRead()).rejects.toMatchObject({ kind });
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/session")),
    ).toHaveLength(1);
  });
  test.each(["text/html", "text/plain", "", "application/jsonp"])(
    "refuses non-JSON referral content %s",
    async (contentType) => {
      mockRead(json({ referralDisplayItems: [] }, 200, contentType));
      await expect(startRead()).rejects.toMatchObject({ kind: "unavailable" });
    },
  );
  test("does not accept redirected JSON as a clinical response", async () => {
    const response = json({ referralDisplayItems: [] });
    Object.defineProperty(response, "redirected", { value: true });
    mockRead(response);
    await expect(startRead()).rejects.toMatchObject({ kind: "unavailable" });
  });
  test.each([
    null,
    {},
    [],
    { referralDisplayItems: null },
    { referralDisplayItems: {} },
    { referralDisplayItems: [null] },
    { referralDisplayItems: [[]] },
    { referralDisplayItems: ["bad"] },
  ])("rejects malformed referral data %#", async (value) => {
    mockRead(json(value));
    await expect(startRead()).rejects.toMatchObject({ kind: "unavailable" });
  });
  test.each([
    { analysisId: "" },
    { analysisId: "71,72" },
    { analysisId: ["71"] },
    { analysisId: {} },
    { analysisId: "0" },
    { disabled: "false" },
    { notes: { value: "unexpected" } },
    { accessionNumber: [] },
    { patientFirstName: 7 },
  ])(
    "rejects malformed cell, selection or report identity %#",
    async (patch) => {
      mockRead(json({ referralDisplayItems: [{ ...row(), ...patch }] }));
      await expect(startRead()).rejects.toMatchObject({ kind: "unavailable" });
    },
  );
  test("missing analysis identity remains readable but unavailable for printing", async () => {
    mockRead(json({ referralDisplayItems: [{ ...row(), analysisId: null }] }));
    await expect(startRead()).resolves.toMatchObject({
      rows: [{ analysisId: null }],
    });
  });
  test("malformed JSON cannot become an empty result", async () => {
    mockRead(
      new Response("{broken", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test.each([
    [401, "unauthenticated"],
    [403, "forbidden"],
    [500, "unavailable"],
  ])(
    "initial session HTTP %s prevents reading referrals",
    async (status, kind) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(actor, status)));
      await expect(startRead()).rejects.toMatchObject({ kind });
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        config.serverBaseUrl + "/session",
      ]);
    },
  );
  test("a malformed or unauthorized initial session never fetches referral rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ ...actor, roles: ["Reception"] })),
    );
    await expect(startRead()).rejects.toMatchObject({ kind: "forbidden" });
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      config.serverBaseUrl + "/session",
    ]);
  });
  test.each([
    { userId: "18" },
    { sessionId: "different-session" },
    { roles: ["Results"] },
    { loginLabUnit: "血液组" },
    { userLabRolesMap: { 化学组: ["Results"] } },
  ])(
    "discards rows when stable scope changes during the query %#",
    async (patch) => {
      mockRead(json({ referralDisplayItems: [row()] }), actor, {
        ...actor,
        ...patch,
      });
      await expect(startRead()).rejects.toMatchObject({ kind: "scope" });
    },
  );
  test("scope checks tolerate fresh CSRF masks and equivalent role/map ordering", async () => {
    mockRead(
      json({ referralDisplayItems: [row()] }),
      { ...actor, csrf: "synthetic-mask-one" },
      {
        ...actor,
        csrf: "synthetic-mask-two",
        roles: ["Reception", "Results"],
        userLabRolesMap: {
          血液组: ["Results"],
          化学组: ["Reception", "Results", "Results"],
        },
      },
    );
    await expect(startRead()).resolves.toEqual({
      rows: [row()],
      owner: pendingSummarySessionKey(actor),
    });
  });
  test("a logout during the request remains session expiry and cannot publish the rows", async () => {
    mockRead(json({ referralDisplayItems: [row()] }), actor, {
      authenticated: false,
    });
    await expect(startRead()).rejects.toMatchObject({
      kind: "unauthenticated",
    });
  });
  test("an aborted query does not request clinical records", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      readReferralRecords(
        "searchType=PATIENT&selPatient=41",
        controller.signal,
        pendingSummarySessionKey(actor),
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("abort after reading rows prevents the final scope read and acceptance", async () => {
    const controller = new AbortController();
    const response = json({ referralDisplayItems: [row()] });
    const parse = response.json.bind(response);
    response.json = async () => {
      const value = await parse();
      controller.abort();
      return value;
    };
    mockRead(response);
    await expect(
      readReferralRecords(
        "searchType=PATIENT&selPatient=41",
        controller.signal,
        pendingSummarySessionKey(actor),
      ),
    ).rejects.toMatchObject({ kind: "scope" });
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/session")),
    ).toHaveLength(1);
  });
});
