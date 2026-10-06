import {
  readWorkplan,
  workplanSessionKey,
  requestWorkplanPDF,
  buildWorkplanParams,
} from "./workplanRequest";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";
vi.mock("../utils/readOpenElisResponse", () => ({
  readOpenElisResponse: vi.fn(),
}));
const session = {
  authenticated: true,
  userId: "42",
  sessionId: "fixture-session",
  roles: ["Results"],
  loginLabUnit: "7",
  userLabRolesMap: { 7: ["Results"] },
  csrf: "fixture-csrf",
};
const row = {
  analysisId: "101",
  sampleId: "201",
  sampleItemId: "301",
  testId: "401",
  accessionNumber: "HMC26092800001",
  statusId: "4",
  lastupdated: "2026-10-06T01:02:03.123456Z",
  rowKind: "ANALYSIS",
  groupKey: "201",
  canPrint: true,
  printUnavailableReason: null,
  testName: "白细胞计数",
  receivedDate: "2026/10/06",
  nonconforming: false,
};
const query = { type: "unit", filterId: "7" };
const response = (value, status = 200, type = "application/json") =>
  new Response(typeof value === "string" ? value : JSON.stringify(value), {
    status,
    headers: { "Content-Type": type },
  });
const result = () => ({
  queryVersion: "2",
  currentUserId: "42",
  canPrint: true,
  pageSnapshot: "a".repeat(64),
  query: { ...query, page: 1, pageSize: 10 },
  effectiveScope: { role: "Results", testIds: ["401"] },
  paging: { currentPage: "1", totalPages: "1", totalResults: 1, pageSize: 10 },
  workplanTests: [{ ...row }],
});
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const mockReads = (value = result(), after = session) =>
  readOpenElisResponse
    .mockResolvedValueOnce(response(session))
    .mockResolvedValueOnce(response(value))
    .mockResolvedValueOnce(response(after));
test.each(["test", "panel", "unit", "priority"])(
  "each %s query and page carries complete independent criteria",
  (type) => {
    const filterId = type === "priority" ? "STAT" : "7";
    const p = buildWorkplanParams({ type, filterId }, 2, 10);
    expect(Object.fromEntries(p)).toEqual({
      queryVersion: "2",
      type,
      filterId,
      page: "2",
      pageSize: "10",
    });
  },
);
test.each([
  { type: "bad", filterId: "1" },
  { type: "unit", filterId: "" },
  { type: "test", filterId: "NFS" },
  { type: "priority", filterId: "3" },
])("rejects invalid/unbounded criteria %j", (q) =>
  expect(() => buildWorkplanParams(q, 1, 10)).toThrow(),
);
test("CSRF rotation is not an actor change; real grants and session are", () => {
  expect(workplanSessionKey({ ...session, csrf: "rotated" })).toBe(
    workplanSessionKey(session),
  );
  expect(workplanSessionKey({ ...session, sessionId: "other" })).not.toBe(
    workplanSessionKey(session),
  );
  expect(workplanSessionKey({ ...session, userLabRolesMap: {} })).not.toBe(
    workplanSessionKey(session),
  );
  expect(() =>
    workplanSessionKey({ ...session, roles: ["Reception"] }),
  ).toThrow();
});
test("valid fresh page retains raw numbers, exact analysis identities and real total", async () => {
  mockReads();
  const data = await readWorkplan(
    query,
    1,
    10,
    signal(),
    workplanSessionKey(session),
  );
  expect(data.rows[0].accessionNumber).toBe(row.accessionNumber);
  expect(data.rows[0].analysisId).toBe("101");
  expect(data.paging.totalResults).toBe(1);
  expect(readOpenElisResponse.mock.calls[1][0]).toBe(
    "/rest/Workplan?queryVersion=2&type=unit&filterId=7&page=1&pageSize=10",
  );
});
test.each([401, 403, 500])(
  "HTTP %s is failure rather than empty workplan",
  async (status) => {
    readOpenElisResponse
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response({}, status));
    await expect(
      readWorkplan(query, 1, 10, signal(), workplanSessionKey(session)),
    ).rejects.toThrow();
  },
);
test.each(["<html>login</html>", "{broken"])(
  "non-JSON and malformed response fail closed (case %#)",
  async (body) => {
    readOpenElisResponse
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response(body));
    await expect(
      readWorkplan(query, 1, 10, signal(), workplanSessionKey(session)),
    ).rejects.toThrow();
  },
);
test.each([
  (value) => {
    value.query.filterId = "9";
  },
  (value) => {
    value.query.page = 2;
  },
  (value) => {
    value.currentUserId = "9";
  },
  (value) => {
    value.workplanTests[0].analysisId = "";
  },
  (value) => {
    value.workplanTests.push({ ...row });
    value.paging.totalResults = 2;
  },
  (value) => {
    value.workplanTests[0].rowKind = "PATIENT_HEADER";
  },
  (value) => {
    value.effectiveScope.testIds = [];
  },
  (value) => {
    value.paging.totalResults = 2;
  },
  (value) => {
    value.workplanTests[0].lastupdated = "2026/10/06";
  },
  (value) => {
    value.workplanTests[0].canPrint = false;
    value.workplanTests[0].printUnavailableReason = null;
  },
])(
  "rejects mismatched query, page, actor, identity, scope or version (case %#)",
  async (mutate) => {
    const value = result();
    mutate(value);
    mockReads(value);
    await expect(
      readWorkplan(query, 1, 10, signal(), workplanSessionKey(session)),
    ).rejects.toThrow();
  },
);
test("actor/grants changed while query is in flight suppresses result", async () => {
  mockReads(result(), { ...session, userLabRolesMap: { 7: ["Reception"] } });
  await expect(
    readWorkplan(query, 1, 10, signal(), workplanSessionKey(session)),
  ).rejects.toMatchObject({ kind: "scope" });
});
test("true zero results are a successful bounded page", async () => {
  const value = result();
  value.workplanTests = [];
  value.paging.totalResults = 0;
  mockReads(value);
  expect(
    (await readWorkplan(query, 1, 10, signal(), workplanSessionKey(session)))
      .rows,
  ).toEqual([]);
});
const payload = () => ({
  ...query,
  pageSnapshot: "a".repeat(64),
  page: 1,
  pageSize: 10,
  analyses: [
    {
      analysisId: row.analysisId,
      sampleId: row.sampleId,
      sampleItemId: row.sampleItemId,
      testId: row.testId,
      accessionNumber: row.accessionNumber,
      statusId: row.statusId,
      lastupdated: row.lastupdated,
    },
  ],
});
const pdf = "%PDF-1.4\nfixture\n%%EOF";
test("printing sends only current identities and verifies actual PDF and fresh actor", async () => {
  readOpenElisResponse.mockImplementation(() =>
    Promise.resolve(response(session)),
  );
  fetch.mockResolvedValue(response(pdf, 200, "application/pdf"));
  const blob = await requestWorkplanPDF(
    payload(),
    signal(),
    workplanSessionKey(session),
  );
  expect(blob.type).toBe("application/pdf");
  expect(blob.size).toBe(pdf.length);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/PrintWorkplanReport\?queryVersion=2$/);
  expect(JSON.parse(options.body)).toEqual(payload());
  expect(options.headers["X-CSRF-Token"]).toBe("fixture-csrf");
  expect(options.redirect).toBe("manual");
});
test.each([
  [200, "application/pdf", "<html>error</html>"],
  [200, "application/json", "{}"],
  [409, "application/json", "{}"],
  [403, "application/json", "{}"],
])(
  "invalid or rejected PDF never becomes success %s %s",
  async (status, type, body) => {
    readOpenElisResponse.mockImplementation(() =>
      Promise.resolve(response(session)),
    );
    fetch.mockResolvedValue(response(body, status, type));
    await expect(
      requestWorkplanPDF(payload(), signal(), workplanSessionKey(session)),
    ).rejects.toThrow();
  },
);
test("late PDF after role revocation does not escape scope", async () => {
  readOpenElisResponse
    .mockResolvedValueOnce(response(session))
    .mockResolvedValueOnce(response({ ...session, sessionId: "changed" }));
  fetch.mockResolvedValue(response(pdf, 200, "application/pdf"));
  await expect(
    requestWorkplanPDF(payload(), signal(), workplanSessionKey(session)),
  ).rejects.toMatchObject({ kind: "scope" });
});
test("duplicate print identities and invalid selections never send a POST", async () => {
  const value = payload();
  value.analyses.push(value.analyses[0]);
  await expect(
    requestWorkplanPDF(value, signal(), workplanSessionKey(session)),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

test("a malformed page snapshot is rejected before exposing rows", async () => {
  const value = result();
  value.pageSnapshot = "missing-page-version";
  mockReads(value);
  await expect(
    readWorkplan(query, 1, 10, signal(), workplanSessionKey(session)),
  ).rejects.toThrow();
});
test("a print request without the complete page snapshot never sends a POST", async () => {
  const value = payload();
  delete value.pageSnapshot;
  await expect(
    requestWorkplanPDF(value, signal(), workplanSessionKey(session)),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

test("a known missing version remains visible with its non-printable reason", async () => {
  const value = result();
  Object.assign(value.workplanTests[0], {
    lastupdated: null,
    canPrint: false,
    printUnavailableReason: "INCOMPLETE_ANALYSIS_IDENTITY",
  });
  mockReads(value);
  const data = await readWorkplan(
    query,
    1,
    10,
    signal(),
    workplanSessionKey(session),
  );
  expect(data.rows[0]).toMatchObject({
    analysisId: "101",
    lastupdated: null,
    canPrint: false,
    printUnavailableReason: "INCOMPLETE_ANALYSIS_IDENTITY",
  });
});
test("an incomplete row cannot be forged into a printable identity", async () => {
  const value = payload();
  value.analyses[0].lastupdated = null;
  await expect(
    requestWorkplanPDF(value, signal(), workplanSessionKey(session)),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
test("a truncated HTTP 200 PDF is not a successful report", async () => {
  readOpenElisResponse.mockImplementation(() =>
    Promise.resolve(response(session)),
  );
  fetch.mockResolvedValue(
    response("%PDF-1.4\ntruncated", 200, "application/pdf"),
  );
  await expect(
    requestWorkplanPDF(payload(), signal(), workplanSessionKey(session)),
  ).rejects.toThrow();
});
