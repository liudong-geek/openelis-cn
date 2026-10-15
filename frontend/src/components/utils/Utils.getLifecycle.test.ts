import { afterEach, describe, expect, test, vi } from "vitest";
import { getFromOpenElisServer } from "./Utils";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const delayedJson = () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        stream = controller;
      },
    }),
    { headers: { "Content-Type": "application/json" } },
  );
  return {
    response,
    complete(body: string) {
      stream.enqueue(new TextEncoder().encode(body));
      stream.close();
    },
  };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("owned legacy GET lifetimes", () => {
  test("awaits a real delayed JSON body before delivering exactly once", async () => {
    const pending = delayedJson();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pending.response));
    const callback = vi.fn();
    const completed = getFromOpenElisServer("/rest/example", callback);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(callback).not.toHaveBeenCalled();
    pending.complete('{"value":7}');
    await completed;
    expect(callback).toHaveBeenCalledExactlyOnceWith({ value: 7 });
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    window.dispatchEvent(new Event("pagehide"));
    expect(signal?.aborted).toBe(false); // settled request listener was removed
  });

  test("pagehide aborts the actual fetch signal and rejects a late successful body", async () => {
    const pending = delayedJson();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pending.response));
    const callback = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const completed = getFromOpenElisServer("/rest/example", callback);
    await Promise.resolve();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    window.dispatchEvent(new Event("pagehide"));
    expect(signal?.aborted).toBe(true);
    pending.complete('{"stale":true}');
    await completed;
    expect(callback).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  test("caller cancellation suppresses a delayed network failure only for that request", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const caller = new AbortController();
    const callback = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const completed = getFromOpenElisServer(
      "/rest/example",
      callback,
      caller.signal,
    );
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(signal).not.toBe(caller.signal);
    caller.abort();
    expect(signal?.aborted).toBe(true);
    pending.reject(new TypeError("Failed to fetch"));
    await completed;
    expect(error).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test("an already aborted caller starts no fetch or callback", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const caller = new AbortController();
    caller.abort();
    const callback = vi.fn();
    await getFromOpenElisServer("/rest/example", callback, caller.signal);
    expect(fetch).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test.each([
    new TypeError("Failed to fetch"),
    new DOMException("active abort-shaped failure", "AbortError"),
  ])(
    "an active rejection remains visible regardless of its name: %s",
    async (failure) => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
      const callback = vi.fn();
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await getFromOpenElisServer("/rest/example", callback);
      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
      expect(callback).toHaveBeenCalledExactlyOnceWith(undefined);
    },
  );

  test("active invalid JSON still reports and delivers the original undefined failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not JSON", {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const callback = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await getFromOpenElisServer("/rest/example", callback);
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
    expect(callback).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("preserves the existing non-2xx JSON callback contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json({ error: "existing contract" }, 403)),
    );
    const callback = vi.fn();
    await getFromOpenElisServer("/rest/example", callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      error: "existing contract",
    });
  });

  test("callback errors reject once even when the callback cancels its own signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ current: true })));
    const caller = new AbortController();
    const failure = new DOMException("caller bug", "AbortError");
    const callback = vi.fn(() => {
      caller.abort();
      throw failure;
    });
    await expect(
      getFromOpenElisServer("/rest/example", callback, caller.signal),
    ).rejects.toBe(failure);
    expect(callback).toHaveBeenCalledExactlyOnceWith({ current: true });
  });

  test("a callback throwing during active failure delivery also remains rejected once", async () => {
    const networkFailure = new TypeError("network failure");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkFailure));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const callerFailure = new Error("callback failure");
    const callback = vi.fn(() => {
      throw callerFailure;
    });
    await expect(getFromOpenElisServer("/rest/example", callback)).rejects.toBe(
      callerFailure,
    );
    expect(error).toHaveBeenCalledExactlyOnceWith(networkFailure);
    expect(callback).toHaveBeenCalledExactlyOnceWith(undefined);
  });
  test("caller cancellation removes pagehide and caller listeners synchronously while fetch is pending", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const caller = new AbortController();
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const removedCaller = vi.spyOn(caller.signal, "removeEventListener");
    const callback = vi.fn();
    const completed = getFromOpenElisServer(
      "/rest/example",
      callback,
      caller.signal,
    );
    const listener = added.mock.calls.find(
      ([type]) => type === "pagehide",
    )?.[1];
    caller.abort();
    expect(removed).toHaveBeenCalledWith("pagehide", listener);
    expect(removedCaller).toHaveBeenCalledWith("abort", listener);
    pending.reject(new TypeError("Failed to fetch"));
    await completed;
    expect(callback).not.toHaveBeenCalled();
  });

  test.each(["successful JSON", "failed network"])(
    "a settled %s read removes pagehide and caller listeners after its response body",
    async (outcome) => {
      const failure = new TypeError("Failed to fetch");
      vi.stubGlobal(
        "fetch",
        outcome === "successful JSON"
          ? vi.fn().mockResolvedValue(json({ current: true }))
          : vi.fn().mockRejectedValue(failure),
      );
      vi.spyOn(console, "error").mockImplementation(() => {});
      const caller = new AbortController();
      const added = vi.spyOn(window, "addEventListener");
      const removed = vi.spyOn(window, "removeEventListener");
      const removedCaller = vi.spyOn(caller.signal, "removeEventListener");
      await getFromOpenElisServer("/rest/example", vi.fn(), caller.signal);
      const listener = added.mock.calls.find(
        ([type]) => type === "pagehide",
      )?.[1];
      expect(listener).toBeDefined();
      expect(removed).toHaveBeenCalledWith("pagehide", listener);
      expect(removedCaller).toHaveBeenCalledWith("abort", listener);
      caller.abort();
      window.dispatchEvent(new Event("pagehide"));
      expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(false);
    },
  );

  test("beforeunload preserves an existing callback promise and does not waive the current TypeError", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const callback = vi.fn();
    const completed = getFromOpenElisServer("/rest/example", callback);
    window.dispatchEvent(new Event("beforeunload"));
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(false);
    const failure = new TypeError("Failed to fetch");
    pending.reject(failure);
    await completed;
    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(callback).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});

describe("GET failure delivery while pagehide is pending", () => {
  test("two rejected GETs remain cancellable until pagehide finishes without reporting or delivering failures", async () => {
    vi.useFakeTimers();
    const failure = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const callbacks = [vi.fn(), vi.fn()];
    const completed = callbacks.map((callback, index) =>
      getFromOpenElisServer("/rest/example/" + index, callback),
    );
    // Rejection continuations can run between native pagehide listeners.
    await Promise.resolve();
    await Promise.resolve();
    expect(error).not.toHaveBeenCalled();
    callbacks.forEach((callback) => expect(callback).not.toHaveBeenCalled());
    window.dispatchEvent(new Event("pagehide"));
    await Promise.all(completed);
    expect(vi.getTimerCount()).toBe(0);
    expect(error).not.toHaveBeenCalled();
    callbacks.forEach((callback) => expect(callback).not.toHaveBeenCalled());
    vi.mocked(fetch).mock.calls.forEach(([, options]) =>
      expect(options?.signal?.aborted).toBe(true),
    );
  });

  test("caller cancellation releases a rejected GET without waiting for a timer to run", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const caller = new AbortController();
    const callback = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const completed = getFromOpenElisServer(
      "/rest/example",
      callback,
      caller.signal,
    );
    await Promise.resolve();
    await Promise.resolve();
    caller.abort();
    await completed;
    expect(vi.getTimerCount()).toBe(0);
    expect(error).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});
