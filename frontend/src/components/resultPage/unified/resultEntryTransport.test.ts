import {
  readResultWorkbench,
  saveResultWorkbench,
} from "./resultEntryTransport";
const json = (body = "{}", status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
const path = "/rest/results-entry/analysis/101/result";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("单行保存真实报文/可信CSRF，只请求一次且无重定向", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json(
        '{"analysisStatusId":"15","analysisLastupdated":"1000","reflex":[],"calculated":[]}',
      ),
    ),
  );
  const response = await new Promise((resolve) =>
    saveResultWorkbench(
      path,
      '{"testResult":{"resultValue":"0"}}',
      resolve,
      "SIM-CSRF",
    ),
  );
  expect(response).toMatchObject({ status: 200, analysisStatusId: "15" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/analysis\/101\/result$/),
    expect.objectContaining({
      method: "POST",
      body: '{"testResult":{"resultValue":"0"}}',
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      headers: expect.objectContaining({ "X-CSRF-Token": "SIM-CSRF" }),
    }),
  );
});
test("保留实际409，不接受报文伪造HTTP状态", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      json('{"status":200,"error":"error.results.specimenNotEligible"}', 409),
    ),
  );
  expect(
    await new Promise((resolve) =>
      saveResultWorkbench(path, "{}", resolve, "SIM"),
    ),
  ).toMatchObject({ status: 409, error: "error.results.specimenNotEligible" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([401, 403, 500, 302])("%s不重试/不返回成功", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json("{}", status)),
  );
  expect(
    await new Promise((resolve) =>
      saveResultWorkbench(path, "{}", resolve, "SIM"),
    ),
  ).toMatchObject({ status, unconfirmed: true });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each(["html", "bad-json", "bad-utf8", "large", "redirected"])(
  "%s保护输入而非导航",
  async (mode) => {
    const response =
      mode === "html"
        ? new Response("<html>PRIVATE</html>", {
            headers: { "content-type": "text/html" },
          })
        : json(
            mode === "bad-json"
              ? "{PRIVATE"
              : mode === "large"
                ? JSON.stringify("x".repeat(4 * 1024 * 1024))
                : "{}",
          );
    if (mode === "redirected")
      Object.defineProperty(response, "redirected", { value: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mode === "bad-utf8"
          ? new Response(new Uint8Array([255]), {
              headers: { "content-type": "application/json" },
            })
          : response,
      ),
    );
    const data = await new Promise((resolve) =>
      saveResultWorkbench(path, "{}", resolve, "SIM"),
    );
    expect(data).toMatchObject({ unconfirmed: true });
    expect(JSON.stringify(data)).not.toContain("PRIVATE");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
test.each(["read", "save"])(
  "%s不响应abort也准时结束，迟到只回调一次",
  async (method) => {
    vi.useFakeTimers();
    let resolveFetch!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const callback = vi.fn();
    if (method === "read")
      readResultWorkbench("/rest/results-entry/pending", callback);
    else saveResultWorkbench(path, "{}", callback, "SIM");
    await vi.advanceTimersByTimeAsync(30001);
    expect(callback).toHaveBeenCalledTimes(1);
    resolveFetch(json());
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
test("列表只读无缓存且失败不会成为空成功", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json("{}", 500)),
  );
  const result = await new Promise((resolve) =>
    readResultWorkbench("/rest/results-entry/pending", (data, error) =>
      resolve({ data, error }),
    ),
  );
  expect(result).toMatchObject({ data: undefined, error: { status: 500 } });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/results-entry\/pending$/),
    expect.objectContaining({
      method: "GET",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
    }),
  );
});
