import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { MemoryRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/zh.json";
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
vi.mock("./collectionTransport", () => ({ postRecoveredCollection: vi.fn() }));
import { OrderProvider, useOrderContext } from "./OrderContext";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import EntryRecoveryPanel from "./EntryRecoveryPanel";
import { readOpenElisResponse } from "../utils/readOpenElisResponse";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../utils/Utils";
import { postRecoveredCollection } from "./collectionTransport";
import { rememberEntryCheckpoint } from "./orderEntryRecovery";
import {
  collectionRecoveryResult,
  recoveryReference,
} from "./collectionRecovery.fixtures";
let context, finish;
function Probe() {
  context = useOrderContext();
  return <EntryRecoveryPanel />;
}
function View({ authenticated = true }) {
  return (
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated,
              userId: "SIM-USER",
              sessionId: "SIM-SESSION",
              csrf: "SIM-CSRF",
            },
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
const response = (data) => ({
  status: 200,
  redirected: false,
  headers: new Headers({ "content-type": "application/json" }),
  json: async () => data,
});
const afterCollection = () => {
  const data = collectionRecoveryResult();
  data.current.requestedSpecimens[1].status = "COLLECTED";
  data.current.requestedSpecimens[1].sampleItemId = "1002";
  data.current.physicalSpecimens.push({
    ...data.current.physicalSpecimens[0],
    id: "1002",
    requestId: "902",
    quantity: 1,
    collectionDate: "2026-09-13T06:20:00Z",
    collector: "模拟采集员",
    analyses: [{ id: "1102", testId: "31", statusId: "3", lastUpdated: null }],
  });
  return data;
};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  sessionStorage.clear();
  rememberEntryCheckpoint(recoveryReference);
  readOpenElisResponse
    .mockReset()
    .mockResolvedValue(response(collectionRecoveryResult()));
  getFromOpenElisServer.mockReset();
  postToOpenElisServerFullResponse.mockReset();
  postRecoveredCollection.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
});
afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const query = async () => {
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["order.recovery.currentCheck"],
    }),
  );
  await screen.findByText("模拟患者");
};
const adopt = async () => {
  await query();
  fireEvent.click(
    screen.getByRole("button", { name: "确认本次申请，登记采集" }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "本次采集第 2 管" }));
  fireEvent.change(screen.getByLabelText("采集人员"), {
    target: { value: "模拟采集员" },
  });
};
it("查询与明确采用不改原表单，只提交所选剩余管并核对当前事实", async () => {
  render(<View />);
  const before = JSON.stringify(context.orderData),
    initialReads = getFromOpenElisServer.mock.calls.length;
  await adopt();
  expect(screen.getByLabelText("采集日期")).toHaveValue("2026-09-13");
  expect(screen.getByLabelText("采集时间")).toHaveValue("14:20");
  expect(screen.getByText("24小时制，例如：14:20")).toBeInTheDocument();
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  expect(screen.getByText("未记录知情同意")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "保存所选标本采集" }));
  await waitFor(() => expect(postRecoveredCollection).toHaveBeenCalledTimes(1));
  const body = JSON.parse(postRecoveredCollection.mock.calls[0][0]);
  expect(body.collectionOnly).toBe(true);
  expect(body.sampleXML).toContain('sampleTypeRequestId="902"');
  expect(body.sampleXML).not.toContain('sampleTypeRequestId="901"');
  readOpenElisResponse.mockResolvedValue(response(afterCollection()));
  await act(async () =>
    finish({
      status: 200,
      redirected: false,
      data: {
        success: true,
        sampleOrderItems: { sampleId: "701", labNo: "SIM-COLLECTION-701" },
      },
    }),
  );
  await screen.findByText("本次采集已核实保存。继续处理前请重新核对当前申请。");
  expect(readOpenElisResponse).toHaveBeenCalledTimes(2);
  expect(
    readOpenElisResponse.mock.calls.every(([url]) => url.endsWith("/current")),
  ).toBe(true);
  expect(JSON.stringify(context.orderData)).toBe(before);
  expect(context.orderId).toBeNull();
  expect(context.stepProgress.collect).toBe(false);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).not.toBeNull();
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(getFromOpenElisServer).toHaveBeenCalledTimes(initialReads);
});
it("未采用、伪造快照和重复保存不能派发；失败只能重新核对", async () => {
  render(<View />);
  await query();
  const current = await context.queryCurrentEntryRecovery(
    recoveryReference.submissionId,
  );
  await expect(
    context.saveRecoveredCollection(current, []),
  ).rejects.toBeDefined();
  expect(() =>
    context.adoptRecoveredCollection({
      ...current,
      current: { ...current.current, sampleId: "999" },
    }),
  ).toThrow();
  expect(postRecoveredCollection).not.toHaveBeenCalled();
  await adopt();
  fireEvent.click(screen.getByRole("button", { name: "保存所选标本采集" }));
  await waitFor(() => expect(postRecoveredCollection).toHaveBeenCalledTimes(1));
  await act(async () => finish({ status: 503 }));
  await screen.findByText(messages["order.collectionRecovery.unknown"]);
  expect(
    screen.getByRole("button", { name: "保存所选标本采集" }),
  ).toBeDisabled();
  expect(postRecoveredCollection).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).not.toBeNull();
});
it("发送后切换会话不展示成功、不继续回读或开放旧保存", async () => {
  const view = render(<View />);
  await adopt();
  fireEvent.click(screen.getByRole("button", { name: "保存所选标本采集" }));
  await waitFor(() => expect(postRecoveredCollection).toHaveBeenCalledTimes(1));
  view.rerender(<View authenticated={false} />);
  await act(async () =>
    finish({
      status: 200,
      data: {
        success: true,
        sampleOrderItems: { sampleId: "701", labNo: "SIM-COLLECTION-701" },
      },
    }),
  );
  expect(
    screen.queryByText("本次采集已核实保存。继续处理前请重新核对当前申请。"),
  ).not.toBeInTheDocument();
  expect(readOpenElisResponse).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("lis.entry.pending.v1")).not.toBeNull();
});

it("未知保存后同页及刷新读到旧待采集状态均禁止第二次POST；真实匹配读回才能解除", async () => {
  const view = render(<View />);
  await adopt();
  fireEvent.click(screen.getByRole("button", { name: "保存所选标本采集" }));
  await waitFor(() => expect(postRecoveredCollection).toHaveBeenCalledTimes(1));
  const marker = sessionStorage.getItem("lis.collection.pending.v1");
  expect(marker).toBeTruthy();
  expect(marker).not.toMatch(
    /模拟患者|模拟采集员|SIM-COLLECTION|Asia|2026-09-13|requestId|quantity/,
  );
  await act(async () => finish({ status: 503 }));
  await act(async () => {
    await expect(
      context.queryCurrentEntryRecovery(recoveryReference.submissionId),
    ).rejects.toMatchObject({ errorKey: "order.collectionRecovery.unknown" });
  });
  view.unmount();
  render(<View />);
  await act(async () => {
    await expect(
      context.queryCurrentEntryRecovery(recoveryReference.submissionId),
    ).rejects.toMatchObject({ errorKey: "order.collectionRecovery.unknown" });
  });
  expect(postRecoveredCollection).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem("lis.collection.pending.v1")).toBe(marker);
  readOpenElisResponse.mockResolvedValue(response(afterCollection()));
  let value;
  await act(async () => {
    value = await context.queryCurrentEntryRecovery(
      recoveryReference.submissionId,
    );
  });
  expect(value.current.requestedSpecimens[1].status).toBe("COLLECTED");
  expect(sessionStorage.getItem("lis.collection.pending.v1")).toBeNull();
  expect(postRecoveredCollection).toHaveBeenCalledTimes(1);
});

it("没有首单marker时，采集未知刷新仍显示核对码且阻止普通保存", async () => {
  sessionStorage.clear();
  const view = render(<View />);
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["order.recovery.currentTitle"],
    }),
  );
  fireEvent.change(
    screen.getByLabelText(messages["order.save.submissionReference"]),
    { target: { value: recoveryReference.submissionId } },
  );
  await adopt();
  fireEvent.click(screen.getByRole("button", { name: "保存所选标本采集" }));
  await waitFor(() => expect(postRecoveredCollection).toHaveBeenCalledTimes(1));
  await act(async () => finish({ status: 503 }));
  expect(sessionStorage.getItem("lis.entry.pending.v1")).toBeNull();
  view.unmount();
  render(<View />);
  expect(
    screen.getByLabelText(messages["order.save.submissionReference"]),
  ).toHaveValue(recoveryReference.submissionId);
  await act(async () => {
    await expect(context.saveOrderEntry()).rejects.toBeDefined();
  });
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  expect(postRecoveredCollection).toHaveBeenCalledTimes(1);
});

it("采集期间重复点击与旧整单保存不产生额外写入", async () => {
  render(<View />);
  await adopt();
  const button = screen.getByRole("button", { name: "保存所选标本采集" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(postRecoveredCollection).toHaveBeenCalledTimes(1));
  await act(async () => {
    await expect(context.saveOrderEntry()).rejects.toBeDefined();
  });
  expect(postToOpenElisServerFullResponse).not.toHaveBeenCalled();
  await act(async () => finish({ status: 503 }));
  expect(postRecoveredCollection).toHaveBeenCalledTimes(1);
});
