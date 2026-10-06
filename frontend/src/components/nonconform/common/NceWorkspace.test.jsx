import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { screen, within, waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";
import ReportNonConformingEvent from "./ReportNonConformingEvent";
import NceDashboard from "./NceDashboard";
import InlineNceForm from "./InlineNceForm";
import NceEventActionModal from "./NceEventActionModal";
import NceRegistrationModal from "./NceRegistrationModal";
import {
  event,
  jsonResponse,
  metadata,
  order,
  orders,
  receipt,
  session,
  urlPath,
  version,
  workspace,
} from "./nceWorkspace.testData";
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({}),
    NotificationContext: createContext({}),
  };
});
let fetcher, history;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const providers = (content, actor = session) => (
  <Router history={history}>
    <IntlProvider locale="zh-CN" messages={zh}>
      <NotificationContext.Provider
        value={{ addNotification: vi.fn(), notificationVisible: false }}
      >
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: actor, isCheckingLogin: () => false }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" },
            }}
          >
            {content}
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </NotificationContext.Provider>
    </IntlProvider>
  </Router>
);
const formFill = (root = document) => {
  fireEvent.change(root.querySelector("#reporting-unit"), {
    target: { value: "3" },
  });
  fireEvent.change(root.querySelector("#nce-category"), {
    target: { value: "3" },
  });
  fireEvent.change(root.querySelector("#nce-description"), {
    target: { value: "本次真实合同测试的描述" },
  });
  fireEvent.click(root.querySelector("#nce-severity-MINOR"));
};
const findForm = () => screen.findByRole("textbox", { name: "登记人" });
const getPost = () =>
  fetcher.mock.calls.filter(([, opts]) => opts.method === "POST");
beforeEach(() => {
  sessionStorage.clear();
  history = createMemoryHistory();
  fetcher = vi.fn(async (url, opts) => {
    const path = urlPath(url),
      p = new URL(url, "http://localhost").searchParams;
    if (path.endsWith("/session")) return jsonResponse(session);
    if (path.endsWith("/registration/users"))
      return jsonResponse({
        queryVersion: "2",
        currentUserId: "1",
        users: [
          { id: "2", firstName: "宁", lastName: "李", loginName: "assignee" },
        ],
      });
    if (path.endsWith("/registration/meta")) return jsonResponse(metadata());
    if (path.endsWith("/nce/workspace"))
      return jsonResponse(
        workspace(
          Number(p.get("page")),
          Number(p.get("pageSize")),
          Object.fromEntries(
            ["keyword", "status", "categoryId", "severity"].map((k) => [
              k,
              p.get(k) || "",
            ]),
          ),
        ),
      );
    if (path.endsWith("/registration/orders"))
      return jsonResponse(
        orders({ searchType: p.get("searchType"), value: p.get("value") }, [
          order(p.get("value") === "HMC00002" ? 2 : 1),
        ]),
      );
    if (opts.method === "POST") {
      const cmd =
        opts.body instanceof FormData
          ? JSON.parse(opts.body.get("nceData"))
          : JSON.parse(opts.body);
      return jsonResponse({
        ...receipt(cmd.requestId, cmd.type || "CREATE"),
        linkedSpecimens: cmd.linkedSpecimens || [],
        attachments:
          opts.body instanceof FormData
            ? opts.body.getAll("files").map((f, i) => ({
                id: String(i + 1),
                fileName: f.name,
                fileType: f.type,
                fileSize: f.size,
                uploadedDate: "2026-10-06T01:02:03Z",
              }))
            : [],
      });
    }
    throw new Error(`unexpected contract endpoint ${path}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
test("full five sections use readonly server identity, translated actual type and custom fallback without number allocation", async () => {
  render(providers(<ReportNonConformingEvent />));
  const reporter = await findForm();
  expect(reporter).toHaveValue("刘洋");
  expect(reporter).toHaveAttribute("readonly");
  expect(screen.getByRole("textbox", { name: "不符合项编号" })).toHaveValue(
    zh["nce.number.afterSave"],
  );
  for (const id of [
    "nce.section.reporterContext",
    "nce.section.classification",
    "nce.section.details",
    "nce.section.attachments",
    "nce.section.linkSamples",
  ])
    expect(screen.getByRole("heading", { name: zh[id] })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("类别 *"), { target: { value: "3" } });
  expect(screen.getByRole("option", { name: "标本凝固" })).toBeInTheDocument();
  expect(
    screen.getByRole("option", { name: "本地自定义类型" }),
  ).toBeInTheDocument();
  expect(
    fetcher.mock.calls.some(([url]) =>
      /generate-number|reportnonconformingevent/.test(url),
    ),
  ).toBe(false);
  expect(document.querySelector("#date-of-event")).toHaveAttribute(
    "placeholder",
    "年/月/日",
  );
  expect(document.querySelector("#date-of-event").value).toMatch(
    /^\d{4}\/\d{2}\/\d{2}$/,
  );
});
test("selection across two searches retains both actual pipes and versions in the create payload", async () => {
  const saved = vi.fn();
  render(providers(<ReportNonConformingEvent onSaved={saved} />));
  await findForm();
  formFill();
  fireEvent.change(screen.getByLabelText("筛选项目"), {
    target: { value: "labNumber" },
  });
  for (const n of [1, 2]) {
    fireEvent.change(document.querySelector("#search-value"), {
      target: { value: `HMC0000${n}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await screen.findByRole("checkbox", {
      name: `血液 · 标本记录 ${n * 10} · PIPE-${n}`,
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `血液 · 标本记录 ${n * 10} · PIPE-${n}`,
      }),
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "关联所选标本" }));
  expect(document.querySelectorAll(".nce-linked-samples li")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "提交不符合项" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  const payload = JSON.parse(getPost()[0][1].body);
  expect(payload.linkedSpecimens).toEqual(
    [1, 2].map((n) => ({
      sampleId: String(n),
      labNumber: `HMC0000${n}`,
      sampleLastupdated: version,
      sampleItemId: String(n * 10),
      lastupdated: version,
      analysisId: null,
      analysisLastupdated: null,
    })),
  );
  expect(payload).not.toHaveProperty("nceNumber");
  expect(payload).not.toHaveProperty("reporterName");
  expect(payload.severity).toBe("MINOR");
  expect(payload.dateOfEvent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
test("the immediate submit lock prevents two writes and freezes all original attachment Files", async () => {
  const post = deferred(),
    saved = vi.fn(),
    original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    opts.method === "POST" ? post.promise : original(url, opts),
  );
  render(providers(<ReportNonConformingEvent onSaved={saved} />));
  await findForm();
  formFill();
  const files = [
    new File(["a"], "a.pdf", { type: "application/pdf" }),
    new File(["b"], "b.png", { type: "image/png" }),
  ];
  fireEvent.change(
    document.querySelector('.cds--file input[type="file"]') ||
      document.querySelector('input[type="file"]'),
    { target: { files } },
  );
  const submit = screen.getByRole("button", { name: "提交不符合项" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => expect(getPost()).toHaveLength(1));
  expect(getPost()[0][1].body.getAll("files")).toEqual(files);
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  const cmd = JSON.parse(getPost()[0][1].body.get("nceData"));
  await act(async () =>
    post.resolve(
      jsonResponse({
        ...receipt(cmd.requestId),
        attachments: files.map((f, i) => ({
          id: String(i + 1),
          fileName: f.name,
          fileType: f.type,
          fileSize: f.size,
          uploadedDate: "2026-10-06T01:02:03Z",
        })),
      }),
    ),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
});
test("20 second unknown preserves draft and File; Carbon X/Escape cannot hide it and NOT_FOUND never resubmits", async () => {
  const original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    opts.method === "POST"
      ? new Promise(() => {})
      : urlPath(url).endsWith("/receipt")
        ? Promise.resolve(
            jsonResponse({
              queryVersion: "2",
              currentUserId: "1",
              requestId: new URL(url, "http://localhost").searchParams.get(
                "requestId",
              ),
              operation: "CREATE",
              outcome: "NOT_FOUND",
            }),
          )
        : original(url, opts),
  );
  const closed = vi.fn();
  render(providers(<NceRegistrationModal onClose={closed} />));
  await findForm();
  formFill();
  const file = new File(["a"], "unknown.pdf", { type: "application/pdf" });
  fireEvent.change(document.querySelector('input[type="file"]'), {
    target: { files: [file] },
  });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "提交不符合项" }));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  expect(screen.getByRole("dialog", { name: "登记不符合项" })).toBeVisible();
  expect(closed).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20001);
  });
  vi.useRealTimers();
  await screen.findByRole("button", { name: "核对保存结果" });
  fireEvent.keyDown(screen.getByRole("dialog", { name: "登记不符合项" }), {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
  });
  expect(screen.getByRole("dialog", { name: "登记不符合项" })).toBeVisible();
  expect(closed).not.toHaveBeenCalled();
  expect(document.querySelector("#nce-description")).toHaveValue(
    "本次真实合同测试的描述",
  );
  expect(screen.getByText("unknown.pdf")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "提交不符合项" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "核对保存结果" }));
  await screen.findByText(zh["nce.workspace.notFoundReceipt"]);
  expect(getPost()).toHaveLength(1);
  const cmd = JSON.parse(getPost()[0][1].body.get("nceData"));
  const call = fetcher.mock.calls.find(([url]) =>
    urlPath(url).endsWith("/receipt"),
  );
  const p = new URL(call[0], "http://localhost").searchParams;
  expect(p.get("requestId")).toBe(cmd.requestId);
  expect(p.get("operation")).toBe("CREATE");
});
test("actor A to unknown to A rejects the original late metadata even when the owner key returns", async () => {
  const late = deferred(),
    original = fetcher.getMockImplementation();
  let metaCount = 0;
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/meta") && ++metaCount === 1
      ? late.promise
      : original(url, opts),
  );
  const view = render(providers(<ReportNonConformingEvent />));
  await waitFor(() => expect(metaCount).toBe(1));
  view.rerender(providers(<ReportNonConformingEvent />, null));
  expect(
    screen.queryByRole("textbox", { name: "登记人" }),
  ).not.toBeInTheDocument();
  view.rerender(providers(<ReportNonConformingEvent />));
  await findForm();
  await act(async () =>
    late.resolve(
      jsonResponse({
        ...metadata(),
        reporter: { firstName: "迟到", lastName: "旧", loginName: "old" },
      }),
    ),
  );
  expect(screen.getByRole("textbox", { name: "登记人" })).toHaveValue("刘洋");
});
test("page two registration opens one full modal, dirty cancellation is protected and successful save refreshes the same filters and page", async () => {
  history = createMemoryHistory({
    initialEntries: [
      "/NceDashboard?keyword=保存&status=Pending&page=2&pageSize=25",
    ],
  });
  render(providers(<NceDashboard />));
  await screen.findByText("NCE-2026-00026");
  expect(
    screen.getByRole("combobox", { name: "页码，共2页" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Page of/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "登记不符合项" }));
  await findForm();
  expect(
    screen
      .getByRole("dialog", { name: "登记不符合项" })
      .closest(".nce-registration-modal"),
  ).not.toBeNull();
  formFill();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  await screen.findByRole("dialog", { name: "放弃当前草稿？" });
  fireEvent.click(screen.getByRole("button", { name: "继续填写" }));
  expect(document.querySelector("#nce-description")).toHaveValue(
    "本次真实合同测试的描述",
  );
  fireEvent.click(screen.getByRole("button", { name: "提交不符合项" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "登记不符合项" }),
    ).not.toBeInTheDocument(),
  );
  await screen.findByText("NCE-2026-00026");
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) =>
        urlPath(url).endsWith("/nce/workspace"),
      ),
    ).toHaveLength(2),
  );
  const reads = fetcher.mock.calls.filter(([url]) =>
    urlPath(url).endsWith("/nce/workspace"),
  );
  expect(reads).toHaveLength(2);
  for (const [url] of reads) {
    const p = new URL(url, "http://localhost").searchParams;
    expect(p.get("page")).toBe("2");
    expect(p.get("pageSize")).toBe("25");
    expect(p.get("keyword")).toBe("保存");
    expect(p.get("status")).toBe("Pending");
  }
});
test("editing criteria immediately hides a previous page and its late response cannot restore it", async () => {
  const late = deferred(),
    original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? late.promise
      : original(url, opts),
  );
  render(providers(<NceDashboard />));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) =>
        urlPath(url).endsWith("/nce/workspace"),
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "新的条件" },
  });
  await act(async () => late.resolve(jsonResponse(workspace())));
  expect(screen.queryByText("NCE-2026-00001")).not.toBeInTheDocument();
  expect(
    screen.getByText(zh["nce.workspace.searchNeeded"]),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "登记不符合项" })).toBeDisabled();
});
test("a list failure is shown honestly and never rendered as a successful empty list", async () => {
  const original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse(
            {
              queryVersion: "2",
              code: "NCE_PERMISSION_DENIED",
              outcome: "NOT_APPLIED",
            },
            403,
          ),
        )
      : original(url, opts),
  );
  render(providers(<NceDashboard />));
  await screen.findByText(zh["nce.workspace.error.forbidden"]);
  expect(screen.queryByText(zh["nce.list.empty"])).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "登记不符合项" })).toBeDisabled();
});
test("actual CAPA and completed statuses are translated, CAPA detail is explicitly not loaded, row header is keyboard operable", async () => {
  const original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse({
            ...workspace(),
            nceList: [
              {
                ...workspace().nceList[0],
                status: "CAPA",
                statusCode: "CAPA",
                canAcknowledge: false,
              },
            ],
          }),
        )
      : original(url, opts),
  );
  render(providers(<NceDashboard />));
  const header = await screen.findByRole("button", {
    name: /NCE-2026-00001 整改中/,
  });
  expect(header).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(header);
  expect(header).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("tab", { name: "纠正与预防措施" }));
  expect(screen.getByText(zh["nce.capa.notLoaded"])).toBeInTheDocument();
  expect(screen.queryByText(zh["nce.capa.noItems"])).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
test("existing result embedded entry resolves and posts the exact analysis under its real pipe", async () => {
  const saved = vi.fn();
  render(
    providers(
      <InlineNceForm
        resultRow={{
          id: "7",
          analysisId: "100",
          accessionNumber: "HMC00001",
          sampleItemId: "10",
        }}
        onClose={vi.fn()}
        onSubmitSuccess={saved}
      />,
    ),
  );
  await findForm();
  await screen.findByText(/HMC00001 · 血液 · 血糖/);
  formFill();
  fireEvent.click(screen.getByRole("button", { name: "提交不符合项" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(JSON.parse(getPost()[0][1].body).linkedSpecimens).toEqual([
    {
      sampleId: "1",
      labNumber: "HMC00001",
      sampleLastupdated: version,
      sampleItemId: "10",
      lastupdated: version,
      analysisId: "100",
      analysisLastupdated: version,
    },
  ]);
});
test.each(["ACKNOWLEDGE", "ADD_NOTE", "ASSIGN"])(
  "existing %s action posts the typed parent version and confirms its real advancing receipt",
  async (type) => {
    const saved = vi.fn();
    render(
      providers(
        <NceEventActionModal
          row={event()}
          type={type}
          onClose={vi.fn()}
          onSaved={saved}
        />,
      ),
    );
    if (type === "ADD_NOTE")
      fireEvent.change(screen.getByRole("textbox", { name: "备注" }), {
        target: { value: "实际处理备注" },
      });
    if (type === "ASSIGN") {
      const input = await screen.findByRole("combobox", { name: "选择处理人" });
      fireEvent.click(input);
      fireEvent.keyDown(input, { key: "ArrowDown" });
      const option = await screen.findByRole("option", {
        name: "李宁 (assignee)",
      });
      fireEvent.click(option);
    }
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    const [url, options] = getPost()[0];
    expect(url).toContain("/rest/nce/events/1/actions?queryVersion=2");
    expect(JSON.parse(options.body)).toMatchObject({
      currentUserId: "1",
      lastupdated: version,
      type,
      description: type === "ADD_NOTE" ? "实际处理备注" : null,
      assignedTo: type === "ASSIGN" ? "2" : null,
    });
    expect(saved.mock.calls[0][0].lastupdated).not.toBe(version);
  },
);
test("actual Carbon X and Escape keep a dirty registration visible, and continuing returns focus to the launcher", async () => {
  const close = vi.fn();
  render(providers(<NceRegistrationModal onClose={close} onSaved={vi.fn()} />));
  await findForm();
  fireEvent.change(screen.getByRole("textbox", { name: "标题" }), {
    target: { value: "保留的草稿" },
  });
  const parent = screen.getByRole("dialog", { name: "登记不符合项" }),
    x = within(parent).getByRole("button", { name: "关闭" });
  x.focus();
  fireEvent.click(x);
  const confirm = await screen.findByRole("dialog", { name: "放弃当前草稿？" });
  expect(parent.closest(".cds--modal")).toHaveClass("is-visible");
  expect(
    within(confirm).getByRole("button", { name: "继续填写" }),
  ).toHaveFocus();
  fireEvent.click(within(confirm).getByRole("button", { name: "继续填写" }));
  await waitFor(() => expect(x).toHaveFocus());
  expect(parent.closest(".cds--modal")).toHaveClass("is-visible");
  fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
  await screen.findByRole("dialog", { name: "放弃当前草稿？" });
  expect(close).not.toHaveBeenCalled();
  expect(parent.closest(".cds--modal")).toHaveClass("is-visible");
});
test("an unknown note receipt cannot count as registration success in an existing result entry", async () => {
  const requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    saved = vi.fn();
  sessionStorage.setItem(
    "openelis.nce.pending.v2",
    JSON.stringify({
      1: { actor: "1", requestId, operation: "ADD_NOTE", eventId: "1" },
    }),
  );
  render(
    providers(
      <InlineNceForm
        resultRow={{ id: "7", analysisId: "100", accessionNumber: "HMC00001" }}
        onClose={vi.fn()}
        onSubmitSuccess={saved}
      />,
    ),
  );
  await findForm();
  expect(
    screen.getByText(zh["nce.workspace.pendingOther"]),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "核对保存结果" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "提交不符合项" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
  expect(saved).not.toHaveBeenCalled();
});
test("a missing real analysisId never falls back to a colliding display sequence", async () => {
  render(
    providers(
      <InlineNceForm
        resultRow={{
          id: "100",
          accessionNumber: "HMC00001",
          sampleItemId: "10",
        }}
        onClose={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />,
    ),
  );
  await findForm();
  expect(screen.getByRole("button", { name: "提交不符合项" })).toBeDisabled();
  expect(
    fetcher.mock.calls.some(([url]) => urlPath(url).endsWith("/orders")),
  ).toBe(false);
  expect(
    screen.getByText(zh["nce.workspace.resultUnavailable"]),
  ).toBeInTheDocument();
});
test("real note text remains visible and an actor change clears the prior event and its success message", async () => {
  const original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse({
            ...workspace(),
            nceList: [
              {
                ...event(),
                notes: [
                  {
                    id: "9",
                    text: "服务端真实备注",
                    timestamp: "2026-10-06T09:10:00Z",
                    userName: "刘洋",
                  },
                ],
              },
            ],
          }),
        )
      : original(url, opts),
  );
  const view = render(providers(<NceDashboard />));
  const header = await screen.findByRole("button", { name: /NCE-2026-00001/ });
  fireEvent.click(header);
  fireEvent.click(screen.getByRole("tab", { name: "原因调查" }));
  expect(screen.getByText("服务端真实备注")).toBeInTheDocument();
  view.rerender(providers(<NceDashboard />, null));
  expect(screen.queryByText("NCE-2026-00001")).not.toBeInTheDocument();
  expect(screen.queryByText("服务端真实备注")).not.toBeInTheDocument();
});
test("expanded history translates actual activity/default text and preserves user notes and unknown activities", async () => {
  const original = fetcher.getMockImplementation(),
    historyRows = [
      {
        id: "1",
        activity: "CREATED",
        description: "Non-conforming event registered",
      },
      {
        id: "2",
        activity: "ACKNOWLEDGED",
        description: "Non-conforming event acknowledged",
      },
      { id: "3", activity: "ASSIGNED", description: "Assigned to 李宁" },
      { id: "4", activity: "NOTE_ADDED", description: "保留用户自由备注" },
      {
        id: "5",
        activity: "CUSTOM_HOSPITAL_ACTIVITY",
        description: "保留院方原文",
      },
    ];
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse({
            ...workspace(),
            nceList: [{ ...event(), history: historyRows }],
          }),
        )
      : original(url, opts),
  );
  render(providers(<NceDashboard />));
  fireEvent.click(
    await screen.findByRole("button", { name: /NCE-2026-00001/ }),
  );
  fireEvent.click(screen.getByRole("tab", { name: "处理记录" }));
  for (const text of [
    "已登记不符合项",
    "已确认不符合项",
    "已指派给 李宁",
    "保留用户自由备注",
    "CUSTOM_HOSPITAL_ACTIVITY",
    "保留院方原文",
  ])
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
  expect(
    screen.queryByText(/Non-conforming event registered/),
  ).not.toBeInTheDocument();
});

test("safe attachment preview uses the guarded parent endpoint and never a legacy download URL", async () => {
  const original = fetcher.getMockImplementation(),
    attachment = {
      id: "8",
      fileName: "existing.pdf",
      fileType: "application/pdf",
      fileSize: 5,
      uploadedDate: "2026-10-06T01:02:03Z",
    };
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse({
            ...workspace(),
            nceList: [{ ...event(), attachments: [attachment] }],
          }),
        )
      : urlPath(url).endsWith("/attachments/8")
        ? Promise.resolve(
            new Response("bytes", {
              headers: { "content-type": "application/pdf" },
            }),
          )
        : original(url, opts),
  );
  const create = vi.fn(() => "blob:guarded-existing"),
    revoke = vi.fn(),
    opened = { opener: "old" };
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const open = vi.spyOn(window, "open").mockReturnValue(opened);
  render(providers(<NceDashboard />));
  fireEvent.click(
    await screen.findByRole("button", { name: /NCE-2026-00001/ }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "查看附件 existing.pdf" }),
  );
  await waitFor(() =>
    expect(open).toHaveBeenCalledWith("blob:guarded-existing", "_blank"),
  );
  expect(opened.opener).toBeNull();
  const call = fetcher.mock.calls.find(([url]) =>
    urlPath(url).endsWith("/attachments/8"),
  );
  expect(new URL(call[0], "http://localhost").searchParams.get("eventId")).toBe(
    "1",
  );
  expect(
    new URL(call[0], "http://localhost").searchParams.get("queryVersion"),
  ).toBe("2");
});

test("an attachment response after the actor changes cannot create or open a preview", async () => {
  const original = fetcher.getMockImplementation(),
    late = deferred(),
    attachment = {
      id: "8",
      fileName: "late.pdf",
      fileType: "application/pdf",
      fileSize: 5,
      uploadedDate: "2026-10-06T01:02:03Z",
    };
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse({
            ...workspace(),
            nceList: [{ ...event(), attachments: [attachment] }],
          }),
        )
      : urlPath(url).endsWith("/attachments/8")
        ? late.promise
        : original(url, opts),
  );
  const create = vi.fn(),
    revoke = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const open = vi.spyOn(window, "open").mockReturnValue({ opener: null });
  const view = render(providers(<NceDashboard />));
  fireEvent.click(
    await screen.findByRole("button", { name: /NCE-2026-00001/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "查看附件 late.pdf" }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) =>
        urlPath(url).endsWith("/attachments/8"),
      ),
    ).toBe(true),
  );
  view.rerender(providers(<NceDashboard />, null));
  await act(async () =>
    late.resolve(
      new Response("bytes", { headers: { "content-type": "application/pdf" } }),
    ),
  );
  expect(create).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  expect(screen.queryByText("late.pdf")).not.toBeInTheDocument();
});

test("a page that vanished reports a failure and offers an explicit first page read with the same filters", async () => {
  history = createMemoryHistory({
    initialEntries: [
      "/NceDashboard?keyword=保留&status=Pending&page=2&pageSize=25",
    ],
  });
  const original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace") &&
    new URL(url, "http://localhost").searchParams.get("page") === "2"
      ? Promise.resolve(
          jsonResponse(
            {
              queryVersion: "2",
              code: "NCE_PAGE_CHANGED",
              outcome: "NOT_APPLIED",
            },
            409,
          ),
        )
      : original(url, opts),
  );
  render(providers(<NceDashboard />));
  fireEvent.click(
    await screen.findByRole("button", { name: "保留当前筛选，读取第一页" }),
  );
  await screen.findByText("NCE-2026-00001");
  const reads = fetcher.mock.calls.filter(([url]) =>
    urlPath(url).endsWith("/nce/workspace"),
  );
  expect(
    reads.map(([url]) =>
      new URL(url, "http://localhost").searchParams.get("page"),
    ),
  ).toEqual(["2", "1"]);
  for (const [url] of reads) {
    const p = new URL(url, "http://localhost").searchParams;
    expect(p.get("keyword")).toBe("保留");
    expect(p.get("status")).toBe("Pending");
    expect(p.get("pageSize")).toBe("25");
  }
});

test.each(["CREATE", "ADD_NOTE"])(
  "UNKNOWN 403 %s hides old identity and preserves only the same-operation receipt path",
  async (operation) => {
    const original = fetcher.getMockImplementation();
    let submitted;
    fetcher.mockImplementation((url, opts) => {
      if (opts.method === "POST") {
        submitted =
          opts.body instanceof FormData
            ? JSON.parse(opts.body.get("nceData"))
            : JSON.parse(opts.body);
        return Promise.resolve(
          jsonResponse(
            {
              queryVersion: "2",
              requestId: submitted.requestId,
              code: "NCE_PERMISSION_DENIED",
              outcome: "UNKNOWN",
            },
            403,
          ),
        );
      }
      if (urlPath(url).endsWith("/receipt"))
        return Promise.resolve(
          jsonResponse({
            queryVersion: "2",
            currentUserId: "1",
            requestId: submitted.requestId,
            operation,
            outcome: "NOT_FOUND",
          }),
        );
      return original(url, opts);
    });
    render(providers(<NceDashboard />));
    await screen.findByText("NCE-2026-00001");
    if (operation === "CREATE") {
      fireEvent.click(screen.getByRole("button", { name: "登记不符合项" }));
      await findForm();
      formFill();
      fireEvent.click(screen.getByRole("button", { name: "提交不符合项" }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: /NCE-2026-00001/ }));
      fireEvent.click(screen.getByRole("button", { name: "添加处理备注" }));
      fireEvent.change(screen.getByRole("textbox", { name: "备注" }), {
        target: { value: "保留未知原备注" },
      });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
    }
    const dialog = screen.getByRole("dialog", {
      name: operation === "CREATE" ? "登记不符合项" : "添加处理备注",
    });
    await within(dialog).findByRole("button", { name: "核对保存结果" });
    expect(screen.queryAllByText("NCE-2026-00001")).toHaveLength(0);
    expect(
      screen.queryByRole("textbox", { name: "登记人" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "备注" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "核对保存结果" }),
    );
    await within(dialog).findByText(zh["nce.workspace.notFoundReceipt"]);
    expect(getPost()).toHaveLength(1);
    expect(
      JSON.parse(sessionStorage.getItem("openelis.nce.pending.v2"))["1"],
    ).toMatchObject({ requestId: submitted.requestId, operation });
    expect(dialog).toBeVisible();
  },
);

test("a current readonly list exposes the missing registration permission and never opens or initializes a writable form", async () => {
  const original = fetcher.getMockImplementation();
  fetcher.mockImplementation((url, opts) =>
    urlPath(url).endsWith("/nce/workspace")
      ? Promise.resolve(
          jsonResponse({
            ...workspace(),
            canCreate: false,
            createUnavailableReason: "NCE_ADD_PERMISSION_DENIED",
          }),
        )
      : original(url, opts),
  );
  render(providers(<NceDashboard />));
  await screen.findByText("NCE-2026-00001");
  expect(
    screen.getByText(zh["nce.workspace.createDenied"]),
  ).toBeInTheDocument();
  const button = screen.getByRole("button", { name: "登记不符合项" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(
    screen.queryByRole("dialog", { name: "登记不符合项" }),
  ).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.some(([url]) =>
      urlPath(url).endsWith("/registration/meta"),
    ),
  ).toBe(false);
  expect(getPost()).toHaveLength(0);
});
