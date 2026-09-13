import { webcrypto, createHash } from "node:crypto";
import { submitOrderEntry } from "./orderEntrySubmission";
import { buildPersistPayload } from "../barcodeWorkflow/LabelsSection";

const specimens = () => [
  {
    sampleTypeId: "11",
    quantity: "1",
    quantityUnit: "21",
    tests: [{ id: "31" }],
    panels: [{ id: "41" }],
  },
  { sampleTypeId: "11", quantity: "2", tests: ["32"], panels: [] },
];
const form = () => ({
  orderEntryOnly: true,
  sampleXML: "",
  patientProperties: {
    patientPK: "801",
    patientUpdateStatus: "NO_ACTION",
    lastName: "SIM原子申请",
  },
  sampleOrderItems: {
    labNo: "SIM-ATOMIC",
    programId: "51",
    additionalQuestions: { resourceType: "QuestionnaireResponse", item: [] },
  },
  labelPersistRequest: buildPersistPayload(
    [{ preset_id: 61 }],
    [],
    [],
    { 61: 2 },
    {},
  ),
});
export const wireReceipt = (body, headers) => {
  const sent = JSON.parse(body);
  return {
    success: true,
    replayed: false,
    receipt: {
      version: 1,
      submissionId: headers?.["Idempotency-Key"],
      requestHash: createHash("sha256")
        .update("raw-json-v1\n" + body)
        .digest("hex"),
      hashVersion: "raw-json-v1",
      createdAt: "2026-09-13T02:00:00Z",
      sampleId: "701",
      labNo: "SIM-ATOMIC",
      workflowType: "clinical",
      patientId: "801",
      requestedSpecimens: (sent.requestedSpecimens || []).map(
        (tube, index) => ({
          ...tube,
          id: String(901 + index),
          sampleId: "701",
          sortOrder: index,
          status: "REQUESTED",
          sampleItemId: null,
        }),
      ),
      labelRequests: [{ id: 71, presetId: 61, quantity: 2 }],
    },
  };
};
const run = (mutate = () => {}, overrides = {}) => {
  const operation = { labNo: "SIM-ATOMIC" };
  const onUnknown = vi.fn();
  const read = vi.fn((_url, callback) =>
    callback({
      id: "701",
      labNumber: operation.labNo,
      patientProperties: { patientPK: "801" },
    }),
  );
  const createRequests = vi.fn().mockResolvedValue([]);
  const post = vi.fn((_url, body, callback, _extra, headers) => {
    const data = wireReceipt(body, headers);
    mutate(data);
    callback({ status: 200, json: async () => data });
  });
  const result = submitOrderEntry({
    operation,
    body: JSON.stringify(form()),
    samples: specimens(),
    patientId: "801",
    post,
    read,
    createRequests,
    isCurrent: () => true,
    canContinue: () => true,
    onUnknown,
    ...overrides,
  });
  return { result, post, read, createRequests, onUnknown, operation };
};
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("首次保存一次带键POST包含同类型两管、程序问卷及申请标签；不查询编号或逐管续写", async () => {
  const test = run();
  expect((await test.result).id).toBe("701");
  expect(test.post).toHaveBeenCalledTimes(1);
  const [, body, , , headers] = test.post.mock.calls[0];
  expect(headers?.["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.parse(body)).toMatchObject({
    ...form(),
    requestedSpecimens: [
      {
        typeOfSampleId: "11",
        sortOrder: 0,
        requestedQuantity: 1,
        unitOfMeasureId: "21",
        requestedTests: "31",
        requestedPanels: "41",
      },
      {
        typeOfSampleId: "11",
        sortOrder: 1,
        requestedQuantity: 2,
        unitOfMeasureId: null,
        requestedTests: "32",
        requestedPanels: "",
      },
    ],
  });
  expect(test.read).not.toHaveBeenCalled();
  expect(test.createRequests).not.toHaveBeenCalled();
});
it("数值字符串标签与实际服务端整数回执匹配，保留原报文字节", async () => {
  const value = form();
  value.labelPersistRequest.order_cells = [{ preset_id: "61", qty: "2" }];
  const test = run(() => {}, { body: JSON.stringify(value) });
  expect((await test.result).id).toBe("701");
  expect(JSON.parse(test.operation.command.body).labelPersistRequest).toEqual(
    value.labelPersistRequest,
  );
});
it("服务端忽略的标签别名在发送前拒绝，不能静默丢失标签", async () => {
  const test = run(() => {}, {
    body: JSON.stringify({
      ...form(),
      labelPersistRequest: { orderCells: [{ presetId: 61, qty: 2 }] },
    }),
  });
  await expect(test.result).rejects.toMatchObject({
    errorKey: "order.save.incomplete",
  });
  expect(test.post).not.toHaveBeenCalled();
});
it("明确无患者环境申请保持环境工作流，完整回执可以确认保存", async () => {
  const value = form();
  value.patientProperties = { patientUpdateStatus: "NO_ACTION" };
  value.sampleOrderItems.environmentalFields = {
    workflowType: "environmental",
    samplingSiteId: "81",
  };
  const test = run(
    (data) => {
      data.receipt.workflowType = "environmental";
      delete data.receipt.patientId;
    },
    {
      body: JSON.stringify(value),
      patientId: undefined,
      requiresPatient: false,
    },
  );
  expect(await test.result).toMatchObject({ id: "701", patientProperties: {} });
  expect(
    JSON.parse(test.operation.command.body).sampleOrderItems
      .environmentalFields,
  ).toEqual(value.sampleOrderItems.environmentalFields);
  expect(test.createRequests).not.toHaveBeenCalled();
});
it.each([
  [
    "wrong key",
    (r) => {
      r.submissionId = "00000000-0000-4000-8000-000000000000";
    },
  ],
  [
    "wrong digest",
    (r) => {
      r.requestHash = "0".repeat(64);
    },
  ],
  [
    "missing tube",
    (r) => {
      r.requestedSpecimens.pop();
    },
  ],
  [
    "wrong patient",
    (r) => {
      r.patientId = "802";
    },
  ],
  [
    "wrong owner",
    (r) => {
      if (r.requestedSpecimens[0]) r.requestedSpecimens[0].sampleId = "702";
    },
  ],
  [
    "missing label",
    (r) => {
      r.labelRequests = [];
    },
  ],
  [
    "not confirmed",
    (_r, data) => {
      data.success = false;
    },
  ],
])("%s不能被HTTP200或普通编号查询当作保存成功", async (_name, corrupt) => {
  const test = run((data) => corrupt(data.receipt, data));
  await expect(test.result).rejects.toMatchObject({
    errorKey: "order.save.readbackUnconfirmed",
  });
  expect(test.onUnknown).toHaveBeenCalled();
  expect(test.read).not.toHaveBeenCalled();
  expect(test.createRequests).not.toHaveBeenCalled();
});
it.each([403, 409, 503])("首次%d不能证明回滚或转旧逐管路径", async (status) => {
  const test = run(() => {}, {
    post: (_url, _body, callback) =>
      callback({
        status,
        json: async () => ({
          success: false,
          code: "ENTRY_SUBMISSION_INCOMPLETE",
        }),
      }),
  });
  await expect(test.result).rejects.toMatchObject({
    errorKey: "order.save.readbackUnconfirmed",
  });
  expect(test.onUnknown).toHaveBeenCalled();
  expect(test.createRequests).not.toHaveBeenCalled();
});
it.each(
  ["0", "-1", "abc", "2abc", "Infinity", true, [], {}].map((value) => [value]),
)("非法数量%j在发送之前阻断，不悄悄改成1", async (quantity) => {
  const test = run(() => {}, { samples: [{ ...specimens()[0], quantity }] });
  await expect(test.result).rejects.toMatchObject({
    errorKey: "order.save.incomplete",
  });
  expect(test.post).not.toHaveBeenCalled();
  expect(test.onUnknown).not.toHaveBeenCalled();
});

it.each([{ modified: true }, { sampleId: "bad" }, { sampleId: "702" }])(
  "无法核实的编辑身份%j不能回退无键写入",
  async (state) => {
    const value = form();
    Object.assign(value.sampleOrderItems, state);
    const test = run(() => {}, {
      body: JSON.stringify(value),
      orderId: state.sampleId === "702" ? "701" : undefined,
    });
    await expect(test.result).rejects.toMatchObject({
      errorKey: "order.save.incomplete",
    });
    expect(test.post).not.toHaveBeenCalled();
    expect(test.onUnknown).not.toHaveBeenCalled();
  },
);
it("摘要挂起在页面总期限之前明确未发送；迟到摘要不得再派发", async () => {
  vi.useFakeTimers();
  let release;
  vi.stubGlobal("crypto", {
    randomUUID: () => webcrypto.randomUUID(),
    subtle: {
      digest: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
  });
  const test = run();
  const outcome = test.result.catch((error) => error);
  await vi.advanceTimersByTimeAsync(10001);
  expect(await outcome).toMatchObject({ errorKey: "order.save.incomplete" });
  expect(test.onUnknown).not.toHaveBeenCalled();
  expect(test.operation.dispatched).not.toBe(true);
  release(new Uint8Array(32).buffer);
  await Promise.resolve();
  expect(test.post).not.toHaveBeenCalled();
});
it.each(
  [
    {},
    [],
    { success: true },
    { success: false, code: "ENTRY_SUBMISSION_CHANGED", message: "SIM冲突" },
  ].map((value) => [value]),
)("HTTP400含矛盾或不明错误%j仍保存未知与原键", async (data) => {
  const test = run(() => {}, {
    post: (_url, _body, callback) =>
      callback({ status: 400, json: async () => data }),
  });
  await expect(test.result).rejects.toMatchObject({
    errorKey: "order.save.readbackUnconfirmed",
  });
  expect(test.onUnknown).toHaveBeenCalledWith(test.operation);
  expect(test.operation.command?.submissionId).toMatch(/^[0-9a-f-]{36}$/);
});
it.each([
  {
    error: "SIM必填项缺失",
    fieldErrors: [
      {
        field: "sampleOrderItems.referringSiteId",
        defaultMessage: "SIM请选择",
      },
    ],
    globalErrors: [],
  },
  { success: false, code: "ENTRY_SUBMISSION_INVALID", message: "SIM内容无效" },
])("后端明确输入拒绝%j允许修正，不误锁为未知", async (data) => {
  const test = run(() => {}, {
    post: (_url, _body, callback) =>
      callback({ status: 400, json: async () => data }),
  });
  await expect(test.result).rejects.toMatchObject({
    errorKey: "order.save.incomplete",
    status: 400,
  });
  expect(test.onUnknown).not.toHaveBeenCalled();
});
