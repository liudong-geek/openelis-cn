import React from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import zhMessages from "../../../languages/zh_CN.json";
import QCImports from "./QCImports";
import QCDashboard from "../dashboard/QCDashboard";

const row = {
  id: "31",
  analyzerId: "7",
  accessionNumber: "QC-001",
  testName: "白细胞计数",
  lotNumber: "LOT-UNKNOWN",
  controlLevel: "LOW",
  result: "4.2",
  units: "10^9/L",
  completeDate: "2026-10-20T08:00:00",
  qcProcessingStatus: "NOT_PROCESSED",
  qcProcessingReason: "QC_CONTROL_LOT_NOT_RESOLVED",
  canRetry: true,
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const renderPage = (search = "") => {
  const history = createMemoryHistory({
    initialEntries: [`/analyzers/qc/imports${search}`],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <QCImports />
      </IntlProvider>
    </Router>,
  );
  return history;
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("默认展示待处理记录及原批号，详情只读并保留分页条件", async () => {
  const requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      requests.push(url);
      if (url.endsWith("/31")) return json(row);
      return json({ rows: [row], total: 45, limit: 20, offset: 20 });
    }),
  );
  const history = renderPage("?page=2");
  const user = userEvent.setup();
  expect(await screen.findByText("LOT-UNKNOWN")).toBeInTheDocument();
  expect(requests[0]).toContain("status=OPEN&limit=20&offset=20");
  await user.click(screen.getByRole("button", { name: "查看详情" }));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText("LOT-UNKNOWN")).toBeInTheDocument();
  expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(dialog).getByText(/原批号和原读数只读/)).toBeInTheDocument();
  await user.click(
    within(dialog).getAllByRole("button", { name: "关闭" }).at(-1),
  );
  expect(history.location.search).toContain("page=2");
  expect(screen.getByText("LOT-UNKNOWN")).toBeInTheDocument();
});

test("补处理只提交当前记录，查回关联结果后禁止重复提交", async () => {
  let stored = row;
  const writes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options.method === "POST") {
        writes.push({ url, body: options.body });
        stored = {
          ...row,
          qcProcessingStatus: "CREATED",
          qcProcessingReason: null,
          qcResultId: "QC-88",
          canRetry: false,
        };
        return json({ status: "CREATED", qcResultId: "QC-88" });
      }
      return json(
        url.endsWith("/31")
          ? stored
          : { rows: [stored], total: 1, limit: 20, offset: 0 },
      );
    }),
  );
  renderPage();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "查看详情" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("button", { name: "按原记录重新处理" }),
  );
  expect(await within(dialog).findByText("QC-88")).toBeInTheDocument();
  expect(writes).toEqual([
    { url: "/api/OpenELIS-Global/rest/qc/imports/31/reprocess", body: "{}" },
  ]);
  expect(
    within(dialog).getByRole("button", { name: "按原记录重新处理" }),
  ).toBeDisabled();
  expect(
    within(dialog).getByText(/生成质控结果不等于质控合格/),
  ).toBeInTheDocument();
});

test("网络结果未知不重发，刷新查回已创建记录后显示关联结果", async () => {
  let calls = 0;
  let detailReads = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options.method === "POST") {
        calls++;
        throw new Error("connection lost after commit");
      }
      if (url.endsWith("/31")) {
        detailReads++;
        return json(
          detailReads === 1
            ? row
            : {
                ...row,
                qcProcessingStatus: "CREATED",
                qcResultId: "QC-89",
                canRetry: false,
              },
        );
      }
      return json({ rows: [row], total: 1, limit: 20, offset: 0 });
    }),
  );
  renderPage();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "查看详情" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("button", { name: "按原记录重新处理" }),
  );
  expect(
    await within(dialog).findByText(/本次处理结果尚未确认/),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "按原记录重新处理" }),
  ).toBeDisabled();
  expect(detailReads).toBe(1);
  await user.click(within(dialog).getByRole("button", { name: "刷新核对" }));
  expect(await within(dialog).findByText("QC-89")).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "按原记录重新处理" }),
  ).toBeDisabled();
  expect(calls).toBe(1);
  vi.restoreAllMocks();
});

test("仍未入库时展示当前原因，只有明确再次点击才补处理", async () => {
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options.method === "POST") {
        writes++;
        return json({
          status: "NOT_PROCESSED",
          reasonCode: "QC_CONTROL_LOT_NOT_RESOLVED",
        });
      }
      return json(
        url.endsWith("/31")
          ? row
          : { rows: [row], total: 1, limit: 20, offset: 0 },
      );
    }),
  );
  renderPage();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "查看详情" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(
    await within(dialog).findByRole("button", { name: "按原记录重新处理" }),
  );
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "按原记录重新处理" }),
    ).toBeEnabled(),
  );
  expect(
    within(dialog).getByText(/未找到可用的对应质控批号/),
  ).toBeInTheDocument();
  expect(writes).toBe(1);
  await user.click(
    within(dialog).getByRole("button", { name: "按原记录重新处理" }),
  );
  await waitFor(() => expect(writes).toBe(2));
});

test.each([
  ["UNKNOWN", false],
  ["LEGACY_REVIEW", true],
  ["NOT_PROCESSED", false],
])("状态%s、canRetry=%s时禁止补处理", async (qcProcessingStatus, canRetry) => {
  const current = { ...row, qcProcessingStatus, canRetry };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      json(
        url.endsWith("/31")
          ? current
          : { rows: [current], total: 1, limit: 20, offset: 0 },
      ),
    ),
  );
  renderPage();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "查看详情" }));
  const dialog = await screen.findByRole("dialog");
  await within(dialog).findByText("LOT-UNKNOWN");
  expect(
    within(dialog).getByRole("button", { name: "按原记录重新处理" }),
  ).toBeDisabled();
  expect(
    fetch.mock.calls.every(([, options]) => options.method === "GET"),
  ).toBe(true);
});

test("结果未知记录经当前身份查回、无关联且后端允许时，明确核对后才重处理", async () => {
  const current = {
    ...row,
    qcProcessingStatus: "UNKNOWN",
    qcResultId: null,
    canRetry: true,
  };
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options.method === "POST") {
        writes++;
        return json({ status: "NOT_PROCESSED" });
      }
      return json(
        url.endsWith("/31")
          ? current
          : { rows: [current], total: 1, limit: 20, offset: 0 },
      );
    }),
  );
  renderPage();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "查看详情" }));
  const dialog = await screen.findByRole("dialog");
  const retry = await within(dialog).findByRole("button", {
    name: "核对后重新处理",
  });
  expect(writes).toBe(0);
  expect(retry).toBeEnabled();
  await user.click(retry);
  await waitFor(() => expect(writes).toBe(1));
});

test("关闭旧详情后，其迟到响应不能覆盖新记录", async () => {
  let resolveOld;
  const second = { ...row, id: "32", lotNumber: "LOT-SECOND" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (url.endsWith("/31"))
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      if (url.endsWith("/32")) return json(second);
      return json({ rows: [row, second], total: 2, limit: 20, offset: 0 });
    }),
  );
  renderPage();
  const user = userEvent.setup();
  await screen.findByText("LOT-UNKNOWN");
  await user.click(screen.getAllByRole("button", { name: "查看详情" })[0]);
  await user.click(
    within(screen.getByRole("dialog"))
      .getAllByRole("button", { name: "关闭" })
      .at(-1),
  );
  await user.click(screen.getAllByRole("button", { name: "查看详情" })[1]);
  const dialog = screen.getByRole("dialog");
  expect(await within(dialog).findByText("LOT-SECOND")).toBeInTheDocument();
  await act(async () => {
    resolveOld(json(row));
  });
  expect(within(dialog).queryByText("LOT-UNKNOWN")).not.toBeInTheDocument();
  expect(within(dialog).getByText("LOT-SECOND")).toBeInTheDocument();
});

test("提交中不能重复提交，旧记录回执不会改变另一详情", async () => {
  let resolveWrite;
  let writes = 0;
  const second = { ...row, id: "32", lotNumber: "LOT-SECOND" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options.method === "POST") {
        writes++;
        return new Promise((resolve) => {
          resolveWrite = resolve;
        });
      }
      if (url.endsWith("/31")) return json(row);
      if (url.endsWith("/32")) return json(second);
      return json({ rows: [row, second], total: 2, limit: 20, offset: 0 });
    }),
  );
  renderPage();
  const user = userEvent.setup();
  await screen.findByText("LOT-UNKNOWN");
  await user.click(screen.getAllByRole("button", { name: "查看详情" })[0]);
  let dialog = screen.getByRole("dialog");
  await user.dblClick(
    await within(dialog).findByRole("button", { name: "按原记录重新处理" }),
  );
  expect(writes).toBe(1);
  expect(
    within(dialog).getByRole("button", { name: "正在处理…" }),
  ).toBeDisabled();
  await user.click(
    within(dialog).getAllByRole("button", { name: "关闭" }).at(-1),
  );
  await user.click(screen.getAllByRole("button", { name: "查看详情" })[1]);
  dialog = screen.getByRole("dialog");
  expect(await within(dialog).findByText("LOT-SECOND")).toBeInTheDocument();
  await act(async () => {
    resolveWrite(json({ status: "CREATED", qcResultId: "QC-OTHER" }));
  });
  expect(within(dialog).queryByText("QC-OTHER")).not.toBeInTheDocument();
  expect(within(dialog).getByText("LOT-SECOND")).toBeInTheDocument();
});

test("筛选切换重置分页，迟到的上一条件结果不会覆盖列表", async () => {
  let resolveOld;
  const current = {
    ...row,
    id: "33",
    lotNumber: "LOT-CREATED",
    qcProcessingStatus: "CREATED",
    canRetry: false,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (url.includes("status=OPEN"))
        return new Promise((resolve) => {
          resolveOld = resolve;
        });
      return json({ rows: [current], total: 1, limit: 20, offset: 0 });
    }),
  );
  const history = renderPage("?page=2");
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("处理状态"), "CREATED");
  expect(await screen.findByText("LOT-CREATED")).toBeInTheDocument();
  expect(history.location.search).toContain("status=CREATED&page=1");
  await act(async () => {
    resolveOld(json({ rows: [row], total: 30, limit: 20, offset: 20 }));
  });
  expect(screen.queryByText("LOT-UNKNOWN")).not.toBeInTheDocument();
});

test.each([
  [{ ...row, id: "other" }, 200],
  [{ message: "Forbidden" }, 403],
])("不正确详情响应不能用于补处理：%j", async (body, status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      json(
        url.endsWith("/31")
          ? body
          : { rows: [row], total: 1, limit: 20, offset: 0 },
        url.endsWith("/31") ? status : 200,
      ),
    ),
  );
  renderPage();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "查看详情" }));
  const dialog = screen.getByRole("dialog");
  expect(
    await within(dialog).findByText("质控记录加载失败"),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "按原记录重新处理" }),
  ).toBeDisabled();
});

test("最后一页记录处理后减少，回到仍存在的页面并保持筛选", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      json({
        rows: url.includes("offset=20") ? [] : [row],
        total: 19,
        limit: 20,
        offset: url.includes("offset=20") ? 20 : 0,
      }),
    ),
  );
  const history = renderPage("?status=NOT_PROCESSED&page=2&size=20");
  expect(await screen.findByText("LOT-UNKNOWN")).toBeInTheDocument();
  expect(history.location.search).toContain(
    "status=NOT_PROCESSED&page=1&size=20",
  );
});

test("质控工作台提供待处理入口", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      json(url.endsWith("/summary") ? { totalInstruments: 0 } : []),
    ),
  );
  const history = createMemoryHistory({ initialEntries: ["/analyzers/qc/db"] });
  render(
    <Router history={history}>
      <IntlProvider locale="zh-CN" messages={zhMessages}>
        <QCDashboard />
      </IntlProvider>
    </Router>,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "仪器质控待处理" }));
  expect(history.location.pathname).toBe("/analyzers/qc/imports");
});
