import {
  createRequest,
  createRequestsForSamples,
} from "./sampleTypeRequestApi";
import config from "../../../config.json";

const input = { sampleId: "701", typeOfSampleId: "2" };
const body = (value, id = "901") => ({
  ...value,
  id,
  sortOrder: value.sortOrder ?? 0,
  requestedQuantity: value.requestedQuantity ?? 1,
  status: "REQUESTED",
  sampleItemId: null,
});
const json = (value, status = 201) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => {
  localStorage.setItem("CSRF", "SIM-RECEIPT-CSRF");
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("CSRF");
});

test("真实POST适配器读取回执正文，而不是把extraParams当作正文", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(body(input)));
  vi.stubGlobal("fetch", fetchMock);
  await expect(createRequest(input)).resolves.toEqual(body(input));
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
    config.serverBaseUrl + "/rest/sample-type-requests",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify(input),
      headers: expect.objectContaining({ "X-CSRF-Token": "SIM-RECEIPT-CSRF" }),
    }),
  );
});

test("真实POST适配器逐管取得不同请求ID，保留同类型多管", async () => {
  const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
    const value = JSON.parse(options.body);
    return json(body(value, String(901 + value.sortOrder)));
  });
  vi.stubGlobal("fetch", fetchMock);
  const result = await createRequestsForSamples("701", [
    { sampleTypeId: "2", tests: [{ id: "11" }] },
    { sampleTypeId: "2", tests: [{ id: "11" }] },
  ]);
  expect(result.map((value) => value?.id)).toEqual(["901", "902"]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test.each([{}, { ...body(input), sampleId: "702" }])(
  "真实201错回执不得继续第二管 %j",
  async (response) => {
    const fetchMock = vi.fn().mockResolvedValue(json(response));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createRequestsForSamples("701", [
        { sampleTypeId: "2" },
        { sampleTypeId: "3" },
      ]),
    ).rejects.toMatchObject({ errorKey: "order.save.readbackUnconfirmed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

test.each([401, 403, 500])("真实%s失败不自动重试", async (status) => {
  const fetchMock = vi.fn().mockResolvedValue(json({ success: false }, status));
  vi.stubGlobal("fetch", fetchMock);
  await expect(createRequest(input)).rejects.toBeInstanceOf(Error);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
