import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../languages/zh.json";
import SampleResultsTable from "./SampleResultsTable";
import {
  cancellationPending,
  cancellationPendingKey,
  rememberCancellation,
  reconcileCancellations,
} from "./sampleCancelPending";

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../utils/Utils", () => ({
  postToOpenElisServerFullResponse: mocks.post,
}));
const test = (overrides = {}) => ({
  analysisId: "101",
  testId: "301",
  testName: "白细胞计数",
  status: "7",
  statusCode: "NotStarted",
  canCancelByStatus: true,
  ...overrides,
});
const sample = (overrides = {}) => ({
  id: "201",
  sampleAccessionNumber: "HMC-001",
  externalId: "管-001",
  sampleType: "全血",
  quantity: 5,
  effectiveRemainingQuantity: 4,
  hasRemainingQuantity: true,
  statusId: "20",
  statusCode: "Entered",
  orderedTests: [test()],
  ...overrides,
});
const cancelled = (overrides = {}) => ({
  success: true,
  analysisId: "101",
  sampleItemId: "201",
  test: test({ status: "9", statusCode: "Canceled", canCancelByStatus: false }),
  ...overrides,
});
const response = (body = cancelled(), status = 200) => ({
  status,
  ok: status >= 200 && status < 300,
  json: vi.fn().mockResolvedValue(body),
});
const wrap = (props) => (
  <IntlProvider locale="zh" messages={messages}>
    <SampleResultsTable
      sampleItems={[sample()]}
      canCancelTests={true}
      actorId="1"
      requestContext={{
        stamp: { identity: "actor-session" },
        current: () => true,
      }}
      {...props}
    />
  </IntlProvider>
);
const expand = () =>
  fireEvent.click(document.querySelector(".cds--table-expand__button"));
const cancelButton = () => screen.getByRole("button", { name: "取消检验项目" });
const confirm = () =>
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "确认取消",
    }),
  );
const reply = async (value) => {
  await act(async () => {
    await mocks.post.mock.calls[0][2](value);
  });
};
beforeEach(() => {
  mocks.post.mockReset();
  sessionStorage.clear();
});

describe("SampleResultsTable authoritative status and cancellation", () => {
  it.each([
    ["NotStarted", "未开始", true],
    ["TechnicalAcceptance", "技术审核通过", true],
    ["SampleRejected", "标本已拒收", false],
    ["Canceled", "已取消", false],
    ["TechnicalRejected", "技术审核退回", false],
    ["BiologistRejected", "结果审核退回", false],
    ["NonConforming_depricated", "不符合项（历史状态）", false],
    ["Finalized", "已完成", false],
  ])(
    "renders analysis %s in Chinese and obeys its capability",
    (code, label, allowed) => {
      render(
        wrap({
          sampleItems: [
            sample({
              orderedTests: [
                test({ statusCode: code, canCancelByStatus: allowed }),
              ],
            }),
          ],
        }),
      );
      expand();
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(cancelButton().disabled).toBe(!allowed);
      expect(screen.queryByText("7")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["Entered", "已登记"],
    ["SampleRejected", "已拒收"],
    ["Canceled", "已取消"],
    ["Disposed", "已销毁"],
  ])("shows sample %s independently of remaining volume", (code, label) => {
    render(
      wrap({
        sampleItems: [
          sample({ statusCode: code, hasRemainingQuantity: false }),
        ],
      }),
    );
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByText("无剩余量")).toBeInTheDocument();
    expand();
    expect(cancelButton().disabled).toBe(code !== "Entered");
  });

  it.each([null, undefined, "7", 7, "UNKNOWN", "Finalized injected", {}])(
    "blocks unknown analysis code %s",
    (code) => {
      render(
        wrap({
          sampleItems: [sample({ orderedTests: [test({ statusCode: code })] })],
        }),
      );
      expand();
      expect(screen.getByText("状态待核对")).toBeInTheDocument();
      expect(cancelButton()).toBeDisabled();
    },
  );

  it.each([false, undefined, null, "true", 1])(
    "requires explicit cancellation permission %s",
    (allowed) => {
      render(wrap({ canCancelTests: allowed }));
      expand();
      expect(cancelButton()).toBeDisabled();
    },
  );

  it.each([false, undefined, null, "true", 1])(
    "requires explicit status capability %s",
    (allowed) => {
      render(
        wrap({
          sampleItems: [
            sample({ orderedTests: [test({ canCancelByStatus: allowed })] }),
          ],
        }),
      );
      expand();
      expect(cancelButton()).toBeDisabled();
    },
  );

  it("blocks a missing or foreign sample status even when a legacy numeric ID is present", () => {
    render(
      wrap({ sampleItems: [sample({ statusId: "1", statusCode: "UNKNOWN" })] }),
    );
    expand();
    expect(cancelButton()).toBeDisabled();
    expect(screen.getByText("状态待核对")).toBeInTheDocument();
  });

  it.each([undefined, null, "", 101, "001", "invalid", "0"])(
    "blocks a missing or invalid analysis identity %s",
    (id) => {
      render(
        wrap({
          sampleItems: [sample({ orderedTests: [test({ analysisId: id })] })],
        }),
      );
      expand();
      expect(cancelButton()).toBeDisabled();
    },
  );
  it.each([undefined, null, "", 301, "invalid", "0"])(
    "blocks a missing or invalid test identity %s",
    (id) => {
      render(
        wrap({
          sampleItems: [sample({ orderedTests: [test({ testId: id })] })],
        }),
      );
      expand();
      expect(cancelButton()).toBeDisabled();
    },
  );
  it("blocks a noncanonical tube identity", () => {
    render(wrap({ sampleItems: [sample({ id: "0201" })] }));
    expand();
    expect(cancelButton()).toBeDisabled();
  });

  it("opens a compact danger confirmation without sending and allows neutral cancellation", () => {
    render(wrap());
    expand();
    fireEvent.click(cancelButton());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("白细胞计数")).toBeInTheDocument();
    expect(within(dialog).getByText("HMC-001 · 管-001")).toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    const abort = within(dialog).getByRole("button", { name: "取消" });
    expect(abort).toHaveClass("cds--btn--secondary");
    fireEvent.click(abort);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("submits once and checks the returned cancellation identity", async () => {
    const onTestCanceled = vi.fn();
    render(wrap({ onTestCanceled }));
    expand();
    fireEvent.click(cancelButton());
    confirm();
    confirm();
    expect(mocks.post).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.post.mock.calls[0][1])).toEqual({
      analysisId: "101",
      sampleItemId: "201",
    });
    await reply(response());
    expect(onTestCanceled).toHaveBeenCalledWith("201", "101", cancelled().test);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([400, 401, 403, 404, 409])(
    "keeps rows and shows a translated rejected request %s",
    async (status) => {
      const onTestCanceled = vi.fn();
      render(wrap({ onTestCanceled }));
      expand();
      fireEvent.click(cancelButton());
      confirm();
      await reply(
        response(
          { error: "Invalid state", message: "Backend English error" },
          status,
        ),
      );
      expect(onTestCanceled).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.queryByText("Backend English error"),
      ).not.toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog")).getByRole("alert"),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "确认取消",
        }),
      ).toBeEnabled();
    },
  );

  it.each([
    ["missing", undefined],
    ["server error", response({}, 500)],
    ["empty success", response(null)],
    ["wrong analysis", response(cancelled({ analysisId: "102" }))],
    ["wrong tube", response(cancelled({ sampleItemId: "202" }))],
    [
      "wrong nested analysis",
      response(
        cancelled({
          test: test({
            analysisId: "102",
            statusCode: "Canceled",
            canCancelByStatus: false,
          }),
        }),
      ),
    ],
    [
      "wrong test",
      response(
        cancelled({
          test: test({
            testId: "302",
            statusCode: "Canceled",
            canCancelByStatus: false,
          }),
        }),
      ),
    ],
    [
      "wrong final state",
      response(
        cancelled({
          test: test({ statusCode: "NotStarted", canCancelByStatus: false }),
        }),
      ),
    ],
    [
      "permissive cancellation",
      response(
        cancelled({
          test: test({ statusCode: "Canceled", canCancelByStatus: true }),
        }),
      ),
    ],
    ["false success", response(cancelled({ success: false }))],
  ])("blocks repeat after an unconfirmed result: %s", async (_name, value) => {
    const onTestCanceled = vi.fn();
    render(wrap({ onTestCanceled }));
    expand();
    fireEvent.click(cancelButton());
    confirm();
    await reply(value);
    expect(onTestCanceled).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认取消",
      }),
    ).toBeDisabled();
    expect(
      screen.getAllByText(
        "取消结果待核对，请重新查询标本列表。核对前不会再次提交取消。",
      ).length,
    ).toBeGreaterThan(0);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }),
    );
    expect(cancelButton()).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it("does not settle a request into an unmounted query", async () => {
    const onTestCanceled = vi.fn();
    const { unmount } = render(wrap({ onTestCanceled }));
    expand();
    fireEvent.click(cancelButton());
    confirm();
    unmount();
    await reply(response());
    expect(onTestCanceled).not.toHaveBeenCalled();
  });

  it("keeps the canceled project visible when its returned state is applied", async () => {
    function Harness() {
      const [items, setItems] = useState([sample()]);
      return wrap({
        sampleItems: items,
        onTestCanceled: (sampleId, analysisId, updated) =>
          setItems((current) =>
            current.map((item) =>
              item.id === sampleId
                ? {
                    ...item,
                    orderedTests: item.orderedTests.map((entry) =>
                      entry.analysisId === analysisId ? updated : entry,
                    ),
                  }
                : item,
            ),
          ),
      });
    }
    render(<Harness />);
    expand();
    fireEvent.click(cancelButton());
    confirm();
    await reply(response());
    expect(screen.getByText("白细胞计数")).toBeInTheDocument();
    expect(screen.getByText("已取消")).toBeInTheDocument();
    expect(cancelButton()).toBeDisabled();
  });
  it("retains an unconfirmed write marker across query remount and an old unchanged GET", async () => {
    const first = render(wrap());
    expand();
    fireEvent.click(cancelButton());
    confirm();
    await reply(undefined);
    first.unmount();
    reconcileCancellations("1", { sampleItems: [sample()] });
    render(wrap());
    expand();
    expect(cancelButton()).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledOnce();
  });
  it("retains an in-flight marker across query remount", () => {
    const first = render(wrap());
    expand();
    fireEvent.click(cancelButton());
    confirm();
    first.unmount();
    render(wrap());
    expand();
    expect(cancelButton()).toBeDisabled();
    expect(mocks.post).toHaveBeenCalledOnce();
  });
  it("clears a retained marker only on a confirmed canceled GET row", () => {
    const key = cancellationPendingKey("1", "201", "101");
    rememberCancellation(key, { current: () => true });
    reconcileCancellations("1", {
      sampleItems: [
        sample({
          orderedTests: [
            test({ statusCode: "Finalized", canCancelByStatus: false }),
          ],
        }),
      ],
    });
    expect(cancellationPending(key)).toBe(true);
    reconcileCancellations("1", {
      sampleItems: [sample({ orderedTests: [cancelled().test] })],
    });
    expect(cancellationPending(key)).toBe(false);
    render(
      wrap({ sampleItems: [sample({ orderedTests: [cancelled().test] })] }),
    );
    expand();
    expect(screen.getByText("已取消")).toBeInTheDocument();
    expect(cancelButton()).toBeDisabled();
  });
  it("offers a visible requery action without reopening cancellation", () => {
    rememberCancellation(cancellationPendingKey("1", "201", "101"), {
      current: () => true,
    });
    const onRecheck = vi.fn();
    render(wrap({ onRecheck }));
    expand();
    fireEvent.click(screen.getByRole("button", { name: "重新查询" }));
    expect(onRecheck).toHaveBeenCalledOnce();
    expect(cancelButton()).toBeDisabled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("stores no patient data, test name or credentials", () => {
    render(wrap());
    expand();
    fireEvent.click(cancelButton());
    confirm();
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.key(0)).toMatch(/^report\.pending\.v1\./);
    expect(sessionStorage.getItem(sessionStorage.key(0))).toBe(
      '{"pending":true}',
    );
  });
  it("does not submit when persistent marker storage fails", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    try {
      render(wrap());
      expand();
      fireEvent.click(cancelButton());
      confirm();
      expect(mocks.post).not.toHaveBeenCalled();
      expect(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "确认取消",
        }),
      ).toBeDisabled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("requires an account identity and current write session", () => {
    const first = render(wrap({ actorId: undefined }));
    expand();
    expect(cancelButton()).toBeDisabled();
    first.unmount();
    render(wrap({ requestContext: { current: () => false } }));
    expand();
    expect(cancelButton()).toBeDisabled();
  });
  it("isolates a late cancellation response when the account session changes", async () => {
    let current = true;
    const onTestCanceled = vi.fn();
    render(
      wrap({ onTestCanceled, requestContext: { current: () => current } }),
    );
    expand();
    fireEvent.click(cancelButton());
    confirm();
    current = false;
    await reply(response());
    expect(onTestCanceled).not.toHaveBeenCalled();
    expect(cancellationPending(cancellationPendingKey("1", "201", "101"))).toBe(
      true,
    );
  });
  it("releases a marker after a structured rejection so a deliberate retry is possible", async () => {
    render(wrap());
    expand();
    fireEvent.click(cancelButton());
    confirm();
    await reply(response({ error: "Invalid State" }, 409));
    expect(cancellationPending(cancellationPendingKey("1", "201", "101"))).toBe(
      false,
    );
    confirm();
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });
  it("keeps an ambiguous rejection blocked without a structured error", async () => {
    render(wrap());
    expand();
    fireEvent.click(cancelButton());
    confirm();
    await reply(response({ message: "unrecognized" }, 400));
    expect(cancellationPending(cancellationPendingKey("1", "201", "101"))).toBe(
      true,
    );
    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "确认取消",
      }),
    ).toBeDisabled();
  });
});
