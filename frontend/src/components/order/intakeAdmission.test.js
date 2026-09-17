import { verifyIntakeAdmission, intakeAdmissionPath } from "./intakeAdmission";
import { verifyCurrentEntry } from "./orderEntryCurrent";
import { intakeFixture } from "./intakeDecision.fixtures";
import { recoveryReference } from "./collectionRecovery.fixtures";

import { admissionFixture } from "./intakeAdmission.fixtures";
const first = (result) =>
  result.current.specimenDecisions[0].resultEntryAdmission;
const verify = (result) => verifyCurrentEntry(result, recoveryReference);

it("准入独立于历史记录，完整匹配当前管及全部项目版本才可读出", () => {
  const result = verify(admissionFixture());
  expect(first(result).state).toBe("READY");
  expect(result.current.specimenDecisions[0].currentAcceptanceVerified).toBe(
    false,
  );
  expect(result.current.specimenDecisions[0].recordedDecision).toBeNull();
  expect(intakeAdmissionPath(result)).toBe(
    "/result?type=order&accessionNumber=SIM-COLLECTION-701&doRange=false",
  );
});

it.each([
  [
    "旧服务缺字段",
    (r) => {
      delete r.current.specimenDecisions[0].resultEntryAdmission;
    },
  ],
  [
    "null",
    (r) => {
      r.current.specimenDecisions[0].resultEntryAdmission = null;
    },
  ],
  [
    "伪READY",
    (r) => {
      first(r).analyses = [];
    },
  ],
  [
    "错申请",
    (r) => {
      first(r).sampleId = "702";
    },
  ],
  [
    "错管",
    (r) => {
      first(r).sampleItemId = "1002";
    },
  ],
  [
    "错管版本",
    (r) => {
      first(r).itemVersion = "2026-09-13T06:10:00.123457Z";
    },
  ],
  [
    "错成员",
    (r) => {
      first(r).analyses[0].analysisId = "1199";
    },
  ],
  [
    "错项目",
    (r) => {
      first(r).analyses[0].testId = "32";
    },
  ],
  [
    "错成员版本",
    (r) => {
      first(r).analyses[0].analysisVersion = "2026-09-13T06:00:00.123457Z";
    },
  ],
  [
    "版本缺失",
    (r) => {
      first(r).analyses[0].analysisVersion = null;
    },
  ],
  [
    "字符串allowed",
    (r) => {
      first(r).analyses[0].allowed = "true";
    },
  ],
  [
    "允许却有原因",
    (r) => {
      first(r).analyses[0].blockedReason = "error.results.specimenRejected";
    },
  ],
  [
    "拒绝却无原因",
    (r) => {
      first(r).state = "BLOCKED";
      first(r).analyses[0].allowed = false;
    },
  ],
  [
    "未知错误键",
    (r) => {
      first(r).state = "BLOCKED";
      first(r).analyses[0].allowed = false;
      first(r).analyses[0].blockedReason = "error.results.allowEverything";
    },
  ],
  [
    "状态计数不符",
    (r) => {
      first(r).state = "PARTIAL";
    },
  ],
  [
    "不可核实混入成员",
    (r) => {
      first(r).state = "UNAVAILABLE";
    },
  ],
  [
    "额外成员",
    (r) => {
      first(r).analyses.push({ ...first(r).analyses[0], analysisId: "1199" });
    },
  ],
])("%s仅将本管转为未核实，不能从历史或另一管补出权限", (_name, change) => {
  const raw = admissionFixture();
  change(raw);
  const result = verify(raw);
  expect(first(result)).toMatchObject({ state: "UNAVAILABLE", analyses: [] });
  expect(result.current.specimenDecisions[1].resultEntryAdmission.state).toBe(
    "READY",
  );
});

it("成员顺序可不同，但重复成员或漏成员均不可用", () => {
  const raw = admissionFixture();
  const tube = raw.current.physicalSpecimens[0];
  tube.analyses.push({ ...tube.analyses[0], id: "1199", testId: "32" });
  first(raw).analyses.push({
    ...first(raw).analyses[0],
    analysisId: "1199",
    testId: "32",
  });
  first(raw).analyses.reverse();
  expect(verifyIntakeAdmission(first(raw), raw.current, tube).state).toBe(
    "READY",
  );
  first(raw).analyses[1] = { ...first(raw).analyses[0] };
  expect(verifyIntakeAdmission(first(raw), raw.current, tube).state).toBe(
    "UNAVAILABLE",
  );
});

it("完整逐项权限及部分准入的状态必须按成员计数一致", () => {
  const raw = admissionFixture();
  const tube = raw.current.physicalSpecimens[0];
  tube.analyses.push({ ...tube.analyses[0], id: "1199", testId: "32" });
  first(raw).analyses.push({
    ...first(raw).analyses[0],
    analysisId: "1199",
    testId: "32",
    allowed: false,
    blockedReason: "order.intakeAdmission.permission",
  });
  first(raw).state = "PARTIAL";
  expect(verifyIntakeAdmission(first(raw), raw.current, tube).state).toBe(
    "PARTIAL",
  );
  first(raw).analyses[0].allowed = false;
  first(raw).analyses[0].blockedReason = "error.results.specimenIntakeChanged";
  first(raw).state = "BLOCKED";
  expect(verifyIntakeAdmission(first(raw), raw.current, tube).state).toBe(
    "BLOCKED",
  );
});

it("查询后当前版本改变或历史内容孤立存在，点击路径也不能借旧准入", () => {
  const result = verify(admissionFixture());
  result.current.physicalSpecimens.forEach((tube) => {
    tube.analyses[0].lastUpdated = "2026-09-15T06:00:00Z";
  });
  expect(intakeAdmissionPath(result)).toBeNull();
  expect(intakeAdmissionPath(verify(intakeFixture()))).toBeNull();
});
