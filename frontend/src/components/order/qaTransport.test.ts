import { postQaConfirmation } from "./qaTransport";
const controller = () => new AbortController();
afterEach(() => vi.unstubAllGlobals());
it("只发一次，保留CSRF/凭据及无重定向合同", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response('{"sampleId":"701"}', {
          headers: { "content-type": "application/json" },
        }),
    ),
  );
  expect(
    await postQaConfirmation("{}", controller().signal, "SIM-CSRF"),
  ).toEqual({ sampleId: "701" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/confirm-current$/),
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      headers: expect.objectContaining({ "X-CSRF-Token": "SIM-CSRF" }),
    }),
  );
});
it.each([400, 401, 403, 409, 500, 302])(
  "%s 不重试、不返回成功",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            status,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(
      postQaConfirmation("{}", controller().signal, "SIM-CSRF"),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  "html",
  "large",
  "invalidJson",
  "invalidUtf8",
  "noBody",
  "redirected",
])("拒绝 %s 回包", async (mode) => {
  let response = new Response(
    mode === "large"
      ? '"' + "a".repeat(65536) + '"'
      : mode === "invalidJson"
        ? "{"
        : mode === "invalidUtf8"
          ? new Uint8Array([255])
          : mode === "noBody"
            ? null
            : "{}",
    {
      headers: {
        "content-type": mode === "html" ? "text/html" : "application/json",
      },
    },
  );
  if (mode === "redirected")
    Object.defineProperty(response, "redirected", { value: true });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
  await expect(
    postQaConfirmation("{}", controller().signal, "SIM-CSRF"),
  ).rejects.toThrow();
});
it("已取消的读响应不能视为成功", async () => {
  const c = controller();
  c.abort();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("{}", { headers: { "content-type": "application/json" } }),
    ),
  );
  await expect(
    postQaConfirmation("{}", c.signal, "SIM-CSRF"),
  ).rejects.toThrow();
});
