import {
  ENTRY_CHECKPOINT_KEY,
  readEntryCheckpoint,
  rememberEntryCheckpoint,
  forgetEntryCheckpoint,
  verifyRecoveredEntryReceipt,
  recoverEntrySubmission,
} from "./orderEntryRecovery";

const reference = () => ({
  submissionId: "11111111-2222-4333-8444-555555555555",
  requestHash: "a".repeat(64),
});
const result = () => ({
  success: true,
  replayed: true,
  receipt: {
    version: 1,
    ...reference(),
    hashVersion: "raw-json-v1",
    createdAt: "2026-09-13T06:00:00Z",
    sampleId: "701",
    labNo: "SIM-RECOVERY-701",
    workflowType: "clinical",
    patientId: "801",
    labelRequests: [{ id: 1, presetId: 2, quantity: 3 }],
    requestedSpecimens: [0, 1].map((i) => ({
      id: String(901 + i),
      sampleId: "701",
      sortOrder: i,
      typeOfSampleId: "11",
      requestedQuantity: 1,
      unitOfMeasureId: null,
      requestedTests: "31,32",
      requestedPanels: "",
      status: "REQUESTED",
      sampleItemId: null,
    })),
  },
});
const response = (body = result(), status = 200) => ({
  status,
  redirected: false,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => body,
});
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("恢复凭证只保留版本/key/hash，原患者和认证报文不得持久化", () => {
  rememberEntryCheckpoint({
    ...reference(),
    body: '{"patient":"SIM-PATIENT","csrf":"SIM-CSRF"}',
    labNo: "SIM-LAB",
  });
  expect(readEntryCheckpoint()).toEqual({
    checkpoint: { version: 1, ...reference() },
    error: null,
  });
  expect(sessionStorage.getItem(ENTRY_CHECKPOINT_KEY)).not.toMatch(
    /SIM-|patient|csrf|labNo|body/,
  );
  expect(() => rememberEntryCheckpoint(reference())).toThrow(
    "order.save.readbackUnconfirmed",
  );
  expect(() =>
    forgetEntryCheckpoint({ ...reference(), requestHash: "b".repeat(64) }),
  ).toThrow();
  expect(readEntryCheckpoint().checkpoint).toBeTruthy();
  forgetEntryCheckpoint(reference());
  expect(readEntryCheckpoint().checkpoint).toBeNull();
});
it.each([
  "{",
  "null",
  JSON.stringify({ version: 2, ...reference() }),
  JSON.stringify({ version: 1, ...reference(), patient: "SIM" }),
  "x".repeat(257),
])("损坏或未知版本凭证不能当作空状态 %s", (raw) => {
  sessionStorage.setItem(ENTRY_CHECKPOINT_KEY, raw);
  expect(readEntryCheckpoint().error).toBe("order.recovery.storageUnavailable");
  expect(() => rememberEntryCheckpoint(reference())).toThrow();
  expect(sessionStorage.getItem(ENTRY_CHECKPOINT_KEY)).toBe(raw);
});
it("无法回读已写凭证时在发送前拒绝", () => {
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
  expect(() => rememberEntryCheckpoint(reference())).toThrow(
    "order.recovery.storageUnavailable",
  );
});
it("双管历史回执验真且不伪装为当前采集状态", () => {
  expect(
    verifyRecoveredEntryReceipt(result(), reference()).requestedSpecimens.map(
      (t) => t.id,
    ),
  ).toEqual(["901", "902"]);
  expect(
    verifyRecoveredEntryReceipt(result(), {
      submissionId: reference().submissionId,
    }).labNo,
  ).toBe("SIM-RECOVERY-701");
});
it.each([
  (r) => {
    r.success = false;
  },
  (r) => {
    r.replayed = false;
  },
  (r) => {
    r.receipt.version = 2;
  },
  (r) => {
    r.receipt.submissionId = "11111111-2222-4333-8444-555555555556";
  },
  (r) => {
    r.receipt.requestHash = "b".repeat(64);
  },
  (r) => {
    r.receipt.patientId = null;
  },
  (r) => {
    r.receipt.workflowType = "unknown";
  },
  (r) => {
    r.receipt.createdAt = "bad";
  },
  (r) => {
    r.receipt.requestedSpecimens = [];
  },
  (r) => {
    r.receipt.requestedSpecimens[1].id = "901";
  },
  (r) => {
    r.receipt.requestedSpecimens[1].sampleId = "702";
  },
  (r) => {
    r.receipt.requestedSpecimens[1].sortOrder = 0;
  },
  (r) => {
    r.receipt.requestedSpecimens[0].requestedTests = "31,31";
  },
  (r) => {
    r.receipt.requestedSpecimens[0].requestedQuantity = 0;
  },
  (r) => {
    r.receipt.requestedSpecimens[0].sampleItemId = "999";
  },
  (r) => {
    r.receipt.labelRequests.push({ ...r.receipt.labelRequests[0], id: 2 });
  },
])("畸形、不完整或不匹配回执拒绝 %#", (mutate) => {
  const value = result();
  mutate(value);
  expect(() => verifyRecoveredEntryReceipt(value, reference())).toThrow(
    "order.recovery.invalidReceipt",
  );
});
it("环境申请无患者才能恢复", () => {
  const value = result();
  value.receipt.workflowType = "environmental";
  expect(() => verifyRecoveredEntryReceipt(value, reference())).toThrow();
  delete value.receipt.patientId;
  expect(verifyRecoveredEntryReceipt(value, reference()).workflowType).toBe(
    "environmental",
  );
});
it.each([
  [404, "order.recovery.notFound"],
  [401, "order.recovery.permission"],
  [403, "order.recovery.permission"],
  [409, "order.recovery.invalidReceipt"],
  [503, "order.recovery.invalidReceipt"],
])("状态%d保持未知，不移除凭证也不重写", async (status, key) => {
  rememberEntryCheckpoint(reference());
  const read = vi.fn().mockResolvedValue(response(result(), status));
  await expect(
    recoverEntrySubmission({
      reference: reference(),
      read,
      isCurrent: () => true,
    }),
  ).rejects.toMatchObject({ errorKey: key });
  expect(read).toHaveBeenCalledWith(
    "/rest/SamplePatientEntry/submissions/" + reference().submissionId,
    expect.any(AbortSignal),
  );
  expect(readEntryCheckpoint().checkpoint).toEqual({
    version: 1,
    ...reference(),
  });
});
it("非法核对码不发请求", async () => {
  const read = vi.fn();
  await expect(
    recoverEntrySubmission({
      reference: { submissionId: "../../other" },
      read,
      isCurrent: () => true,
    }),
  ).rejects.toMatchObject({ errorKey: "order.recovery.invalidCode" });
  expect(read).not.toHaveBeenCalled();
});
it("响应头成功但流挂起仍有超时；迟到结果不解除凭证", async () => {
  vi.useFakeTimers();
  rememberEntryCheckpoint(reference());
  let finish;
  const read = vi.fn().mockResolvedValue({
    ...response(),
    json: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const call = recoverEntrySubmission({
    reference: reference(),
    read,
    isCurrent: () => true,
  }).catch((e) => e);
  await vi.advanceTimersByTimeAsync(25001);
  expect(await call).toMatchObject({ errorKey: "order.recovery.unavailable" });
  finish(result());
  await Promise.resolve();
  expect(readEntryCheckpoint().checkpoint).toBeTruthy();
});
it("会话或工作区改变后丢弃迟到查询", async () => {
  let finish,
    current = true;
  const read = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const call = recoverEntrySubmission({
    reference: reference(),
    read,
    isCurrent: () => current,
  }).catch((e) => e);
  current = false;
  finish(response());
  expect(await call).toMatchObject({
    errorKey: "order.progress.requestChanged",
  });
});
it.each([
  (r) => (r.redirected = true),
  (r) => (r.headers = new Headers({ "content-type": "text/html" })),
])("不把登录跳转或HTML当作回执 %#", async (mutate) => {
  const r = response();
  mutate(r);
  await expect(
    recoverEntrySubmission({
      reference: reference(),
      read: async () => r,
      isCurrent: () => true,
    }),
  ).rejects.toMatchObject({ errorKey: "order.recovery.invalidReceipt" });
});
it("清除凭证失败必须保留阻断，不能返回已恢复", () => {
  rememberEntryCheckpoint(reference());
  const original = sessionStorage;
  vi.stubGlobal("sessionStorage", {
    getItem: original.getItem.bind(original),
    removeItem: () => {},
  });
  expect(() => forgetEntryCheckpoint(reference())).toThrow(
    "order.recovery.storageUnavailable",
  );
  expect(readEntryCheckpoint().checkpoint).toBeTruthy();
});
