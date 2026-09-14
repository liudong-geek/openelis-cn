import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useResultPresence } from "./useResultPresence";

const pending = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const json = (value = {}, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8" },
  });
const current = () => true;
const defaults = {
  editing: "101",
  ids: ["101", "102"],
  binding: "SIM-A",
  isCurrent: current,
  csrf: "SIM-CSRF-A",
};
function Harness(props) {
  const { editing, ids, binding, isCurrent, csrf } = { ...defaults, ...props };
  const value = useResultPresence(editing, ids, binding, isCurrent, csrf);
  return (
    <>
      <output data-testid="presence">{JSON.stringify(value.presence)}</output>
      <output data-testid="unavailable">{String(value.unavailable)}</output>
    </>
  );
}
const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};
const tick = async (ms) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const finish = async (request, response) => {
  await act(async () => {
    request.resolve(response);
    await vi.advanceTimersByTimeAsync(0);
  });
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ 102: "SIM colleague" })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("one initial bounded POST, positive unique visible IDs and fixed CSRF", async () => {
  render(<Harness ids={["102", "101", "101", "0", "01", "-1", "1.2", "x"]} />);
  expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/OpenELIS-Global/rest/results-entry/presence",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        analysisId: "101",
        visibleAnalysisIds: ["101", "102"],
      }),
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      headers: expect.objectContaining({ "X-CSRF-Token": "SIM-CSRF-A" }),
    }),
  );
  expect(screen.getByTestId("presence")).toHaveTextContent("SIM colleague");
  expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
  await tick(9999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(["0", "01", "-1", "103", "10000000000", undefined])(
  "invalid or invisible edited analysis %s is never claimed",
  async (editing) => {
    render(<Harness editing={editing} />);
    await flush();
    expect(JSON.parse(fetch.mock.calls[0][1].body).analysisId).toBeNull();
  },
);

test.each([
  { binding: "" },
  { csrf: "" },
  { isCurrent: () => false },
  {
    isCurrent: () => {
      throw new Error("SIM denied");
    },
  },
])(
  "unavailable binding cannot send or imply healthy collaboration",
  async (props) => {
    render(<Harness {...props} />);
    await tick(20000);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByTestId("presence")).toHaveTextContent("{}");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
  },
);

test("equivalent reordered or duplicate IDs do not restart a heartbeat", async () => {
  const view = render(<Harness />);
  await flush();
  view.rerender(<Harness ids={["102", "101", "102"]} isCurrent={() => true} />);
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
  { binding: "SIM-B" },
  { csrf: "SIM-CSRF-B" },
  { ids: ["103"], editing: "103" },
  { isCurrent: () => false },
])(
  "changed binding/list/revocation immediately hides previous names",
  async (props) => {
    const view = render(<Harness />);
    await flush();
    fetch.mockImplementation(() => new Promise(() => {}));
    view.rerender(<Harness {...props} />);
    expect(screen.getByTestId("presence")).toHaveTextContent("{}");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
  },
);

test.each([
  { binding: "SIM-B", csrf: "SIM-CSRF-B" },
  { ids: ["103"], editing: "103" },
])(
  "late old callbacks cannot enter a new binding/list and never overlap fetches",
  async (props) => {
    const old = pending();
    fetch.mockImplementationOnce(() => old.promise);
    const view = render(<Harness />);
    const signal = fetch.mock.calls[0][1].signal;
    view.rerender(<Harness {...props} />);
    expect(signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await finish(old, json({ 102: "SIM old private name" }));
    expect(screen.getByTestId("presence")).not.toHaveTextContent("SIM old");
    fetch.mockImplementation(async () => json({}));
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("presence")).toHaveTextContent("{}");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
  },
);

test("callback rechecks authority even without a render, and interval withdraws stale presence", async () => {
  let allowed = true;
  const old = pending();
  fetch.mockImplementationOnce(() => old.promise);
  render(<Harness isCurrent={() => allowed} />);
  allowed = false;
  await finish(old, json({ 102: "SIM denied name" }));
  expect(screen.getByTestId("presence")).toHaveTextContent("{}");
  await tick(20000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
});

test.each([401, 403])(
  "HTTP %s stops the same credential binding without redirect or reload",
  async (status) => {
    fetch.mockImplementation(async () => json({}, status));
    const view = render(<Harness />);
    await flush();
    await tick(20000);
    view.rerender(<Harness ids={["103"]} editing="103" />);
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
    fetch.mockImplementation(async () => json({}));
    view.rerender(<Harness binding="SIM-B" csrf="SIM-CSRF-B" />);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
  },
);

describe.each([401, 403])("late credential rejection %s", (status) => {
  test.each(["empty-list-loaded", "editor-changed", "timed-out"])(
    "%s retires names, but not the rejection of the same credentials",
    async (change) => {
      const old = pending();
      fetch.mockImplementationOnce(() => old.promise);
      const view = render(
        change === "empty-list-loaded" ? (
          <Harness ids={[]} editing={null} />
        ) : (
          <Harness />
        ),
      );
      if (change === "empty-list-loaded") view.rerender(<Harness />);
      if (change === "editor-changed") view.rerender(<Harness editing="102" />);
      if (change === "timed-out") await tick(8000);
      expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
      await finish(old, json({}, status));
      view.rerender(<Harness ids={["103"]} editing="103" />);
      await tick(30000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("presence")).toHaveTextContent("{}");
      expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
    },
  );

  test("cannot freeze a new credential binding", async () => {
    const old = pending();
    fetch.mockImplementationOnce(() => old.promise);
    const view = render(<Harness />);
    view.rerender(<Harness binding="SIM-B" csrf="SIM-CSRF-B" />);
    await finish(old, json({}, status));
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("SIM-CSRF-B");
    expect(screen.getByTestId("presence")).toHaveTextContent("SIM colleague");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
  });

  test("cannot update an unmounted hook", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const old = pending();
      fetch.mockImplementationOnce(() => old.promise);
      const view = render(<Harness />);
      view.unmount();
      await finish(old, json({}, status));
      await tick(20000);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      error.mockRestore();
    }
  });
});

test.each([302, 500, 503])(
  "HTTP %s clears stale names and waits for the normal interval",
  async (status) => {
    const view = render(<Harness />);
    await flush();
    fetch.mockImplementationOnce(async () => json({}, status));
    await tick(10000);
    expect(screen.getByTestId("presence")).toHaveTextContent("{}");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
    expect(fetch).toHaveBeenCalledTimes(2);
    view.rerender(<Harness />);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
  },
);

test.each([
  "array",
  "null",
  "foreign",
  "invalid-id",
  "nested",
  "empty-name",
  "html",
  "wrong-charset",
  "redirected",
  "bad-json",
  "bad-utf8",
  "large",
  "oversized-header",
])(
  "%s response is unavailable, never successful or rendered as a name",
  async (mode) => {
    const values = {
      array: [],
      null: null,
      foreign: { 999: "SIM private" },
      "invalid-id": { "01": "SIM private" },
      nested: { 101: {} },
      "empty-name": { 101: "" },
    };
    let response = mode in values ? json(values[mode]) : json({});
    if (mode === "html")
      response = new Response("SIM private", {
        headers: { "content-type": "text/html" },
      });
    if (mode === "wrong-charset")
      response.headers.set(
        "content-type",
        "application/json; charset=ISO-8859-1",
      );
    if (mode === "redirected")
      Object.defineProperty(response, "redirected", { value: true });
    if (mode === "bad-json")
      response = new Response("{SIM private", {
        headers: { "content-type": "application/json" },
      });
    if (mode === "bad-utf8")
      response = new Response(new Uint8Array([255]), {
        headers: { "content-type": "application/json" },
      });
    if (mode === "large") response = json({ 101: "X".repeat(65536) });
    if (mode === "oversized-header")
      response.headers.set("content-length", "65537");
    fetch.mockImplementation(async () => response);
    render(<Harness />);
    await flush();
    expect(screen.getByTestId("presence")).toHaveTextContent("{}");
    expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);

test("fetch ignoring abort times out, never overlaps, and its late result is discarded", async () => {
  const old = pending();
  fetch.mockImplementationOnce(() => old.promise);
  render(<Harness />);
  await tick(8000);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
  await tick(22000);
  expect(fetch).toHaveBeenCalledTimes(1);
  await finish(old, json({ 101: "SIM late private name" }));
  expect(screen.getByTestId("presence")).toHaveTextContent("{}");
  await tick(10000);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("unavailable")).toHaveTextContent("false");
});

test("a response stream that never completes is also bounded", async () => {
  fetch.mockImplementation(
    async () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { "content-type": "application/json" },
      }),
  );
  render(<Harness />);
  await flush();
  await tick(8000);
  expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});

test("unmount aborts the active request and leaves no periodic or late update", async () => {
  const old = pending();
  fetch.mockImplementationOnce(() => old.promise);
  const view = render(<Harness />);
  view.unmount();
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await finish(old, json({ 101: "SIM late name" }));
  await tick(30000);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("an oversized worklist is unavailable rather than silently truncated", async () => {
  render(
    <Harness
      ids={Array.from({ length: 1001 }, (_, index) => String(index + 1))}
    />,
  );
  await tick(20000);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
});

test("normal heartbeats never obtain replacement CSRF from mutable local storage", async () => {
  const original = localStorage.getItem("CSRF");
  try {
    render(<Harness />);
    await flush();
    localStorage.setItem("CSRF", "SIM-UNRELATED-TOKEN");
    await tick(10000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("SIM-CSRF-A");
  } finally {
    if (original === null) localStorage.removeItem("CSRF");
    else localStorage.setItem("CSRF", original);
  }
});

test("403 and the next periodic callback in one batch cannot briefly reuse old authorization", async () => {
  const old = pending();
  fetch.mockImplementationOnce(() => old.promise);
  render(<Harness />);
  await act(async () => {
    old.resolve(json({}, 403));
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("presence")).toHaveTextContent("{}");
  expect(screen.getByTestId("unavailable")).toHaveTextContent("true");
});
