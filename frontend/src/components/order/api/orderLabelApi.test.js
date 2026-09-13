import { webcrypto } from "node:crypto";
import { generateOrderLabels } from "./orderLabelApi";
import { hasPendingLabels } from "../labelCheckpoint";
const request = () => ({
  orderId: "42",
  labNumber: "SIM-LABEL-42",
  labels: [{ type: "specimen", sampleItemId: "91", quantity: 2 }],
});
const response = () => ({
  orderId: "42",
  labNumber: "SIM-LABEL-42",
  totalGenerated: 1,
  items: [
    {
      type: "specimen",
      sampleItemId: "91",
      barcode: "SIM-LABEL-42.7",
      requestedQuantity: 2,
      generatedQuantity: 1,
      reason: "PRINT_LIMIT",
    },
  ],
  pdfBase64: btoa("%PDF-1.4\nSIM-only\n%%EOF"),
});
const options = () => ({
  isCurrent: () => true,
  csrf: "SIM-CSRF",
  barcodes: { "specimen:91": "SIM-LABEL-42.7" },
});
const reply = (data = response(), status = 200, headers = {}) =>
  fetch.mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json", ...headers },
    }),
  );
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn());
  reply();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it("只发送一次，验证实际管码和生成数量；不用返回份数推断已经出纸", async () => {
  const result = await generateOrderLabels(request(), options());
  expect(result).toMatchObject({
    totalGenerated: 1,
    items: [{ generatedQuantity: 1, reason: "PRINT_LIMIT" }],
  });
  expect(result.pdf.type).toBe("application/pdf");
  expect(hasPendingLabels()).toBe(true);
  result.confirmConsumed();
  expect(hasPendingLabels()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    redirect: "manual",
    cache: "no-store",
    credentials: "include",
    body: JSON.stringify(request()),
    headers: { "X-CSRF-Token": "SIM-CSRF" },
  });
});
it.each([
  null,
  {},
  { orderId: "43" },
  { labNumber: "OTHER" },
  { totalGenerated: 2 },
  { items: [] },
  { items: [response().items[0], response().items[0]] },
  { items: [{ ...response().items[0], sampleItemId: "92" }] },
  { items: [{ ...response().items[0], barcode: "SIM-LABEL-42.91" }] },
  { items: [{ ...response().items[0], requestedQuantity: 1 }] },
  { items: [{ ...response().items[0], generatedQuantity: 3 }] },
  { items: [{ ...response().items[0], reason: null }] },
  { success: false },
  { pdfBase64: null },
  { pdfBase64: btoa("<html>Login</html>") },
])("无效成功应答保留保护且不重试：%j", async (change) => {
  reply(
    change === null
      ? null
      : Object.keys(change).length
        ? { ...response(), ...change }
        : {},
  );
  await expect(generateOrderLabels(request(), options())).rejects.toMatchObject(
    { code: "UNCONFIRMED" },
  );
  expect(hasPendingLabels()).toBe(true);
  await expect(generateOrderLabels(request(), options())).rejects.toMatchObject(
    { code: "UNCONFIRMED" },
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("生成零份时保留限制明细，不制造文件", async () => {
  reply({
    ...response(),
    totalGenerated: 0,
    pdfBase64: null,
    items: [{ ...response().items[0], generatedQuantity: 0 }],
  });
  expect(await generateOrderLabels(request(), options())).toMatchObject({
    totalGenerated: 0,
    pdf: null,
  });
});
it.each([0, -1, 1.5, "2", null, 101])(
  "非法数量零请求：%s",
  async (quantity) => {
    const body = request();
    body.labels[0].quantity = quantity;
    await expect(generateOrderLabels(body, options())).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(hasPendingLabels()).toBe(false);
  },
);
it("重复目标和不属于当前快照的目标零请求", async () => {
  const body = request();
  body.labels.push({ ...body.labels[0] });
  await expect(generateOrderLabels(body, options())).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  await expect(
    generateOrderLabels(request(), { ...options(), barcodes: {} }),
  ).rejects.toMatchObject({ code: "STALE" });
  await expect(generateOrderLabels(request())).rejects.toMatchObject({
    code: "STALE",
  });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  [401, "UNAUTHORIZED"],
  [403, "FORBIDDEN"],
  [400, "UNCONFIRMED"],
  [409, "UNCONFIRMED"],
  [500, "UNCONFIRMED"],
  [302, "UNCONFIRMED"],
])("HTTP %s不构成回滚证明", async (status, code) => {
  reply({}, status);
  await expect(generateOrderLabels(request(), options())).rejects.toMatchObject(
    { code },
  );
  expect(hasPendingLabels()).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["html", "header-size", "stream-size", "bad-utf8"])(
  "有界读取拒绝异常正文：%s",
  async (kind) => {
    if (kind === "html") reply({}, 200, { "content-type": "text/html" });
    if (kind === "header-size")
      reply({}, 200, { "content-length": "28500001" });
    if (kind === "stream-size")
      fetch.mockResolvedValue(
        new Response(" ".repeat(28500001), {
          headers: { "content-type": "application/json" },
        }),
      );
    if (kind === "bad-utf8")
      fetch.mockResolvedValue(
        new Response(new Uint8Array([0xc3, 0x28]), {
          headers: { "content-type": "application/json" },
        }),
      );
    await expect(
      generateOrderLabels(request(), options()),
    ).rejects.toMatchObject({ code: "UNCONFIRMED" });
    expect(hasPendingLabels()).toBe(true);
  },
);
it("请求与预期条码在派发前冻结，不借用调用方后续修改", async () => {
  let finish;
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const body = request(),
    scope = options(),
    pending = generateOrderLabels(body, scope);
  body.labels[0].quantity = 99;
  body.labNumber = "OTHER";
  scope.barcodes["specimen:91"] = "OTHER";
  finish(
    new Response(JSON.stringify(response()), {
      headers: { "content-type": "application/json" },
    }),
  );
  expect((await pending).items[0].requestedQuantity).toBe(2);
});
it("发送前存储写入/读回失败零HTTP", async () => {
  vi.stubGlobal("sessionStorage", {
    getItem: () => null,
    setItem: () => {
      throw new Error("SIM-storage");
    },
    clear: () => {},
  });
  await expect(generateOrderLabels(request(), options())).rejects.toMatchObject(
    { code: "STORAGE_UNAVAILABLE" },
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("失效会话的迟到成功不可消费或解除保护", async () => {
  let finish,
    current = true;
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = generateOrderLabels(request(), {
    ...options(),
    isCurrent: () => current,
  });
  current = false;
  finish(
    new Response(JSON.stringify(response()), {
      headers: { "content-type": "application/json" },
    }),
  );
  await expect(pending).rejects.toMatchObject({ code: "STALE" });
  expect(hasPendingLabels()).toBe(true);
});
it("超时后保留匿名标记；晚到成功不清标记，不回传旧文件", async () => {
  vi.useFakeTimers();
  let finish;
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const outcome = generateOrderLabels(request(), options()).catch(
    (error) => error,
  );
  await vi.advanceTimersByTimeAsync(60001);
  expect((await outcome).code).toBe("UNCONFIRMED");
  const marker = sessionStorage.getItem("lis.labels.pending.v1");
  expect(JSON.parse(marker)).toEqual({ version: 1, nonce: expect.any(String) });
  expect(Object.keys(JSON.parse(marker)).sort()).toEqual(["nonce", "version"]);
  finish(
    new Response(JSON.stringify(response()), {
      headers: { "content-type": "application/json" },
    }),
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(sessionStorage.getItem("lis.labels.pending.v1")).toBe(marker);
});
