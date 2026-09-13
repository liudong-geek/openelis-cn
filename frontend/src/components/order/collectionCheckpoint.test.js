import { webcrypto } from "node:crypto";
import {
  readCollectionCheckpoint,
  rememberCollectionCheckpoint,
} from "./collectionCheckpoint";
import { buildRecoveredCollection } from "./collectionRecovery";
import {
  collectionRecoveryResult,
  recoveryReference,
} from "./collectionRecovery.fixtures";
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const command = () =>
  buildRecoveredCollection(collectionRecoveryResult(), [
    {
      requestId: "902",
      quantity: 1,
      collector: "SIM采集员",
      date: "2026-09-13",
      time: "14:20",
    },
  ]);
it("最大1000管真实摘要写前校验并可完整回读，不存原始字段", async () => {
  const value = command();
  value.expected = Array.from({ length: 1000 }, (_, i) => ({
    ...value.expected[0],
    requestId: String(i + 1),
  }));
  const saved = await rememberCollectionCheckpoint(
    recoveryReference.submissionId,
    value,
  );
  expect(readCollectionCheckpoint()).toEqual(saved);
  expect(saved.rows).toHaveLength(1000);
  expect(Object.keys(saved).sort()).toEqual([
    "rows",
    "salt",
    "submissionId",
    "version",
  ]);
  expect(Object.keys(saved.rows[0]).sort()).toEqual(["facts", "reference"]);
  expect(sessionStorage.getItem("lis.collection.pending.v1")).not.toMatch(
    /SIM采集员|2026-09-13|SIM-COLLECTION/,
  );
});
it("重复管和超限管写前拒绝，不留下不可读标记", async () => {
  const value = command();
  value.expected.push(value.expected[0]);
  await expect(
    rememberCollectionCheckpoint(recoveryReference.submissionId, value),
  ).rejects.toBeDefined();
  expect(readCollectionCheckpoint()).toBeNull();
  value.expected = Array.from({ length: 1001 }, (_, i) => ({
    ...value.expected[0],
    requestId: String(i + 1),
  }));
  await expect(
    rememberCollectionCheckpoint(recoveryReference.submissionId, value),
  ).rejects.toBeDefined();
  expect(readCollectionCheckpoint()).toBeNull();
});
it("摘要计算期间失去会话不得落下迟到标记", async () => {
  let resolve;
  vi.stubGlobal("crypto", {
    randomUUID: () => recoveryReference.submissionId,
    subtle: {
      digest: () =>
        new Promise((r) => {
          resolve = r;
        }),
    },
  });
  let current = true;
  const pending = rememberCollectionCheckpoint(
    recoveryReference.submissionId,
    command(),
    () => current,
  );
  // First digest resolves; the second uses the same deferred adapter.
  current = false;
  resolve(new ArrayBuffer(32));
  await Promise.resolve();
  await Promise.resolve();
  resolve(new ArrayBuffer(32));
  await expect(pending).rejects.toBeDefined();
  expect(readCollectionCheckpoint()).toBeNull();
});
