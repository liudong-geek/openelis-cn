import { afterEach, describe, expect, test, vi } from "vitest";
import {
  postToOpenElisServer,
  postToOpenElisServerFullResponse,
} from "./Utils";

const delayedResponse = (status = 200) => {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
  return {
    response,
    complete(body = "{}") {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  };
};

describe("POST response completion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("status callback waits until the write response has fully arrived", async () => {
    const pending = delayedResponse(201);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pending.response));
    const callback = vi.fn();

    postToOpenElisServer("/rest/example", "{}", callback);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(callback).not.toHaveBeenCalled();

    pending.complete('{"saved":true}');
    await vi.waitFor(() =>
      expect(callback).toHaveBeenCalledWith(201, undefined),
    );
  });

  test("full-response callback waits for completion and keeps its body readable", async () => {
    const pending = delayedResponse(200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(pending.response));
    const callback = vi.fn();

    postToOpenElisServerFullResponse("/rest/example", "{}", callback);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(callback).not.toHaveBeenCalled();

    pending.complete('{"saved":true}');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    const response = callback.mock.calls[0][0] as Response;
    await expect(response.json()).resolves.toEqual({ saved: true });
  });
});
