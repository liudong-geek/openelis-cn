import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";
const messages = zh;
vi.mock("./useResultPresence", () => ({
  useResultPresence: () => ({ presence: {}, unavailable: false }),
}));
vi.mock("../../esignature/ESignatureButton", () => ({
  default: ({ children, disabled, onSign }) => (
    <button disabled={disabled} onClick={onSign}>
      {children}
    </button>
  ),
  SignatureMeaning: { AUTHORED: "AUTHORED" },
}));
const row = (analysisId = "101", sampleItemId = "201") => ({
  id: "0",
  analysisId,
  sampleItemId,
  testId: "401",
  accessionNumber: "SIM-READ-ORDER",
  sampleItemExternalId: `SIM-TUBE-${sampleItemId}`,
  patientName: "SIM-PATIENT",
  testName: `SIM-TEST-${analysisId}`,
  analysisLastupdated: "1000",
  analysisStatusId: "4",
  resultType: "N",
  resultValue: "",
  reportable: "Y",
});
const json = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
let session, serverUser, records, requests, clinical;
beforeEach(() => {
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM-SESSION",
      csrf: "SIM-MASK-A",
      loginName: "SIM-USER",
      roles: ["Results"],
    },
  };
  serverUser = { ...session.userSessionDetails };
  records = [row(), row("102", "202")];
  requests = [];
  clinical = async () => json({ testResult: records });
  localStorage.setItem("CSRF", "SIM-MASK-A");
  window.history.replaceState({}, "", "/Results?scope=pending");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init = {}) => {
      const path = new URL(String(url), "http://localhost").pathname;
      requests.push({ path, init });
      if (path.endsWith("/session"))
        return json({ ...serverUser, csrf: `SIM-ROTATING-${requests.length}` });
      if (path.endsWith("/results-entry/lab-units"))
        return json([{ id: "4", value: "SIM-UNIT" }]);
      if (path.endsWith("/analysis-status-types"))
        return json([{ id: "4", value: "SIM-STATUS" }]);
      if (
        path.endsWith("/results-entry/pending") ||
        path.endsWith("/LogbookResults")
      )
        return clinical();
      throw new Error("Unexpected synthetic request");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
const view = () => (
  <MemoryRouter>
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider value={session}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" } }}
        >
          <NotificationContext.Provider
            value={{
              addNotification: vi.fn(),
              setNotificationVisible: vi.fn(),
            }}
          >
            <UnifiedResults />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const tr = (id = "101") =>
  within(screen.getByText(`SIM-TEST-${id}`).closest("tr"));
const query = () =>
  fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));
const clinicalReads = () =>
  requests.filter((r) => /\/(pending|LogbookResults)$/.test(r.path));
const writes = () => requests.filter((r) => r.init.method === "POST");

test("two different masks in the same session load the queue and permit selection without enabling writes", async () => {
  localStorage.setItem("CSRF", "SIM-MASK-B");
  render(view());
  await screen.findByText("SIM-TEST-101");
  expect(screen.getByRole("option", { name: "SIM-UNIT" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "应用筛选" })).toBeEnabled();
  const tube = within(screen.getByRole("complementary")).getByRole("button", {
    name: /SIM-TUBE-202/,
  });
  expect(tube).toBeEnabled();
  fireEvent.click(tube);
  expect(screen.getByText("SIM-TEST-102")).toBeVisible();
  expect(screen.queryByText("SIM-TEST-101")).toBeNull();
  expect(tr("102").queryByRole("spinbutton")).toBeNull();
  expect(tr("102").queryByRole("button", { name: "保存" })).toBeNull();
  expect(
    screen.getByText(messages["results.workbench.sessionWritePaused"]),
  ).toBeVisible();
  expect(writes()).toHaveLength(0);
  expect(localStorage.getItem("CSRF")).toBe("SIM-MASK-B");
});

test("storage changes hide rows and retain a zero draft for explicit same-identity requery, with writes still paused", async () => {
  render(view());
  await screen.findByText("SIM-TEST-101");
  fireEvent.change(tr().getByRole("spinbutton"), { target: { value: "0" } });
  const readCount = clinicalReads().length;
  localStorage.setItem("CSRF", "SIM-MASK-B");
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "CSRF" })));
  expect(screen.queryByText("SIM-TEST-101")).toBeNull();
  expect(screen.queryByText("SIM-PATIENT")).toBeNull();
  expect(
    screen.getByText(messages["results.workbench.sessionReadPaused"]),
  ).toBeVisible();
  await act(async () => {});
  expect(clinicalReads()).toHaveLength(readCount);
  query();
  await waitFor(() =>
    expect(screen.getAllByText("SIM-TEST-101").length).toBeGreaterThan(0),
  );
  const draft = screen.getByRole("region", {
    name: zh["results.workbench.drafts.title"],
  });
  expect(within(draft).getByText("0")).toBeVisible();
  expect(
    within(draft).getByRole("button", {
      name: zh["results.workbench.drafts.resume"],
    }),
  ).toBeDisabled();
  expect(writes()).toHaveLength(0);
  expect(localStorage.getItem("CSRF")).toBe("SIM-MASK-B");
});

test("a different server account after storage invalidation cannot regain old rows or drafts", async () => {
  render(view());
  await screen.findByText("SIM-TEST-101");
  fireEvent.change(tr().getByRole("spinbutton"), { target: { value: "0" } });
  serverUser = { ...serverUser, userId: "702", sessionId: "SIM-NEXT" };
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
  const count = clinicalReads().length;
  query();
  await screen.findByText(messages["results.workbench.sessionReadUnconfirmed"]);
  expect(screen.queryByText("SIM-TEST-101")).toBeNull();
  expect(
    screen.queryByRole("region", {
      name: zh["results.workbench.drafts.title"],
    }),
  ).toBeNull();
  expect(clinicalReads()).toHaveLength(count);
  expect(writes()).toHaveLength(0);
});

test("a late clinical read after storage invalidation cannot publish even if its fetch ignores abort", async () => {
  let finish;
  clinical = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  render(view());
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  const request = clinicalReads()[0];
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: "CSRF" })));
  expect(request.init.signal.aborted).toBe(true);
  await act(async () => finish(json({ testResult: records })));
  expect(screen.queryByText("SIM-TEST-101")).toBeNull();
  expect(
    screen.getByText(messages["results.workbench.sessionReadPaused"]),
  ).toBeVisible();
  expect(writes()).toHaveLength(0);
});

test.each([{ roles: ["Validation"] }, { userLabRolesMap: { 4: "Results" } }])(
  "unconfirmed read scope on the same actor hides rows and drafts and rejects late callbacks: %j",
  async (change) => {
    const app = render(view());
    await screen.findByText("SIM-TEST-101");
    fireEvent.change(tr().getByRole("spinbutton"), { target: { value: "0" } });
    let finish;
    clinical = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    query();
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    const request = clinicalReads().at(-1);
    session = {
      userSessionDetails: { ...session.userSessionDetails, ...change },
    };
    app.rerender(view());
    expect(screen.queryByText("SIM-TEST-101")).toBeNull();
    expect(screen.queryByText("SIM-PATIENT")).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: zh["results.workbench.drafts.title"],
      }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "应用筛选" })).toBeDisabled();
    expect(request.init.signal.aborted).toBe(true);
    await act(async () => finish(json({ testResult: records })));
    expect(screen.queryByText("SIM-TEST-101")).toBeNull();
    expect(writes()).toHaveLength(0);
  },
);

test.each(["editing", "unknown"])(
  "same-actor scope change preserves a %s draft privately, without rebinding it to the new scope",
  async (disposition) => {
    const originalUser = { ...session.userSessionDetails };
    const app = render(view());
    await screen.findByText("SIM-TEST-101");
    fireEvent.change(tr().getByRole("spinbutton"), { target: { value: "0" } });
    if (disposition === "unknown") {
      fireEvent.click(tr().getByRole("button", { name: "保存" }));
      await screen.findByRole("region", {
        name: zh["results.workbench.drafts.title"],
      });
    }
    const writeCount = writes().length;
    session = {
      userSessionDetails: {
        ...originalUser,
        loginLabUnit: "5",
        userLabRolesMap: { 5: ["Results"] },
      },
    };
    serverUser = { ...session.userSessionDetails };
    records = [row("102", "202")];
    app.rerender(view());
    expect(screen.queryByText("SIM-TEST-101")).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: zh["results.workbench.drafts.title"],
      }),
    ).toBeNull();
    query();
    await screen.findByText("SIM-TEST-102");
    expect(screen.queryByText("SIM-TEST-101")).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: zh["results.workbench.drafts.title"],
      }),
    ).toBeNull();
    expect(
      screen.getByText(zh["results.workbench.drafts.scopeHeld"]),
    ).toBeVisible();
    expect(writes()).toHaveLength(writeCount);
    // Returning to the original verified scope reveals the held value; it does
    // not resume editing or retry an unknown write merely because a GET worked.
    session = { userSessionDetails: originalUser };
    serverUser = originalUser;
    records = [row(), row("102", "202")];
    app.rerender(view());
    query();
    const draft = await screen.findByRole("region", {
      name: zh["results.workbench.drafts.title"],
    });
    expect(within(draft).getByText("0")).toBeVisible();
    expect(tr().queryByRole("spinbutton")).toBeNull();
    if (disposition === "unknown") {
      expect(
        within(draft).queryByRole("button", {
          name: zh["results.workbench.drafts.resume"],
        }),
      ).toBeNull();
      expect(
        within(draft).queryByRole("button", {
          name: zh["results.workbench.drafts.discard"],
        }),
      ).toBeNull();
    } else
      expect(
        within(draft).getByRole("button", {
          name: zh["results.workbench.drafts.resume"],
        }),
      ).toBeEnabled();
    expect(writes()).toHaveLength(writeCount);
  },
);
