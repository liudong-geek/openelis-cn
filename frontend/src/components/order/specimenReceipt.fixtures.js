import { collectionRecoveryResult } from "./collectionRecovery.fixtures";

export function receiptFixture() {
  const result = collectionRecoveryResult();
  result.current.physicalSpecimens[0].lastUpdated =
    "2026-09-13T06:10:00.123456Z";
  result.current.physicalSpecimens[0].collectionDate =
    "2026-09-13T06:10:00.123456Z";
  return result;
}
export function receivedFixture(command) {
  const result = receiptFixture();
  command.tubes.forEach((t) => {
    result.current.physicalSpecimens.find(
      (i) => i.id === t.sampleItemId,
    ).receivedDate = t.receivedDate;
  });
  return result;
}
export const receiptResponse = (command) => ({
  ...command,
  success: true,
  tubes: command.tubes.map((t) => ({ ...t, replayed: false })),
});

export function twoTubeReceiptFixture() {
  const result = receiptFixture();
  result.current.requestedSpecimens[1].status = "COLLECTED";
  result.current.requestedSpecimens[1].sampleItemId = "1002";
  const second = JSON.parse(
    JSON.stringify(result.current.physicalSpecimens[0]),
  );
  Object.assign(second, { id: "1002", requestId: "902", sortOrder: "2" });
  second.analyses[0].id = "1102";
  result.current.physicalSpecimens.push(second);
  return result;
}
