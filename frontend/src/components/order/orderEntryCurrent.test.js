import {
  verifyCurrentEntry,
  recoverCurrentEntrySubmission,
} from "./orderEntryCurrent";
import {
  rememberEntryCheckpoint,
  readEntryCheckpoint,
} from "./orderEntryRecovery";

export const reference = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  requestHash: "a".repeat(64),
};
export const currentResult = () => ({
  success: true,
  receipt: {
    version: 1,
    ...reference,
    hashVersion: "raw-json-v1",
    createdAt: "2026-09-13T06:00:00Z",
    sampleId: "701",
    labNo: "SIM-CURRENT-701",
    workflowType: "clinical",
    patientId: "801",
    labelRequests: [],
    requestedSpecimens: [0, 1, 2].map((i) => ({
      id: String(901 + i),
      sampleId: "701",
      sortOrder: i,
      typeOfSampleId: "11",
      requestedQuantity: 1,
      unitOfMeasureId: null,
      requestedTests: "31",
      requestedPanels: "",
      status: "REQUESTED",
      sampleItemId: null,
    })),
  },
  current: {
    version: 1,
    readOnly: true,
    sampleId: "701",
    labNo: "SIM-CURRENT-701",
    workflowType: "clinical",
    orderStatusId: "1",
    lastUpdated: "2026-09-13T06:20:00Z",
    patient: {
      id: "801",
      nationalId: "SIM-PATIENT",
      firstName: "",
      lastName: "模拟患者",
      gender: "F",
      birthDate: "2000-01-02",
    },
    requestedSpecimens: ["COLLECTED", "REQUESTED", "CANCELLED"].map(
      (status, i) => ({
        id: String(901 + i),
        sortOrder: i,
        typeOfSampleId: "11",
        requestedQuantity: 1,
        unitOfMeasureId: null,
        testIds: ["31"],
        panelIds: [],
        status,
        sampleItemId: i === 0 ? "1001" : null,
        createdAt: "2026-09-13T06:00:00Z",
        lastUpdated: null,
      }),
    ),
    physicalSpecimens: [
      {
        id: "1001",
        requestId: "901",
        sortOrder: "1",
        typeOfSampleId: "11",
        quantity: 0.5,
        unitOfMeasureId: null,
        statusId: "2",
        voided: false,
        rejected: false,
        collectionDate: "2026-09-13T06:10:00Z",
        receivedDate: null,
        collector: "SIM采集员",
        lastUpdated: null,
        analyses: [
          { id: "1101", testId: "31", statusId: "3", lastUpdated: null },
        ],
      },
    ],
  },
});
const response = (data = currentResult(), status = 200) => ({
  status,
  redirected: false,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => data,
});
afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

it("部分采集及取消与历史状态分开，返回独立只读快照", () => {
  const data = currentResult();
  const value = verifyCurrentEntry(data, reference);
  expect(value.current.requestedSpecimens.map((t) => t.status)).toEqual([
    "COLLECTED",
    "REQUESTED",
    "CANCELLED",
  ]);
  expect(
    value.receipt.requestedSpecimens.every((t) => t.status === "REQUESTED"),
  ).toBe(true);
  data.current.physicalSpecimens[0].quantity = 99;
  expect(value.current.physicalSpecimens[0].quantity).toBe(0.5);
});
it("只返回已验证的事实字段，不透传响应中的操作或能力指令", () => {
  const data = currentResult();
  const flags = {
    canCollect: true,
    canResume: true,
    resume: true,
    capabilities: { save: true },
    stepProgress: { collect: "complete" },
  };
  Object.assign(data.current, flags);
  Object.assign(data.current.patient, flags);
  Object.assign(data.current.requestedSpecimens[0], flags);
  Object.assign(data.current.physicalSpecimens[0], flags);
  Object.assign(data.current.physicalSpecimens[0].analyses[0], flags);
  const { current } = verifyCurrentEntry(data, reference);
  for (const facts of [
    current,
    current.patient,
    current.requestedSpecimens[0],
    current.physicalSpecimens[0],
    current.physicalSpecimens[0].analyses[0],
  ]) {
    for (const key of Object.keys(flags)) expect(facts).not.toHaveProperty(key);
  }
});
it.each([
  "2026-02-30T06:00:00Z",
  "2026-09-13T06:00:00",
  "2026-09-13T24:00:00Z",
])("事件时间不能接受无时区或自动滚日：%s", (value) => {
  const data = currentResult();
  data.current.physicalSpecimens[0].collectionDate = value;
  expect(() => verifyCurrentEntry(data, reference)).toThrow(
    "order.recovery.invalidCurrent",
  );
});
it.each([
  (d) => {
    d.success = false;
  },
  (d) => {
    delete d.current;
  },
  (d) => {
    d.current.readOnly = false;
  },
  (d) => {
    d.current.version = 2;
  },
  (d) => {
    d.current.sampleId = "702";
  },
  (d) => {
    d.current.labNo = "SIM-OTHER";
  },
  (d) => {
    d.current.patient.id = "802";
  },
  (d) => {
    d.current.patient.birthDate = "2000-02-30";
  },
  (d) => {
    d.current.workflowType = "environmental";
  },
  (d) => {
    d.current.orderStatusId = "";
  },
  (d) => {
    d.current.requestedSpecimens.pop();
  },
  (d) => {
    d.current.requestedSpecimens[1].id = "901";
  },
  (d) => {
    d.current.requestedSpecimens[1].status = "DONE";
  },
  (d) => {
    d.current.requestedSpecimens[1].sampleItemId = "1001";
  },
  (d) => {
    d.current.requestedSpecimens[0].sampleItemId = null;
  },
  (d) => {
    d.current.requestedSpecimens[0].testIds.push("31");
  },
  (d) => {
    d.current.requestedSpecimens[0].requestedQuantity = 0;
  },
  (d) => {
    d.current.physicalSpecimens = [];
  },
  (d) => {
    d.current.physicalSpecimens[0].requestId = "902";
  },
  (d) => {
    d.current.physicalSpecimens[0].typeOfSampleId = "12";
  },
  (d) => {
    d.current.physicalSpecimens.push({
      ...d.current.physicalSpecimens[0],
      id: "1002",
    });
  },
  (d) => {
    delete d.current.physicalSpecimens[0].voided;
  },
  (d) => {
    d.current.physicalSpecimens[0].rejected = "false";
  },
  (d) => {
    d.current.physicalSpecimens[0].analyses = [];
  },
  (d) => {
    d.current.physicalSpecimens[0].analyses[0].testId = "32";
  },
  (d) => {
    d.current.physicalSpecimens[0].analyses.push({
      ...d.current.physicalSpecimens[0].analyses[0],
    });
  },
  (d) => {
    d.current.physicalSpecimens[0].collectionDate = "not-a-date";
  },
])("不完整/错关联/未知状态不得作为当前核对结果 %#", (mutate) => {
  const data = currentResult();
  mutate(data);
  expect(() => verifyCurrentEntry(data, reference)).toThrow(
    "order.recovery.invalidCurrent",
  );
});
it("同显示排序的追加管、额外分析和异常事实保留，不据此放行", () => {
  const data = currentResult();
  data.current.requestedSpecimens.push({
    ...data.current.requestedSpecimens[1],
    id: "904",
    sortOrder: 0,
  });
  const item = data.current.physicalSpecimens[0];
  item.voided = true;
  item.rejected = true;
  item.analyses.push(
    { id: "1102", testId: "31", statusId: "4", lastUpdated: null },
    { id: "1103", testId: "32", statusId: "4", lastUpdated: null },
  );
  const value = verifyCurrentEntry(data, reference);
  expect(value.current.requestedSpecimens).toHaveLength(4);
  expect(value.current.physicalSpecimens[0].analyses).toHaveLength(3);
  expect(value.current.physicalSpecimens[0].voided).toBe(true);
  expect(value.current.canCollect).toBeUndefined();
});
it("当前接口不能拿纯历史响应冒充，原核对码不删除", async () => {
  rememberEntryCheckpoint(reference);
  const data = currentResult();
  delete data.current;
  const read = vi.fn().mockResolvedValue(response(data));
  await expect(
    recoverCurrentEntrySubmission({ reference, read, isCurrent: () => true }),
  ).rejects.toMatchObject({ errorKey: "order.recovery.invalidCurrent" });
  expect(read).toHaveBeenCalledWith(
    `/rest/SamplePatientEntry/submissions/${reference.submissionId}/current`,
    expect.any(AbortSignal),
  );
  expect(readEntryCheckpoint().checkpoint.submissionId).toBe(
    reference.submissionId,
  );
});
it("只有环境申请允许无患者", () => {
  const data = currentResult();
  data.receipt.workflowType = data.current.workflowType = "environmental";
  delete data.receipt.patientId;
  data.current.patient = null;
  expect(verifyCurrentEntry(data, reference).current.patient).toBeNull();
});
it("未知错误及409均保持核对，不暴露后端原文", async () => {
  const read = vi
    .fn()
    .mockResolvedValue(
      response({ success: false, message: "SIM-private" }, 409),
    );
  await expect(
    recoverCurrentEntrySubmission({ reference, read, isCurrent: () => true }),
  ).rejects.toMatchObject({ errorKey: "order.recovery.currentUnavailable" });
});
