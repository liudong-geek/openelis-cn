import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import Index from "./Index";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import { getReviewResults, postReviewResults } from "./reviewTransport";
import { getFromOpenElisServer } from "../utils/Utils";
import messages from "../../languages/en.json";

vi.mock("./reviewTransport", async () => ({
  ...(await vi.importActual("./reviewTransport")),
  getReviewResults: vi.fn(),
  postReviewResults: vi.fn(),
}));
vi.mock("../utils/Utils", async () => ({
  ...(await vi.importActual("../utils/Utils")),
  getFromOpenElisServer: vi.fn(),
}));
vi.mock("../resultPage/unified/resultSignatureApi", () => ({
  createResultSignatureApi: ({ guard }) => ({
    assertCurrent: () => {
      if (!guard()) throw new Error("STALE");
    },
    dispose: vi.fn(),
    isEsigEnabled: () => Promise.resolve({ enabled: false }),
  }),
}));
const record = (id = "101", extra = {}) => ({
  analysisId: id,
  accessionNumber: "SIM-ORDER",
  patientInfo: "---",
  testName: `SIM-TEST-${id} (SERUM)`,
  resultType: "N",
  result: "0",
  isAccepted: false,
  isRejected: false,
  readOnly: false,
  showAcceptReject: true,
  note: "",
  ...extra,
});
const summary = (extra = {}) => ({
  scope: "pending",
  state: "ready",
  analysisCount: 4,
  accessionCount: 2,
  displayRowCount: 6,
  qcBlockedAnalysisCount: 1,
  generatedAt: "2026-09-23T12:30:00Z",
  ...extra,
});
const response = (extra = {}) => ({
  queryId: "SIM-QUERY",
  reviewScope: "pending",
  doRange: true,
  searchFinished: true,
  summary: summary(),
  resultList: [record()],
  ...extra,
});
const empty = () =>
  response({
    resultList: [],
    summary: summary({
      analysisCount: 0,
      accessionCount: 0,
      displayRowCount: 0,
      qcBlockedAnalysisCount: 0,
    }),
  });
let requests, notify, changeSession;
const Contexts = () => {
  const [session, setSession] = useState({
    authenticated: true,
    userId: "SIM-ACTOR-A",
    sessionId: "SIM-SESSION",
    roles: ["Validation"],
  });
  changeSession = setSession;
  return (
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: session }}
        >
          <ConfigurationContext.Provider
            value={{ configurationProperties: { AccessionFormat: "NUMERIC" } }}
          >
            <NotificationContext.Provider
              value={{
                notificationVisible: false,
                addNotification: notify,
                setNotificationVisible: vi.fn(),
              }}
            >
              <Index />
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>
  );
};
const start = (path = "/validation?scope=pending") => {
  window.history.replaceState({}, "", path);
  return render(<Contexts />);
};
const respond = (data, index = requests.length - 1, status = 200) =>
  act(() => requests[index].callback(data, status));
const stats = () =>
  within(
    screen.getByRole("region", {
      name: messages["validation.summary.pending"],
    }),
  );
const mode = (name) =>
  screen.getByRole("button", {
    name: messages[
      `validation.search.mode.${name === "routine" ? "section" : name}`
    ],
  });
beforeEach(() => {
  requests = [];
  notify = vi.fn();
  localStorage.setItem("CSRF", "SIM-CSRF");
  getReviewResults.mockReset();
  postReviewResults.mockReset();
  getFromOpenElisServer.mockReset();
  getReviewResults.mockImplementation((url, callback, signal) =>
    requests.push({ url, callback, signal }),
  );
  getFromOpenElisServer.mockImplementation((_url, callback) =>
    callback([{ id: "101", value: "SIM-LAB" }]),
  );
});

test("a plain route remains unqueried; the explicit pending mode loads and only a successful empty query shows zero", () => {
  start("/validation");
  expect(requests).toHaveLength(0);
  expect(
    screen.getByText(messages["validation.queryState.unqueried.title"]),
  ).toBeVisible();
  expect(screen.queryByText("0 test tasks")).toBeNull();
  fireEvent.click(mode("pending"));
  expect(requests[0].url).toBe("/rest/AccessionValidation?scope=pending");
  expect(
    screen.getByText(messages["validation.queryState.loading.title"]),
  ).toBeVisible();
  respond(empty());
  expect(stats().getByText("0 test tasks")).toBeVisible();
  expect(
    screen.getByText(messages["validation.queryState.ready.title"]),
  ).toBeVisible();
});

test("pending deep links load once and use complete-query statistics rather than visible rows", () => {
  start();
  expect(requests).toHaveLength(1);
  respond(response({ resultList: [record(), record("102")] }));
  expect(stats().getByText("4 test tasks")).toBeVisible();
  expect(stats().getByText("6 result rows")).toBeVisible();
  expect(stats().getByText("2 accession groups")).toBeVisible();
  expect(stats().getByText("1 test tasks blocked by QC")).toBeVisible();
  fireEvent.click(mode("routine"));
  expect(new URLSearchParams(window.location.search).has("scope")).toBe(false);
  expect(
    screen.getByText(messages["validation.queryState.unqueried.title"]),
  ).toBeVisible();
  expect(screen.queryByText("4 test tasks")).toBeNull();
});

test("server pagination keeps pending scope and token, and each page retains the whole-query summary", () => {
  start();
  respond(response({ paging: { currentPage: 1, totalPages: 2 } }));
  fireEvent.click(document.getElementById("loadnextresults"));
  const query = new URLSearchParams(requests.at(-1).url.split("?")[1]);
  expect(Object.fromEntries(query)).toEqual({
    scope: "pending",
    queryId: "SIM-QUERY",
    page: "2",
  });
  expect(screen.queryByText("4 test tasks")).toBeNull();
  respond(
    response({
      paging: { currentPage: 2, totalPages: 2 },
      resultList: [record("102")],
    }),
  );
  expect(stats().getByText("4 test tasks")).toBeVisible();
  expect(screen.getByText(/SIM-TEST-102/)).toBeVisible();
});

test("late pending responses cannot restore rows or summary after switching modes", () => {
  start();
  fireEvent.click(mode("order"));
  expect(requests[0].signal.aborted).toBe(true);
  respond(response(), 0);
  expect(screen.queryByText(/SIM-TEST-101/)).toBeNull();
  expect(screen.queryByText("4 test tasks")).toBeNull();
  expect(
    screen.getByText(messages["validation.queryState.unqueried.title"]),
  ).toBeVisible();
});

test.each([
  "/validation?scope=unknown",
  "/validation?scope=pending&accessionNumber=SIM-ORDER",
  "/validation?scope=pending&testSectionId=101",
  "/validation?scope=pending&doRange=false",
  "/validation?scope=pending&doRange=FALSE",
])(
  "mixed or unknown query scopes are explained rather than silently widening the search: %s",
  (path) => {
    start(path);
    expect(requests).toHaveLength(0);
    expect(
      screen.getByText(messages["validation.queryState.error.title"]),
    ).toBeVisible();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: messages["validation.query.scopeInvalid"],
      }),
    );
  },
);

test("a server unqueried response does not become an empty success or no-results notification", async () => {
  start("/validation?type=order");
  fireEvent.click(screen.getByTestId("Search-btn"));
  await waitFor(() => expect(requests).toHaveLength(1));
  respond({
    reviewScope: "filtered",
    queryId: null,
    searchFinished: false,
    resultList: [],
    summary: summary({
      scope: "filtered",
      state: "unqueried",
      analysisCount: null,
      accessionCount: null,
      displayRowCount: null,
      qcBlockedAnalysisCount: null,
    }),
  });
  expect(
    screen.getByText(messages["validation.queryState.unqueried.title"]),
  ).toBeVisible();
  expect(notify).not.toHaveBeenCalled();
  expect(screen.queryByText("0 test tasks")).toBeNull();
});

test.each([401, 403, 409, 500])(
  "failed pending queries (%i) show an error state without zero",
  (status) => {
    start();
    respond(undefined, 0, status);
    expect(
      screen.getByText(messages["validation.queryState.error.title"]),
    ).toBeVisible();
    expect(screen.queryByText("0 test tasks")).toBeNull();
    expect(
      screen.queryByRole("region", {
        name: messages["validation.summary.pending"],
      }),
    ).toBeNull();
  },
);

test("missing summary remains unknown while valid read-only rows and original controls remain intact", () => {
  start();
  respond(
    response({
      summary: undefined,
      resultList: [
        record("101", { readOnly: true, reviewReadOnlyReason: "released" }),
        record("102", { readOnly: true, reviewReadOnlyReason: "printed" }),
        record("103", {
          readOnly: true,
          reviewReadOnlyReason: "released_and_printed",
        }),
        record("104"),
      ],
    }),
  );
  expect(
    stats().getByText(messages["validation.summary.unavailable"]),
  ).toBeVisible();
  for (const reason of ["released", "printed", "released_and_printed"])
    expect(
      screen.getByText(messages[`validation.readOnly.${reason}`]),
    ).toBeVisible();
  for (const index of [0, 1, 2])
    for (const field of ["isAccepted", "isRejected", "note"])
      expect(
        document.getElementById(`resultList${index}.${field}`),
      ).toBeDisabled();
  expect(document.getElementById("resultList3.isAccepted")).toBeEnabled();
  expect(screen.queryByText("0 test tasks")).toBeNull();
});

test("partial summaries only show known units, with current-batch QC distinctly labelled", () => {
  start();
  respond(
    response({
      summary: summary({
        state: "partial",
        displayRowCount: null,
        qcBlockedAnalysisCount: null,
      }),
      resultList: [record("101", { qcReleaseBlocked: true })],
    }),
  );
  expect(stats().getByText("4 test tasks")).toBeVisible();
  expect(stats().queryByText(/result rows/)).toBeNull();
  expect(
    stats().getByText(messages["validation.summary.partial"]),
  ).toBeVisible();
  expect(
    screen.getByText(messages["validation.summary.currentBatchQc"]),
  ).toBeVisible();
  expect(document.getElementById("resultList0.isAccepted")).toBeDisabled();
  expect(document.getElementById("resultList0.isRejected")).toBeEnabled();
});

test("unsaved review decisions block leaving pending mode before rows or scope are cleared", () => {
  start();
  respond(response());
  fireEvent.click(document.getElementById("resultList0.isAccepted"));
  fireEvent.click(mode("order"));
  expect(requests).toHaveLength(1);
  expect(new URLSearchParams(window.location.search).get("scope")).toBe(
    "pending",
  );
  expect(document.getElementById("resultList0.isAccepted")).toBeChecked();
  expect(stats().getByText("4 test tasks")).toBeVisible();
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: messages["validation.search.unsaved"] }),
  );
});

test("a page response for another scope invalidates the query instead of making its rows reviewable", () => {
  start();
  respond(response({ paging: { currentPage: 1, totalPages: 2 } }));
  fireEvent.click(document.getElementById("loadnextresults"));
  respond(
    response({
      reviewScope: "filtered",
      summary: summary({ scope: "filtered" }),
      paging: { currentPage: 2, totalPages: 2 },
    }),
  );
  expect(
    screen.getByText(messages["validation.queryState.error.title"]),
  ).toBeVisible();
  expect(screen.queryByText(/SIM-TEST-101/)).toBeNull();
});

test("changing actor clears the previous summary and discards its late callback", () => {
  start();
  respond(response());
  act(() =>
    changeSession({
      authenticated: true,
      userId: "SIM-ACTOR-B",
      sessionId: "SIM-SESSION-B",
      roles: ["Validation"],
    }),
  );
  expect(requests).toHaveLength(2);
  expect(screen.queryByText("4 test tasks")).toBeNull();
  respond(response(), 0);
  expect(screen.queryByText("4 test tasks")).toBeNull();
  respond(empty(), 1);
  expect(stats().getByText("0 test tasks")).toBeVisible();
});

test("the existing submission copy retains review scope and complete-query summary", async () => {
  start();
  const source = response();
  respond(source);
  fireEvent.click(document.getElementById("resultList0.isAccepted"));
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.review.submit"] }),
  );
  await waitFor(() => expect(postReviewResults).toHaveBeenCalledTimes(1));
  const payload = postReviewResults.mock.calls[0][0];
  expect(payload.reviewScope).toBe("pending");
  expect(payload.queryId).toBe("SIM-QUERY");
  expect(payload.summary).toEqual(source.summary);
  expect(payload.resultList[0].isAccepted).toBe(true);
});
