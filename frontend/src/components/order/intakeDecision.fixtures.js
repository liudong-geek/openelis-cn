import { qaFixture } from "./qaConfirmation.fixtures";
export const SIM_ACTOR = "7";
export function intakeFixture() {
  const result = qaFixture();
  result.current.requestedSpecimens.forEach((r) => {
    r.lastUpdated = "2026-09-13T06:00:00.123456Z";
  });
  result.current.physicalSpecimens.forEach((t) =>
    t.analyses.forEach((a) => {
      a.lastUpdated = "2026-09-13T06:00:00.123456Z";
    }),
  );
  result.current.specimenDecisions = result.current.physicalSpecimens.map(
    (t) => ({
      sampleItemId: t.id,
      state: "NOT_RECORDED",
      recordedDecision: null,
      operationId: null,
      reason: null,
      decidedBy: null,
      decidedAt: null,
      evidenceDigest: null,
      currentAcceptanceVerified: false,
    }),
  );
  result.current.intakeReasons = {
    schema: 1,
    state: "READY",
    items: [
      {
        namespace: "DICTIONARY:resultRejectionReasons",
        id: "41",
        label: "模拟：容器不符合要求",
        version: "2026-09-13T06:00:00.123456Z",
      },
    ],
  };
  return result;
}
export const intakeAck = (command) => ({
  success: true,
  replayed: false,
  sampleId: command.sampleId,
  labNo: command.labNo,
  patientId: command.patientId,
  requestId: command.requestId,
  sampleItemId: command.sampleItemId,
  operationId: command.operationId,
  recordedDecision: command.decision,
  reason: command.reason,
  decidedBy: SIM_ACTOR,
  decidedAt: "2026-09-14T06:00:00.123456Z",
  currentAcceptanceVerified: false,
});
export function intakeRecorded(command, source = intakeFixture()) {
  const result = JSON.parse(JSON.stringify(source)),
    ack = intakeAck(command);
  Object.assign(
    result.current.specimenDecisions.find(
      (t) => t.sampleItemId === command.sampleItemId,
    ),
    {
      state: "RECORDED",
      recordedDecision: ack.recordedDecision,
      operationId: ack.operationId,
      reason: ack.reason,
      decidedBy: ack.decidedBy,
      decidedAt: ack.decidedAt,
      evidenceDigest: command.expectedEvidenceDigest,
    },
  );
  if (command.decision === "REJECTED") {
    const tube = result.current.physicalSpecimens.find(
      (t) => t.id === command.sampleItemId,
    );
    tube.rejected = true;
    tube.lastUpdated = ack.decidedAt;
  }
  return result;
}
