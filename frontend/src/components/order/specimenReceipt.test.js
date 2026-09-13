import { webcrypto } from "node:crypto";
import {
  buildReceipt,
  receiptInstant,
  receiptOptions,
  verifyCurrentReceipt,
  verifyReceiptResponse,
} from "./specimenReceipt";
import {
  RECEIPT_CHECKPOINT_KEY,
  readReceiptCheckpoint,
  rememberReceiptCheckpoint,
  reconcileReceiptCheckpoint,
} from "./receiptCheckpoint";
import {
  receiptFixture,
  receivedFixture,
  receiptResponse,
  twoTubeReceiptFixture,
} from "./specimenReceipt.fixtures";

const now = Date.parse("2026-09-13T06:20:00Z");
const command = () => buildReceipt(receiptFixture(), ["901"], now);
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("保留真实管 ID 和原始采集微秒，只写签收字段", () => {
  expect(command()).toEqual({
    sampleId: "701",
    labNo: "SIM-COLLECTION-701",
    patientId: "801",
    tubes: [
      {
        requestId: "901",
        sampleItemId: "1001",
        collectionDate: "2026-09-13T06:10:00.123456Z",
        receivedDate: "2026-09-13T06:20:00.000Z",
      },
    ],
  });
  expect(receiptOptions(receiptFixture())[0].barcode).toBe(
    "SIM-COLLECTION-701.1",
  );
});
it.each([
  "2026-02-30T06:20:00Z",
  "2026-09-13T06:20:00.1234567Z",
  "2026-09-13T14:20:00+08:00",
  "2026-09-13T06:20:60Z",
])("拒绝非法或超精度时间 %s", (value) =>
  expect(() => receiptInstant(value)).toThrow(),
);
it("相同 instant 可规范化，但不能混同微秒", () => {
  expect(receiptInstant("2026-09-13T06:20:00.1Z")).toBe(
    receiptInstant("2026-09-13T06:20:00.100000Z"),
  );
  expect(receiptInstant("2026-09-13T06:20:00.123456Z")).not.toBe(
    receiptInstant("2026-09-13T06:20:00.123457Z"),
  );
});
it.each([[], ["901", "901"], ["902"], ["1001"], ["903"]])(
  "不能隐式全选或用错误 ID %j",
  (ids) => expect(() => buildReceipt(receiptFixture(), ids, now)).toThrow(),
);
it.each([
  (c) => {
    c.physicalSpecimens[0].lastUpdated = null;
  },
  (c) => {
    c.physicalSpecimens[0].receivedDate = "2026-09-13T06:11:00Z";
  },
  (c) => {
    c.physicalSpecimens[0].rejected = true;
  },
  (c) => {
    c.physicalSpecimens[0].analyses = [];
  },
  (c) => {
    c.collectionContext.masterData.find((r) => r.kind === "TEST").active =
      false;
  },
  (c) => {
    c.collectionContext.masterData.find(
      (r) => r.kind === "ANALYSIS_STATUS",
    ).name = "Finalized";
  },
])("不可签收状态不提供选择", (change) => {
  const result = receiptFixture();
  change(result.current);
  expect(receiptOptions(result)).toEqual([]);
});
it("签收不能早于原始采集微秒", () =>
  expect(() =>
    buildReceipt(
      receiptFixture(),
      ["901"],
      Date.parse("2026-09-13T06:10:00.123Z"),
    ),
  ).toThrow());
it.each([
  (r) => {
    r.patientId = "802";
  },
  (r) => {
    r.tubes[0].sampleItemId = "1002";
  },
  (r) => {
    r.tubes[0].receivedDate = "2026-09-13T06:20:00.000001Z";
  },
  (r) => {
    r.tubes = [];
  },
  (r) => {
    r.tubes[0].collectionDate = "2026-09-13T06:10:00.123Z";
  },
])("成功响应仍逐管验真", (change) => {
  const response = receiptResponse(command());
  change(response);
  expect(() => verifyReceiptResponse(response, command())).toThrow();
});
it("只认逐管读回，不认200或仍未签收", () => {
  expect(() => verifyCurrentReceipt(receiptFixture(), command())).toThrow();
  expect(() =>
    verifyCurrentReceipt(receivedFixture(command()), command()),
  ).not.toThrow();
});
it("匿名保护不存患者/管/时间，匹配实际逐管签收才消解，其他保护不清除", async () => {
  const result = receiptFixture();
  await rememberReceiptCheckpoint(
    result.receipt.submissionId,
    command(),
    () => true,
  );
  const raw = sessionStorage.getItem(RECEIPT_CHECKPOINT_KEY);
  for (const secret of ["SIM-COLLECTION", '"801"', '"1001"', "2026-09-13"])
    expect(raw).not.toContain(secret);
  sessionStorage.setItem("lis.labels.pending.v1", "SIM-other");
  await expect(
    reconcileReceiptCheckpoint(result, () => true),
  ).rejects.toThrow();
  expect(readReceiptCheckpoint()).not.toBeNull();
  await reconcileReceiptCheckpoint(receivedFixture(command()), () => true);
  expect(readReceiptCheckpoint()).toBeNull();
  expect(sessionStorage.getItem("lis.labels.pending.v1")).toBe("SIM-other");
});
it("迟到或错误签收时刻不能解锁", async () => {
  await rememberReceiptCheckpoint(
    receiptFixture().receipt.submissionId,
    command(),
    () => true,
  );
  await expect(
    reconcileReceiptCheckpoint(receivedFixture(command()), () => false),
  ).rejects.toThrow();
  const wrong = receivedFixture(command());
  wrong.current.physicalSpecimens[0].receivedDate =
    "2026-09-13T06:20:00.000001Z";
  await expect(reconcileReceiptCheckpoint(wrong, () => true)).rejects.toThrow();
  expect(readReceiptCheckpoint()).not.toBeNull();
});
it.each([
  (tube) => {
    tube.rejected = true;
  },
  (tube) => {
    tube.voided = true;
  },
  (tube) => {
    tube.collectionDate = "2026-09-13T06:10:00.123456789Z";
  },
])("不合格旧管不阻止另一根合法管签收", (change) => {
  const result = twoTubeReceiptFixture();
  change(result.current.physicalSpecimens[0]);
  expect(receiptOptions(result).map((r) => r.requestId)).toEqual(["902"]);
  expect(
    buildReceipt(result, ["902"], now).tubes.map((t) => t.sampleItemId),
  ).toEqual(["1002"]);
});
it("多管仅缺一根签收事实不能消解，全部精确匹配才消解", async () => {
  const result = twoTubeReceiptFixture(),
    batch = buildReceipt(result, ["901", "902"], now);
  await rememberReceiptCheckpoint(
    result.receipt.submissionId,
    batch,
    () => true,
  );
  result.current.physicalSpecimens[0].receivedDate =
    batch.tubes[0].receivedDate;
  await expect(
    reconcileReceiptCheckpoint(result, () => true),
  ).rejects.toThrow();
  expect(readReceiptCheckpoint()).not.toBeNull();
  result.current.physicalSpecimens[1].receivedDate =
    batch.tubes[1].receivedDate;
  await reconcileReceiptCheckpoint(result, () => true);
  expect(readReceiptCheckpoint()).toBeNull();
});
