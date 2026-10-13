import { postSpecimenReceipt } from "./receiptTransport";
afterEach(() => vi.unstubAllGlobals());
it.each([201, 403, 409, 422, 500])(
  "仅接受 200，HTTP %s 不解析成功或错误正文",
  async (status) => {
    const response = new Response('{"code":"SIM_CODE","success":true}', {
      status,
      headers: { "content-type": "application/json" },
    });
    const getReader = vi.spyOn(response.body!, "getReader");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      postSpecimenReceipt("SIM body", new AbortController().signal, "SIM-CSRF"),
    ).rejects.toThrow("order.receiving.unknown");
    expect(getReader).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
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
it("完整读到响应结尾后不取消浏览器响应流", async () => {
  const response = new Response('{"success":true}', {
    headers: { "content-type": "application/json" },
  });
  const reader = response.body!.getReader();
  const cancel = vi.spyOn(reader, "cancel");
  vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  await expect(
    postSpecimenReceipt("SIM body", new AbortController().signal, "SIM-CSRF"),
  ).resolves.toEqual({ success: true });
  expect(cancel).not.toHaveBeenCalled();
});
it("超出回执上限时取消尚未读完的流", async () => {
  const response = new Response("x".repeat(65537), {
    headers: { "content-type": "application/json" },
  });
  const reader = response.body!.getReader();
  const cancel = vi.spyOn(reader, "cancel");
  vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

  await expect(
    postSpecimenReceipt("SIM body", new AbortController().signal, "SIM-CSRF"),
  ).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("恰好 65536 字节可读取，完成后释放且不取消流", async () => {
  const response = new Response("{}" + " ".repeat(65534), {
    headers: { "content-type": "application/json", "content-length": "65536" },
  });
  const reader = response.body!.getReader();
  const cancel = vi.spyOn(reader, "cancel");
  const release = vi.spyOn(reader, "releaseLock");
  vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(
    postSpecimenReceipt("SIM body", new AbortController().signal, "SIM-CSRF"),
  ).resolves.toEqual({});
  expect(cancel).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledTimes(1);
});
it.each(["malformed", "abortedAtEnd"])(
  "完整读完后 %s 拒绝仍不取消流",
  async (kind) => {
    const response = new Response(kind === "malformed" ? "broken" : "{}", {
      headers: { "content-type": "application/json" },
    });
    const controller = new AbortController();
    const reader = response.body!.getReader();
    const read = reader.read.bind(reader);
    vi.spyOn(reader, "read").mockImplementation(async () => {
      const chunk = await read();
      if (chunk.done && kind === "abortedAtEnd") controller.abort();
      return chunk;
    });
    const cancel = vi.spyOn(reader, "cancel");
    const release = vi.spyOn(reader, "releaseLock");
    vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const result = postSpecimenReceipt(
      "SIM body",
      controller.signal,
      "SIM-CSRF",
    );
    if (kind === "malformed")
      await expect(result).rejects.toBeInstanceOf(SyntaxError);
    else await expect(result).rejects.toThrow("order.receiving.unknown");
    expect(cancel).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  },
);
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
