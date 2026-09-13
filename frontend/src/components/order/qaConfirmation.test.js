import { webcrypto } from "node:crypto";
import { qaFixture, qaMatched, qaAck } from "./qaConfirmation.fixtures";
import { verifyCurrentEntry } from "./orderEntryCurrent";
import { recoveryReference } from "./collectionRecovery.fixtures";
import {
  buildQaConfirmation,
  verifyQaAck,
  verifyQaReadback,
  qaCanConfirm,
} from "./qaConfirmation";
import {
  readQaCheckpoint,
  rememberQaCheckpoint,
  reconcileQaCheckpoint,
  QA_CHECKPOINT_KEY,
} from "./qaCheckpoint";
const verified = (r = qaFixture()) => verifyCurrentEntry(r, recoveryReference);
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("只接收配置及完整实管的只读投影，不保留运输能力", () => {
  const raw = qaFixture();
  raw.current.qaReview.command = { sampleId: "999" };
  const result = verified(raw);
  expect(qaCanConfirm(result)).toBe(true);
  expect(result.current.qaReview.command).toBeUndefined();
  expect(result.current.qaReview.checklistItems[0].lastUpdated).toBe(
    "2026-09-13T06:00:00.123456Z",
  );
});
it.each([
  (r) => (r.schema = 2),
  (r) => (r.scope = "TUBE"),
  (r) => (r.state = "PASS"),
  (r) => (r.currentAcceptanceVerified = true),
  (r) => (r.currentAcceptanceVerified = "false"),
  (r) => (r.specimenIds = ["1001"]),
  (r) => (r.specimenIds = ["1001", "1001"]),
  (r) => (r.specimenIds = [1001, 1002]),
  (r) => (r.checklistItems = []),
  (r) => (r.checklistItems[1].key = "identity"),
  (r) => (r.checklistItems[0].lastUpdated = "bad"),
  (r) => (r.checklistVersion = "2026-02-30T00:00:00Z"),
  (r) => (r.currentFactsDigest = "bad"),
  (r) => (r.checklistItems[0].label = ""),
])("坏核对合同仅阻断核对区，不丢患者当前记录 %#", (mutate) => {
  const raw = qaFixture();
  mutate(raw.current.qaReview);
  const result = verified(raw);
  expect(result.current.qaReview.state).toBe("BLOCKED");
  expect(qaCanConfirm(result)).toBe(false);
  expect(result.current.patient.lastName).toBe("模拟患者");
});
it.each([
  "2026-09-13T06:00:00.1Z",
  "2026-09-13T06:00:00.1234Z",
  "2026-09-13T06:00:00.000Z",
  "2026-09-13T06:00:00.123000Z",
])("非后台规范微秒版本不能引发一次必失败的确认 %s", (version) => {
  const raw = qaFixture();
  raw.current.qaReview.checklistVersion = version;
  expect(verified(raw).current.qaReview.state).toBe("BLOCKED");
});
it("旧current无qaReview继续可读但无确认能力", () => {
  const raw = qaFixture();
  delete raw.current.qaReview;
  expect(verified(raw).current.qaReview).toBeUndefined();
});
it.each([
  (t) => (t.sortOrder = null),
  (t) => (t.sortOrder = "2"),
  (t) => (t.receivedDate = null),
  (t) => (t.voided = true),
  (t) => (t.rejected = true),
])("坏实管不能用有效QA投影掩盖 %#", (mutate) => {
  const raw = qaFixture();
  mutate(raw.current.physicalSpecimens[0]);
  expect(verified(raw).current.qaReview.state).toBe("BLOCKED");
});
it.each([
  [],
  ["identity"],
  ["identity", "integrity", "extra"],
  ["identity", "identity"],
])("只能明确确认全部配置 %j", (keys) => {
  expect(() => buildQaConfirmation(verified(), keys)).toThrow();
});
it("冻结微秒版本，严格核对ACK和独立current", () => {
  const raw = qaFixture();
  raw.current.qaReview.checklistVersion = "2026-09-13T06:00:00.123456Z";
  const command = buildQaConfirmation(verified(raw), ["identity", "integrity"]);
  expect(command.expectedChecklistVersion).toBe(
    raw.current.qaReview.checklistVersion,
  );
  expect(Object.keys(command).sort()).toEqual([
    "confirmationId",
    "expectedChecklistVersion",
    "expectedFactsDigest",
    "sampleId",
    "specimenIds",
    "verifiedItems",
  ]);
  expect(() => verifyQaAck(qaAck(command), command)).not.toThrow();
  expect(() =>
    verifyQaReadback(verified(qaMatched(command)), command),
  ).not.toThrow();
  for (const patch of [
    { sampleId: "999" },
    { confirmationId: crypto.randomUUID() },
    { scope: "PASS" },
    { replayed: "false" },
    { readbackRequired: false },
    { currentAcceptanceVerified: true },
  ])
    expect(() =>
      verifyQaAck({ ...qaAck(command), ...patch }, command),
    ).toThrow();
});
it("持久保护不含患者/实管/命令，仅精确current可消解", async () => {
  const command = buildQaConfirmation(verified(), ["identity", "integrity"]);
  await rememberQaCheckpoint(
    recoveryReference.submissionId,
    command,
    () => true,
  );
  const raw = sessionStorage.getItem(QA_CHECKPOINT_KEY);
  for (const value of [
    "模拟患者",
    "1001",
    "1002",
    "SIM-COLLECTION",
    "identity",
    command.expectedFactsDigest,
  ])
    expect(raw).not.toContain(value);
  for (const change of [
    (r) => (r.state = "STALE_CONFIRMATION"),
    (r) => (r.state = "NOT_CONFIRMED"),
    (r) => (r.currentFactsDigest = "c".repeat(64)),
    (r) => (r.confirmationId = crypto.randomUUID()),
    (r) => (r.reviewerId = "7"),
  ]) {
    const result = qaMatched(command);
    change(result.current.qaReview);
    await expect(
      reconcileQaCheckpoint(verified(result), () => true),
    ).rejects.toThrow();
    expect(readQaCheckpoint()).not.toBeNull();
  }
  await expect(
    reconcileQaCheckpoint(verified(qaMatched(command)), () => false),
  ).rejects.toThrow();
  await reconcileQaCheckpoint(verified(qaMatched(command)), () => true);
  expect(readQaCheckpoint()).toBeNull();
});
it.each(["{", JSON.stringify({ version: 1 }), "x".repeat(2001)])(
  "损坏保护不能静默清空 %s",
  (raw) => {
    sessionStorage.setItem(QA_CHECKPOINT_KEY, raw);
    expect(readQaCheckpoint).toThrow();
    expect(sessionStorage.getItem(QA_CHECKPOINT_KEY)).toBe(raw);
  },
);
