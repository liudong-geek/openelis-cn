import React from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { Theme } from "@carbon/react";
import { IntlProvider } from "react-intl";

const fixture = vi.hoisted(() => ({ context: null }));
vi.mock("./OrderContext", () => ({
  useOrderContext: () => fixture.context,
}));

import EntryRecoveryPanel from "./EntryRecoveryPanel";
import { ENTRY_CHECKPOINT_KEY } from "./orderEntryRecovery";
import messages from "../../languages/zh.json";

const submissionId = "11111111-2222-4333-8444-555555555555";
const checkpoint = {
  version: 1,
  submissionId,
  requestHash: "a".repeat(64),
};
const historicalReceipt = () => ({
  version: 1,
  submissionId,
  labNo: "SIM-RECOVERY-PANEL-701",
  requestedSpecimens: [{ id: "901" }, { id: "902" }],
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
const content = () => (
  <IntlProvider locale="zh" messages={messages}>
    <Theme theme="white">
      <EntryRecoveryPanel />
    </Theme>
  </IntlProvider>
);
const queryButton = () =>
  screen.getByRole("button", { name: messages["order.recovery.check"] });
const codeInput = () =>
  screen.getByRole("textbox", {
    name: messages["order.save.submissionReference"],
  });

beforeEach(() => {
  sessionStorage.clear();
  fixture.context = {
    entryRecovery: { checkpoint: { ...checkpoint }, error: null },
    queryEntryRecovery: vi.fn().mockResolvedValue(historicalReceipt()),
    isRecoveryCurrent: vi.fn(() => true),
    isSubmitting: false,
    // Querying must not invoke clinical writes or reinterpret the current draft.
    saveOrderEntry: vi.fn(),
    saveOrder: vi.fn(),
    setOrderData: vi.fn(),
    setSamples: vi.fn(),
    resetOrder: vi.fn(),
    setCurrentStep: vi.fn(),
  };
});

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("EntryRecoveryPanel 的真实 Carbon/Intl 只读交互", () => {
  it("待核对码默认展开且不可编辑，不自动发送查询", async () => {
    render(content());

    expect(
      screen.getByRole("heading", { name: messages["order.recovery.title"] }),
    ).toBeInTheDocument();
    expect(codeInput()).toHaveValue(submissionId);
    expect(codeInput()).toHaveAttribute("readonly");
    await userEvent.type(codeInput(), "SIM-OTHER");
    expect(codeInput()).toHaveValue(submissionId);
    expect(fixture.context.queryEntryRecovery).not.toHaveBeenCalled();
  });

  it("连续点击在途查询只发送一次，完成前禁止重查和修改核对码", async () => {
    const request = deferred();
    fixture.context.queryEntryRecovery.mockReturnValue(request.promise);
    render(content());

    await userEvent.dblClick(queryButton());

    expect(fixture.context.queryEntryRecovery).toHaveBeenCalledTimes(1);
    expect(fixture.context.queryEntryRecovery).toHaveBeenCalledWith(
      submissionId,
      expect.any(AbortSignal),
    );
    expect(queryButton()).toBeDisabled();
    // Carbon keeps a read-only value copyable rather than adding disabled.
    expect(codeInput()).toHaveAttribute("readonly");
    await userEvent.type(codeInput(), "SIM-OTHER");
    expect(codeInput()).toHaveValue(submissionId);
    expect(
      screen.getByText(messages["order.recovery.loading"]),
    ).toBeInTheDocument();
    await userEvent.click(queryButton());
    expect(fixture.context.queryEntryRecovery).toHaveBeenCalledTimes(1);

    await act(async () => request.resolve(historicalReceipt()));
    await waitFor(() => expect(queryButton()).toBeEnabled());
  });

  it("404 明确提示尚未查到并允许只读重查，不移除原核对码", async () => {
    const stored = JSON.stringify(checkpoint);
    sessionStorage.setItem(ENTRY_CHECKPOINT_KEY, stored);
    fixture.context.queryEntryRecovery
      .mockRejectedValueOnce({ errorKey: "order.recovery.notFound" })
      .mockResolvedValueOnce(historicalReceipt());
    render(content());

    await userEvent.click(queryButton());
    expect(
      await screen.findByText(messages["order.recovery.notFound"]),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(messages["order.recovery.confirmed"]),
    ).not.toBeInTheDocument();
    expect(queryButton()).toBeEnabled();
    expect(codeInput()).toHaveValue(submissionId);
    expect(sessionStorage.getItem(ENTRY_CHECKPOINT_KEY)).toBe(stored);

    await userEvent.click(queryButton());
    expect(
      await screen.findByText(messages["order.recovery.confirmed"]),
    ).toBeInTheDocument();
    expect(fixture.context.queryEntryRecovery).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(ENTRY_CHECKPOINT_KEY)).toBe(stored);
    expect(
      screen.queryByText(messages["order.recovery.notFound"]),
    ).not.toBeInTheDocument();
  });

  it("成功只显示历史保存和未开放恢复说明，不提供打开、继续或写入操作", async () => {
    render(content());
    await userEvent.click(queryButton());

    expect(
      await screen.findByText(messages["order.recovery.confirmed"]),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /申请编号：SIM-RECOVERY-PANEL-701；该次保存包含 2 管标本申请/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(messages["order.recovery.readOnlyNotice"]),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toEqual([queryButton()]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    for (const action of [
      "saveOrderEntry",
      "saveOrder",
      "setOrderData",
      "setSamples",
      "resetOrder",
      "setCurrentStep",
    ]) {
      expect(fixture.context[action]).not.toHaveBeenCalled();
    }
  });

  it("没有待核对指针时可手工输入查询，查询成功不创建持久指针", async () => {
    fixture.context.entryRecovery = { checkpoint: null, error: null };
    render(content());
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: messages["order.recovery.title"] }),
    );
    expect(queryButton()).toBeDisabled();
    expect(codeInput()).not.toHaveAttribute("readonly");
    await userEvent.type(codeInput(), submissionId);
    await userEvent.click(queryButton());

    expect(
      await screen.findByText(messages["order.recovery.confirmed"]),
    ).toBeInTheDocument();
    expect(fixture.context.queryEntryRecovery).toHaveBeenCalledWith(
      submissionId,
      expect.any(AbortSignal),
    );
    expect(fixture.context.entryRecovery.checkpoint).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(fixture.context.setOrderData).not.toHaveBeenCalled();
    expect(fixture.context.setSamples).not.toHaveBeenCalled();
  });

  it.each(["resolve", "reject"])(
    "卸载取消查询，迟到 %s 不出现在新的面板",
    async (completion) => {
      const request = deferred();
      fixture.context.queryEntryRecovery.mockReturnValue(request.promise);
      const view = render(content());
      await userEvent.click(queryButton());
      const signal = fixture.context.queryEntryRecovery.mock.calls[0][1];
      expect(signal.aborted).toBe(false);

      act(() => {
        view.unmount();
      });
      expect(signal.aborted).toBe(true);
      render(content());
      await act(async () => {
        if (completion === "resolve") request.resolve(historicalReceipt());
        else request.reject({ errorKey: "order.recovery.notFound" });
        await request.promise.catch(() => {});
      });

      expect(
        screen.queryByText(messages["order.recovery.confirmed"]),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(messages["order.recovery.notFound"]),
      ).not.toBeInTheDocument();
      expect(queryButton()).toBeEnabled();
      expect(fixture.context.queryEntryRecovery).toHaveBeenCalledTimes(1);
    },
  );

  it("Provider 判定身份或工作区已失效后隐藏旧回执", async () => {
    const view = render(content());
    await userEvent.click(queryButton());
    expect(
      await screen.findByText(messages["order.recovery.confirmed"]),
    ).toBeInTheDocument();

    fixture.context.isRecoveryCurrent.mockReturnValue(false);
    view.rerender(content());

    expect(
      screen.queryByText(messages["order.recovery.confirmed"]),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/SIM-RECOVERY-PANEL-701/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(messages["order.recovery.readOnlyNotice"]),
    ).not.toBeInTheDocument();
    expect(codeInput()).toHaveValue(submissionId);
  });

  it("已进入保存阶段时不能发起并行查询", async () => {
    fixture.context.isSubmitting = true;
    const view = render(content());
    expect(queryButton()).toBeDisabled();
    expect(codeInput()).toHaveAttribute("readonly");
    await userEvent.click(queryButton());
    expect(fixture.context.queryEntryRecovery).not.toHaveBeenCalled();

    fixture.context.isSubmitting = false;
    view.rerender(content());
    expect(queryButton()).toBeEnabled();
  });

  it("手工改动核对码后立即清除之前的历史结果", async () => {
    fixture.context.entryRecovery = { checkpoint: null, error: null };
    render(content());
    await userEvent.click(
      screen.getByRole("button", { name: messages["order.recovery.title"] }),
    );
    await userEvent.type(codeInput(), submissionId);
    await userEvent.click(queryButton());
    expect(
      await screen.findByText(messages["order.recovery.confirmed"]),
    ).toBeInTheDocument();

    await userEvent.clear(codeInput());

    expect(
      screen.queryByText(messages["order.recovery.confirmed"]),
    ).not.toBeInTheDocument();
    expect(queryButton()).toBeDisabled();
    expect(fixture.context.queryEntryRecovery).toHaveBeenCalledTimes(1);
  });
});
