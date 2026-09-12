vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
}));
import { createRequestsForSamples } from "./sampleTypeRequestApi";
import {
  postToOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";

const samples = [
  { sampleTypeId: "1", tests: [{ id: "11" }] },
  { sampleTypeId: "2", tests: [{ id: "12" }] },
];
beforeEach(() => {
  postToOpenElisServer.mockReset();
  postToOpenElisServerFullResponse
    .mockReset()
    .mockImplementation((url, input, finish) =>
      postToOpenElisServer(url, input, (status, body) =>
        finish({
          status,
          json: async () =>
            typeof body === "string" ? JSON.parse(body) : body,
        }),
      ),
    );
});
test("首管发送前失效，不创建任何标本申请", async () => {
  await expect(
    createRequestsForSamples("701", samples, () => false),
  ).rejects.toThrow("order.progress.requestChanged");
  expect(postToOpenElisServer).not.toHaveBeenCalled();
});
test("第一管在途后申请失效，不继续创建第二管", async () => {
  let callback,
    allowed = true;
  postToOpenElisServer.mockImplementation((_url, _body, finish) => {
    callback = finish;
  });
  const result = createRequestsForSamples("701", samples, () => allowed).catch(
    (error) => error,
  );
  expect(postToOpenElisServer).toHaveBeenCalledTimes(1);
  allowed = false;
  callback(201, {
    id: "901",
    sampleId: "701",
    typeOfSampleId: "1",
    sortOrder: 0,
    requestedQuantity: 1,
    requestedTests: "11",
    requestedPanels: "",
    status: "REQUESTED",
  });
  expect((await result).message).toBe("order.progress.requestChanged");
  expect(postToOpenElisServer).toHaveBeenCalledTimes(1);
});
test.each([false, true])(
  "正常串行保存保持旧调用兼容，显式守卫=%s",
  async (guarded) => {
    postToOpenElisServer.mockImplementation((_url, body, finish) => {
      const data = JSON.parse(body);
      finish(201, { ...data, id: data.typeOfSampleId, status: "REQUESTED" });
      finish(201, {});
    });
    const results = await createRequestsForSamples(
      "701",
      samples,
      guarded ? () => true : undefined,
    );
    expect(results.map(({ id, sampleId }) => ({ id, sampleId }))).toEqual([
      { id: "1", sampleId: "701" },
      { id: "2", sampleId: "701" },
    ]);
    expect(postToOpenElisServer).toHaveBeenCalledTimes(2);
  },
);
