vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
}));
import {
  createRequest,
  createRequestsForSamples,
} from "./sampleTypeRequestApi";
import {
  postToOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";
import { submitOrderEntry } from "../orderEntrySubmission";

const request = () => ({
  sampleId: "701",
  typeOfSampleId: "2",
  sortOrder: 0,
  requestedQuantity: 2,
  unitOfMeasureId: "3",
  requestedTests: "11,12",
  requestedPanels: "21",
});
const receipt = (input = request(), overrides = {}) => ({
  ...input,
  id: "901",
  status: "REQUESTED",
  sampleItemId: null,
  ...overrides,
});
beforeEach(() => {
  postToOpenElisServer.mockReset();
  postToOpenElisServerFullResponse
    .mockReset()
    .mockImplementation((url, input, finish) =>
      postToOpenElisServer(url, input, (status, body, error) =>
        finish(
          {
            status,
            json: async () =>
              typeof body === "string" ? JSON.parse(body) : body,
          },
          undefined,
          error,
        ),
      ),
    );
});

describe("标本申请创建回执（仅内存SIM）", () => {
  test.each([null, undefined, "", "not-json", "null", "[]", [], true, 1, {}])(
    "201携带无效回执 %j 不得当作成功",
    async (body) => {
      postToOpenElisServer.mockImplementation((_url, _input, finish) =>
        finish(201, body),
      );
      await expect(createRequest(request())).rejects.toMatchObject({
        errorKey: "order.save.readbackUnconfirmed",
      });
    },
  );
  test.each([
    { success: false },
    { id: null },
    { id: "0" },
    { id: "-1" },
    { id: "901x" },
    { id: 1.5 },
    { sampleId: "702" },
    { sampleId: null },
    { typeOfSampleId: "3" },
    { typeOfSampleId: undefined },
    { sortOrder: 1 },
    { sortOrder: undefined },
    { requestedQuantity: 1 },
    { requestedQuantity: "2" },
    { requestedQuantity: undefined },
    { unitOfMeasureId: null },
    { requestedTests: "11,13" },
    { requestedTests: "11" },
    { requestedPanels: "22" },
    { requestedPanels: null },
    { status: "COLLECTED" },
    { status: "CANCELLED" },
    { status: undefined },
    { sampleItemId: "501" },
  ])("回执身份或内容不符 %j 不得成功", async (overrides) => {
    postToOpenElisServer.mockImplementation((_url, _input, finish) =>
      finish(201, receipt(request(), overrides)),
    );
    await expect(createRequest(request())).rejects.toMatchObject({
      errorKey: "order.save.readbackUnconfirmed",
    });
  });
  test.each([200, 201])("%s兼容完整对象和JSON回执", async (status) => {
    for (const body of [receipt(), JSON.stringify(receipt())]) {
      postToOpenElisServer.mockImplementation((_url, _input, finish) =>
        finish(status, body),
      );
      await expect(createRequest(request())).resolves.toEqual(receipt());
    }
  });
  test("兼容服务端默认数量、顺序及空可选字段", async () => {
    const input = { sampleId: "701", typeOfSampleId: "2" };
    const expected = receipt(input, {
      sortOrder: 0,
      requestedQuantity: 1,
      unitOfMeasureId: null,
      requestedTests: null,
      requestedPanels: "",
    });
    postToOpenElisServer.mockImplementation((_url, _input, finish) =>
      finish(201, expected),
    );
    await expect(createRequest(input)).resolves.toEqual(expected);
  });
  test("只与已派发的输入比较，不受调用方事后改动影响", async () => {
    let finish;
    const input = request();
    postToOpenElisServer.mockImplementation((_url, _input, callback) => {
      finish = callback;
    });
    const saved = createRequest(input);
    input.sampleId = "702";
    finish(201, receipt());
    await expect(saved).resolves.toEqual(receipt());
  });
  test("首个畸形回执失败后不接受重复成功回调", async () => {
    postToOpenElisServer.mockImplementation((_url, _input, finish) => {
      finish(201, {});
      finish(201, receipt());
    });
    await expect(createRequest(request())).rejects.toMatchObject({
      errorKey: "order.save.readbackUnconfirmed",
    });
  });
  test("成功状态同时携带传输错误仍失败", async () => {
    const error = new Error("SIM传输中断");
    postToOpenElisServer.mockImplementation((_url, _input, finish) =>
      finish(201, receipt(), error),
    );
    await expect(createRequest(request())).rejects.toBe(error);
  });
  test("单管错误回执停止后续写入并将开单保留为待确认", async () => {
    postToOpenElisServer.mockImplementation((_url, _input, finish) =>
      finish(201, {}),
    );
    const onUnknown = vi.fn();
    await expect(
      submitOrderEntry({
        operation: { labNo: "SIM-RECEIPT-001" },
        body: "{}",
        samples: [
          { sampleTypeId: "2", tests: [{ id: "11" }] },
          { sampleTypeId: "3", tests: [{ id: "12" }] },
        ],
        patientId: "801",
        post: (_url, _body, finish) => finish({ status: 200 }),
        read: (_url, finish) =>
          finish({
            id: "701",
            labNumber: "SIM-RECEIPT-001",
            patientProperties: { patientPK: "801" },
          }),
        createRequests: createRequestsForSamples,
        isCurrent: () => true,
        canContinue: () => true,
        onUnknown,
      }),
    ).rejects.toMatchObject({ errorKey: "order.save.readbackUnconfirmed" });
    expect(postToOpenElisServer).toHaveBeenCalledTimes(1);
    expect(onUnknown).toHaveBeenCalledTimes(1);
  });
  test("同批两管收到同一请求ID时停止，不再派发第三管", async () => {
    postToOpenElisServer.mockImplementation((_url, body, finish) =>
      finish(201, receipt(JSON.parse(body))),
    );
    await expect(
      createRequestsForSamples("701", [
        { sampleTypeId: "2", tests: [{ id: "11" }] },
        { sampleTypeId: "2", tests: [{ id: "11" }] },
        { sampleTypeId: "3", tests: [{ id: "12" }] },
      ]),
    ).rejects.toMatchObject({ errorKey: "order.save.readbackUnconfirmed" });
    expect(postToOpenElisServer).toHaveBeenCalledTimes(2);
  });
  test("首管成功、第二管回执缺失时不派发第三管或重试前两管", async () => {
    postToOpenElisServer.mockImplementation((_url, body, finish) => {
      const sent = JSON.parse(body);
      finish(201, sent.sortOrder === 0 ? receipt(sent) : {});
    });
    await expect(
      createRequestsForSamples("701", [
        { sampleTypeId: "2", tests: [{ id: "11" }] },
        { sampleTypeId: "3", tests: [{ id: "12" }] },
        { sampleTypeId: "4", tests: [{ id: "13" }] },
      ]),
    ).rejects.toMatchObject({ errorKey: "order.save.readbackUnconfirmed" });
    expect(postToOpenElisServer).toHaveBeenCalledTimes(2);
  });
});
