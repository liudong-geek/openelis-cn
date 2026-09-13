import { submitOrderEntry } from "./orderEntrySubmission";

describe("开单首个派发前的生命周期检查", () => {
  it.each(["request", "session"])(
    "%s已失效时不发送首个写请求",
    async (failure) => {
      const post = vi.fn();
      const result = submitOrderEntry({
        operation: { labNo: "SIM-PREDISPATCH" },
        body: "{}",
        samples: [],
        post,
        read: vi.fn(),
        createRequests: vi.fn(),
        isCurrent: () => failure !== "request",
        canContinue: () => failure !== "session",
        onUnknown: vi.fn(),
      }).catch((error) => error);
      expect(post).not.toHaveBeenCalled();
      expect((await result).errorKey).toBe(
        failure === "request"
          ? "order.progress.requestChanged"
          : "security.sessionWriteBlocked",
      );
    },
  );
  it("已保存申请不得进入旧的读取再逐管追加链", async () => {
    const operation = { labNo: "SIM-SESSION-LOST" };
    const onUnknown = vi.fn();
    const read = vi.fn();
    const result = submitOrderEntry({
      operation,
      orderId: "701",
      body: "{}",
      samples: [],
      post: vi.fn(),
      read,
      createRequests: vi.fn(),
      isCurrent: () => true,
      canContinue: () => true,
      onUnknown,
    }).catch((error) => error);
    expect((await result).errorKey).toBe("order.entry.editUnavailable");
    expect(onUnknown).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
});
