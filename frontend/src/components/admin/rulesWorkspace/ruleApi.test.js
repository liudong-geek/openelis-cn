import { ruleRequest as transport } from "./ruleApi";
const currentSession = () => ({
  stamp: { csrf: localStorage.getItem("CSRF"), identity: "user:1" },
  current: () => true,
});
const ruleRequest = (path, options = {}) =>
  transport(path, { ...options, session: currentSession() });
beforeEach(() => localStorage.setItem("CSRF", "token"));
afterEach(() => vi.unstubAllGlobals());
const response = (status, data, extra = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  redirected: false,
  type: "basic",
  headers: new Headers({ "content-type": "application/json" }),
  json: vi.fn().mockResolvedValue(data),
  ...extra,
});
test("GET preserves status and JSON shape; forbidden is not successful empty data", async () => {
  const request = vi.fn().mockResolvedValue(response(403, []));
  vi.stubGlobal("fetch", request);
  expect(await ruleRequest("/rest/reflexrules")).toEqual({
    status: 403,
    ok: false,
    data: [],
  });
  expect(request.mock.calls[0][1]).toMatchObject({
    credentials: "include",
    redirect: "manual",
    method: "GET",
    cache: "no-store",
  });
});
test("POST sends serialized immutable payload and CSRF; empty/HTML success cannot invent an identity", async () => {
  localStorage.setItem("CSRF", "csrf-token");
  const request = vi.fn().mockResolvedValue(
    response(200, undefined, {
      headers: new Headers({ "content-type": "text/html" }),
    }),
  );
  vi.stubGlobal("fetch", request);
  const payload = { id: 1, active: true };
  const result = await ruleRequest("/rest/reflexrule", {
    method: "POST",
    body: payload,
  });
  expect(result.data).toBeUndefined();
  expect(request.mock.calls[0][1]).toMatchObject({
    body: '{"id":1,"active":true}',
    headers: { "X-CSRF-Token": "csrf-token" },
  });
  expect(payload).toEqual({ id: 1, active: true });
});
test("invalid JSON and network/redirect outcomes remain unconfirmed", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      response(200, null, {
        json: vi.fn().mockRejectedValue(new Error("invalid")),
      }),
    ),
  );
  expect((await ruleRequest("/rest/reflexrule/1")).data).toBeUndefined();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(
    await ruleRequest("/rest/reflexrule", { method: "POST", body: {} }),
  ).toEqual({ status: 0, ok: false, data: undefined });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(response(200, { id: 1 }, { redirected: true })),
  );
  expect((await ruleRequest("/rest/reflexrule")).ok).toBe(false);
});

test("revoked or changed sessions never issue writes or accept late successful responses", async () => {
  const request = vi.fn().mockResolvedValue(response(200, { id: 1 }));
  vi.stubGlobal("fetch", request);
  const forbidden = { stamp: { csrf: "token" }, current: () => false };
  expect(
    (
      await transport("/rest/reflexrule", {
        method: "POST",
        body: {},
        session: forbidden,
      })
    ).ok,
  ).toBe(false);
  expect(request).not.toHaveBeenCalled();
  const session = currentSession();
  request.mockImplementation(async () => {
    localStorage.setItem("CSRF", "new-token");
    return response(200, { id: 1 });
  });
  expect(
    await transport("/rest/reflexrule", { method: "POST", body: {}, session }),
  ).toEqual({ status: 0, ok: false, data: undefined, sessionChanged: true });
});
