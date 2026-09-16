import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import ReviewSubmissionButton from "./ReviewSubmissionButton";
import { postReviewResults } from "./reviewTransport";
import messages from "../../languages/en.json";

const modal = vi.hoisted(() => ({ props: null }));
vi.mock("../esignature/ESignatureModal", () => ({
  default: (props) => {
    modal.props = props;
    return (
      <div role="dialog">
        <button onClick={props.onClose}>SIM cancel</button>
        <button
          onClick={async () => {
            try {
              const result = await props.signatureApi.executeSignature({
                username: "SIM.operator",
                password: "SIM-only-password",
              });
              props.onSuccess(result);
            } catch {
              /* owner reports outcome */
            }
          }}
        >
          SIM sign
        </button>
      </div>
    );
  },
}));
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const deferred = () => {
  let resolve;
  return {
    promise: new Promise((done) => {
      resolve = done;
    }),
    resolve: (value) => resolve(value),
  };
};
const batch = () => ({
  queryId: "SIM-query",
  resultList: [{ analysisId: "42", isRejected: true, note: "SIM repeat" }],
});
const start = (source = batch()) => {
  const onBusy = vi.fn(),
    onOutcome = vi.fn(),
    onError = vi.fn();
  let current = source;
  const renderFor = (id = "7") => (
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            userId: id,
            loginName: "SIM.operator",
            authenticated: true,
          },
        }}
      >
        <ReviewSubmissionButton
          queryId={current.queryId}
          prepare={() => JSON.parse(JSON.stringify(current))}
          isCurrent={(payload) =>
            JSON.stringify(payload) === JSON.stringify(current)
          }
          context={() => "SIM review"}
          onBusy={onBusy}
          onOutcome={onOutcome}
          onError={onError}
        >
          SIM submit
        </ReviewSubmissionButton>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
  const view = render(renderFor());
  return {
    ...view,
    onBusy,
    onOutcome,
    onError,
    change: (next, id) => {
      current = next;
      view.rerender(renderFor(id));
    },
  };
};
let transport;
beforeEach(() => {
  localStorage.setItem("CSRF", "SIM-csrf");
  modal.props = null;
  transport = vi.fn();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});
const posts = () =>
  transport.mock.calls.filter(([, options]) => options.method === "POST");
test.each([true, false])(
  "signature enabled=%s submits exactly one atomic review with frozen credentials and query receipt",
  async (enabled) => {
    transport.mockImplementation((url) =>
      Promise.resolve(
        url.endsWith("/enabled")
          ? response({ enabled })
          : response({ queryId: "SIM-query", resultList: [] }),
      ),
    );
    const source = batch(),
      view = start(source);
    fireEvent.click(screen.getByText("SIM submit"));
    if (enabled) {
      await screen.findByRole("dialog");
      expect(posts()).toHaveLength(0);
      fireEvent.click(screen.getByText("SIM sign"));
    }
    await waitFor(() => expect(view.onOutcome).toHaveBeenCalledWith(200));
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toMatch(/\/rest\/AccessionValidation$/);
    expect(JSON.parse(posts()[0][1].body)).toEqual({
      ...source,
      ...(enabled
        ? {
            reviewSignature: {
              username: "SIM.operator",
              password: "SIM-only-password",
            },
          }
        : {}),
    });
    expect(posts()[0][1].headers["X-CSRF-Token"]).toBe("SIM-csrf");
    expect(source.reviewSignature).toBeUndefined();
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
test("cancel before signing performs no review write and releases the query guard", async () => {
  transport.mockResolvedValue(response({ enabled: true }));
  const view = start();
  fireEvent.click(screen.getByText("SIM submit"));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByText("SIM cancel"));
  expect(posts()).toHaveLength(0);
  expect(view.onBusy).toHaveBeenLastCalledWith(false);
  expect(view.onOutcome).not.toHaveBeenCalled();
});
test.each(["session", "decision", "csrf"])(
  "a changed %s rejects a delayed signing ceremony before writing",
  async (change) => {
    const pending = deferred();
    transport.mockReturnValue(pending.promise);
    const source = batch(),
      view = start(source);
    fireEvent.click(screen.getByText("SIM submit"));
    if (change === "session") view.change(source, "8");
    if (change === "decision") source.resultList[0].note = "changed";
    if (change === "csrf") {
      localStorage.setItem("CSRF", "SIM-other");
      view.change(source);
    }
    await act(async () => pending.resolve(response({ enabled: false })));
    expect(posts()).toHaveLength(0);
    expect(view.onOutcome).not.toHaveBeenCalledWith(200);
  },
);
test.each([400, 403, 409, 500])(
  "review HTTP %s consumes the ceremony without retry",
  async (status) => {
    transport.mockImplementation((url) =>
      Promise.resolve(
        url.endsWith("/enabled")
          ? response({ enabled: true })
          : response({ error: "SIM" }, status),
      ),
    );
    const view = start();
    fireEvent.click(screen.getByText("SIM submit"));
    await screen.findByRole("dialog");
    const old = modal.props.signatureApi;
    fireEvent.click(screen.getByText("SIM sign"));
    await waitFor(() => expect(view.onOutcome).toHaveBeenCalledWith(status));
    expect(() =>
      old.executeSignature({ username: "SIM.operator", password: "SIM" }),
    ).toThrow();
    expect(posts()).toHaveLength(1);
  },
);
test("cancel during an uncertain review clears the batch instead of allowing a resend", async () => {
  const pending = deferred();
  transport.mockImplementation((url) =>
    url.endsWith("/enabled")
      ? Promise.resolve(response({ enabled: true }))
      : pending.promise,
  );
  const view = start();
  fireEvent.click(screen.getByText("SIM submit"));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByText("SIM sign"));
  await waitFor(() => expect(posts()).toHaveLength(1));
  fireEvent.click(screen.getByText("SIM cancel"));
  expect(view.onOutcome).toHaveBeenCalledWith(0);
  await act(async () => pending.resolve(response({ queryId: "SIM-query" })));
  expect(view.onOutcome).toHaveBeenCalledTimes(1);
});
test("review timeout completes once even when fetch ignores abort", async () => {
  vi.useFakeTimers();
  transport.mockReturnValue(new Promise(() => {}));
  const callback = vi.fn();
  const work = postReviewResults(batch(), callback, { csrf: "SIM-csrf" });
  await vi.advanceTimersByTimeAsync(30001);
  await work;
  expect(callback).toHaveBeenCalledExactlyOnceWith(0);
});
test.each(["wrong-query", "html", "redirect"])(
  "%s cannot serve as a successful review receipt",
  async (kind) => {
    const r =
      kind === "html"
        ? new Response("<html>login</html>", {
            headers: { "Content-Type": "text/html" },
          })
        : response({ queryId: "other" });
    if (kind === "redirect")
      Object.defineProperty(r, "redirected", { value: true });
    transport.mockResolvedValue(r);
    const callback = vi.fn();
    await postReviewResults(batch(), callback);
    expect(callback).toHaveBeenCalledWith(kind === "redirect" ? 401 : 0);
  },
);
