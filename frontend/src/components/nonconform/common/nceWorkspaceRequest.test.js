import {
  nceSessionKey,
  pendingNceOperation,
  rememberNceOperation,
  readNceAttachment,
  readNceOrders,
  readNceReceipt,
  readNceWorkspace,
  submitNceOperation,
} from "./nceWorkspaceRequest";
import {
  event,
  jsonResponse,
  metadata,
  order,
  orders,
  query,
  receipt,
  session,
  urlPath,
  version,
  workspace,
} from "./nceWorkspace.testData";
const owner = nceSessionKey(session),
  requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
let fetcher;
beforeEach(() => {
  sessionStorage.clear();
  fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const signal = () => new AbortController().signal;
const command = () => ({
  requestId,
  currentUserId: "1",
  dateOfEvent: "2026-10-06",
  reportingUnit: "3",
  title: "",
  description: "登记描述",
  immediateAction: "",
  suspectedCauses: "",
  proposedAction: "",
  severity: "MINOR",
  nceCategoryId: "3",
  nceTypeId: null,
  linkedSpecimens: [],
});
test("preserves complete server page and exact query encoding, never makes a second page slice", async () => {
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(
      jsonResponse(workspace(2, 25, { ...query, keyword: "A&B 号" })),
    )
    .mockResolvedValueOnce(jsonResponse(session));
  const v = await readNceWorkspace(
    { ...query, keyword: "A&B 号" },
    2,
    25,
    signal(),
    owner,
  );
  expect(v.nceList.map((r) => r.id)).toEqual(["26"]);
  const p = new URL(fetcher.mock.calls[1][0], "http://localhost").searchParams;
  expect(Object.fromEntries(p)).toEqual({
    queryVersion: "2",
    ...query,
    keyword: "A&B 号",
    page: "2",
    pageSize: "25",
  });
  expect(
    fetcher.mock.calls.every(
      ([, opts]) => opts.cache === "no-store" && opts.redirect === "manual",
    ),
  ).toBe(true);
});
test("rejects an echoed query or actor belonging to another request", async () => {
  fetcher.mockResolvedValueOnce(jsonResponse(session)).mockResolvedValueOnce(
    jsonResponse({
      ...workspace(),
      query: { ...query, page: 2, pageSize: 25 },
    }),
  );
  await expect(
    readNceWorkspace(query, 1, 25, signal(), owner),
  ).rejects.toMatchObject({ kind: "unavailable" });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
test("retains distinct real specimen and analysis versions across multiple raw order numbers", async () => {
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(
      jsonResponse(
        orders({ searchType: "firstName", value: "测&试" }, [
          order(1),
          order(2),
        ]),
      ),
    )
    .mockResolvedValueOnce(jsonResponse(session));
  const v = await readNceOrders(
    { searchType: "firstName", value: "测&试" },
    1,
    10,
    signal(),
    owner,
  );
  expect(
    v.orders.map((o) => [
      o.labNumber,
      o.specimens[0].analyses[0].analysisId,
      o.lastupdated,
    ]),
  ).toEqual([
    ["HMC00001", "100", version],
    ["HMC00002", "200", version],
  ]);
});
test("POST multipart sends every original File and relies on the server receipt, without preallocating a number", async () => {
  fetcher.mockImplementation(async (url, opts) =>
    urlPath(url).endsWith("/session")
      ? jsonResponse(session)
      : jsonResponse({
          ...receipt(JSON.parse(opts.body.get("nceData")).requestId),
          attachments: opts.body.getAll("files").map((f, i) => ({
            id: String(i + 1),
            fileName: f.name,
            fileType: f.type,
            fileSize: f.size,
            uploadedDate: "2026-10-06T01:02:03Z",
          })),
        }),
  );
  const files = [
    new File(["first"], "first.pdf", { type: "application/pdf" }),
    new File(["second"], "second.png", { type: "image/png" }),
  ];
  await submitNceOperation(command(), files, "CREATE", null, signal(), owner);
  const [url, options] = fetcher.mock.calls.find(
    ([, opts]) => opts.method === "POST",
  );
  expect(url).toContain("/rest/nce/registration?queryVersion=2");
  expect(options.body.getAll("files")).toEqual(files);
  expect(JSON.parse(options.body.get("nceData"))).toEqual(command());
  expect(options.headers["X-CSRF-Token"]).toBe(session.csrf);
  expect(pendingNceOperation(owner)).toBeNull();
});
test("malformed success and transport interruption remain UNKNOWN and retain the same opaque receipt key", async () => {
  fetcher.mockResolvedValueOnce(jsonResponse(session)).mockResolvedValueOnce(
    new Response("<html>login</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  );
  await expect(
    submitNceOperation(command(), [], "CREATE", null, signal(), owner),
  ).rejects.toMatchObject({ outcome: "UNKNOWN" });
  expect(pendingNceOperation(owner)).toMatchObject({
    requestId,
    operation: "CREATE",
  });
  expect(sessionStorage.getItem("openelis.nce.pending.v2")).not.toContain(
    "登记描述",
  );
});
test("only an explicit rollback envelope unlocks the original request after a rejected POST", async () => {
  fetcher.mockResolvedValueOnce(jsonResponse(session)).mockResolvedValueOnce(
    jsonResponse(
      {
        queryVersion: "2",
        currentUserId: "1",
        requestId,
        code: "INVALID_DATE",
        outcome: "NOT_APPLIED",
      },
      400,
    ),
  );
  await expect(
    submitNceOperation(command(), [], "CREATE", null, signal(), owner),
  ).rejects.toMatchObject({ kind: "invalid", outcome: "NOT_APPLIED" });
  expect(pendingNceOperation(owner)).toBeNull();
});
test("receipt NOT_FOUND must match operation and cannot confirm the absence of an in-flight create", async () => {
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(
      jsonResponse({
        queryVersion: "2",
        currentUserId: "1",
        requestId,
        operation: "CREATE",
        outcome: "NOT_FOUND",
      }),
    )
    .mockResolvedValueOnce(jsonResponse(session));
  expect(
    (await readNceReceipt(requestId, "CREATE", null, signal(), owner)).outcome,
  ).toBe("NOT_FOUND");
  expect(
    new URL(fetcher.mock.calls[1][0], "http://localhost").searchParams.get(
      "operation",
    ),
  ).toBe("CREATE");
});
test("typed action carries the original event version and validates the same parent receipt", async () => {
  const c = {
    requestId,
    currentUserId: "1",
    type: "ACKNOWLEDGE",
    lastupdated: version,
    description: null,
    assignedTo: null,
  };
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(
      jsonResponse(receipt(requestId, "ACKNOWLEDGE", "2")),
    );
  await expect(
    submitNceOperation(c, [], "ACKNOWLEDGE", "1", signal(), owner),
  ).rejects.toMatchObject({ outcome: "UNKNOWN" });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual(c);
});
test("download sends the actual parent event and rejects executable HTML content", async () => {
  fetcher.mockResolvedValueOnce(jsonResponse(session)).mockResolvedValueOnce(
    new Response("<script>x</script>", {
      headers: { "content-type": "text/html" },
    }),
  );
  await expect(
    readNceAttachment({ id: "8" }, "2", signal(), owner),
  ).rejects.toMatchObject({ kind: "unavailable" });
  const u = new URL(fetcher.mock.calls[1][0], "http://localhost");
  expect(u.pathname).toContain("/nce/registration/attachments/8");
  expect(u.searchParams.get("eventId")).toBe("2");
});
test("CREATE cannot accept an APPLIED receipt that dropped a fixed link or original file", async () => {
  const o = order(),
    link = {
      sampleId: o.sampleId,
      labNumber: o.labNumber,
      sampleLastupdated: version,
      sampleItemId: o.specimens[0].sampleItemId,
      lastupdated: version,
      analysisId: null,
      analysisLastupdated: null,
    };
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(jsonResponse(receipt(requestId)));
  await expect(
    submitNceOperation(
      { ...command(), linkedSpecimens: [link] },
      [],
      "CREATE",
      null,
      signal(),
      owner,
    ),
  ).rejects.toMatchObject({ outcome: "UNKNOWN" });
  expect(pendingNceOperation(owner)).toMatchObject({ requestId });
});
test("action APPLIED must advance the original event version even for a repeated assignment", async () => {
  fetcher
    .mockResolvedValueOnce(jsonResponse(session))
    .mockResolvedValueOnce(
      jsonResponse({ ...receipt(requestId, "ASSIGN"), lastupdated: version }),
    );
  await expect(
    submitNceOperation(
      {
        requestId,
        currentUserId: "1",
        lastupdated: version,
        type: "ASSIGN",
        description: null,
        assignedTo: "2",
      },
      [],
      "ASSIGN",
      "1",
      signal(),
      owner,
    ),
  ).rejects.toMatchObject({ outcome: "UNKNOWN" });
});
test.each([
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])(
  "existing safe %s attachments remain downloadable with their actual parent",
  async (mime) => {
    fetcher
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(
        new Response("preservedbytes", { headers: { "content-type": mime } }),
      )
      .mockResolvedValueOnce(jsonResponse(session));
    expect(
      (await readNceAttachment({ id: "8" }, "2", signal(), owner)).type,
    ).toBe(mime);
  },
);
test("malformed note elements are rejected before list rendering", async () => {
  fetcher.mockResolvedValueOnce(jsonResponse(session)).mockResolvedValueOnce(
    jsonResponse({
      ...workspace(),
      nceList: [{ ...event(), notes: [null] }],
    }),
  );
  await expect(
    readNceWorkspace(query, 1, 25, signal(), owner),
  ).rejects.toMatchObject({ kind: "unavailable" });
});
test.each(["bogus", "2026-02-30 09:11:12.345"])(
  "an APPLIED action with invalid server version %s remains UNKNOWN under the same request key",
  async (lastupdated) => {
    fetcher
      .mockResolvedValueOnce(jsonResponse(session))
      .mockResolvedValueOnce(
        jsonResponse({ ...receipt(requestId, "ADD_NOTE"), lastupdated }),
      );
    await expect(
      submitNceOperation(
        {
          requestId,
          currentUserId: "1",
          lastupdated: version,
          type: "ADD_NOTE",
          description: "原备注",
          assignedTo: null,
        },
        [],
        "ADD_NOTE",
        "1",
        signal(),
        owner,
      ),
    ).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(pendingNceOperation(owner)).toMatchObject({
      requestId,
      operation: "ADD_NOTE",
      eventId: "1",
    });
  },
);
test("switching actors preserves each unresolved request separately without persisting clinical fields or files", () => {
  const otherOwner = nceSessionKey({
    ...session,
    userId: "2",
    sessionId: "other-session",
  });
  rememberNceOperation(owner, {
    requestId,
    operation: "CREATE",
    eventId: null,
  });
  rememberNceOperation(otherOwner, {
    requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
    operation: "ADD_NOTE",
    eventId: "2",
  });
  expect(pendingNceOperation(owner)).toEqual({
    actor: "1",
    requestId,
    operation: "CREATE",
    eventId: null,
  });
  expect(pendingNceOperation(otherOwner)).toMatchObject({
    actor: "2",
    operation: "ADD_NOTE",
    eventId: "2",
  });
  expect(
    Object.keys(JSON.parse(sessionStorage.getItem("openelis.nce.pending.v2"))),
  ).toEqual(["1", "2"]);
});

test.each([undefined, "2"])(
  "a NOT_APPLIED envelope without the current authoritative actor (%s) cannot unlock the fixed request",
  async (currentUserId) => {
    fetcher.mockResolvedValueOnce(jsonResponse(session)).mockResolvedValueOnce(
      jsonResponse(
        {
          queryVersion: "2",
          currentUserId,
          requestId,
          code: "NCE_LINK_CHANGED",
          outcome: "NOT_APPLIED",
        },
        409,
      ),
    );
    await expect(
      submitNceOperation(command(), [], "CREATE", null, signal(), owner),
    ).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(pendingNceOperation(owner)).toMatchObject({
      requestId,
      operation: "CREATE",
    });
  },
);
