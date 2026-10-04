export const copy = (value) => JSON.parse(JSON.stringify(value));
export const reflexFixture = {
  id: 1,
  lastupdated: 1700000000000,
  configurationVersion: "2026-10-04T01:00:00.123456Z",
  ruleName: "白细胞加做",
  overall: "ALL",
  active: true,
  toggled: true,
  analyteId: 40,
  conditions: [
    {
      id: 31,
      sampleId: "1",
      testId: "10",
      testName: "白细胞计数",
      relation: "GREATER_THAN",
      value: "10",
      value2: "0",
      testAnalyteId: 55,
    },
  ],
  actions: [
    {
      id: 41,
      sampleId: "1",
      reflexTestId: "11",
      reflexTestName: "白细胞分类",
      internalNote: "内部备注",
      externalNote: "报告备注",
      addNotification: "Y",
      testReflexId: 65,
    },
  ],
};
export const calculationFixture = {
  id: 2,
  lastupdated: 1700000000000,
  configurationVersion: "2026-10-04T01:00:00.123456Z",
  name: "计算示例",
  sampleId: 1,
  testId: 10,
  active: true,
  toggled: true,
  result: "",
  note: "保留备注",
  operations: [
    { id: 51, order: 0, type: "INTEGER", value: "1", sampleId: null },
  ],
};
export const sampleOptions = [
  { id: "1", value: "全血" },
  { id: "2", value: "血清" },
];
export const testOptions = [
  { id: "10", value: "白细胞计数", resultType: "N", resultList: [] },
  { id: "11", value: "白细胞分类", resultType: "N", resultList: [] },
];
export const reflexOptions = {
  overallOptions: [
    { value: "ALL", label: "All" },
    { value: "ANY", label: "Any" },
  ],
  numericRelationOptions: [
    "EQUALS",
    "GREATER_THAN",
    "BETWEEN",
    "INSIDE_NORMAL_RANGE",
    "OUTSIDE_NORMAL_RANGE",
  ].map((value) => ({ value, label: value })),
  generalRelationOptions: [
    "EQUALS",
    "NOT_EQUALS",
    "INSIDE_NORMAL_RANGE",
    "OUTSIDE_NORMAL_RANGE",
  ].map((value) => ({ value, label: value })),
};
export const makeServer = () => {
  const store = {
    reflex: [copy(reflexFixture)],
    calculation: [copy(calculationFixture)],
  };
  const calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, options: copy({ ...options, signal: undefined }) });
    if (path === "/rest/reflexrules")
      return { ok: true, status: 200, data: copy(store.reflex) };
    if (path === "/rest/test-calculations")
      return { ok: true, status: 200, data: copy(store.calculation) };
    if (path === "/rest/reflexrule-options")
      return { ok: true, status: 200, data: copy(reflexOptions) };
    if (path === "/rest/math-functions")
      return {
        ok: true,
        status: 200,
        data: [
          { id: "+", value: "加" },
          { id: "*", value: "乘以" },
        ],
      };
    if (path === "/rest/displayList/SAMPLE_TYPE_ACTIVE")
      return { ok: true, status: 200, data: copy(sampleOptions) };
    if (path.startsWith("/rest/test-display-beans-map"))
      return { ok: true, status: 200, data: { 1: copy(testOptions), 2: [] } };
    if (path.startsWith("/rest/test-display-beans?sampleType="))
      return {
        ok: true,
        status: 200,
        data: path.endsWith("1") ? copy(testOptions) : [],
      };
    const type = path.includes("test-calculation") ? "calculation" : "reflex";
    const id = path.split("/").pop();
    if (options.method === "POST") {
      if (/activate-|deactivate-/.test(path)) {
        const record = store[type].find((row) => String(row.id) === id);
        if (!record) return { ok: false, status: 404 };
        record.active = !path.includes("deactivate-");
        return { ok: true, status: 200, data: copy(record) };
      }
      const incoming = copy(options.body);
      const next = {
        ...incoming,
        id: incoming.id || 100,
        lastupdated: 1700000000001,
        configurationVersion: "2026-10-04T01:00:01.123456Z",
      };
      if (type === "reflex") {
        next.conditions.forEach((child, i) => {
          child.id ??= 1001 + i;
        });
        next.actions.forEach((child, i) => {
          child.id ??= 2001 + i;
        });
      } else
        next.operations.forEach((child, i) => {
          child.id ??= 3001 + i;
        });
      const index = store[type].findIndex((row) => row.id === next.id);
      if (index >= 0) store[type][index] = next;
      else store[type].push(next);
      return { ok: true, status: 200, data: copy(next) };
    }
    const found = store[type].find((row) => String(row.id) === id);
    return {
      ok: Boolean(found),
      status: found ? 200 : 404,
      data: copy(found || null),
    };
  };
  return { store, calls, request };
};

export const adminSession = {
  sessionPhase: "authenticated",
  userSessionDetails: {
    authenticated: true,
    userId: "1",
    sessionId: "test-session",
    csrf: "token",
    roles: ["Global Administrator"],
  },
};
