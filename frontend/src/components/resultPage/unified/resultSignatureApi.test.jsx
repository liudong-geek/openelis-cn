import React from "react";
import ReactDOM from "react-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import ESignatureButton from "../../esignature/ESignatureButton";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { createResultSignatureApi } from "./resultSignatureApi";
import messages from "../../../languages/zh.json";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const response = (body, status = 200, extras = {}) => {
  const value = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  for (const [key, override] of Object.entries(extras)) {
    Object.defineProperty(value, key, { value: override });
  }
  return value;
};
const signature = (overrides = {}) => ({
  signatureId: 90,
  signerId: 7,
  recordId: 42,
  recordType: "RESULT",
  signatureMeaning: "AUTHORED",
  ...overrides,
});
const command = (overrides = {}) => ({
  username: "SIM.operator",
  password: "SIM-secret",
  recordId: 42,
  recordType: "RESULT",
  signatureMeaning: "AUTHORED",
  rejectionReason: null,
  ...overrides,
});
const create = (overrides = {}) =>
  createResultSignatureApi({
    username: "SIM.operator",
    userId: "7",
    recordId: "42",
    guard: () => true,
    csrf: "SIM-fixed-csrf",
    ...overrides,
  });
const install = (handler) => {
  const transport = vi.fn(
    handler ||
      ((url) => {
        if (url.endsWith("/enabled"))
          return Promise.resolve(response({ enabled: true }));
        if (url.includes("/certified/"))
          return Promise.resolve(
            response({ username: "SIM.operator", certified: true }),
          );
        if (url.includes("/session-status/"))
          return Promise.resolve(
            response({
              username: "SIM.operator",
              sessionActive: true,
              signingCount: 1,
            }),
          );
        if (url.endsWith("/certify"))
          return Promise.resolve(
            response({
              certificationId: 4,
              userId: 7,
              certifiedAt: "2026-09-14T01:00:00Z",
            }),
          );
        if (url.endsWith("/sign"))
          return Promise.resolve(response(signature()));
        throw new Error("Unexpected SIM endpoint");
      }),
  );
  vi.stubGlobal("fetch", transport);
  return transport;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("fixed five endpoints preserve manual response and exact sign target", async () => {
  const transport = install();
  const api = create();
  expect(await api.isEsigEnabled()).toEqual({ enabled: true });
  expect(await api.isUserCertified("SIM.operator")).toEqual({
    username: "SIM.operator",
    certified: true,
  });
  expect(await api.getSessionStatus("SIM.operator")).toEqual({
    username: "SIM.operator",
    sessionActive: true,
    signingCount: 1,
  });
  expect(
    await api.certifyUser({
      username: "SIM.operator",
      password: "SIM-secret",
      certificationText: "SIM legal text",
    }),
  ).toMatchObject({ certificationId: 4, userId: 7 });
  expect(await api.executeSignature(command())).toMatchObject(signature());
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    "/api/OpenELIS-Global/rest/esig/enabled",
    "/api/OpenELIS-Global/rest/esig/certified/SIM.operator",
    "/api/OpenELIS-Global/rest/esig/session-status/SIM.operator",
    "/api/OpenELIS-Global/rest/esig/certify",
    "/api/OpenELIS-Global/rest/esig/sign",
  ]);
  for (const [, options] of transport.mock.calls) {
    expect(options).toMatchObject({
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  }
  expect(JSON.parse(transport.mock.calls[4][1].body)).toEqual(command());
  expect(transport.mock.calls[4][1].headers["X-CSRF-Token"]).toBe(
    "SIM-fixed-csrf",
  );
});

test.each([
  null,
  {},
  { enabled: "false" },
  { enabled: 0 },
  { enabled: false, success: false },
])("invalid enabled never becomes disabled: %j", async (body) => {
  install(() => Promise.resolve(response(body)));
  await expect(create().isEsigEnabled()).rejects.toMatchObject({
    code: "INVALID_SIGNATURE_RESPONSE",
  });
});

test.each([
  { signatureId: 0 },
  { signatureId: "90" },
  { recordId: 43 },
  { recordType: "ANALYSIS" },
  { signatureMeaning: "REJECTED" },
  { signerId: 8 },
  { success: false },
])("bad signature poisons adapter, not retried: %j", async (overrides) => {
  const transport = install(() =>
    Promise.resolve(response(signature(overrides))),
  );
  const onUnknown = vi.fn();
  const api = create({ onUnknown });
  await expect(api.executeSignature(command())).rejects.toMatchObject({
    code: "SIGNATURE_OUTCOME_UNKNOWN",
  });
  await expect(api.executeSignature(command())).rejects.toBeDefined();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(onUnknown).toHaveBeenCalledExactlyOnceWith({ operation: "sign" });
});

test.each([
  { username: "other" },
  { recordId: 43 },
  { recordType: "REPORT" },
  { signatureMeaning: "REJECTED" },
  { rejectionReason: "other" },
  { ignoredExtraField: "must-not-send" },
])("rejects mutated command before transport: %j", async (overrides) => {
  const transport = install();
  await expect(
    create().executeSignature(command(overrides)),
  ).rejects.toBeDefined();
  expect(transport).not.toHaveBeenCalled();
});

test("wrong read identity and bad certification refuse success", async () => {
  const transport = install(() =>
    Promise.resolve(response({ username: "other", certified: true })),
  );
  const api = create();
  await expect(api.isUserCertified("SIM.operator")).rejects.toBeDefined();
  await expect(api.getSessionStatus("other")).rejects.toBeDefined();
  expect(transport).toHaveBeenCalledTimes(1);
  transport.mockResolvedValue(response({ certificationId: 3, userId: 8 }));
  await expect(
    api.certifyUser({
      username: "SIM.operator",
      password: "SIM",
      certificationText: "SIM",
    }),
  ).rejects.toMatchObject({ code: "SIGNATURE_OUTCOME_UNKNOWN" });
});

test("guard failure before write and after body parsing permanently rejects stale epoch", async () => {
  let current = true;
  let stream;
  const body = new ReadableStream({
    start(controller) {
      stream = controller;
    },
  });
  const transport = install(() =>
    Promise.resolve(response(null, 200, { body })),
  );
  const api = create({ guard: () => current });
  const pending = api.isEsigEnabled();
  current = false;
  stream.enqueue(new TextEncoder().encode(JSON.stringify({ enabled: false })));
  stream.close();
  await expect(pending).rejects.toMatchObject({
    code: "SIGNATURE_CONTEXT_CHANGED",
  });
  current = true;
  await expect(api.executeSignature(command())).rejects.toBeDefined();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("write deadline wins ignored abort and late success; no second write", async () => {
  vi.useFakeTimers();
  const late = deferred();
  const transport = install(() => late.promise);
  const onUnknown = vi.fn();
  const api = create({ onUnknown });
  const pending = api.executeSignature(command());
  const assertion = expect(pending).rejects.toMatchObject({
    code: "SIGNATURE_OUTCOME_UNKNOWN",
  });
  await vi.advanceTimersByTimeAsync(30000);
  await assertion;
  expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  late.resolve(response(signature()));
  await Promise.resolve();
  await expect(api.executeSignature(command())).rejects.toBeDefined();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(onUnknown).toHaveBeenCalledTimes(1);
});

test("body deadline, manual redirects and 403 never leak server message or navigate", async () => {
  const transport = install(() =>
    Promise.resolve(response({ message: "SIM-private-server-message" }, 403)),
  );
  const api = create();
  await expect(api.executeSignature(command())).rejects.toMatchObject({
    code: "SIGNATURE_OUTCOME_UNKNOWN",
  });
  expect(transport).toHaveBeenCalledTimes(1);
  install(() =>
    Promise.resolve(response({ enabled: false }, 200, { redirected: true })),
  );
  await expect(create().isEsigEnabled()).rejects.toBeDefined();
  vi.useFakeTimers();
  install(() =>
    Promise.resolve(response(null, 200, { body: new ReadableStream({}) })),
  );
  const pending = create().isEsigEnabled();
  const assertion = expect(pending).rejects.toMatchObject({
    code: "SIGNATURE_TIMEOUT",
  });
  await vi.advanceTimersByTimeAsync(30000);
  await assertion;
});

test.each([
  new Uint8Array([
    123, 34, 101, 110, 97, 98, 108, 101, 100, 34, 58, 102, 97, 108, 115, 101,
    44, 34, 120, 34, 58, 34, 0xff, 34, 125,
  ]),
  new TextEncoder().encode(
    JSON.stringify({ enabled: false, extra: "x".repeat(65536) }),
  ),
])(
  "real response malformed UTF8 or over64KiB cannot disable signature",
  async (bytes) => {
    install(() =>
      Promise.resolve(
        new Response(bytes, {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(create().isEsigEnabled()).rejects.toBeDefined();
  },
);

const renderButton = (props) =>
  render(
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: { userId: "7", loginName: "SIM.operator" },
        }}
      >
        <ESignatureButton
          recordId="42"
          recordType="RESULT"
          meaning="AUTHORED"
          {...props}
        >
          SIM签名
        </ESignatureButton>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );

test("real modal uses injected transport, freezes original callback across parent render", async () => {
  const transport = install();
  const first = vi.fn();
  const replacement = vi.fn();
  const api = create();
  const view = renderButton({ signatureApi: api, onSign: first });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  const input = await screen.findByLabelText(messages["esig.label.password"]);
  view.rerender(
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: { userId: "7", loginName: "SIM.operator" },
        }}
      >
        <ESignatureButton
          recordId="43"
          recordType="RESULT"
          meaning="AUTHORED"
          signatureApi={create({ recordId: "43" })}
          onSign={replacement}
        >
          SIM签名
        </ESignatureButton>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );
  fireEvent.change(input, { target: { value: "SIM-secret" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.sign"] }),
  );
  await waitFor(() =>
    expect(first).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: 42 }),
    ),
  );
  expect(replacement).not.toHaveBeenCalled();
  expect(
    JSON.parse(
      transport.mock.calls.find(([url]) => url.endsWith("/sign"))[1].body,
    ).recordId,
  ).toBe(42);
});

test("real modal edited row cannot sign; malformed enabled never invokes null callback", async () => {
  let current = true;
  const transport = install();
  const onSign = vi.fn();
  const view = renderButton({
    signatureApi: create({ guard: () => current }),
    onSign,
  });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  const input = await screen.findByLabelText(messages["esig.label.password"]);
  current = false;
  fireEvent.change(input, { target: { value: "SIM-secret" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.sign"] }),
  );
  await waitFor(() => expect(screen.queryByRole("alert")).toBeInTheDocument());
  expect(
    transport.mock.calls.filter(([url]) => url.endsWith("/sign")),
  ).toHaveLength(0);
  expect(onSign).not.toHaveBeenCalled();
  view.unmount();
  install(() => Promise.resolve(response({})));
  renderButton({ signatureApi: create(), onSign });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  await waitFor(() =>
    expect(
      screen.queryByText(messages["esig.error.generic"]),
    ).toBeInTheDocument(),
  );
  expect(onSign).not.toHaveBeenCalled();
});

test("unmount aborts signature and discards late success", async () => {
  const late = deferred();
  const transport = install();
  const onSign = vi.fn();
  const onUnknown = vi.fn();
  const view = renderButton({ signatureApi: create({ onUnknown }), onSign });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  const input = await screen.findByLabelText(messages["esig.label.password"]);
  transport.mockImplementation(() => late.promise);
  fireEvent.change(input, { target: { value: "SIM-secret" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.sign"] }),
  );
  view.unmount();
  await act(async () => {
    late.resolve(response(signature()));
  });
  expect(onSign).not.toHaveBeenCalled();
  expect(onUnknown).toHaveBeenCalledOnce();
  expect(transport.mock.calls.at(-1)[1].signal.aborted).toBe(true);
});

test("unmount invalidates the injected ceremony synchronously before passive cleanup", async () => {
  const late = deferred();
  const transport = install();
  const onSign = vi.fn();
  const onUnknown = vi.fn();
  const view = renderButton({ signatureApi: create({ onUnknown }), onSign });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  const input = await screen.findByLabelText(messages["esig.label.password"]);
  transport.mockImplementation(() => late.promise);
  fireEvent.change(input, { target: { value: "SIM-secret" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.sign"] }),
  );
  const signal = transport.mock.calls.at(-1)[1].signal;
  act(() => {
    ReactDOM.unmountComponentAtNode(view.container);
    // Deliberately inspect before act flushes React17's passive effects.
    expect(signal.aborted).toBe(true);
    expect(onUnknown).toHaveBeenCalledExactlyOnceWith({ operation: "sign" });
  });
  await act(async () => {
    late.resolve(response(signature()));
  });
  expect(onSign).not.toHaveBeenCalled();
});

test.each([
  { sessionActive: "true", signingCount: 1 },
  { sessionActive: true, signingCount: -1 },
  { sessionActive: true, signingCount: "1" },
  { sessionActive: true, signingCount: 0.5 },
])(
  "malformed session status cannot authorize password-only ceremony: %j",
  async (body) => {
    install(() =>
      Promise.resolve(response({ username: "SIM.operator", ...body })),
    );
    await expect(
      create().getSessionStatus("SIM.operator"),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE_RESPONSE" });
  },
);

test("empty certification response invalidates adapter and notifies once", async () => {
  const transport = install(() => Promise.resolve(response({})));
  const onUnknown = vi.fn();
  const api = create({ onUnknown });
  await expect(
    api.certifyUser({
      username: "SIM.operator",
      password: "SIM",
      certificationText: "SIM",
    }),
  ).rejects.toMatchObject({ code: "SIGNATURE_OUTCOME_UNKNOWN" });
  api.dispose();
  await expect(api.executeSignature(command())).rejects.toBeDefined();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(onUnknown).toHaveBeenCalledExactlyOnceWith({ operation: "certify" });
});

test("actual Timestamp-shaped certification accepts numeric milliseconds without treating it as unknown", async () => {
  const transport = install(() =>
    Promise.resolve(
      response({ certificationId: 4, userId: 7, certifiedAt: 1789347600000 }),
    ),
  );
  const onUnknown = vi.fn();
  const api = create({ onUnknown });
  expect(
    await api.certifyUser({
      username: "SIM.operator",
      password: "SIM",
      certificationText: "SIM",
    }),
  ).toMatchObject({ certificationId: 4, userId: 7 });
  expect(onUnknown).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("concurrent write cannot dispatch a second operation", async () => {
  const late = deferred();
  const transport = install(() => late.promise);
  const api = create();
  const pending = api.executeSignature(command());
  await expect(api.executeSignature(command())).rejects.toMatchObject({
    code: "SIGNATURE_BUSY",
  });
  late.resolve(response(signature()));
  expect(await pending).toMatchObject({ signatureId: 90 });
  await expect(api.executeSignature(command())).rejects.toBeDefined();
  expect(transport).toHaveBeenCalledTimes(1);
});

test("guard invalidation during write reports unknown rather than accepting late signature", async () => {
  let current = true;
  const late = deferred();
  install(() => late.promise);
  const onUnknown = vi.fn();
  const api = create({ guard: () => current, onUnknown });
  const pending = api.executeSignature(command());
  current = false;
  late.resolve(response(signature()));
  await expect(pending).rejects.toMatchObject({
    code: "SIGNATURE_OUTCOME_UNKNOWN",
  });
  expect(onUnknown).toHaveBeenCalledExactlyOnceWith({ operation: "sign" });
});

test("injected disabled mode checks every click, never reuses previous false", async () => {
  const transport = install(() =>
    Promise.resolve(response({ enabled: false })),
  );
  const onSign = vi.fn();
  renderButton({ signatureApi: create(), onSign });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  await waitFor(() => expect(onSign).toHaveBeenCalledTimes(1));
  transport.mockResolvedValue(response({ enabled: "false" }));
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  await waitFor(() =>
    expect(
      screen.queryByText(messages["esig.error.generic"]),
    ).toBeInTheDocument(),
  );
  expect(onSign).toHaveBeenCalledExactlyOnceWith(null);
  expect(transport).toHaveBeenCalledTimes(2);
});

test("real certification continues with frozen username, then signs without exposing credentials", async () => {
  const transport = install();
  const defaultHandler = transport.getMockImplementation();
  transport.mockImplementation((url, options) =>
    url.includes("/certified/")
      ? Promise.resolve(
          response({ username: "SIM.operator", certified: false }),
        )
      : defaultHandler(url, options),
  );
  const onSign = vi.fn();
  renderButton({ signatureApi: create(), onSign });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  const password = await screen.findByLabelText(
    messages["esig.label.password"],
  );
  fireEvent.click(
    screen.getByLabelText(messages["esig.certification.acknowledge"]),
  );
  fireEvent.change(password, { target: { value: "SIM-secret" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.certify"] }),
  );
  const username = await screen.findByLabelText(
    messages["esig.label.username"],
  );
  expect(username).toHaveAttribute("readonly");
  expect(username).toHaveValue("SIM.operator");
  fireEvent.change(screen.getByLabelText(messages["esig.label.password"]), {
    target: { value: "SIM-secret" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.sign"] }),
  );
  await waitFor(() =>
    expect(onSign).toHaveBeenCalledWith(
      expect.objectContaining({ signatureId: 90 }),
    ),
  );
  expect(
    transport.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(2);
});

test("unknown signature cannot be resent after modal cancel and reopen", async () => {
  const transport = install();
  const onSign = vi.fn();
  const onUnknown = vi.fn();
  const api = create({ onUnknown });
  renderButton({ signatureApi: api, onSign });
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  const password = await screen.findByLabelText(
    messages["esig.label.password"],
  );
  transport.mockResolvedValue(
    response({ message: "SIM-private-server-message" }, 403),
  );
  fireEvent.change(password, { target: { value: "SIM-secret" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["esig.button.sign"] }),
  );
  await waitFor(() => expect(onUnknown).toHaveBeenCalledOnce());
  expect(
    screen.queryByText("SIM-private-server-message"),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: messages["label.button.cancel"] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "SIM签名" }));
  await waitFor(() =>
    expect(screen.queryByRole("status")).toHaveTextContent(
      messages["esig.error.generic"],
    ),
  );
  expect(
    transport.mock.calls.filter(([url]) => url.endsWith("/sign")),
  ).toHaveLength(1);
  expect(onSign).not.toHaveBeenCalled();
});
