import { postIntakeDecision } from "./intakeTransport";
import { webcrypto } from "node:crypto";
import { createIntakeOperation } from "./intakeOperation";
import { intakeFixture, intakeAck } from "./intakeDecision.fixtures";
import { verifyCurrentEntry } from "./orderEntryCurrent";
import { recoveryReference } from "./collectionRecovery.fixtures";
import { readIntakeCheckpoint } from "./intakeCheckpoint";
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const json = (status = 200) =>
  new Response('{"success":true}', {
    status,
    headers: { "content-type": "application/json" },
  });
it("单次固定POST携凭据和CSRF，不允许重定向", async () => {
  fetch.mockResolvedValue(json());
  await expect(
    postIntakeDecision("{}", new AbortController().signal, "SIM-CSRF"),
  ).resolves.toEqual({ success: true });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "include",
    redirect: "manual",
    cache: "no-store",
    headers: { "X-CSRF-Token": "SIM-CSRF" },
  });
});
it("完整读到响应结尾后不取消浏览器响应流", async () => {
  const response = json();
  const reader = response.body!.getReader();
  const cancel = vi.spyOn(reader, "cancel");
  vi.spyOn(response.body!, "getReader").mockReturnValue(reader);
  fetch.mockResolvedValue(response);

  await expect(
    postIntakeDecision("{}", new AbortController().signal, "SIM-CSRF"),
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
  fetch.mockResolvedValue(response);

  await expect(
    postIntakeDecision("{}", new AbortController().signal, "SIM-CSRF"),
  ).rejects.toThrow();
  expect(cancel).toHaveBeenCalledTimes(1);
});
it.each([401, 403])(
  "即使已超时，迟到%i也通知固定凭证拒权回调",
  async (status) => {
    let resolve;
    fetch.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const c = new AbortController(),
      denied = vi.fn();
    const pending = postIntakeDecision("{}", c.signal, "SIM-CSRF", denied);
    c.abort();
    resolve(json(status));
    await expect(pending).rejects.toMatchObject({
      errorKey: "order.intakeDecision.denied",
    });
    expect(denied).toHaveBeenCalledTimes(1);
  },
);
it.each([302, 400, 409, 500])(
  "HTTP %i不能解析为成功且无自动重试",
  async (status) => {
    fetch.mockResolvedValue(json(status));
    await expect(
      postIntakeDecision("{}", new AbortController().signal, "SIM-CSRF"),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it.each([
  new Response("<html>login</html>", {
    headers: { "content-type": "text/html" },
  }),
  new Response("{bad", { headers: { "content-type": "application/json" } }),
  new Response('"' + "x".repeat(66000) + '"', {
    headers: { "content-type": "application/json" },
  }),
])("HTML、破损或过大回执不能作为成功 %#", async (value) => {
  fetch.mockResolvedValue(value);
  await expect(
    postIntakeDecision("{}", new AbortController().signal, "SIM-CSRF"),
  ).rejects.toThrow();
});
it("15秒超时锁住提交；迟到拒权仍回调，绝不续跑GET", async () => {
  vi.stubGlobal("crypto", webcrypto);
  sessionStorage.clear();
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const record = {
    result: verifyCurrentEntry(intakeFixture(), recoveryReference),
    isCurrent: () => true,
    used: false,
    adopted: false,
  };
  const denied = vi.fn(),
    read = vi.fn(),
    end = vi.fn();
  const operation = createIntakeOperation({
    record,
    actor: "7",
    csrf: () => "SIM-CSRF",
    isBound: () => true,
    assertIdle: () => {},
    begin: () => {},
    end,
    read,
    denied,
  });
  await operation.preview("1001", "ACCEPTED");
  vi.useFakeTimers();
  const result = operation.confirm().catch((e) => e);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(15001);
  expect((await result).errorKey).toBe("order.intakeDecision.unknown");
  expect(readIntakeCheckpoint()).not.toBeNull();
  expect(end).toHaveBeenCalledTimes(1);
  resolve(json(403));
  await vi.advanceTimersByTimeAsync(1);
  expect(denied).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(readIntakeCheckpoint()).not.toBeNull();
});
it("ACK署名和时间必须与独立回读一致，不清未知凭证", async () => {
  vi.stubGlobal("crypto", webcrypto);
  sessionStorage.clear();
  const record = {
    result: verifyCurrentEntry(intakeFixture(), recoveryReference),
    isCurrent: () => true,
  };
  const read = vi.fn(),
    denied = vi.fn();
  const operation = createIntakeOperation({
    record,
    actor: "7",
    csrf: () => "SIM-CSRF",
    isBound: () => true,
    assertIdle: () => {},
    begin: () => {},
    end: () => {},
    read,
    denied,
  });
  await operation.preview("1001", "ACCEPTED");
  fetch.mockImplementation(
    async (_, options) =>
      new Response(
        JSON.stringify({
          ...intakeAck(JSON.parse(options.body)),
          decidedBy: "8",
        }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  await expect(operation.confirm()).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(readIntakeCheckpoint()).not.toBeNull();
});
