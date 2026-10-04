import React from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import messages from "../../../languages/zh.json";
import {
  makeServer,
  reflexFixture,
  calculationFixture,
  copy,
  testOptions,
  adminSession,
} from "./testFixture";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("./ruleApi", async (importOriginal) => ({
  ...(await importOriginal()),
  ruleRequest: request,
}));
import RulesWorkspace from "./RulesWorkspace";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname + location.search}
    </output>
  );
}
const mount = (entry = "/MasterListsPage/rulesWorkspace", props = {}) =>
  render(
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider value={adminSession}>
        <MemoryRouter initialEntries={[entry]}>
          <RulesWorkspace {...props} />
          <LocationProbe />
        </MemoryRouter>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );
let server;
beforeEach(() => {
  request.mockClear();
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
  server = makeServer();
  request.mockImplementation(server.request);
});
afterEach(cleanup);
const editReflex = async () => {
  await screen.findByText("白细胞加做");
  const row = screen.getByText("白细胞加做").closest("tr");
  await userEvent.click(within(row).getByRole("button", { name: "编辑" }));
  await screen.findByDisplayValue("白细胞加做");
  await waitFor(() =>
    expect(document.getElementById("condition-0-test")).not.toBeDisabled(),
  );
};
const saveButton = () =>
  screen.getByRole("button", { name: "保存", exact: true });

test("default shows two persisted types without an empty editor; query/type/status preserve URL", async () => {
  mount();
  await screen.findByText("白细胞加做");
  expect(screen.getByText("计算示例")).toBeInTheDocument();
  expect(screen.queryByLabelText("规则名称")).toBeNull();
  await userEvent.selectOptions(
    document.getElementById("rules-type"),
    "calculation",
  );
  expect(screen.queryByText("白细胞加做")).toBeNull();
  expect(screen.getByTestId("location")).toHaveTextContent("type=calculation");
  await userEvent.type(document.getElementById("rules-search"), "计算");
  expect(screen.getByTestId("location").textContent).toContain(
    "q=%E8%AE%A1%E7%AE%97",
  );
  await userEvent.selectOptions(
    document.getElementById("rules-state"),
    "inactive",
  );
  expect(screen.getByText("未找到符合当前条件的规则。")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("state=inactive");
});
test("empty lists show empty state; malformed or failed list does not become an empty success", async () => {
  server.store.reflex = [];
  server.store.calculation = [];
  mount();
  await screen.findByText("尚未配置检验规则，可新增加做规则或计算规则。");
  expect(screen.queryByLabelText("规则名称")).toBeNull();
  cleanup();
  request.mockImplementation(async (path) =>
    path === "/rest/reflexrules"
      ? { ok: false, status: 403, data: [] }
      : server.request(path),
  );
  mount();
  await screen.findByText("规则或编辑选项加载失败，请核对访问权限后重新加载。");
  expect(
    screen.queryByText("尚未配置检验规则，可新增加做规则或计算规则。"),
  ).toBeNull();
});
test("detail uses actual ID; failed save keeps payload identity/version/notes and draft", async () => {
  const handler = server.request;
  request.mockImplementation((path, options) =>
    options?.method === "POST" && path === "/rest/reflexrule"
      ? Promise.resolve({ ok: false, status: 409 })
      : handler(path, options),
  );
  mount("/MasterListsPage/rulesWorkspace?q=%E7%99%BD&type=reflex");
  await editReflex();
  await userEvent.type(document.getElementById("rule-editor-name"), "新");
  await userEvent.click(saveButton());
  await screen.findByText(
    "规则已被修改或存在配置冲突。请记录当前输入，再取消并重新打开核对。",
  );
  const body = request.mock.calls.find(
    ([path, options]) =>
      path === "/rest/reflexrule" && options?.method === "POST",
  )[1].body;
  expect(body).toMatchObject({
    id: 1,
    analyteId: 40,
    active: true,
    lastupdated: reflexFixture.lastupdated,
    configurationVersion: reflexFixture.configurationVersion,
    ruleName: "白细胞加做新",
  });
  expect(body.conditions[0]).toMatchObject({ id: 31, testAnalyteId: 55 });
  expect(body.actions[0]).toMatchObject({
    id: 41,
    testReflexId: 65,
    internalNote: "内部备注",
    externalNote: "报告备注",
    addNotification: "Y",
  });
  expect(document.getElementById("rule-editor-name")).toHaveValue(
    "白细胞加做新",
  );
  expect(saveButton()).not.toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "取消", exact: true }),
  );
  await screen.findByText("尚有未保存的修改");
  await userEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(document.getElementById("rule-editor-name")).toHaveValue(
    "白细胞加做新",
  );
});
test("save request locks fields/cancel and prevents double submission, then verifies by exact ID", async () => {
  let resolvePost;
  const handler = server.request;
  request.mockImplementation((path, options) =>
    path === "/rest/reflexrule" && options?.method === "POST"
      ? new Promise((resolve) => {
          resolvePost = async () => resolve(await handler(path, options));
        })
      : handler(path, options),
  );
  mount();
  await editReflex();
  await userEvent.type(document.getElementById("rule-editor-name"), "新版");
  await userEvent.dblClick(saveButton());
  expect(document.getElementById("rule-editor-name")).toBeDisabled();
  expect(document.getElementById("condition-0-sample")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "取消", exact: true }),
  ).toBeDisabled();
  await userEvent.keyboard("{Escape}");
  expect(document.getElementById("rule-editor-name")).toBeInTheDocument();
  expect(
    request.mock.calls.filter(
      ([path, options]) =>
        path === "/rest/reflexrule" && options?.method === "POST",
    ),
  ).toHaveLength(1);
  await resolvePost();
  await screen.findByText("规则已保存并核对。");
  await screen.findByText("白细胞加做新版");
  expect(
    request.mock.calls.filter(([path]) => path === "/rest/reflexrule/1").length,
  ).toBeGreaterThanOrEqual(2);
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/MasterListsPage/rulesWorkspace",
  );
});
test.each([0, 500])(
  "unknown update status %s reads exact identity; mismatch locks draft, verify only reads and never repeats POST",
  async (status) => {
    const handler = server.request;
    request.mockImplementation((path, options) =>
      path === "/rest/reflexrule" && options?.method === "POST"
        ? Promise.resolve({ ok: false, status })
        : handler(path, options),
    );
    mount();
    await editReflex();
    await userEvent.type(document.getElementById("rule-editor-name"), "核对");
    await userEvent.click(saveButton());
    await screen.findByText(
      "保存结果尚未确认，输入已锁定。点击“核对保存结果”读取当前记录，系统不会重复提交。",
    );
    expect(document.getElementById("rule-editor-name")).toBeDisabled();
    server.store.reflex[0].ruleName = "白细胞加做核对";
    await userEvent.click(screen.getByRole("button", { name: "核对保存结果" }));
    await screen.findByText("规则已保存并核对。");
    expect(
      request.mock.calls.filter(
        ([path, options]) =>
          path === "/rest/reflexrule" && options?.method === "POST",
      ),
    ).toHaveLength(1);
  },
);
test.each([0, 500])(
  "unknown creation status %s with no identity remains pending across close/reopen/remount and cannot resubmit",
  async (status) => {
    const handler = server.request;
    request.mockImplementation((path, options) =>
      path === "/rest/test-calculation" && options?.method === "POST"
        ? Promise.resolve({ ok: false, status })
        : handler(path, options),
    );
    mount();
    await screen.findByText("计算示例");
    await userEvent.click(screen.getByRole("button", { name: "新增计算规则" }));
    await screen.findByLabelText("规则名称");
    await userEvent.type(document.getElementById("rule-editor-name"), "新公式");
    await userEvent.selectOptions(
      document.getElementById("operation-0-type"),
      "INTEGER",
    );
    await userEvent.type(document.getElementById("operation-0-value"), "2");
    await userEvent.selectOptions(
      document.getElementById("calculation-output-sample"),
      "1",
    );
    await waitFor(() =>
      expect(
        document.getElementById("calculation-output-test"),
      ).not.toBeDisabled(),
    );
    await userEvent.selectOptions(
      document.getElementById("calculation-output-test"),
      "10",
    );
    await userEvent.click(saveButton());
    await screen.findByText(
      "未收到新增规则编号，保存结果待核实。当前表单不能再次提交，请先返回列表核对是否已创建。",
    );
    expect(screen.getByRole("button", { name: "核对保存结果" })).toBeDisabled();
    expect(
      request.mock.calls.filter(
        ([path, options]) =>
          path === "/rest/test-calculation" && options?.method === "POST",
      ),
    ).toHaveLength(1);
    await userEvent.click(
      screen.getByRole("button", { name: "取消", exact: true }),
    );
    await screen.findByText("尚有未保存的修改");
    await userEvent.click(
      screen.getByRole("button", { name: "放弃修改并返回" }),
    );
    expect(screen.getByRole("button", { name: "新增计算规则" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "新增加做规则" }),
    ).not.toBeDisabled();
    cleanup();
    mount("/MasterListsPage/calculatedValue", { defaultType: "calculation" });
    await screen.findByText("计算示例");
    expect(screen.getByRole("button", { name: "新增计算规则" })).toBeDisabled();
    expect(
      request.mock.calls.filter(
        ([path, options]) =>
          path === "/rest/test-calculation" && options?.method === "POST",
      ),
    ).toHaveLength(1);
  },
);
test("invalid formula is rejected without a write; correcting it can save with operation identities retained", async () => {
  mount();
  await screen.findByText("计算示例");
  await userEvent.click(
    within(screen.getByText("计算示例").closest("tr")).getByRole("button", {
      name: "编辑",
    }),
  );
  await screen.findByDisplayValue("计算示例");
  await waitFor(() =>
    expect(
      document.getElementById("calculation-output-test"),
    ).not.toBeDisabled(),
  );
  await userEvent.clear(document.getElementById("operation-0-value"));
  await userEvent.type(document.getElementById("operation-0-value"), "bad");
  await userEvent.click(saveButton());
  await screen.findByText(
    "请完善输出项目和有序的公式步骤，检验结果输入须为数值，公式须使用受支持的运算符。",
  );
  expect(
    request.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
  await userEvent.clear(document.getElementById("operation-0-value"));
  await userEvent.type(document.getElementById("operation-0-value"), "-0.5");
  await userEvent.click(saveButton());
  await screen.findByText("规则已保存并核对。");
  const body = request.mock.calls.find(
    ([path, options]) =>
      path === "/rest/test-calculation" && options?.method === "POST",
  )[1].body;
  expect(body).toMatchObject({
    id: 2,
    configurationVersion: calculationFixture.configurationVersion,
    active: true,
    note: "保留备注",
    operations: [
      { id: 51, order: 0, type: "INTEGER", value: "-0.5", sampleId: null },
    ],
  });
});
test("changing specimen clears its selected test and a late response cannot replace a newer selection", async () => {
  let resolveSerum;
  const handler = server.request;
  request.mockImplementation((path, options) =>
    path === "/rest/test-display-beans?sampleType=2"
      ? new Promise((resolve) => {
          resolveSerum = resolve;
        })
      : handler(path, options),
  );
  mount();
  await editReflex();
  await userEvent.selectOptions(
    document.getElementById("condition-0-sample"),
    "2",
  );
  expect(document.getElementById("condition-0-test")).toHaveValue("");
  await userEvent.selectOptions(
    document.getElementById("condition-0-sample"),
    "1",
  );
  resolveSerum({
    ok: true,
    status: 200,
    data: [{ ...testOptions[0], id: "99", value: "血清项目" }],
  });
  await waitFor(() =>
    expect(document.getElementById("condition-0-test")).not.toBeDisabled(),
  );
  expect(
    within(document.getElementById("condition-0-test")).queryByRole("option", {
      name: "血清项目",
    }),
  ).toBeNull();
  expect(
    within(document.getElementById("condition-0-test")).getByRole("option", {
      name: "白细胞计数",
    }),
  ).toBeInTheDocument();
});
test("missing existing references block saving; discard and cancel preserve the list query/page", async () => {
  server.store.reflex = Array.from({ length: 21 }, (_, i) => ({
    ...copy(reflexFixture),
    id: i + 1,
    ruleName: `加做${i + 1}`,
  }));
  server.store.calculation = [];
  mount(
    "/MasterListsPage/rulesWorkspace?q=%E5%8A%A0%E5%81%9A&type=reflex&page=2",
  );
  await screen.findByText("加做21");
  await userEvent.click(
    within(screen.getByText("加做21").closest("tr")).getByRole("button", {
      name: "编辑",
    }),
  );
  await screen.findByDisplayValue("加做21");
  await waitFor(() =>
    expect(document.getElementById("condition-0-test")).not.toBeDisabled(),
  );
  await userEvent.type(document.getElementById("rule-editor-name"), "草稿");
  await userEvent.keyboard("{Escape}");
  await screen.findByText("尚有未保存的修改");
  await userEvent.click(screen.getByRole("button", { name: "放弃修改并返回" }));
  expect(screen.getByText("加做21")).toBeInTheDocument();
  expect(screen.getByTestId("location")).toHaveTextContent("page=2");
  expect(server.store.reflex[20].ruleName).toBe("加做21");
  cleanup();
  server = makeServer();
  server.store.reflex[0].conditions[0].testId = "99";
  request.mockImplementation(server.request);
  mount();
  await editReflex();
  await screen.findByText(
    "当前规则引用的标本类型或检验项目已不可用，暂不能保存。请核对基础配置，或重新选择有效关联。",
  );
  expect(saveButton()).toBeDisabled();
});

test("new reflex creation receives a persisted identity, verifies its complete definition and refreshes the real list", async () => {
  mount("/MasterListsPage/rulesWorkspace?type=reflex");
  await screen.findByText("白细胞加做");
  await userEvent.click(screen.getByRole("button", { name: "新增加做规则" }));
  await screen.findByLabelText("规则名称");
  await userEvent.type(
    document.getElementById("rule-editor-name"),
    "新的中文加做",
  );
  await userEvent.selectOptions(
    document.getElementById("condition-0-sample"),
    "1",
  );
  await waitFor(() =>
    expect(document.getElementById("condition-0-test")).not.toBeDisabled(),
  );
  await userEvent.selectOptions(
    document.getElementById("condition-0-test"),
    "10",
  );
  await userEvent.selectOptions(
    document.getElementById("condition-0-relation"),
    "GREATER_THAN",
  );
  await userEvent.clear(document.getElementById("condition-0-value"));
  await userEvent.type(document.getElementById("condition-0-value"), "10");
  await userEvent.selectOptions(
    document.getElementById("action-0-sample"),
    "1",
  );
  await userEvent.selectOptions(document.getElementById("action-0-test"), "11");
  await userEvent.click(saveButton());
  await screen.findByText("规则已保存并核对。");
  await screen.findByText("新的中文加做");
  const writes = server.calls.filter(
    ({ options }) => options.method === "POST",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0].options.body.id).toBeNull();
  expect(writes[0].options.body.conditions[0].id).toBeNull();
  expect(
    server.store.reflex.find((row) => row.id === 100).conditions[0].id,
  ).toBe(1001);
  expect(
    server.calls.some((call) => call.path === "/rest/reflexrule/100"),
  ).toBe(true);
  expect(screen.queryByLabelText("规则名称")).toBeNull();
  expect(sessionStorage.length).toBe(0);
});
test("editing an inactive rule preserves its status and associated names; activation is not implicit", async () => {
  server.store.reflex[0].active = false;
  mount();
  await editReflex();
  await userEvent.type(document.getElementById("rule-editor-name"), "停用稿");
  await userEvent.click(saveButton());
  await screen.findByText("规则已保存并核对。");
  const write = server.calls.find(({ options }) => options.method === "POST");
  expect(write.options.body.active).toBe(false);
  expect(write.options.body.conditions[0].testName).toBe("白细胞计数");
  expect(write.options.body.actions[0].reflexTestName).toBe("白细胞分类");
  expect(server.store.reflex[0].active).toBe(false);
});

test("BETWEEN accepts signed decimal/scientific boundaries while reversed bounds never write", async () => {
  mount();
  await editReflex();
  await userEvent.selectOptions(
    document.getElementById("condition-0-relation"),
    "BETWEEN",
  );
  await userEvent.clear(document.getElementById("condition-0-value"));
  await userEvent.type(document.getElementById("condition-0-value"), "1e-3");
  await userEvent.clear(document.getElementById("condition-0-value2"));
  await userEvent.type(document.getElementById("condition-0-value2"), "-0.5");
  await userEvent.click(saveButton());
  await screen.findByText("范围下限不能大于上限，请核对两个边界值。");
  expect(
    server.calls.filter(({ options }) => options.method === "POST"),
  ).toHaveLength(0);
  await userEvent.clear(document.getElementById("condition-0-value"));
  await userEvent.type(document.getElementById("condition-0-value"), "-0.5");
  await userEvent.clear(document.getElementById("condition-0-value2"));
  await userEvent.type(document.getElementById("condition-0-value2"), "1e-3");
  await userEvent.click(saveButton());
  await screen.findByText("规则已保存并核对。");
  const write = server.calls.find(({ options }) => options.method === "POST");
  expect(write.options.body.conditions[0]).toMatchObject({
    relation: "BETWEEN",
    value: "-0.5",
    value2: "1e-3",
  });
});

test.each([
  ["A", "EQUALS"],
  ["N", "INSIDE_NORMAL_RANGE"],
])(
  "oversized persisted %s/%s derived text is shown intact and cannot POST",
  async (resultType, relation) => {
    const original = "字".repeat(51);
    server.store.reflex[0].conditions[0].relation = relation;
    server.store.reflex[0].conditions[0].value = original;
    const handler = server.request;
    request.mockImplementation((path, options) =>
      path === "/rest/test-display-beans?sampleType=1"
        ? Promise.resolve({
            ok: true,
            status: 200,
            data: testOptions.map((item, index) =>
              index === 0 ? { ...item, resultType } : item,
            ),
          })
        : handler(path, options),
    );
    mount();
    await editReflex();
    const input = document.getElementById("condition-0-value");
    expect(input).toHaveValue(original);
    expect(input).toHaveAttribute("maxLength", "50");
    await userEvent.type(document.getElementById("rule-editor-name"), "草稿");
    await userEvent.click(saveButton());
    await screen.findAllByText(
      "名称、数值条件和计算备注最多64个字；文本条件、参考范围保留值和加做规则备注最多50个字。",
    );
    expect(
      server.calls.filter(({ options }) => options.method === "POST"),
    ).toHaveLength(0);
    expect(input).toHaveValue(original);
    expect(server.store.reflex[0].conditions[0].value).toBe(original);
  },
);
