import { postSpecimenReceipt } from "./receiptTransport";
afterEach(() => vi.unstubAllGlobals());
it("仅一次专用POST，冻结CSRF并禁止缓存、重定向", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response("{}", { headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  await postSpecimenReceipt("SIM body", signal, "SIM-CSRF");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]).toEqual([
    expect.stringMatching(/\/rest\/specimen-receipts$/),
    expect.objectContaining({
      method: "POST",
      body: "SIM body",
      signal,
      redirect: "manual",
      cache: "no-store",
      headers: expect.objectContaining({ "X-CSRF-Token": "SIM-CSRF" }),
    }),
  ]);
});
it.each([
  "redirect",
  "html",
  "empty",
  "oversize",
  "invalidUtf8",
  "malformed",
  "aborted",
])("拒绝 %s 且零重试", async (kind) => {
  const body =
    kind === "empty"
      ? ""
      : kind === "oversize"
        ? "x".repeat(65537)
        : kind === "invalidUtf8"
          ? new Uint8Array([0xc3, 0x28])
          : kind === "malformed"
            ? "SIM broken"
            : "{}";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(body, {
          status: kind === "redirect" ? 302 : 200,
          headers: {
            "content-type": kind === "html" ? "text/html" : "application/json",
          },
        }),
    ),
  );
  const controller = new AbortController();
  if (kind === "aborted") controller.abort();
  await expect(
    postSpecimenReceipt("SIM body", controller.signal, "SIM-CSRF"),
  ).rejects.toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(1);
});
