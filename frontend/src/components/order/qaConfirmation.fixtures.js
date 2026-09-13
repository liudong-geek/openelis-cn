import { twoTubeReceiptFixture } from "./specimenReceipt.fixtures";
import { QA_SCOPE } from "./qaConfirmation";

export function qaFixture() {
  const result = twoTubeReceiptFixture();
  result.current.physicalSpecimens.forEach((t) => {
    t.receivedDate = "2026-09-13T07:10:00.123456Z";
  });
  result.current.qaReview = {
    schema: 1,
    scope: QA_SCOPE,
    state: "NOT_CONFIRMED",
    reason: "请逐项核对当前全部实管后明确确认。",
    currentFactsDigest: "b".repeat(64),
    checklistVersion: null,
    specimenIds: ["1001", "1002"],
    checklistItems: [
      {
        id: "41",
        key: "identity",
        label: "标本条码与患者信息一致",
        sortOrder: 1,
        lastUpdated: "2026-09-13T06:00:00.123456Z",
      },
      {
        id: "42",
        key: "integrity",
        label: "标本容器完整，采集和签收记录已核对",
        sortOrder: 2,
        lastUpdated: "2026-09-13T06:00:00Z",
      },
    ],
    confirmationId: null,
    reviewedAt: null,
    reviewerId: null,
    currentAcceptanceVerified: false,
  };
  return result;
}
export function qaMatched(command, source = qaFixture()) {
  const result = JSON.parse(JSON.stringify(source));
  Object.assign(result.current.qaReview, {
    state: "MATCHED_CONFIRMATION",
    confirmationId: command.confirmationId,
    checklistVersion: "2026-09-14T01:00:00.123456Z",
    reviewedAt: "2026-09-14T01:00:00.123456Z",
    reviewerId: 7,
  });
  return result;
}
export const qaAck = (command) => ({
  sampleId: command.sampleId,
  confirmationId: command.confirmationId,
  scope: QA_SCOPE,
  replayed: false,
  readbackRequired: true,
  currentAcceptanceVerified: false,
});
