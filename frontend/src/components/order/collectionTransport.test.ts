import { postRecoveredCollection } from "./collectionTransport";
import config from "../../config.json";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("CSRF");
});
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
