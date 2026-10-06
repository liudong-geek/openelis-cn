export const session = {
  authenticated: true,
  userId: "1",
  sessionId: "nce-session",
  roles: ["Reception"],
  userLabRolesMap: { AllLabUnits: ["Reception"] },
  loginLabUnit: "AllLabUnits",
  csrf: "masked-csrf",
};
export const version = "2026-10-06 08:01:02.123456";
export const query = { keyword: "", status: "", categoryId: "", severity: "" };
export const category = {
  id: "3",
  name: "Sample",
  displayKey: "nce.category.sample",
  types: [
    {
      id: "4",
      name: "Coagulated Sample",
      displayKey: "nce.type.coagulatedSample",
    },
    { id: "5", name: "本地自定义类型", displayKey: "custom.local" },
  ],
};
export const metadata = () => ({
  queryVersion: "2",
  currentUserId: "1",
  effectiveScope: { roleIds: ["2"], sectionIds: ["3"] },
  canCreate: true,
  createUnavailableReason: null,
  reporter: { firstName: "洋", lastName: "刘", loginName: "reporter" },
  reportingUnits: [{ id: "3", name: "生化专业组" }],
  categories: [category],
  warningCodes: [],
});
export const order = (n = 1) => ({
  sampleId: String(n),
  labNumber: `HMC0000${n}`,
  lastupdated: version,
  patient: { patientId: String(n), lastName: "测试", firstName: "患者" },
  specimens: [
    {
      sampleItemId: String(n * 10),
      lastupdated: version,
      externalId: `PIPE-${n}`,
      typeName: "血液",
      statusId: "2",
      analyses: [
        {
          analysisId: String(n * 100),
          testId: "9",
          testName: "血糖",
          lastupdated: version,
          statusId: "4",
        },
      ],
    },
  ],
});
export const event = (n = 1, status = "Pending") => ({
  id: String(n),
  eventId: String(n),
  lastupdated: version,
  nceNumber: `NCE-2026-${String(n).padStart(5, "0")}`,
  title: `事件 ${n}`,
  description: "测试登记描述",
  status,
  statusCode: status,
  severity: "MINOR",
  nceCategoryId: "3",
  nceTypeId: "4",
  canAcknowledge: status === "Pending",
  canAddNote: true,
  canAssign: true,
  actionUnavailableReason: null,
  attachments: [],
  history: [],
  notes: [],
  linkedSpecimens: [],
  dateOfEvent: "2026-10-06",
  nameOfReporter: "刘洋",
});
export const workspace = (
  page = 1,
  size = 25,
  filters = query,
  total = page === 2 ? 26 : 1,
) => ({
  ...metadata(),
  query: { ...filters, page, pageSize: size },
  paging: {
    currentPage: Math.min(page, Math.ceil(total / size) || 1),
    totalPages: Math.ceil(total / size),
    pageSize: size,
    totalResults: total,
  },
  nceList: total ? [event(page === 1 ? 1 : 26)] : [],
});
export const orders = (
  q = { searchType: "labNumber", value: "HMC00001" },
  list = [order()],
) => ({
  ...metadata(),
  query: { ...q, page: 1, pageSize: 10 },
  paging: {
    currentPage: 1,
    totalPages: list.length ? 1 : 0,
    pageSize: 10,
    totalResults: list.length,
  },
  orders: list,
});
export const receipt = (requestId, operation = "CREATE", eventId = "1") => ({
  queryVersion: "2",
  currentUserId: "1",
  requestId,
  operation,
  requestHash: "a".repeat(64),
  outcome: "APPLIED",
  eventId,
  nceNumber: "NCE-2026-00001",
  statusCode: operation === "CREATE" ? "Pending" : "Under Investigation",
  lastupdated: "2026-10-06 09:11:12.345",
  linkedSpecimens: [],
  attachments: [],
});
export const jsonResponse = (v, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
export const urlPath = (url) => new URL(url, "http://localhost").pathname;
