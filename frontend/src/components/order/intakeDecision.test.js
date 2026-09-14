import { webcrypto, createHash } from "node:crypto";
import {
  buildIntakeDecision,
  intakeOptions,
  intakeEvidence,
  verifyIntakeAck,
  verifyIntakeReadback,
  verifyIntakeReasons,
} from "./intakeDecision";
import { verifyCurrentEntry } from "./orderEntryCurrent";
import {
  intakeFixture,
  intakeAck,
  intakeRecorded,
  SIM_ACTOR,
} from "./intakeDecision.fixtures";
import {
  INTAKE_CHECKPOINT_KEY,
  rememberIntakeCheckpoint,
  readIntakeCheckpoint,
  reconcileIntakeCheckpoint,
} from "./intakeCheckpoint";
import { recoveryReference } from "./collectionRecovery.fixtures";
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
const verified = (r = intakeFixture()) =>
  verifyCurrentEntry(r, recoveryReference);
it("两管独立，未默认接收，摘要保留微秒和Java数值排序", async () => {
  const r = verified(),
    tube = r.current.physicalSpecimens[0];
  tube.analyses = [
    { ...tube.analyses[0], id: "10" },
    { ...tube.analyses[0], id: "2" },
  ];
  expect(intakeOptions(r).map((t) => t.id)).toEqual(["1001", "1002"]);
  await expect(buildIntakeDecision(r, "1001", "", "")).rejects.toThrow();
  const command = await buildIntakeDecision(r, "1001", "ACCEPTED");
  const json = JSON.stringify(intakeEvidence(r.current, tube));
  expect(json).toBe(
    '{"schema":1,"sampleVersion":"2026-09-13T06:20:00Z","requestVersion":"2026-09-13T06:00:00.123456Z","itemVersion":"2026-09-13T06:10:00.123456Z","typeOfSampleId":"11","collectionDate":"2026-09-13T06:10:00.123456Z","receivedDate":"2026-09-13T07:10:00.123456Z","analyses":[{"id":"2","testId":"31","version":"2026-09-13T06:00:00.123456Z"},{"id":"10","testId":"31","version":"2026-09-13T06:00:00.123456Z"}]}',
  );
  expect(command.expectedEvidenceDigest).toBe(
    createHash("sha256").update(json).digest("hex"),
  );
  expect(Object.keys(command)).toHaveLength(10);
  expect(command.reason).toBeNull();
});
it.each([
  (c) => {
    delete c.specimenDecisions;
  },
  (c) => {
    c.specimenDecisions = [];
  },
  (c) => {
    c.specimenDecisions[1] = c.specimenDecisions[0];
  },
  (c) => {
    c.specimenDecisions[0].currentAcceptanceVerified = true;
  },
  (c) => {
    c.specimenDecisions[0].state = "ACCEPTED";
  },
])("缺失或损坏全管投影不开放写入 #%#", (change) => {
  const r = intakeFixture();
  change(r.current);
  expect(intakeOptions(verified(r))).toEqual([]);
});
it.each([
  (t) => {
    t.receivedDate = null;
  },
  (t) => {
    t.rejected = true;
  },
  (t) => {
    t.voided = true;
  },
  (t) => {
    t.lastUpdated = null;
  },
  (t) => {
    t.sortOrder = "0";
  },
  (t) => {
    t.analyses[0].lastUpdated = null;
  },
  (t) => {
    t.analyses[0].statusId = "999";
  },
])("单管未就绪不阻断另一有效管 #%#", (change) => {
  const r = intakeFixture();
  change(r.current.physicalSpecimens[0]);
  if (r.current.physicalSpecimens[0].analyses[0].statusId === "999")
    r.current.collectionContext.masterData.push({
      kind: "ANALYSIS_STATUS",
      id: "999",
      name: "Finalized",
      active: true,
    });
  if (r.current.physicalSpecimens[0].rejected)
    r.current.specimenDecisions[0].state = "LEGACY_REJECTION";
  expect(intakeOptions(verified(r)).map((t) => t.id)).toEqual(["1002"]);
});
it.each([
  null,
  { schema: 1, state: "EMPTY", items: [] },
  { schema: 1, state: "READY", items: [{ namespace: "QA_EVENT", id: "41" }] },
])("缺目录可接收但不可拒收 %j", async (catalog) => {
  const r = intakeFixture();
  r.current.intakeReasons = catalog;
  const v = verified(r);
  await expect(
    buildIntakeDecision(v, "1001", "REJECTED", "41"),
  ).rejects.toThrow();
  expect((await buildIntakeDecision(v, "1001", "ACCEPTED")).reason).toBeNull();
});
it.each(["\u0085", "\u0000", "\u009f"])("原因目录拒绝控制字符 %j", (char) => {
  const c = intakeFixture().current.intakeReasons;
  c.items[0].label += char;
  expect(verifyIntakeReasons(c).state).toBe("UNAVAILABLE");
});
it("拒收写后版本变化按已存摘要回读，不错误重算", async () => {
  const c = await buildIntakeDecision(verified(), "1001", "REJECTED", "41"),
    next = verified(intakeRecorded(c));
  expect(() => verifyIntakeAck(intakeAck(c), c, SIM_ACTOR)).not.toThrow();
  expect(() =>
    verifyIntakeReadback(next, c, SIM_ACTOR, intakeAck(c)),
  ).not.toThrow();
  expect(intakeOptions(next).map((t) => t.id)).toEqual(["1002"]);
});
it.each(["decidedBy", "decidedAt", "sampleItemId", "evidenceDigest"])(
  "回读错配不确认 %s",
  async (field) => {
    const c = await buildIntakeDecision(verified(), "1001", "ACCEPTED"),
      raw = intakeRecorded(c);
    raw.current.specimenDecisions[0][field] =
      field === "decidedAt" ? "2026-09-14T06:01:00Z" : "8";
    expect(() =>
      verifyIntakeReadback(verified(raw), c, SIM_ACTOR, intakeAck(c)),
    ).toThrow();
  },
);
it("未知结果只存盐化凭证且未查到不清；完整同操作者记录才解除", async () => {
  const c = await buildIntakeDecision(verified(), "1001", "REJECTED", "41");
  await rememberIntakeCheckpoint(
    recoveryReference.submissionId,
    c,
    () => true,
    SIM_ACTOR,
  );
  const raw = sessionStorage.getItem(INTAKE_CHECKPOINT_KEY);
  for (const secret of [c.labNo, c.patientId, c.reason.label, c.sampleItemId])
    expect(raw).not.toContain('"' + secret + '"');
  await expect(
    reconcileIntakeCheckpoint(verified(), () => true),
  ).rejects.toThrow();
  expect(readIntakeCheckpoint()).not.toBeNull();
  const other = intakeRecorded(c);
  other.current.specimenDecisions[0].decidedBy = "8";
  await expect(
    reconcileIntakeCheckpoint(verified(other), () => true),
  ).rejects.toThrow();
  await reconcileIntakeCheckpoint(verified(intakeRecorded(c)), () => true);
  expect(readIntakeCheckpoint()).toBeNull();
});
it("跨患者、其他操作、过期恢复都不清未知保护", async () => {
  const c = await buildIntakeDecision(verified(), "1001", "ACCEPTED");
  await rememberIntakeCheckpoint(
    recoveryReference.submissionId,
    c,
    () => true,
    SIM_ACTOR,
  );
  await expect(
    reconcileIntakeCheckpoint(verified(intakeRecorded(c)), () => false),
  ).rejects.toThrow();
  const r = verified(intakeRecorded(c));
  r.current.patient.id = "802";
  await expect(reconcileIntakeCheckpoint(r, () => true)).rejects.toThrow();
  expect(readIntakeCheckpoint()).not.toBeNull();
});
