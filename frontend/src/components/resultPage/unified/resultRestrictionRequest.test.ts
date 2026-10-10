import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pendingSummarySessionKey } from "../../home/pendingSummarySession";
import {
  parseResultRestriction,
  readResultRestriction,
  readRestrictedIntakeLookup,
} from "./resultRestrictionRequest";
const actor = {
  authenticated: true,
  userId: "701",
  sessionId: "CURRENT",
  csrf: "MASKED",
  roles: ["Results", "Reception"],
  loginLabUnit: "",
  userLabRolesMap: { AllLabUnits: ["Results", "Reception"] },
};
const identity = {
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  labNumber: "RAW-001",
  analysisLastupdated: "1000",
};
import { diagnosticFixture } from "./resultRestriction.testFixtures";
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("reads the live owner before and after a real HTTP diagnostic, preserving exact query and no-store", async () => {
  fetchMock
    .mockResolvedValueOnce(response(actor))
    .mockResolvedValueOnce(response(diagnosticFixture()))
    .mockResolvedValueOnce(response({ ...actor, csrf: "OTHER-MASK" }));
  const value = await readResultRestriction(
    identity,
    new AbortController().signal,
    pendingSummarySessionKey(actor),
  );
  expect(value.identity.labNumber).toBe("RAW-001");
  const url = new URL(fetchMock.mock.calls[1][0], "https://example.invalid");
  expect(url.pathname).toBe(
    "/api/OpenELIS-Global/rest/results-entry/analysis/101/restriction",
  );
  expect(Object.fromEntries(url.searchParams)).toEqual({
    queryVersion: "2",
    sampleItemId: "201",
    testId: "401",
    labNumber: "RAW-001",
    analysisLastupdated: "1000",
  });
  expect(
    fetchMock.mock.calls.every(
      ([, options]) =>
        options.cache === "no-store" && options.redirect === "manual",
    ),
  ).toBe(true);
});
it("refuses a different actor even if the clinical response is well formed", async () => {
  fetchMock
    .mockResolvedValueOnce(response(actor))
    .mockResolvedValueOnce(response(diagnosticFixture()))
    .mockResolvedValueOnce(response({ ...actor, userId: "702" }));
  await expect(
    readResultRestriction(
      identity,
      new AbortController().signal,
      pendingSummarySessionKey(actor),
    ),
  ).rejects.toMatchObject({ kind: "scope" });
});
it("never accepts foreign identity, changed versions or display-index selection as a target", () => {
  for (const change of [
    { query: { ...identity, analysisLastupdated: "1001" } },
    { identity: { ...diagnosticFixture().identity, sampleItemId: "202" } },
    { target: { ...diagnosticFixture().target, requestId: "999" } },
  ])
    expect(() =>
      parseResultRestriction(
        { ...diagnosticFixture(), ...change },
        identity,
        "701",
      ),
    ).toThrow();
});
it("keeps explicit unknown facts and absent capability without claiming missing records", () => {
  const value = diagnosticFixture();
  value.canOpenIntake = false;
  value.canEditIntake = false;
  value.intakeEditUnavailableReason = "RECEPTION_PERMISSION_REQUIRED" as any;
  value.target = null as any;
  value.intakeLookup = null as any;
  value.actionUnavailableReason = "RECEPTION_PERMISSION_REQUIRED" as any;
  value.facts.receipt = { state: "UNKNOWN", value: null };
  expect(
    parseResultRestriction(value, identity, "701").facts.receipt.state,
  ).toBe("UNKNOWN");
  expect(() =>
    parseResultRestriction({ ...value, canOpenIntake: true }, identity, "701"),
  ).toThrow();
});
it("rejects duplicate graph identities, cross-request links and false status categories", () => {
  const a = diagnosticFixture();
  a.intakeLookup.current.physicalSpecimens.push({
    ...a.intakeLookup.current.physicalSpecimens[0],
  });
  expect(() => parseResultRestriction(a, identity, "701")).toThrow();
  const b = diagnosticFixture();
  b.intakeLookup.selection.requestId = "999";
  expect(() => parseResultRestriction(b, identity, "701")).toThrow();
  const c = diagnosticFixture();
  c.specimenStatus.actualStatusType = "ANALYSIS";
  expect(() => parseResultRestriction(c, identity, "701")).toThrow();
});
it("maps conflict honestly and bounds a fetch that ignores abort at 20 seconds", async () => {
  fetchMock
    .mockResolvedValueOnce(response(actor))
    .mockResolvedValueOnce(
      response(
        { queryVersion: "2", code: "RESULT_RESTRICTION_VERSION_CHANGED" },
        409,
      ),
    );
  await expect(
    readResultRestriction(
      identity,
      new AbortController().signal,
      pendingSummarySessionKey(actor),
    ),
  ).rejects.toMatchObject({ kind: "changed" });
  vi.useFakeTimers();
  fetchMock.mockImplementation(() => new Promise(() => {}));
  const failure = readResultRestriction(
    identity,
    new AbortController().signal,
    pendingSummarySessionKey(actor),
  ).catch((error) => error);
  await vi.advanceTimersByTimeAsync(20000);
  expect(await failure).toMatchObject({ kind: "timeout" });
});

it("preserves an inconsistent original date fact without claiming it is a recorded instant", () => {
  const value = diagnosticFixture();
  value.facts.collection = { state: "INCONSISTENT", value: "not-a-date" };
  expect(
    parseResultRestriction(value, identity, "701").facts.collection,
  ).toEqual({ state: "INCONSISTENT", value: "not-a-date" });
  expect(() =>
    parseResultRestriction(
      {
        ...value,
        facts: {
          ...value.facts,
          collection: { state: "RECORDED", value: "not-a-date" },
        },
      },
      identity,
      "701",
    ),
  ).toThrow();
});

it("requires explicit independent read/write capabilities and consistent edit denial reasons", () => {
  const value = diagnosticFixture() as any;
  value.canEditIntake = false;
  value.intakeEditUnavailableReason = "RECEPTION_UPDATE_PERMISSION_REQUIRED";
  expect(parseResultRestriction(value, identity, "701").canOpenIntake).toBe(
    true,
  );
  const missing = { ...value };
  delete missing.canEditIntake;
  expect(() => parseResultRestriction(missing, identity, "701")).toThrow();
  expect(() =>
    parseResultRestriction({ ...value, canEditIntake: true }, identity, "701"),
  ).toThrow();
  expect(() =>
    parseResultRestriction(
      { ...value, intakeEditUnavailableReason: null },
      identity,
      "701",
    ),
  ).toThrow();
  expect(() =>
    parseResultRestriction(
      { ...value, canOpenIntake: false, canEditIntake: true },
      identity,
      "701",
    ),
  ).toThrow();
});

it.each([
  "SPECIMEN_LOOKUP_AMBIGUOUS",
  "SPECIMEN_LOOKUP_UNSUPPORTED",
  "SPECIMEN_LOOKUP_STATE_CONFLICT",
])(
  "normalizes real legacy readback conflict %s into the restricted workspace failure vocabulary",
  async (code) => {
    fetchMock
      .mockResolvedValueOnce(response(actor))
      .mockResolvedValueOnce(response({ code }, 409));
    await expect(
      readRestrictedIntakeLookup(
        diagnosticFixture().target,
        new AbortController().signal,
        pendingSummarySessionKey(actor),
      ),
    ).rejects.toMatchObject({ kind: "changed" });
  },
);
