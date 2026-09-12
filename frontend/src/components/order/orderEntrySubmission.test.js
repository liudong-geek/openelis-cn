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
  it("写请求发送后身份失效也记录未知，不能仅返回切换错误后丢失防重锁", async () => {
    let callback,
      valid = true;
    const operation = { labNo: "SIM-SESSION-LOST" };
    const onUnknown = vi.fn();
    const read = vi.fn();
    const result = submitOrderEntry({
      operation,
      body: "{}",
      samples: [],
      post: (_url, _body, finish) => {
        callback = finish;
      },
      read,
      createRequests: vi.fn(),
      isCurrent: () => valid,
      canContinue: () => true,
      onUnknown,
    }).catch((error) => error);
    valid = false;
    callback({ status: 200 });
    expect((await result).errorKey).toBe("order.progress.requestChanged");
    expect(onUnknown).toHaveBeenCalledWith(operation);
    expect(read).not.toHaveBeenCalled();
  });
});
