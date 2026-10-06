export const session = {
  authenticated: true,
  userId: "7",
  sessionId: "unit-session-a",
  roles: ["Reception"],
  loginLabUnit: "临床检验组",
  userLabRolesMap: { AllLabUnits: ["Reception"] },
  csrf: "masked-a",
};
export const rawNumber = "HMC-00004/管 A+&";
export const savedOrder = (labNumber = rawNumber) => ({
  queryVersion: "2",
  currentUserId: "7",
  query: { labNumber },
  orderId: "4",
  labNumber,
  readOnly: true,
  canModify: true,
  isEditable: true,
  modifyUnavailableReason: null,
  warningCodes: [],
  patient: {
    patientId: "4",
    firstName: "洋",
    lastName: "刘",
    gender: "F",
    birthDate: "1990-01-01",
    nationalId: null,
  },
  sampleOrderItems: {
    referringSiteName: null,
    referringSiteDepartmentName: null,
    providerFirstName: "雅宁",
    providerLastName: "李",
    requestDate: "2026/09/28",
    priority: "ROUTINE",
  },
  samples: ["31", "32"].map((sampleItemId, i) => ({
    sampleItemId,
    sortOrder: String(i + 1),
    barcode: i ? null : "TUBE-REAL-31",
    sampleTypeId: "1",
    typeName: "全血",
    statusId: "4",
    statusCode: "Entered",
    statusName: "已登记",
    statusType: "SAMPLE",
    lastupdated: "2026-10-06T01:02:03.123456Z",
    collectionDate: "2026/09/28",
    collectionTime: "10:30",
    receivedDate: "2026/09/28",
    receivedTime: "10:45",
    quantity: 2,
    unitOfMeasureName: "mL",
    analyses: [
      {
        analysisId: String(101 + i),
        testId: "401",
        testName: "白细胞计数",
        panelId: null,
        panelName: null,
        statusId: "4",
        statusCode: "NotStarted",
        statusName: "未开始",
        statusType: "ANALYSIS",
        lastupdated: "2026-10-06T01:02:03.123456Z",
        warningCodes: [],
      },
    ],
    warningCodes: i ? ["BARCODE_UNVERIFIED"] : [],
  })),
  requests: [
    {
      sampleTypeRequestId: "61",
      sampleItemId: null,
      sortOrder: 1,
      sampleTypeId: "2",
      typeName: "血清",
      status: "REQUESTED",
      lastupdated: "2026-10-06T01:02:03.123456Z",
      tests: [{ testId: "501", testName: "总蛋白" }],
      panels: [],
      warningCodes: [],
    },
  ],
});
export const jsonResponse = (value, status = 200, type = "application/json") =>
  new Response(typeof value === "string" ? value : JSON.stringify(value), {
    status,
    headers: { "Content-Type": type },
  });
export const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
