import {
  collectionRecoveryResult,
  recoveryReference,
} from "./collectionRecovery.fixtures";
import { verifyCurrentEntry } from "./orderEntryCurrent";
import {
  freezeCollectionAttempt,
  collectionRecoveryOptions,
  buildRecoveredCollection,
  verifyRecoveredCollection,
  submitRecoveredCollection,
} from "./collectionRecovery";

const attempt = {
  attemptId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  fingerprint: "a".repeat(64),
};
const rejection = () => ({
  status: 409,
  redirected: false,
  data: {
    success: false,
    code: "COLLECTION_NOT_SAVED",
    version: 1,
    ...attempt,
    errorKey: "collection.requestChanged",
  },
});
it("仅原命令对应的回滚应答可认定未保存，且不自动重试", async () => {
  const command = {
    ...buildRecoveredCollection(verified(), selection()),
    attempt,
  };
  const post = vi.fn().mockResolvedValue(rejection());
  await expect(
    submitRecoveredCollection({ command, post, isCurrent: () => true }),
  ).rejects.toMatchObject({ errorKey: "order.collectionRecovery.rejected" });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][2]).toBe(attempt);
});
it.each([
  "nonce",
  "hash",
  "version",
  "reason",
  "status",
  "extra",
  "redirect",
  "oldCode",
])("不可信拒绝保持未知：%s", async (kind) => {
  const response = rejection();
  if (kind === "nonce")
    response.data.attemptId = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  if (kind === "hash") response.data.fingerprint = "b".repeat(64);
  if (kind === "version") response.data.version = 2;
  if (kind === "reason") response.data.errorKey = "collection.dateTimeInvalid";
  if (kind === "status") response.status = 200;
  if (kind === "extra") response.data.patient = "SIM-PRIVATE";
  if (kind === "redirect") response.redirected = true;
  if (kind === "oldCode") response.data.code = "COLLECTION_VALIDATION_FAILED";
  const command = {
    ...buildRecoveredCollection(verified(), selection()),
    attempt,
  };
  await expect(
    submitRecoveredCollection({
      command,
      post: vi.fn().mockResolvedValue(response),
      isCurrent: () => true,
    }),
  ).rejects.toMatchObject({ errorKey: "order.collectionRecovery.unknown" });
});
it("真实摘要绑定完整正文；每个显式新尝试更换标识", async () => {
  const { webcrypto } = await import("node:crypto");
  vi.stubGlobal("crypto", webcrypto);
  try {
    const one = await freezeCollectionAttempt('{"SIM":1}'),
      two = await freezeCollectionAttempt('{"SIM":1}');
    expect(one.attemptId).not.toBe(two.attemptId);
    expect(one.fingerprint).toBe(two.fingerprint);
    expect((await freezeCollectionAttempt('{"SIM":1} ')).fingerprint).not.toBe(
      one.fingerprint,
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
const verified = () =>
  verifyCurrentEntry(collectionRecoveryResult(), recoveryReference);
const selection = () => [
  {
    requestId: "902",
    quantity: "2.5",
    collector: 'SIM<&"采集员',
    date: "2026-09-13",
    time: "14:20",
  },
];

it("当前主数据保持ID和事实白名单，只有有效待采集管可选择", () => {
  const data = collectionRecoveryResult();
  data.current.collectionContext.canCollect = true;
  data.current.collectionContext.masterData[0].canWrite = true;
  const value = verifyCurrentEntry(data, recoveryReference);
  expect(value.current.collectionContext).not.toHaveProperty("canCollect");
  expect(value.current.collectionContext.masterData[0]).not.toHaveProperty(
    "canWrite",
  );
  expect(collectionRecoveryOptions(value).map((r) => r.id)).toEqual(["902"]);
  value.current.collectionContext.masterData[0].active = false;
  expect(collectionRecoveryOptions(value)).toEqual([]);
  expect(value.current.requestedSpecimens).toHaveLength(3);
});
it.each(["missing", "duplicate", "wrongId", "invalidTime", "unknownZone"])(
  "不接受不完整或伪造上下文：%s",
  (mode) => {
    const data = collectionRecoveryResult(),
      context = data.current.collectionContext;
    if (mode === "missing") context.masterData.pop();
    if (mode === "duplicate") context.masterData.push(context.masterData[0]);
    if (mode === "wrongId") context.masterData[0].id = "99";
    if (mode === "invalidTime") context.laboratoryNow = "2026-02-30T24:00";
    if (mode === "unknownZone") context.timeZone = "SIM/Unknown";
    expect(() => verifyCurrentEntry(data, recoveryReference)).toThrow();
  },
);
it("采集报文使用真实旧解析器字段，且不含任何患者/整单/标签字段", () => {
  const value = verified();
  value.current.patient.lastName = "SIM旧患者字段";
  const command = buildRecoveredCollection(
    value,
    selection(),
    Date.parse("2026-09-13T06:30:00Z"),
  );
  const body = JSON.parse(command.body),
    xml = new DOMParser().parseFromString(body.sampleXML, "text/xml");
  expect(Object.keys(body).sort()).toEqual([
    "collectionOnly",
    "sampleOrderItems",
    "sampleXML",
  ]);
  expect(body.sampleOrderItems).toEqual({
    sampleId: "701",
    labNo: "SIM-COLLECTION-701",
  });
  const tube = xml.querySelector("sample");
  expect(tube.getAttribute("sampleID")).toBe("11");
  expect(tube.getAttribute("sampleTypeRequestId")).toBe("902");
  expect(tube.getAttribute("date")).toBe("2026/09/13");
  expect(tube.getAttribute("time")).toBe("14:20");
  expect(tube.getAttribute("collector")).toBe(selection()[0].collector);
  expect(tube.getAttribute("uom")).toBe("51");
  expect(command.body).not.toMatch(
    /patient|requestedSpecimens|panels|tests|label|storage/,
  );
});
it.each(["collected", "cancelled", "duplicate", "date", "future", "quantity"])(
  "错误选择不派发：%s",
  (mode) => {
    const selected = selection();
    if (mode === "collected") selected[0].requestId = "901";
    if (mode === "cancelled") selected[0].requestId = "903";
    if (mode === "duplicate") selected.push(selected[0]);
    if (mode === "date") selected[0].date = "2026-02-30";
    if (mode === "future") selected[0].time = "15:00";
    if (mode === "quantity") selected[0].quantity = "Infinity";
    expect(() =>
      buildRecoveredCollection(
        verified(),
        selected,
        Date.parse("2026-09-13T06:30:00Z"),
      ),
    ).toThrow();
  },
);
it("历史响应可继续只读，不能从旧响应恢复采集", () => {
  const data = collectionRecoveryResult();
  delete data.current.collectionContext;
  expect(
    collectionRecoveryOptions(verifyCurrentEntry(data, recoveryReference)),
  ).toEqual([]);
});
it("200只是写入应答；current未读到该管采集事实不能当成功", () => {
  const command = buildRecoveredCollection(verified(), selection());
  expect(() => verifyRecoveredCollection(verified(), command)).toThrow();
});
it("未确认身份不派发，异常应答不自动重复POST", async () => {
  const command = buildRecoveredCollection(verified(), selection()),
    post = vi.fn();
  await expect(
    submitRecoveredCollection({ command, post, isCurrent: () => false }),
  ).rejects.toMatchObject({ errorKey: "order.progress.requestChanged" });
  expect(post).not.toHaveBeenCalled();
  post.mockResolvedValue({ status: 503 });
  await expect(
    submitRecoveredCollection({ command, post, isCurrent: () => true }),
  ).rejects.toMatchObject({ errorKey: "order.collectionRecovery.unknown" });
  expect(post).toHaveBeenCalledTimes(1);
});

const collected = () => {
  const data = verified();
  data.current.requestedSpecimens[1].status = "COLLECTED";
  data.current.requestedSpecimens[1].sampleItemId = "1002";
  data.current.physicalSpecimens.push({
    ...data.current.physicalSpecimens[0],
    id: "1002",
    requestId: "902",
    quantity: 2.5,
    collectionDate: "2026-09-13T06:20:00Z",
    collector: selection()[0].collector,
    analyses: [{ id: "1102", testId: "31", statusId: "3", lastUpdated: null }],
  });
  return data;
};
it("逐管读回完全相符才确认成功", () => {
  const command = buildRecoveredCollection(verified(), selection());
  const data = collected();
  expect(verifyRecoveredCollection(data, command)).toBe(data);
});
it.each([
  "typeOfSampleId",
  "testIds",
  "panelIds",
  "requestedQuantity",
  "unitOfMeasureId",
])("同requestId修改原计划仍拒绝成功：%s", (field) => {
  const command = buildRecoveredCollection(verified(), selection()),
    data = collected();
  data.current.requestedSpecimens[1][field] = field.endsWith("Ids")
    ? ["999"]
    : field === "requestedQuantity"
      ? 99
      : "999";
  expect(() => verifyRecoveredCollection(data, command)).toThrow();
});
it("超时中止请求且迟到应答不能恢复成功或重发", async () => {
  vi.useFakeTimers();
  try {
    let resolve;
    const post = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const promise = submitRecoveredCollection({
      command: buildRecoveredCollection(verified(), selection()),
      post,
      isCurrent: () => true,
    });
    const rejected = expect(promise).rejects.toMatchObject({
      errorKey: "order.collectionRecovery.unknown",
    });
    await vi.advanceTimersByTimeAsync(30000);
    await rejected;
    expect(post.mock.calls[0][1].aborted).toBe(true);
    resolve({ status: 200, data: { success: true } });
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("超时之后到达的匹配拒绝不能把未知改为可重试", async () => {
  vi.useFakeTimers();
  try {
    let resolve;
    const post = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const promise = submitRecoveredCollection({
      command: {
        ...buildRecoveredCollection(verified(), selection()),
        attempt,
      },
      post,
      isCurrent: () => true,
    });
    const rejected = expect(promise).rejects.toMatchObject({
      errorKey: "order.collectionRecovery.unknown",
    });
    await vi.advanceTimersByTimeAsync(30000);
    await rejected;
    resolve(rejection());
    await Promise.resolve();
    await expect(promise).rejects.toMatchObject({
      errorKey: "order.collectionRecovery.unknown",
    });
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
