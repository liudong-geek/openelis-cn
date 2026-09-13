import { postToOpenElisServerFullResponse } from "./Utils";

afterEach(() => vi.unstubAllGlobals());
it("带键保存保留原文、CSRF和回调附加值；不把第四参数误当请求头", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response('{"success":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  localStorage.setItem("CSRF", "SIM-CSRF");
  const original = '{ "patient":"SIM模拟", "requestedSpecimens": [] }';
  const marker = { test: "SIM附加值" };
  const response = await new Promise<unknown>((resolve) => {
    postToOpenElisServerFullResponse(
      "/rest/SamplePatientEntry",
      original,
      (result, extra) => resolve({ result, extra }),
      marker,
      { "Idempotency-Key": "00000000-0000-4000-8000-000000000001" },
    );
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "include",
    redirect: "manual",
    body: original,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": "SIM-CSRF",
      "Idempotency-Key": "00000000-0000-4000-8000-000000000001",
    },
  });
  expect(response).toMatchObject({ extra: marker });
});
it("其他既有POST默认不携带首次开单键", async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  await new Promise<void>((resolve) =>
    postToOpenElisServerFullResponse("/rest/SIM-other", "{}", () => resolve()),
  );
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Idempotency-Key");
});
