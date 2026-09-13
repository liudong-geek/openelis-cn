import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { MemoryRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import { webcrypto } from "node:crypto";
vi.mock("../layout/Layout", () => ({
  ConfigurationContext: React.createContext({}),
}));
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
  putToOpenElisServer: vi.fn(),
}));
vi.mock("../utils/readOpenElisResponse", () => ({
  readOpenElisResponse: vi.fn(),
}));
import messages from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { OrderProvider, useOrderContext } from "./OrderContext";
import EntryRecoveryPanel from "./EntryRecoveryPanel";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../utils/Utils";
import {
  collectionRecoveryResult,
  recoveryReference,
} from "./collectionRecovery.fixtures";
import { rememberEntryCheckpoint } from "./orderEntryRecovery";
import { hasPendingLabels } from "./labelCheckpoint";
let context;
function Probe() {
  context = useOrderContext();
  return <EntryRecoveryPanel />;
}
function View({
  sessionId = "SIM-SESSION",
  checking = false,
  failed = false,
  generation = 0,
  enhanced = false,
}) {
  return (
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: "SIM-USER",
              sessionId,
              csrf: "SIM-CSRF",
            },
            isCheckingLogin: () => checking,
            errorLoadingSessionDetails: failed,
            ...(enhanced
              ? { getSessionCheckGeneration: () => generation }
              : {}),
          }}
        >
          <OrderProvider>
            <Probe />
          </OrderProvider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>
  );
}
const response = (data) =>
  new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
const labelResponse = (body) => ({
  orderId: body.orderId,
  labNumber: body.labNumber,
  totalGenerated: body.labels.reduce((n, l) => n + l.quantity, 0),
  items: body.labels.map((row) => ({
    ...row,
    barcode: body.labNumber + (row.type === "specimen" ? ".1" : ""),
    requestedQuantity: row.quantity,
    generatedQuantity: row.quantity,
    reason: null,
  })),
  pdfBase64: btoa("%PDF-1.4\nSIM-only\n%%EOF"),
});
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  rememberEntryCheckpoint(recoveryReference);
  readOpenElisResponse
    .mockReset()
    .mockImplementation(async () => response(collectionRecoveryResult()));
  getFromOpenElisServer.mockReset();
  postToOpenElisServerFullResponse.mockReset();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async (url, options) =>
        response(labelResponse(JSON.parse(options.body))),
      ),
  );
  URL.createObjectURL = vi.fn(() => "blob:SIM-label");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const query = async () => {
  fireEvent.click(
    screen.getByRole("button", { name: "查询当前状态", exact: true }),
  );
  await screen.findByText("模拟患者");
};
const open = async () => {
  await query();
  fireEvent.click(screen.getByRole("button", { name: "处理已采集标本标签" }));
};
const generate = () =>
  fireEvent.click(screen.getByRole("button", { name: "生成所选标签" }));
it("核对后显式生成实管标签；不修改原申请、不自动贴签或出纸；重复预览零POST", async () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {}),
    popup = vi.spyOn(window, "open").mockReturnValue({ opener: null });
  render(<View />);
  await open();
  expect(fetch).not.toHaveBeenCalled();
  // The workspace reads blank-form defaults on mount. The label operation may
  // not perform another legacy form load or any whole-order save.
  getFromOpenElisServer.mockClear();
  expect(screen.getByText("SIM-COLLECTION-701.1")).toBeInTheDocument();
  expect(screen.queryByText("SIM-COLLECTION-701.901")).not.toBeInTheDocument();
  generate();
  await screen.findByRole("button", { name: "查看已生成文件" });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    orderId: "701",
    labNumber: "SIM-COLLECTION-701",
    labels: [
      { type: "order", sampleItemId: null, quantity: 1 },
      { type: "specimen", sampleItemId: "1001", quantity: 1 },
    ],
  });
  for (let i = 0; i < 2; i++)
    fireEvent.click(screen.getByRole("button", { name: "查看已生成文件" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(popup).toHaveBeenCalledTimes(2);
  expect(print).not.toHaveBeenCalled();
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(getFromOpenElisServer).not.toHaveBeenCalled();
  expect(context.orderId).toBeNull();
  expect(context.stepProgress.label).toBe(false);
  const checkbox = screen.getByRole("checkbox");
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toHaveAccessibleName(/已核对条码并贴签/);
});
it.each(["checking", "failed", "session", "generation"])(
  "会话%s变化后撤销文件；恢复同一账号也不复活",
  async (kind) => {
    const view = render(<View enhanced={kind === "generation"} />);
    await open();
    generate();
    await screen.findByRole("button", { name: "查看已生成文件" });
    view.rerender(
      <View
        checking={kind === "checking"}
        failed={kind === "failed"}
        sessionId={kind === "session" ? "SIM-OTHER" : "SIM-SESSION"}
        enhanced={kind === "generation"}
        generation={kind === "generation" ? 1 : 0}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "查看已生成文件" }),
    ).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:SIM-label");
    view.rerender(<View enhanced={kind === "generation"} />);
    expect(
      screen.queryByRole("button", { name: "查看已生成文件" }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it("未知结果跨重新挂载保护，重新核对不代表请求已回滚", async () => {
  fetch.mockRejectedValue(new Error("SIM-network"));
  const view = render(<View />);
  await open();
  generate();
  await screen.findByText(messages["order.labels.pending"]);
  expect(screen.getByRole("button", { name: "生成所选标签" })).toBeDisabled();
  expect(hasPendingLabels()).toBe(true);
  view.unmount();
  render(<View />);
  await open();
  expect(screen.getByRole("button", { name: "生成所选标签" })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("文件已生成但浏览器无法建立预览时，刷新重挂也不能再次生成", async () => {
  URL.createObjectURL.mockImplementation(() => {
    throw new Error("SIM-blob-allocation");
  });
  const view = render(<View />);
  await open();
  generate();
  await screen.findByText(messages["order.labels.pending"]);
  expect(hasPendingLabels()).toBe(true);
  expect(
    screen.queryByRole("button", { name: "查看已生成文件" }),
  ).not.toBeInTheDocument();
  view.unmount();
  render(<View />);
  await open();
  expect(screen.getByRole("button", { name: "生成所选标签" })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("生成中旧查询、采集及整单保存不能抢占；卸载后的迟到响应丢弃", async () => {
  let finish;
  fetch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<View />);
  await open();
  generate();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await expect(
    context.queryCurrentEntryRecovery(recoveryReference.submissionId),
  ).rejects.toThrow();
  await expect(context.saveOrder()).rejects.toThrow();
  await expect(context.saveOrderEntry()).rejects.toThrow();
  expect(() =>
    context.adoptRecoveredCollection(collectionRecoveryResult()),
  ).toThrow();
  view.unmount();
  await act(async () =>
    finish(response(labelResponse(JSON.parse(fetch.mock.calls[0][1].body)))),
  );
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(hasPendingLabels()).toBe(true);
});
it("用户可见结果不能借用另一私有核对记录或修改实管ID授权", async () => {
  render(<View />);
  let first, cap;
  await act(async () => {
    first = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
    cap = context.prepareRecoveredLabels(first);
  });
  const tampered = JSON.parse(JSON.stringify(first));
  tampered.current.physicalSpecimens[0].id = "901";
  expect(() => context.prepareRecoveredLabels(tampered)).toThrow("STALE");
  await act(async () =>
    context.queryCurrentEntryRecovery(recoveryReference.submissionId),
  );
  expect(cap.isCurrent()).toBe(false);
  await expect(
    cap.generate({
      orderId: "701",
      labNumber: "SIM-COLLECTION-701",
      labels: [],
    }),
  ).rejects.toThrow("STALE");
  expect(fetch).not.toHaveBeenCalled();
});
