import {
  createRecollection,
  readRecollection,
  RecollectionTransportError,
} from "./recollectionTransport";

const response = (
  body: BodyInit | null = "{}",
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const submit = (signal = new AbortController().signal) =>
  createRecollection("SIM body", "SIM-CSRF", signal);

function observe(value: Response) {
  const reader = value.body!.getReader();
  const cancel = vi.spyOn(reader, "cancel");
  const release = vi.spyOn(reader, "releaseLock");
  vi.spyOn(value.body!, "getReader").mockReturnValue(reader);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value));
  return { reader, cancel, release };
}

afterEach(() => vi.unstubAllGlobals());

it("补采 POST 仅发送一次并保留冻结请求配置", async () => {
  const { cancel, release } = observe(response('{"success":true}', 201));
  const signal = new AbortController().signal;
  await expect(submit(signal)).resolves.toEqual({ success: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/rest\/specimen-recollections$/),
    expect.objectContaining({
      method: "POST",
      body: "SIM body",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: expect.objectContaining({ "X-CSRF-Token": "SIM-CSRF" }),
    }),
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});

it("查回仅发送一次 GET，保留身份查询与取消信号", async () => {
  const { cancel, release } = observe(response('{"success":true}'));
  const signal = new AbortController().signal;
  await expect(readRecollection("701", "1001", signal)).resolves.toEqual({
    success: true,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(
      /\/rest\/specimen-recollections\/current\?sampleId=701&sourceSampleItemId=1001$/,
    ),
    expect.objectContaining({
      method: "GET",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
    }),
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});

it.each([403, 409, 422, 500])(
  "HTTP %s JSON 错误保留服务端 code/status",
  async (status) => {
    const { cancel, release } = observe(
      response('{"code":"RECOLLECTION_CONFLICT"}', status),
    );
    await expect(submit()).rejects.toMatchObject({
      code: "RECOLLECTION_CONFLICT",
      status,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  },
);

it.each(["{}", '{"code":42}', "null"])(
  "错误码缺失或非字符串时保留 HTTP 状态：%s",
  async (body) => {
    observe(response(body, 422));
    await expect(submit()).rejects.toMatchObject({
      code: "RECOLLECTION_UNKNOWN",
      status: 422,
    });
  },
);

it.each(["redirected", "html", "declaredOversize", "missingBody"])(
  "响应门禁拒绝 %s，保留 HTTP 状态且不读取正文",
  async (kind) => {
    const value = response(kind === "missingBody" ? null : "{}", 422, {
      "content-type": kind === "html" ? "text/html" : "application/json",
      "content-length": kind === "declaredOversize" ? "65537" : "2",
    });
    if (kind === "redirected")
      Object.defineProperty(value, "redirected", { value: true });
    const getReader = value.body && vi.spyOn(value.body, "getReader");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(value));
    await expect(submit()).rejects.toMatchObject({
      code: "RECOLLECTION_UNKNOWN",
      status: 422,
    });
    if (getReader) expect(getReader).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

it.each([
  "empty",
  "malformed",
  "invalidUtf8",
  "oversize",
  "oversizeUtf8",
  "aborted",
  "brokenStream",
])("读取 %s 失败映射为 UNKNOWN/status 0，并取消释放且不重试", async (kind) => {
  const value = response(
    kind === "empty"
      ? ""
      : kind === "malformed"
        ? "broken"
        : kind === "invalidUtf8"
          ? new Uint8Array([0xc3, 0x28])
          : kind === "oversize"
            ? "x".repeat(65537)
            : kind === "oversizeUtf8"
              ? JSON.stringify({ label: "中".repeat(21846) })
              : "{}",
    422,
  );
  const { reader, cancel, release } = observe(value);
  if (kind === "brokenStream")
    vi.spyOn(reader, "read").mockRejectedValueOnce(new Error("SIM disconnect"));
  const controller = new AbortController();
  if (kind === "aborted") controller.abort();
  await expect(submit(controller.signal)).rejects.toMatchObject({
    code: "RECOLLECTION_UNKNOWN",
    status: 0,
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledTimes(1);
});

it("按字节限制累计大小并解码跨分片 UTF-8，恰好 65536 字节可接受", async () => {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ label: "中" }) + " ".repeat(65536 - 15),
  );
  expect(bytes.byteLength).toBe(65536);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 11));
      controller.enqueue(bytes.slice(11, 32768));
      controller.enqueue(bytes.slice(32768));
      controller.close();
    },
  });
  const { cancel } = observe(response(stream));
  await expect(submit()).resolves.toEqual({ label: "中" });
  expect(cancel).toHaveBeenCalledTimes(1);
});

it("网络拒绝原样交由调用方处理，不能伪装成服务端拒绝或重试", async () => {
  const error = new TypeError("SIM network failure");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
  await expect(submit()).rejects.toBe(error);
  expect(error).not.toBeInstanceOf(RecollectionTransportError);
  expect(fetch).toHaveBeenCalledTimes(1);
});
