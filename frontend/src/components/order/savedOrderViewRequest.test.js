import {
  readSavedOrder,
  savedOrderSessionKey,
  savedOrderNumberFromSearch,
  validSavedOrderNumber,
} from "./savedOrderViewRequest";
import {
  session,
  rawNumber,
  savedOrder,
  jsonResponse,
} from "./savedOrderView.testData";
let fetcher;
const owner = savedOrderSessionKey(session);
const read = (number = rawNumber) =>
  readSavedOrder(number, new AbortController().signal, owner);
const mockRead = (value = savedOrder(), after = session) =>
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(jsonResponse(value))
    .mockResolvedValueOnce(jsonResponse(after));
beforeEach(() => {
  fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
test("session owner canonicalizes grants but excludes rotating masked CSRF", () => {
  const one = {
    ...session,
    roles: ["Reception", "GlobalAdmin"],
    userLabRolesMap: { B: ["Reception", "Results"], A: ["Reception"] },
  };
  const two = {
    ...one,
    csrf: "rotated",
    roles: ["GlobalAdmin", "Reception"],
    userLabRolesMap: { A: ["Reception"], B: ["Results", "Reception"] },
  };
  expect(savedOrderSessionKey(one)).toBe(savedOrderSessionKey(two));
  expect(
    savedOrderSessionKey({ ...one, userLabRolesMap: { A: ["Reception"] } }),
  ).not.toBe(savedOrderSessionKey(one));
  expect(savedOrderSessionKey({ ...one, sessionId: "another" })).not.toBe(
    savedOrderSessionKey(one),
  );
});
test("preserves raw number and all analysis identities through real GET responses", async () => {
  mockRead();
  const dto = await read();
  expect(dto.labNumber).toBe(rawNumber);
  expect(dto.samples.map((s) => s.analyses[0].analysisId)).toEqual([
    "101",
    "102",
  ]);
  expect(
    fetcher.mock.calls.map(([url]) => url.replace("/api/OpenELIS-Global", "")),
  ).toEqual([
    "/session",
    `/rest/order/saved?${new URLSearchParams({ queryVersion: "2", labNumber: rawNumber })}`,
    "/session",
  ]);
  for (const [, options] of fetcher.mock.calls)
    expect(options).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
    });
});
test.each(["", " spaced", "spaced ", "x".repeat(26), "bad\nnumber"])(
  "invalid raw number %# is rejected before any request",
  async (number) => {
    await expect(read(number)).rejects.toMatchObject({ kind: "invalid" });
    expect(fetcher).not.toHaveBeenCalled();
  },
);
test("accepts schema's exact 25-character boundary and rejects duplicated query number", () => {
  expect(validSavedOrderNumber("x".repeat(25))).toBe(true);
  expect(savedOrderNumberFromSearch("?labNumber=A&labNumber=B")).toBeNull();
  expect(
    savedOrderNumberFromSearch(`?labNumber=${encodeURIComponent(rawNumber)}`),
  ).toBe(rawNumber);
});
test.each([
  [401, "unauthenticated"],
  [403, "forbidden"],
  [404, "notFound"],
  [409, "conflict"],
  [500, "unavailable"],
])("HTTP %s retains honest failure", async (status, kind) => {
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(jsonResponse({}, status));
  await expect(read()).rejects.toMatchObject({ kind });
});
test.each(["<html>login</html>", "{malformed"])(
  "malformed response %# never masquerades as saved data",
  async (body) => {
    fetcher
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(jsonResponse(body));
    await expect(read()).rejects.toMatchObject({ kind: "unavailable" });
  },
);
test("redirected login HTML cannot become a readonly DTO", async () => {
  const response = jsonResponse("<html>login</html>", 200, "text/html");
  Object.defineProperty(response, "redirected", { value: true });
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(response);
  await expect(read()).rejects.toMatchObject({ kind: "unavailable" });
});
test.each([
  [
    "raw number",
    (v) => {
      v.labNumber = "OTHER";
    },
  ],
  [
    "echo",
    (v) => {
      v.query.labNumber = "OTHER";
    },
  ],
  [
    "actor",
    (v) => {
      v.currentUserId = "9";
    },
  ],
  [
    "unverified capability",
    (v) => {
      v.canModify = undefined;
    },
  ],
  [
    "inconsistent editable",
    (v) => {
      v.isEditable = false;
    },
  ],
  [
    "duplicate analysis",
    (v) => {
      v.samples[1].analyses[0].analysisId = "101";
    },
  ],
  [
    "analysis warning shape",
    (v) => {
      v.samples[0].analyses[0].warningCodes = "unknown";
    },
  ],
  [
    "analysis section identity",
    (v) => {
      v.samples[0].analyses[0].testSectionId = "bad";
    },
  ],
  [
    "wrong status category",
    (v) => {
      v.samples[0].analyses[0].statusType = "SAMPLE";
    },
  ],
  [
    "request wrong sample link",
    (v) => {
      v.requests[0].sampleItemId = "99";
    },
  ],
  [
    "bad saved version",
    (v) => {
      v.samples[0].lastupdated = "2026/10/06";
    },
  ],
])("rejects %s without accepting clinical content", async (_name, change) => {
  const dto = savedOrder();
  change(dto);
  mockRead(dto);
  await expect(read()).rejects.toMatchObject({ kind: "unavailable" });
});
test("known unknown status and redacted patient are preserved visibly rather than guessed", async () => {
  const dto = savedOrder();
  dto.patient = { patientId: "4", firstName: null, lastName: null };
  dto.warningCodes = ["PATIENT_DATA_REDACTED"];
  dto.requests[0].status = null;
  dto.requests[0].warningCodes = ["REQUEST_STATE_UNAVAILABLE"];
  dto.samples[0].statusCode = null;
  dto.samples[0].statusName = null;
  dto.samples[0].warningCodes = ["STATUS_UNAVAILABLE"];
  dto.canModify = false;
  dto.isEditable = false;
  dto.modifyUnavailableReason = "INCOMPLETE_ORDER_DATA";
  mockRead(dto);
  const data = await read();
  expect(data.patient.firstName).toBeNull();
  expect(data.requests[0].status).toBeNull();
  expect(data.canModify).toBe(false);
});
test("actor or scope changes after DTO read reject the complete response", async () => {
  mockRead(savedOrder(), { ...session, userId: "8" });
  await expect(read()).rejects.toMatchObject({ kind: "scope" });
});
test("actor change before read prevents even the detail request", async () => {
  fetcher.mockResolvedValueOnce(jsonResponse({ ...session, sessionId: "new" }));
  await expect(read()).rejects.toMatchObject({ kind: "scope" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
