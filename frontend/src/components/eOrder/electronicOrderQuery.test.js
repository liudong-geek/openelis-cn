import {
  electronicOrderSessionKey,
  readElectronicOrderSession,
  emptyElectronicOrderDraft,
  buildElectronicOrderParams,
  readElectronicOrders,
  readEOrderAction,
} from "./electronicOrderQuery";
import config from "../../config.json";

const actor = {
  authenticated: true,
  userId: "7",
  sessionId: "synthetic-electronic-session",
  roles: ["Reception", "Results"],
  loginLabUnit: "化学组",
  userLabRolesMap: { 化学组: ["Reception", "Results"] },
  csrfToken: "masked-token-A",
};
const draft = (patch = {}) => ({ ...emptyElectronicOrderDraft(), ...patch });
const row = (id = "101", patch = {}) => ({
  electronicOrderId: id,
  externalOrderId: `SYNTHETIC-${id}`,
  statusId: "21",
  statusCode: "ENTERED",
  status: "已录入",
  canReceive: true,
  actionUnavailableReason: null,
  warningCodes: [],
  warnings: [],
  patientLastName: "张",
  patientFirstName: "明",
  priority: "STAT",
  ...patch,
});
const body = (patch = {}) => ({
  queryVersion: "2",
  currentUserId: "7",
  canReceive: true,
  pendingOnly: true,
  page: 1,
  pageSize: 50,
  searchType: "DATE_STATUS",
  searchValue: "",
  startDate: "",
  endDate: "",
  statusId: "",
  useAllInfo: false,
  searchFinished: true,
  eOrders: [row()],
  paging: { currentPage: "1", totalPages: "1", totalResults: 1, pageSize: 50 },
  statusSelectionList: [
    { id: "21", value: "待接收" },
    { id: "23", value: "已接收" },
  ],
  warningCodes: [],
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
const params = () => buildElectronicOrderParams(draft(), "zh-CN");
const startRead = (
  signal = new AbortController().signal,
  owner = electronicOrderSessionKey(actor),
) => readElectronicOrders(params(), signal, owner);
const mockRead = (value = body(), status = 200, lastActor = actor) => {
  let sessionReads = 0;
  const fetch = vi.fn(async (url) => {
    if (String(url).endsWith("/session")) {
      return json(sessionReads++ === 0 ? actor : lastActor);
    }
    return json(value, status);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("locale", "zh_CN");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("electronic request actor scope", () => {
  test("uses stable actor/session/permissions while masked CSRF refreshes", () => {
    const owner = electronicOrderSessionKey(actor);
    expect(owner).toBeTruthy();
    expect(
      electronicOrderSessionKey({
        ...actor,
        csrfToken: "masked-token-B",
        roles: ["Results", "Reception", "Reception"],
        userLabRolesMap: { 化学组: ["Results", "Reception", "Reception"] },
      }),
    ).toBe(owner);
    expect(owner).not.toContain("masked-token");
  });
  test.each([
    { userId: "8" },
    { sessionId: "synthetic-session-B" },
    { roles: ["Reception"] },
    { loginLabUnit: "血液组" },
    { userLabRolesMap: { 化学组: ["Reception"] } },
  ])("separates changed actor/session/permission scope %#", (patch) => {
    expect(electronicOrderSessionKey({ ...actor, ...patch })).not.toBe(
      electronicOrderSessionKey(actor),
    );
  });
  test.each([
    null,
    { ...actor, authenticated: false },
    { ...actor, userId: "" },
    { ...actor, userId: "07" },
    { ...actor, sessionId: "" },
    { ...actor, roles: ["Results"] },
    { ...actor, roles: "Reception" },
    { ...actor, userLabRolesMap: [] },
  ])("rejects unusable current identity %#", (value) => {
    expect(() => electronicOrderSessionKey(value)).toThrow();
  });
  test("reads the current authenticated identity through the shared GET boundary", async () => {
    const fetch = vi.fn(async () => json(actor));
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect(await readElectronicOrderSession(signal)).toBe(
      electronicOrderSessionKey(actor),
    );
    expect(fetch).toHaveBeenCalledWith(
      config.serverBaseUrl + "/session",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
        signal,
        headers: { Accept: "application/json", "Accept-Language": "zh-CN" },
      }),
    );
  });
});

describe("electronic request conditions", () => {
  test("defaults to pending requests without inventing a date range", () => {
    expect(emptyElectronicOrderDraft()).toEqual({
      searchValue: "",
      startDate: "",
      endDate: "",
      statusFilter: "PENDING",
      useAllInfo: false,
    });
    const query = params();
    expect(query.get("queryVersion")).toBe("2");
    expect(query.get("searchType")).toBe("DATE_STATUS");
    expect(query.get("pendingOnly")).toBe("true");
    expect(query.get("startDate")).toBe("");
    expect(query.get("endDate")).toBe("");
    expect(query.get("useAllInfo")).toBe("false");
    expect(query.get("page")).toBe("1");
    expect(query.get("pageSize")).toBe("50");
  });
  test("trims and encodes literal identifiers while keeping page/filter conditions", () => {
    const query = buildElectronicOrderParams(
      draft({ searchValue: "  姓名 A/B &x=2  ", useAllInfo: true }),
      "zh-CN",
      2,
      20,
    );
    expect(query.get("searchType")).toBe("IDENTIFIER");
    expect(query.get("searchValue")).toBe("姓名 A/B &x=2");
    expect(query.get("pendingOnly")).toBe("true");
    expect(query.get("useAllInfo")).toBe("true");
    expect(query.get("page")).toBe("2");
    expect(query.get("pageSize")).toBe("20");
    expect(new URLSearchParams(query.toString()).get("searchValue")).toBe(
      "姓名 A/B &x=2",
    );
  });
  test.each([
    ["zh-CN", "2026/10/01", "2026/10/06"],
    ["en-US", "10/01/2026", "10/06/2026"],
    ["fr-FR", "01/10/2026", "06/10/2026"],
  ])(
    "converts native calendar dates at the %s backend boundary",
    (locale, start, end) => {
      const query = buildElectronicOrderParams(
        draft({
          startDate: "2026-10-01",
          endDate: "2026-10-06",
          statusFilter: "ALL",
        }),
        locale,
        3,
        10,
      );
      expect(query.get("startDate")).toBe(start);
      expect(query.get("endDate")).toBe(end);
      expect(query.get("pendingOnly")).toBe("false");
      expect(query.get("statusId")).toBe("");
      expect(query.get("page")).toBe("3");
    },
  );
  test("preserves one-sided dates and explicit status as query conditions", () => {
    const query = buildElectronicOrderParams(
      draft({ startDate: "", endDate: "2026-10-06", statusFilter: "23" }),
      "zh-CN",
    );
    expect(query.get("startDate")).toBe("");
    expect(query.get("endDate")).toBe("2026/10/06");
    expect(query.get("pendingOnly")).toBe("false");
    expect(query.get("statusId")).toBe("23");
  });
  test.each([
    { startDate: "2026-02-29" },
    { endDate: "2026-04-31" },
    { startDate: "2026-13-01" },
    { startDate: "2026-1-01" },
    { startDate: "2026/10/01" },
    { startDate: "2026-10-07", endDate: "2026-10-06" },
    { statusFilter: "23&statusId=21" },
    { statusFilter: "023" },
    { useAllInfo: "false" },
  ])("rejects impossible dates and malformed filter values %#", (patch) => {
    expect(() => buildElectronicOrderParams(draft(patch), "zh-CN")).toThrow();
  });
  test.each([
    [0, 50],
    [-1, 50],
    [1.5, 50],
    [1, 0],
    [1, 1000],
  ])("rejects malformed page %s/page size %s", (page, pageSize) => {
    expect(() =>
      buildElectronicOrderParams(draft(), "zh-CN", page, pageSize),
    ).toThrow();
  });
});

describe("electronic request transport and response", () => {
  test("verifies actor before and after a complete v2 read and keeps unique business identity", async () => {
    const fetch = mockRead();
    const signal = new AbortController().signal;
    const result = await startRead(signal);
    expect(result.owner).toBe(electronicOrderSessionKey(actor));
    expect(result.rows).toEqual([
      expect.objectContaining({
        id: "101",
        electronicOrderId: "101",
        externalOrderId: "SYNTHETIC-101",
        statusCode: "ENTERED",
        canReceive: true,
      }),
    ]);
    expect(result.paging).toEqual(
      expect.objectContaining({
        currentPage: 1,
        totalPages: 1,
        totalResults: 1,
        pageSize: 50,
      }),
    );
    const [url, options] = fetch.mock.calls.find(([url]) =>
      String(url).includes("/rest/ElectronicOrders?"),
    );
    expect(url).toBe(
      config.serverBaseUrl + "/rest/ElectronicOrders?" + params().toString(),
    );
    expect(options).toEqual(
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
        signal,
        method: "GET",
        headers: { Accept: "application/json", "Accept-Language": "zh-CN" },
      }),
    );
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/session")),
    ).toHaveLength(2);
  });
  test("accepts a valid empty result with zero total and explicit dictionary", async () => {
    mockRead(
      body({
        eOrders: [],
        paging: {
          currentPage: "1",
          totalPages: "1",
          totalResults: 0,
          pageSize: 50,
        },
      }),
    );
    const result = await startRead();
    expect(result.rows).toEqual([]);
    expect(result.paging.totalResults).toBe(0);
    expect(result.statuses).toEqual([
      { id: "21", value: "待接收" },
      { id: "23", value: "已接收" },
    ]);
  });
  test("rejects an omitted page instead of showing a false empty result", async () => {
    mockRead(
      body({
        eOrders: [],
        paging: {
          currentPage: "1",
          totalPages: "1",
          totalResults: 1,
          pageSize: 50,
        },
      }),
    );
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("rejects a short first page against a larger authoritative total", async () => {
    mockRead(
      body({
        eOrders: [row()],
        paging: {
          currentPage: "1",
          totalPages: "2",
          totalResults: 51,
          pageSize: 50,
        },
      }),
    );
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("accepts an exact final page with the whole filter set and a non-core FHIR warning", async () => {
    const query = buildElectronicOrderParams(
      draft({
        searchValue: "编号 &A",
        startDate: "2026-10-01",
        statusFilter: "ALL",
        useAllInfo: true,
      }),
      "zh-CN",
      2,
      50,
    );
    const fetch = mockRead(
      body({
        pendingOnly: false,
        eOrders: [row("151", { warningCodes: ["FHIR_DETAILS_UNAVAILABLE"] })],
        paging: {
          currentPage: "2",
          totalPages: "2",
          totalResults: 51,
          pageSize: 50,
        },
        warningCodes: ["FHIR_SEARCH_UNAVAILABLE"],
      }),
    );
    const result = await readElectronicOrders(
      query.toString(),
      new AbortController().signal,
      electronicOrderSessionKey(actor),
    );
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        id: "151",
        canReceive: true,
        warningCodes: ["FHIR_DETAILS_UNAVAILABLE"],
      }),
    );
    expect(result.paging.currentPage).toBe(2);
    expect(result.warningCodes).toEqual(["FHIR_SEARCH_UNAVAILABLE"]);
    const requested = new URL(
      fetch.mock.calls.find(([url]) =>
        String(url).includes("/rest/ElectronicOrders?"),
      )[0],
      "http://sim.invalid",
    );
    expect(requested.searchParams.get("searchValue")).toBe("编号 &A");
    expect(requested.searchParams.get("startDate")).toBe("2026/10/01");
    expect(requested.searchParams.get("page")).toBe("2");
    expect(requested.searchParams.get("pendingOnly")).toBe("false");
  });
  test.each([
    { statusCode: "REALIZED" },
    { statusCode: "UNKNOWN" },
    { externalOrderId: "" },
    { actionUnavailableReason: "NOT_PENDING" },
  ])("rejects a contradictory receive capability %#", async (patch) => {
    mockRead(body({ eOrders: [row("101", patch)] }));
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("preserves an explicit unavailable row reason instead of guessing localized permission", async () => {
    mockRead(
      body({
        canReceive: false,
        eOrders: [
          row("101", {
            canReceive: false,
            statusCode: "REALIZED",
            status: "已实现",
            actionUnavailableReason: "NO_RECEIVE_PERMISSION",
          }),
        ],
      }),
    );
    const result = await startRead();
    expect(result.canReceive).toBe(false);
    expect(result.rows[0].canReceive).toBe(false);
    expect(result.rows[0].actionUnavailableReason).toBe(
      "NO_RECEIVE_PERMISSION",
    );
    expect(result.rows[0].status).toBe("已实现");
  });
  test.each([401, 403, 400, 409, 500])(
    "rejects HTTP %s instead of calling it an empty query",
    async (status) => {
      mockRead({ error: "synthetic error" }, status);
      await expect(startRead()).rejects.toBeInstanceOf(Error);
    },
  );
  test.each([
    { queryVersion: "1" },
    { currentUserId: "8" },
    { canReceive: "true" },
    { eOrders: null },
    { eOrders: [row(), row()] },
    { eOrders: [row("", {})] },
    { eOrders: [row("101", { electronicOrderId: "0101" })] },
    { eOrders: [row("101", { canReceive: "true" })] },
    { paging: null },
    {
      paging: {
        currentPage: "0",
        totalPages: "1",
        totalResults: 1,
        pageSize: 50,
      },
    },
    {
      paging: {
        currentPage: "2",
        totalPages: "1",
        totalResults: 1,
        pageSize: 50,
      },
    },
    {
      paging: {
        currentPage: "1",
        totalPages: "1",
        totalResults: -1,
        pageSize: 50,
      },
    },
    {
      statusSelectionList: [
        { id: "21", value: "待接收" },
        { id: "21", value: "已接收" },
      ],
    },
  ])("rejects a malformed protocol/identity/paging body %#", async (patch) => {
    mockRead(body(patch));
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("rejects HTML at the real transport boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(actor))
        .mockResolvedValueOnce(
          new Response("<html>login</html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        ),
    );
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("rejects a network failure without turning it into an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(actor))
        .mockRejectedValueOnce(
          new TypeError("synthetic connection unavailable"),
        ),
    );
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("rejects a changed current actor after the response arrives", async () => {
    mockRead(body(), 200, { ...actor, userId: "8" });
    await expect(startRead()).rejects.toBeInstanceOf(Error);
  });
  test("does not read the clinical endpoint if the supplied owner is already stale", async () => {
    const fetch = mockRead();
    await expect(
      startRead(
        undefined,
        electronicOrderSessionKey({ ...actor, sessionId: "old-session" }),
      ),
    ).rejects.toBeInstanceOf(Error);
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).includes("/rest/ElectronicOrders?"),
      ),
    ).toBe(false);
  });
  test("rejects an aborted request even if a boundary ignores the AbortSignal", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = mockRead();
    await expect(startRead(controller.signal)).rejects.toBeInstanceOf(Error);
    expect(fetch).not.toHaveBeenCalled();
  });
  test("reads a number action only within one stable current actor scope", async () => {
    const fetch = mockRead({ status: true, body: "SYNTHETIC-LAB-1" });
    const signal = new AbortController().signal;
    expect(
      await readEOrderAction(
        "/rest/SampleEntryGenerateScanProvider",
        signal,
        electronicOrderSessionKey(actor),
      ),
    ).toEqual({ status: true, body: "SYNTHETIC-LAB-1" });
    expect(fetch).toHaveBeenCalledWith(
      config.serverBaseUrl + "/rest/SampleEntryGenerateScanProvider",
      expect.objectContaining({
        signal,
        credentials: "include",
        method: "GET",
      }),
    );
  });
  test.each([
    { status: true },
    { status: "true", body: "SYNTHETIC" },
    { status: true, body: 123 },
    null,
  ])("rejects malformed number feedback %#", async (value) => {
    mockRead(value);
    await expect(
      readEOrderAction(
        "/rest/SampleEntryGenerateScanProvider",
        new AbortController().signal,
        electronicOrderSessionKey(actor),
      ),
    ).rejects.toBeInstanceOf(Error);
  });
});
