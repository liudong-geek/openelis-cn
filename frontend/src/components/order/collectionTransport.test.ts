import { postRecoveredCollection } from "./collectionTransport";
import config from "../../config.json";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("CSRF");
});
it.each([400, 409])(
  "保留拒绝应答正文供命令层核对，不能只凭HTTP状态解锁：%s",
  async (status) => {
    const payload = {
      success: false,
      code: "COLLECTION_NOT_SAVED",
      version: 1,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      postRecoveredCollection("SIM-BODY", new AbortController().signal),
    ).resolves.toMatchObject({ status, data: payload });
  },
);
it("真实适配器只发送一次，不重定向、不传伪幂等头，保留取消信号", async () => {
  const payload = {
    success: true,
    sampleOrderItems: { sampleId: "701", labNo: "SIM-701" },
  };
  const fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  localStorage.setItem("CSRF", "SIM-CSRF");
  const controller = new AbortController();
  expect(
    await postRecoveredCollection("SIM-BODY", controller.signal),
  ).toMatchObject({ status: 200, data: payload });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe(config.serverBaseUrl + "/rest/SamplePatientEntry");
  expect(options).toMatchObject({
    method: "POST",
    redirect: "manual",
    signal: controller.signal,
    body: "SIM-BODY",
    cache: "no-store",
  });
  expect(options.headers["X-CSRF-Token"]).toBe("SIM-CSRF");
  expect(options.headers).not.toHaveProperty("Idempotency-Key");
});
it("采集相关标识单独传递，摘要由后台计算而非客户端声明", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  await postRecoveredCollection("SIM-BODY", new AbortController().signal, {
    attemptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    fingerprint: "a".repeat(64),
  });
  expect(fetcher.mock.calls[0][1].headers["X-LIS-Collection-Attempt"]).toBe(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  );
  expect(JSON.stringify(fetcher.mock.calls[0][1].headers)).not.toContain(
    "a".repeat(64),
  );
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty(
    "Idempotency-Key",
  );
});
it.each(["redirect", "html", "empty", "oversize", "broken"])(
  "异常正文拒绝且不重试：%s",
  async (kind) => {
    const response =
      kind === "redirect"
        ? new Response(null, { status: 307 })
        : new Response(
            kind === "empty"
              ? ""
              : kind === "oversize"
                ? "a".repeat(1024 * 1024 + 1)
                : "SIM-invalid-json",
            {
              headers: {
                "content-type":
                  kind === "html" ? "text/html" : "application/json",
              },
            },
          );
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetcher);
    await expect(
      postRecoveredCollection("SIM-BODY", new AbortController().signal),
    ).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
