import { collectionRecoveryResult } from "./collectionRecovery.fixtures";
import { recoveredLabelIdentity, labelSessionReady } from "./recoveredLabels";

it("部分采集仅投影实际已采集管，不包含取消或剩余管", () => {
  const result = collectionRecoveryResult();
  expect(recoveredLabelIdentity(result)).toEqual({
    orderId: "701",
    labNumber: "SIM-COLLECTION-701",
    patientName: "模拟患者",
    samples: [
      { sampleItemId: "1001", sortOrder: "1", sampleTypeName: "Serum" },
    ],
  });
  expect(result.current.requestedSpecimens).toHaveLength(3);
});
it.each([
  "logical-id",
  "missing-date",
  "voided",
  "rejected",
  "suffix",
  "type",
  "inactive",
  "patient",
  "duplicate",
])("拒绝不可靠管码或采集事实：%s", (kind) => {
  const result = collectionRecoveryResult(),
    tube = result.current.physicalSpecimens[0];
  if (kind === "logical-id") tube.id = "901";
  if (kind === "missing-date") tube.collectionDate = null;
  if (kind === "voided") tube.voided = true;
  if (kind === "rejected") tube.rejected = true;
  if (kind === "suffix") tube.sortOrder = "0";
  if (kind === "type") tube.typeOfSampleId = "99";
  if (kind === "inactive")
    result.current.collectionContext.masterData[0].active = false;
  if (kind === "patient") result.current.patient.id = "802";
  if (kind === "duplicate") result.current.physicalSpecimens.push({ ...tube });
  expect(() => recoveredLabelIdentity(result)).toThrow("INVALID_CURRENT");
});
it("环境申请明确未适配，不补造临床患者", () => {
  const result = collectionRecoveryResult();
  result.current.workflowType = "environmental";
  expect(() => recoveredLabelIdentity(result)).toThrow("UNSUPPORTED");
});
it("没有采集实管不能生成", () => {
  const result = collectionRecoveryResult();
  result.current.requestedSpecimens = [];
  result.current.physicalSpecimens = [];
  expect(() => recoveredLabelIdentity(result)).toThrow("NO_COLLECTED");
});
it("旧会话提供者暴露的加载失败/校验中不能继续写入", () => {
  expect(labelSessionReady({ errorLoadingSessionDetails: true })).toBe(false);
  expect(labelSessionReady({ isCheckingLogin: () => true })).toBe(false);
  expect(
    labelSessionReady({
      isCheckingLogin: () => {
        throw new Error();
      },
    }),
  ).toBe(false);
  expect(labelSessionReady({ isCheckingLogin: () => false })).toBe(true);
});
