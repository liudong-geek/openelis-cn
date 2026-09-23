import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";

const initial = {
  id: "0",
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  patientId: "501",
  accessionNumber: "SIM-READBACK-301",
  testName: "模拟保存核对",
  resultType: "N",
  resultValue: "",
  resultId: "",
  analysisLastupdated: "1000",
  analysisStatusId: "4",
  reportable: "Y",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
let requests, committed, records, pendingRead, notifications, session;
beforeEach(() => {
  requests = [];
  committed = { ...initial };
  records = [{ ...initial }];
  pendingRead = [];
  notifications = vi.fn();
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM-SESSION",
      csrf: "SIM-CSRF",
      loginName: "SIM-USER",
      roles: ["Results"],
    },
  };
  localStorage.setItem("CSRF", "SIM-CSRF");
  window.history.replaceState({}, "", "/Results");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init = {}) => {
      const parsed = new URL(String(url), "http://localhost"),
        path = parsed.pathname;
      requests.push({ path, query: parsed.searchParams, init });
      if (path.endsWith("/session"))
        return json({ ...session.userSessionDetails, csrf: "SIM-OTHER-MASK" });
      if (
        path.endsWith("/results-entry/lab-units") ||
        path.endsWith("/analysis-status-types")
      )
        return json([]);
      if (path.endsWith("/results-entry/pending"))
        return json({ testResult: records });
      if (path.endsWith("/LogbookResults"))
        return new Promise((resolve) => pendingRead.push(resolve));
      if (path.endsWith("/results-entry/presence")) return json({});
      if (path.endsWith("/esig/enabled")) return json({ enabled: false });
      if (path.endsWith("/analysis/101/result")) {
        const item = JSON.parse(init.body).testResult;
        committed = {
          ...item,
          rawResultValue: item.resultValue,
          resultId: "601",
          analysisLastupdated: String(
            Number(committed.analysisLastupdated) + 1000,
          ),
          analysisStatusId: "15",
        };
        // Actual pending Loader omits this optional identifier; Logbook adds it.
        if (item.patientId === null) committed.patientId = "501";
        if (
          item.resultType === "M" &&
          item.multiSelectResultValues === '{"0":"11"}'
        )
          committed.resultId = "602";
        records = records.map((row) =>
          row.analysisId !== item.analysisId
            ? row
            : {
                ...row,
                ...(row.testResultComponentId === item.testResultComponentId
                  ? committed
                  : {}),
                analysisLastupdated: committed.analysisLastupdated,
                analysisStatusId: "15",
              },
        );
        return json({
          analysisLastupdated: committed.analysisLastupdated,
          analysisStatusId: "15",
          reflex: [],
          calculated: [],
        });
      }
      throw Error("Unexpected SIM request");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const view = () => (
  <MemoryRouter>
    <IntlProvider locale="zh" messages={zh}>
      <UserSessionDetailsContext.Provider value={session}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" } }}
        >
          <NotificationContext.Provider
            value={{
              addNotification: notifications,
              setNotificationVisible: () => {},
              notificationVisible: false,
            }}
          >
            <UnifiedResults />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const tr = () => within(screen.getByText("模拟保存核对").closest("tr"));
const writes = () =>
  requests.filter((r) => r.path.endsWith("/analysis/101/result"));
const save = async (value = "0") => {
  await screen.findByText("模拟保存核对");
  fireEvent.change(tr().getByRole("spinbutton"), { target: { value } });
  fireEvent.click(tr().getByRole("button", { name: "保存" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  await waitFor(() => expect(pendingRead).toHaveLength(1));
};
const reply = async (body = { testResult: records }, status = 200) =>
  act(async () => pendingRead.shift()(json(body, status)));
test("保存后先独立读回真实ID，再次编辑更新同一记录而不新增", async () => {
  render(view());
  await save();
  expect(tr().queryByRole("button", { name: "编辑" })).toBeNull();
  expect(notifications).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: "success" }),
  );
  const read = requests.find((r) => r.path.endsWith("/LogbookResults"));
  expect(read.query.get("labNumber")).toBe("SIM-READBACK-301");
  await reply();
  await waitFor(() =>
    expect(tr().getByRole("button", { name: "编辑" })).toBeEnabled(),
  );
  expect(tr().getByText("0")).toBeInTheDocument();
  fireEvent.click(tr().getByRole("button", { name: "编辑" }));
  fireEvent.change(tr().getByRole("spinbutton"), { target: { value: "5" } });
  fireEvent.click(tr().getByRole("button", { name: "保存" }));
  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(JSON.parse(writes()[1].init.body).testResult).toMatchObject({
    resultId: "601",
    analysisLastupdated: "2000",
    resultValue: "5",
  });
  await waitFor(() => expect(pendingRead).toHaveLength(1));
  await reply();
  await waitFor(() => expect(tr().getByText("5")).toBeInTheDocument());
});
test("待录入患者编号为空时，保存后独立查询补全编号并可再次编辑", async () => {
  records = [{ ...initial, patientId: null }];
  render(view());
  await save();
  expect(JSON.parse(writes()[0].init.body).testResult.patientId).toBeNull();
  await reply();
  await waitFor(() =>
    expect(tr().getByRole("button", { name: "编辑" })).toBeEnabled(),
  );
  fireEvent.click(tr().getByRole("button", { name: "编辑" }));
  fireEvent.click(tr().getByRole("button", { name: "保存" }));
  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(JSON.parse(writes()[1].init.body).testResult).toMatchObject({
    patientId: "501",
    sampleItemId: "201",
    resultId: "601",
    analysisLastupdated: "2000",
  });
  await waitFor(() => expect(pendingRead).toHaveLength(1));
  await reply();
});
test.each([
  {},
  { testResult: [] },
  {
    testResult: [
      {
        ...initial,
        resultId: "601",
        resultValue: "8",
        analysisLastupdated: "2000",
        analysisStatusId: "15",
      },
    ],
  },
])("读回缺失或值不匹配时保留本地0且不允许重发：%j", async (body) => {
  render(view());
  await save();
  await reply(body);
  await waitFor(() =>
    expect(notifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" }),
    ),
  );
  expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  expect(tr().queryByRole("button", { name: "编辑" })).toBeNull();
  expect(tr().queryByRole("button", { name: "保存" })).toBeNull();
  expect(writes()).toHaveLength(1);
  expect(notifications).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: "success" }),
  );
});
test("读回403清除患者及结果，迟到响应不能恢复权限", async () => {
  render(view());
  await save();
  await reply({}, 403);
  await waitFor(() => expect(screen.queryByText("模拟保存核对")).toBeNull());
  expect(writes()).toHaveLength(1);
  expect(notifications).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: "success" }),
  );
});
test("读回期间换人，旧成功不恢复旧患者或编辑能力", async () => {
  const app = render(view());
  await save();
  session = {
    userSessionDetails: {
      ...session.userSessionDetails,
      userId: "702",
      sessionId: "SIM-NEW",
    },
  };
  app.rerender(view());
  await reply();
  expect(screen.queryByText("模拟保存核对")).toBeNull();
  expect(notifications).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: "success" }),
  );
  expect(writes()).toHaveLength(1);
});
test("重新查询后迟到读回不覆盖新列表，也不保留无期限加载提示", async () => {
  render(view());
  await save();
  fireEvent.click(
    screen.getByRole("button", { name: zh["results.workbench.applyFilters"] }),
  );
  await reply();
  await waitFor(() =>
    expect(
      screen.queryByText(zh["results.workbench.savingAndChecking"]),
    ).toBeNull(),
  );
  expect(tr().queryByRole("button", { name: "编辑" })).toBeNull();
  expect(notifications).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: "success" }),
  );
  expect(writes()).toHaveLength(1);
});
test("重新查询后迟到403仍撤销同一会话的数据展示", async () => {
  render(view());
  await save();
  fireEvent.click(
    screen.getByRole("button", { name: zh["results.workbench.applyFilters"] }),
  );
  await reply({}, 403);
  await waitFor(() => expect(screen.queryByText("模拟保存核对")).toBeNull());
  expect(writes()).toHaveLength(1);
});
test.each([
  ["N", "5", "5.00", "spinbutton"],
  ["A", "反应(复检)", "反应", "textbox"],
])(
  "%s重开编辑使用原始值，不能把展示格式写回",
  async (resultType, raw, display, role) => {
    records = [{ ...initial, resultType }];
    render(view());
    await screen.findByText("模拟保存核对");
    fireEvent.change(tr().getByRole(role), { target: { value: raw } });
    fireEvent.click(tr().getByRole("button", { name: "保存" }));
    await waitFor(() => expect(pendingRead).toHaveLength(1));
    await reply({ testResult: [{ ...committed, resultValue: display }] });
    await waitFor(() =>
      expect(tr().getByRole("button", { name: "编辑" })).toBeEnabled(),
    );
    expect(tr().getByText(display, { exact: true })).toBeInTheDocument();
    fireEvent.click(tr().getByRole("button", { name: "编辑" }));
    expect(tr().getByRole(role)).toHaveValue(
      resultType === "N" ? Number(raw) : raw,
    );
    fireEvent.click(tr().getByRole("button", { name: "保存" }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1].init.body).testResult).toMatchObject({
      resultId: "601",
      resultValue: raw,
    });
    await waitFor(() => expect(pendingRead).toHaveLength(1));
    await reply();
  },
);
test("同一项目其他组件的未保存输入在读回后单独保留", async () => {
  records = [
    { ...initial, testResultComponentId: "701" },
    { ...initial, testResultComponentId: "702", testName: "模拟兄弟组件" },
  ];
  render(view());
  await screen.findByText("模拟兄弟组件");
  const sibling = within(screen.getByText("模拟兄弟组件").closest("tr"));
  fireEvent.change(sibling.getByRole("spinbutton"), { target: { value: "6" } });
  await save();
  await reply();
  await waitFor(() =>
    expect(tr().getByRole("button", { name: "编辑" })).toBeEnabled(),
  );
  expect(
    screen.getByRole("region", { name: "本页输入核对" }),
  ).toHaveTextContent("6");
  expect(sibling.queryByRole("button", { name: "保存" })).toBeNull();
  expect(writes()).toHaveLength(1);
});
test("多选全部替换后使用读回的新代表编号继续编辑", async () => {
  records = [
    {
      ...initial,
      resultType: "M",
      resultValue: "甲",
      resultId: "601",
      analysisStatusId: "15",
      multiSelectResultValues: '{"0":"10"}',
      dictionaryResults: [
        { id: "10", value: "选项甲" },
        { id: "11", value: "选项乙" },
      ],
    },
  ];
  render(view());
  await screen.findByText("模拟保存核对");
  fireEvent.click(tr().getByRole("button", { name: "编辑" }));
  // Carbon autoAlign uses Floating UI's hide() middleware. JSDOM otherwise
  // supplies zero-sized reference/viewport boxes, so asynchronous positioning
  // hides an open menu. Model only this control's visible geometry: keep the
  // real floating component, accessible-option queries and selection checks.
  const viewport = document.documentElement;
  const dimensions = { clientWidth: 1280, clientHeight: 720 };
  const previousDimensions = Object.fromEntries(
    Object.keys(dimensions).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(viewport, key),
    ]),
  );
  for (const [key, value] of Object.entries(dimensions)) {
    Object.defineProperty(viewport, key, { configurable: true, value });
  }
  const trigger = tr().getByRole("combobox");
  const reference = trigger.closest(".cds--list-box__field--wrapper");
  const referenceRect = vi
    .spyOn(reference, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(400, 240, 300, 40));
  try {
    fireEvent.click(trigger);
    const firstOption = await screen.findByRole("option", { name: "选项甲" });
    const menu = screen.getByRole("listbox");
    await waitFor(() => expect(menu.style.position).toBe("fixed"));
    expect(menu).toBeVisible();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await act(async () => fireEvent.click(firstOption));
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "选项甲" })).toHaveAttribute(
        "aria-selected",
        "false",
      ),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("option", { name: "选项乙" })),
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "选项乙" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByRole("option", { name: "选项甲" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  } finally {
    referenceRect.mockRestore();
    for (const [key, descriptor] of Object.entries(previousDimensions)) {
      if (descriptor) Object.defineProperty(viewport, key, descriptor);
      else delete viewport[key];
    }
  }
  fireEvent.click(tr().getByRole("button", { name: "保存" }));
  await waitFor(() => expect(pendingRead).toHaveLength(1));
  expect(
    JSON.parse(writes()[0].init.body).testResult.multiSelectResultValues,
  ).toBe('{"0":"11"}');
  await reply();
  await waitFor(() =>
    expect(tr().getByRole("button", { name: "编辑" })).toBeEnabled(),
  );
  expect(tr().getByText("选项乙", { exact: true })).toBeInTheDocument();
  fireEvent.click(tr().getByRole("button", { name: "编辑" }));
  fireEvent.click(tr().getByRole("button", { name: "保存" }));
  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(JSON.parse(writes()[1].init.body).testResult).toMatchObject({
    resultId: "602",
    multiSelectResultValues: '{"0":"11"}',
  });
  await waitFor(() => expect(pendingRead).toHaveLength(1));
  await reply();
});
