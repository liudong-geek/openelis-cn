import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import zh from "../../../languages/zh.json";
import ResultRestrictionFacts from "./ResultRestrictionFacts";
import ResultIntakeHandoff from "./ResultIntakeHandoff";
import { intakeHandoffPath } from "./resultRestrictionHandoff";
import { diagnosticFixture } from "./resultRestriction.testFixtures";
const io = vi.hoisted(() => ({
  clock: vi.fn(),
  receipt: vi.fn(),
  decision: vi.fn(),
}));
vi.mock("../../order/api/serverClockApi", () => ({
  getVerifiedServerClock: io.clock,
}));
vi.mock("../../order/receiptTransport", () => ({
  postSpecimenReceipt: io.receipt,
}));
vi.mock("../../order/intakeTransport", () => ({
  postIntakeDecision: io.decision,
}));
const identity = {
  analysisId: "101",
  sampleItemId: "201",
  testId: "401",
  labNumber: "RAW-001",
  analysisLastupdated: "1000",
};
const back =
  "/Results?accessionNumber=RAW-001&testSectionId=9&status=4&page=2&pageSize=25";
let session, history, fetchMock, current, versionAdvanced, holdDiagnostic;
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const view = () => (
  <Router history={history}>
    <IntlProvider locale="zh" messages={zh}>
      <UserSessionDetailsContext.Provider value={session}>
        <ResultIntakeHandoff />
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </Router>
);
beforeEach(() => {
  Object.values(io).forEach((mock) => mock.mockReset());
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "CURRENT",
      csrf: "CURRENT-CSRF",
      roles: ["Results", "Reception"],
      userLabRolesMap: { AllLabUnits: ["Results", "Reception"] },
    },
    isCheckingLogin: false,
    errorLoadingSessionDetails: false,
  };
  history = createMemoryHistory({
    initialEntries: [intakeHandoffPath(identity, back)],
    getUserConfirmation: (_, answer) => answer(false),
  });
  current = diagnosticFixture(identity);
  versionAdvanced = false;
  holdDiagnostic = null;
  io.clock.mockResolvedValue({ instant: "2026-10-07T01:03:00Z" });
  fetchMock = vi.fn(async (url) => {
    if (String(url).endsWith("/session"))
      return response(session.userSessionDetails);
    if (String(url).includes("/restriction?")) {
      if (holdDiagnostic) return await holdDiagnostic;
      if (versionAdvanced)
        return response(
          { queryVersion: "2", code: "RESULT_RESTRICTION_VERSION_CHANGED" },
          409,
        );
      return response(current);
    }
    if (String(url).includes("/specimen-intake/lookup?"))
      return response(current.intakeLookup);
    throw Error("unexpected URL");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const open = async () => {
  const result = render(view());
  await screen.findByText("患者模拟");
  return result;
};
const confirmReceipt = async (user) => {
  await user.click(screen.getByText("我已核对患者、申请与实管条码"));
  await user.click(screen.getByRole("button", { name: "确认此管签收" }));
};
it("refreshes the real diagnostic and fixes the authoritative target without switching neighboring tubes", async () => {
  current.intakeLookup.current.requestedSpecimens.push({
    id: "502",
    sampleItemId: "202",
    typeOfSampleId: "7",
    status: "COLLECTED",
    sampleTypeName: "Whole blood",
  });
  current.intakeLookup.current.physicalSpecimens.push({
    ...current.intakeLookup.current.physicalSpecimens[0],
    id: "202",
    requestId: "502",
    sortOrder: "2",
  });
  const rendered = await open();
  expect(screen.getByRole("searchbox")).toHaveValue("RAW-001.1");
  expect(screen.getByRole("searchbox")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: zh["order.specimenLookup.select"] }),
  ).toBeDisabled();
  expect(io.receipt).not.toHaveBeenCalled();
  rendered.unmount();
  await open();
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/restriction?"),
    ),
  ).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("button", { name: zh["results.restriction.back"] }),
  );
  expect(history.location.pathname + history.location.search).toBe(back);
});
it("uses the original guarded receipt then verifies its outcome even when the analysis version advances", async () => {
  io.receipt.mockImplementation(async (body) => {
    const command = JSON.parse(body);
    current.intakeLookup.current.physicalSpecimens[0].receivedDate =
      command.tubes[0].receivedDate;
    current.intakeLookup.current.physicalSpecimens[0].expectedEvidenceDigest =
      "a".repeat(64);
    versionAdvanced = true;
    return {
      ...command,
      success: true,
      tubes: command.tubes.map((tube) => ({ ...tube, replayed: false })),
    };
  });
  await open();
  const user = userEvent.setup();
  await confirmReceipt(user);
  expect(await screen.findByText(/签收已回查/)).toBeVisible();
  expect(io.receipt).toHaveBeenCalledTimes(1);
  const command = JSON.parse(io.receipt.mock.calls[0][0]);
  expect(command.labNo).toBe("RAW-001");
  expect(command.tubes[0]).toMatchObject({
    sampleItemId: "201",
    requestId: "501",
  });
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/restriction?"),
    ),
  ).toHaveLength(2);
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/specimen-intake/lookup?"),
    ),
  ).toHaveLength(1);
  // The old read context may recover its operation, but it cannot authorize a new acceptance.
  await user.click(screen.getByText("我已核对患者、申请与实管条码"));
  const accept = screen.getByRole("button", { name: "确认此管验收" });
  await user.click(accept);
  expect(io.decision).not.toHaveBeenCalled();
});
it("retains a fixed unknown operation and recovers only by same-target readback without another POST", async () => {
  io.receipt.mockRejectedValue(Error("exchange failed"));
  await open();
  const user = userEvent.setup();
  await confirmReceipt(user);
  expect(
    await screen.findByText(zh["order.specimenLookup.action.unknown"]),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: zh["results.restriction.back"] }),
  ).toBeDisabled();
  const command = JSON.parse(io.receipt.mock.calls[0][0]);
  current.intakeLookup.current.physicalSpecimens[0].receivedDate =
    command.tubes[0].receivedDate;
  versionAdvanced = true;
  await user.click(screen.getByRole("button", { name: "查询当前状态" }));
  expect(await screen.findByText(/签收已回查/)).toBeVisible();
  expect(io.receipt).toHaveBeenCalledTimes(1);
  expect(io.decision).not.toHaveBeenCalled();
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/restriction?"),
    ),
  ).toHaveLength(2);
});
it("clears old private details and prevents dispatch after an actor transition during preflight", async () => {
  const rendered = await open();
  let resolve;
  holdDiagnostic = new Promise((answer) => (resolve = answer));
  const user = userEvent.setup();
  await confirmReceipt(user);
  session = {
    ...session,
    userSessionDetails: {
      ...session.userSessionDetails,
      userId: "702",
      sessionId: "OTHER",
    },
  };
  rendered.rerender(view());
  expect(screen.queryByText("患者模拟")).toBeNull();
  await act(async () => resolve(response(current)));
  expect(io.receipt).not.toHaveBeenCalled();
  expect(io.decision).not.toHaveBeenCalled();
  expect(screen.queryByText("患者模拟")).toBeNull();
});
it("rejects a mismatched tube readback and never treats status alone as saved", async () => {
  io.receipt.mockRejectedValue(Error("unknown"));
  await open();
  const user = userEvent.setup();
  const first = current.intakeLookup;
  fetchMock.mockImplementation(async (url) =>
    String(url).endsWith("/session")
      ? response(session.userSessionDetails)
      : String(url).includes("/restriction?")
        ? response(current)
        : response({
            ...first,
            selection: { ...first.selection, sampleItemId: "202" },
          }),
  );
  await confirmReceipt(user);
  expect(
    await screen.findByText(zh["results.restriction.leaveBlocked"]),
  ).toBeVisible();
  expect(io.receipt).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/签收已回查/)).toBeNull();
});
it("invalid direct URLs show a page error without inventing order context or fetching clinical details", () => {
  history = createMemoryHistory({
    initialEntries: ["/order/result-intake?analysisId=101"],
  });
  render(view());
  expect(
    screen.getByText(zh["results.restriction.error.invalid"]),
  ).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole("searchbox")).toBeNull();
});
it("a same-actor capability revocation is checked before any new POST and clears the old target", async () => {
  await open();
  const user = userEvent.setup();
  await user.click(screen.getByText("我已核对患者、申请与实管条码"));
  current = {
    ...current,
    canOpenIntake: false,
    canEditIntake: false,
    intakeEditUnavailableReason: "RECEPTION_PERMISSION_REQUIRED",
    target: null,
    intakeLookup: null,
    actionUnavailableReason: "RECEPTION_PERMISSION_REQUIRED",
  };
  await user.click(screen.getByRole("button", { name: "确认此管签收" }));
  await waitFor(() => expect(screen.queryByText("患者模拟")).toBeNull());
  expect(io.receipt).not.toHaveBeenCalled();
  expect(io.decision).not.toHaveBeenCalled();
  expect(
    fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/restriction?"),
    ),
  ).toHaveLength(2);
});
it("an A-to-null-to-A transition cannot revive an old same-key diagnostic that ignores abort", async () => {
  let resolveOld,
    resolveNew,
    reads = 0;
  const old = new Promise((resolve) => (resolveOld = resolve)),
    fresh = new Promise((resolve) => (resolveNew = resolve));
  fetchMock.mockImplementation(async (url) =>
    String(url).endsWith("/session")
      ? response(session.userSessionDetails)
      : ++reads === 1
        ? await old
        : await fresh,
  );
  const rendered = render(view());
  await waitFor(() => expect(reads).toBe(1));
  const actor = session;
  session = {
    userSessionDetails: null,
    errorLoadingSessionDetails: false,
    isCheckingLogin: true,
  };
  rendered.rerender(view());
  session = actor;
  rendered.rerender(view());
  await waitFor(() => expect(reads).toBe(2));
  await act(async () => resolveOld(response(current)));
  expect(screen.queryByText("患者模拟")).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
  await act(async () => resolveNew(response(current)));
  expect(await screen.findByText("患者模拟")).toBeVisible();
  expect(io.receipt).not.toHaveBeenCalled();
});
it("a hidden unknown operation remains recoverable under current read authority after its analysis version advances", async () => {
  let denyReadback = true;
  io.receipt.mockRejectedValue(Error("unknown"));
  await open();
  const user = userEvent.setup();
  fetchMock.mockImplementation(async (url) => {
    if (String(url).endsWith("/session"))
      return response(session.userSessionDetails);
    if (String(url).includes("/restriction?"))
      return versionAdvanced
        ? response({ code: "RESULT_RESTRICTION_VERSION_CHANGED" }, 409)
        : response(current);
    if (String(url).includes("/specimen-intake/lookup?"))
      return denyReadback
        ? response({ code: "SPECIMEN_LOOKUP_DENIED" }, 403)
        : response(current.intakeLookup);
    throw Error("unexpected URL");
  });
  await confirmReceipt(user);
  expect(
    await screen.findByText(zh["results.restriction.leaveBlocked"]),
  ).toBeVisible();
  expect(screen.queryByText("患者模拟")).toBeNull();
  const command = JSON.parse(io.receipt.mock.calls[0][0]);
  current.intakeLookup.current.physicalSpecimens[0].receivedDate =
    command.tubes[0].receivedDate;
  versionAdvanced = true;
  denyReadback = false;
  await user.click(
    screen.getByRole("button", { name: zh["results.restriction.retry"] }),
  );
  const check = await screen.findByRole("button", { name: "查询当前状态" });
  await user.click(check);
  expect(await screen.findByText(/签收已回查/)).toBeVisible();
  expect(io.receipt).toHaveBeenCalledTimes(1);
  expect(io.decision).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "当前处理权限和结果版本需要重新核对；可返回结果列表刷新后再进入。",
    ),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "确认此管验收" })).toBeNull();
  expect(
    screen.getByRole("button", { name: zh["results.restriction.back"] }),
  ).not.toBeDisabled();
});

it("shows actual semantic statuses in Chinese and keeps unknown or inconsistent facts honest and text-safe", () => {
  const renderFacts = (data) => (
    <IntlProvider locale="zh" timeZone="Asia/Shanghai" messages={zh}>
      <ResultRestrictionFacts data={data} />
    </IntlProvider>
  );
  const value = diagnosticFixture();
  const rendered = render(renderFacts(value));
  expect(screen.getByText("已登记")).toBeVisible();
  expect(screen.getByText("未开始")).toBeVisible();
  expect(screen.getByText("2026/10/07 GMT+8 09:00:00")).toBeVisible();
  value.analysisStatus = {
    ...value.analysisStatus,
    statusCode: "TechnicalAcceptance",
    statusName: "Technical acceptance",
  };
  rendered.rerender(renderFacts(value));
  expect(screen.getByText("技术审核接受")).toBeVisible();
  value.analysisStatus = {
    ...value.analysisStatus,
    statusCode: "FutureUnknown",
    statusName: "MYSTERY_ENGLISH",
  };
  value.facts.collection = {
    state: "INCONSISTENT",
    value: '<img src=x onerror="bad">',
  };
  rendered.rerender(renderFacts(value));
  expect(screen.getByText("待核实")).toBeVisible();
  expect(screen.queryByText("MYSTERY_ENGLISH")).toBeNull();
  expect(screen.getByText('<img src=x onerror="bad">')).toBeVisible();
  expect(rendered.container.querySelector("img")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("an explicit current-facts retry hides the old whole-order lookup after same-actor Reception read revocation", async () => {
  await open();
  current = {
    ...current,
    canOpenIntake: false,
    canEditIntake: false,
    intakeEditUnavailableReason: "RECEPTION_PERMISSION_REQUIRED",
    target: null,
    intakeLookup: null,
    actionUnavailableReason: "RECEPTION_PERMISSION_REQUIRED",
  };
  fireEvent.click(
    screen.getByRole("button", { name: zh["results.restriction.retry"] }),
  );
  expect(screen.queryByText("患者模拟")).toBeNull();
  expect(
    await screen.findByText(
      zh["results.restriction.unavailable.RECEPTION_PERMISSION_REQUIRED"],
    ),
  ).toBeVisible();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(io.receipt).not.toHaveBeenCalled();
  expect(io.decision).not.toHaveBeenCalled();
});

it.each(["receipt", "accept"])(
  "a current READ_ONLY Reception diagnosis shows real tube facts but exposes no %s write entrance",
  async (stage) => {
    current.canEditIntake = false;
    current.intakeEditUnavailableReason =
      "RECEPTION_UPDATE_PERMISSION_REQUIRED";
    if (stage === "accept")
      current.intakeLookup.current.physicalSpecimens[0].receivedDate =
        "2026-10-07T01:03:00Z";
    await open();
    expect(screen.getByText("患者模拟")).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveValue("RAW-001.1");
    expect(
      screen.getByText("当前岗位只能查看采收核对资料，不能登记签收或验收。"),
    ).toBeVisible();
    expect(
      screen.queryByRole("checkbox", { name: "我已核对患者、申请与实管条码" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /确认此管(签收|验收|拒收)/ }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "查询当前状态" }));
    expect(await screen.findByText("患者模拟")).toBeVisible();
    expect(io.receipt).not.toHaveBeenCalled();
    expect(io.decision).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: zh["results.restriction.back"] }),
    ).not.toBeDisabled();
  },
);

it("rechecks a same-actor UPDATE revocation before dispatch while preserving authorized read-only facts", async () => {
  await open();
  const user = userEvent.setup();
  await user.click(screen.getByText("我已核对患者、申请与实管条码"));
  current.canEditIntake = false;
  current.intakeEditUnavailableReason = "RECEPTION_UPDATE_PERMISSION_REQUIRED";
  await user.click(screen.getByRole("button", { name: "确认此管签收" }));
  expect(
    await screen.findByText(
      "当前岗位只能查看采收核对资料，不能登记签收或验收。",
    ),
  ).toBeVisible();
  expect(screen.getByText("患者模拟")).toBeVisible();
  expect(io.clock).not.toHaveBeenCalled();
  expect(io.receipt).not.toHaveBeenCalled();
  expect(io.decision).not.toHaveBeenCalled();
  expect(
    screen.queryByText(zh["order.specimenLookup.action.unknown"]),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: zh["results.restriction.back"] }),
  ).not.toBeDisabled();
});

it.each([
  [
    "ambiguous conflict",
    () => response({ code: "SPECIMEN_LOOKUP_AMBIGUOUS" }, 409),
    "changed",
  ],
  [
    "invalid JSON",
    () =>
      new Response("{", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    "unavailable",
  ],
  [
    "failed body",
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(Error("internal read failure"));
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    "unavailable",
  ],
  [
    "unavailable service",
    () => response({ code: "INTERNAL_DETAIL" }, 503),
    "unavailable",
  ],
])(
  "a %s UNKNOWN readback shows a known Chinese failure without internal keys or lost pending operation",
  async (_, failedResponse, expected) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      io.receipt.mockRejectedValue(Error("unknown write outcome"));
      await open();
      fetchMock.mockImplementation(async (url) => {
        if (String(url).endsWith("/session"))
          return response(session.userSessionDetails);
        if (String(url).includes("/restriction?")) return response(current);
        if (String(url).includes("/specimen-intake/lookup?"))
          return failedResponse();
        throw Error("unexpected URL");
      });
      await confirmReceipt(userEvent.setup());
      expect(
        await screen.findByText(zh[`results.restriction.error.${expected}`]),
      ).toBeVisible();
      expect(
        await screen.findByText(zh["results.restriction.leaveBlocked"]),
      ).toBeVisible();
      expect(screen.queryByText("患者模拟")).toBeNull();
      expect(io.receipt).toHaveBeenCalledTimes(1);
      expect(io.decision).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(
        /results\.restriction\.error\.|internal read failure|INTERNAL_DETAIL/,
      );
      expect(
        error.mock.calls.filter((args) =>
          args.some((value) => String(value).includes("MISSING_TRANSLATION")),
        ),
      ).toEqual([]);
    } finally {
      error.mockRestore();
    }
  },
);

it("ignores an aborted old-actor UNKNOWN readback without publishing a new page error or private facts", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    io.receipt.mockRejectedValue(Error("unknown write outcome"));
    const rendered = await open();
    let rejectReadback;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/session"))
        return response(session.userSessionDetails);
      if (String(url).includes("/restriction?")) return response(current);
      if (String(url).includes("/specimen-intake/lookup?"))
        return await new Promise((_, reject) => {
          rejectReadback = reject;
        });
      throw Error("unexpected URL");
    });
    await confirmReceipt(userEvent.setup());
    await waitFor(() => expect(rejectReadback).toBeTypeOf("function"));
    session = {
      userSessionDetails: null,
      errorLoadingSessionDetails: false,
      isCheckingLogin: true,
    };
    rendered.rerender(view());
    await act(async () =>
      rejectReadback(new DOMException("Cancelled old request", "AbortError")),
    );
    expect(screen.queryByText("患者模拟")).toBeNull();
    expect(
      screen.queryByText(zh["results.restriction.error.unavailable"]),
    ).toBeNull();
    expect(screen.queryByText("Cancelled old request")).toBeNull();
    expect(
      error.mock.calls.filter((args) =>
        args.some((value) => String(value).includes("MISSING_TRANSLATION")),
      ),
    ).toEqual([]);
    expect(io.receipt).toHaveBeenCalledTimes(1);
    expect(io.decision).not.toHaveBeenCalled();
  } finally {
    error.mockRestore();
  }
});
