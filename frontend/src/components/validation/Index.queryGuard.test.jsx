vi.mock("./reviewTransport", async () => ({
  ...(await vi.importActual("./reviewTransport")),
  getReviewResults: vi.fn(),
  postReviewResults: vi.fn(),
}));
import { getReviewResults, postReviewResults } from "./reviewTransport";
import React, { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import Index from "./Index";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import { getFromOpenElisServer, postToOpenElisServer } from "../utils/Utils";

vi.mock("../utils/Utils", async () => ({
  ...(await vi.importActual("../utils/Utils")),
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServer: vi.fn(),
}));
vi.mock("../esignature/ESignatureButton", () => ({
  // Signing is outside this query-only integration test. No submission runs.
  default: ({ children }) => (
    <button type="button" disabled>
      {children}
    </button>
  ),
  SignatureMeaning: { VALIDATED_AND_RELEASED: "VALIDATED_AND_RELEASED" },
}));

// Synthetic review batches only. Keep the real table, Formik fields and jpSet
// mutations: mocking Validation would miss the in-place mutation contract.
const record = (number = 1, overrides = {}) => ({
  analysisId: String(100 + number),
  accessionNumber: "SIM-W02-001",
  testName: `SIM-W02-TEST-${number} (SERUM)`,
  resultType: "N",
  result: "0",
  isAccepted: false,
  isRejected: false,
  normal: true,
  ...overrides,
});
let requests;
let changeSession;
let changeSessionPhase;

function Contexts() {
  const [session, setSession] = useState({
    authenticated: true,
    userId: "SIM-USER-A",
    roles: ["Validation"],
  });
  changeSession = setSession;
  const [phaseState, setPhaseState] = useState({
    sessionPhase: "authenticated",
    errorLoadingSessionDetails: false,
  });
  changeSessionPhase = setPhaseState;
  const [notifications, setNotifications] = useState([]);
  const [notificationVisible, setNotificationVisible] = useState(false);
  return (
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: session,
            ...phaseState,
          }}
        >
          <ConfigurationContext.Provider
            value={{ configurationProperties: { AccessionFormat: "NUMERIC" } }}
          >
            <NotificationContext.Provider
              value={{
                notifications,
                notificationVisible,
                setNotificationVisible,
                addNotification: (notification) =>
                  setNotifications((current) => [...current, notification]),
                removeNotification: (index) =>
                  setNotifications((current) =>
                    current.filter((_, entry) => index !== entry),
                  ),
              }}
            >
              <Index />
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>
  );
}

const editable = (field, index = 0) =>
  document.querySelector(`[name="resultList[${index}].${field}"]`);
const search = () => fireEvent.click(screen.getByTestId("Search-btn"));
const respond = (resultList, extra = {}) =>
  act(() =>
    requests.at(-1).callback({ queryId: "query-test", resultList, ...extra }),
  );
const start = (rows = [record()], extra = {}) => {
  render(<Contexts />);
  expect(requests).toHaveLength(1);
  respond(rows, extra);
};

beforeEach(() => {
  requests = [];
  window.history.replaceState(
    {},
    "",
    "/AccessionValidation?accessionNumber=SIM-W02-001",
  );
  getReviewResults.mockReset();
  postToOpenElisServer.mockReset();
  getReviewResults.mockImplementation((url, callback, signal) => {
    if (!url.startsWith("/rest/AccessionValidation?"))
      throw new Error(`Unexpected request: ${url}`);
    requests.push({ url, callback, signal });
  });
});

afterEach(() => {
  expect(postToOpenElisServer).not.toHaveBeenCalled();
  expect(postReviewResults).not.toHaveBeenCalled();
});

test.each(["isAccepted", "isRejected", "note"])(
  "an unsaved %s edit blocks a new query and retains the real table input",
  async (field) => {
    start();
    const control = editable(field);
    if (field === "note")
      fireEvent.change(control, {
        target: { value: "SIM pending review note" },
      });
    else fireEvent.click(control);
    fireEvent.change(document.querySelector('[name="accessionNumber"]'), {
      target: { value: "SIM-W02-002" },
    });
    search();
    expect(
      await screen.findByText(messages["validation.search.unsaved"]),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(requests[0].signal.aborted).toBe(false);
    expect(screen.getByText("SIM-W02-TEST-1 (SERUM)")).toBeInTheDocument();
    expect(editable(field)).toBe(control);
    if (field === "note")
      expect(control).toHaveValue("SIM pending review note");
    else expect(control).toBeChecked();
    // Undoing the user's edit restores the loaded baseline and permits a query.
    if (field === "note") fireEvent.change(control, { target: { value: "" } });
    else fireEvent.click(control);
    search();
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(
      new URLSearchParams(requests[1].url.split("?")[1]).get("accessionNumber"),
    ).toBe("SIM-W02-002");
    expect(
      screen.queryByText("SIM-W02-TEST-1 (SERUM)"),
    ).not.toBeInTheDocument();
  },
);

test("server-provided notes are the baseline and do not block another query", async () => {
  start([record(1, { note: "SIM existing server note" })]);
  search();
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(screen.queryByText(messages["validation.search.unsaved"])).toBeNull();
  respond([record(1, { note: "SIM existing server note" })]);
  fireEvent.change(editable("note"), { target: { value: "SIM revised note" } });
  search();
  expect(
    await screen.findByText(messages["validation.search.unsaved"]),
  ).toBeInTheDocument();
  expect(requests).toHaveLength(2);
  expect(editable("note")).toHaveValue("SIM revised note");
});

test("unsaved review changes block server pagination before the existing batch is cleared", async () => {
  start([record()], { paging: { currentPage: 1, totalPages: 3 } });
  fireEvent.click(editable("isRejected"));
  fireEvent.click(document.getElementById("loadnextresults"));
  expect(
    await screen.findByText(messages["validation.search.unsaved"]),
  ).toBeInTheDocument();
  expect(requests).toHaveLength(1);
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
  expect(editable("isRejected")).toBeChecked();
  expect(document.getElementById("loadnextresults")).toBeEnabled();
});

test("an allowed query rebuilds uncontrolled inputs and resets local pagination for a new batch", async () => {
  start(Array.from({ length: 12 }, (_, index) => record(index + 1)));
  const acceptAll = screen.getByLabelText(messages["validation.accept.all"]);
  fireEvent.click(acceptAll);
  for (let index = 0; index < 12; index += 1) {
    expect(editable("isAccepted", index)).toBeChecked();
    fireEvent.click(editable("isAccepted", index));
  }
  // The row edits are undone, but this legacy bulk checkbox keeps its own DOM
  // state. The next batch must not inherit that misleading checked indicator.
  expect(acceptAll).toBeChecked();
  const pageSize = screen.getByLabelText(messages["pagination.items-per-page"]);
  fireEvent.change(pageSize, { target: { value: "10" } });
  fireEvent.click(
    screen.getByRole("button", { name: messages["pagination.forward"] }),
  );
  expect(screen.getByText("SIM-W02-TEST-11 (SERUM)")).toBeInTheDocument();
  expect(screen.queryByText("SIM-W02-TEST-1 (SERUM)")).not.toBeInTheDocument();
  search();
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(screen.queryByText("SIM-W02-TEST-11 (SERUM)")).not.toBeInTheDocument();
  respond([record(1, { testName: "SIM-W02-NEW-BATCH (SERUM)" })]);
  expect(screen.getByText("SIM-W02-NEW-BATCH (SERUM)")).toBeInTheDocument();
  expect(
    screen.getByLabelText(messages["pagination.items-per-page"]),
  ).toHaveValue("100");
  expect(
    screen.getByLabelText(messages["validation.accept.all"]),
  ).not.toBeChecked();
  expect(screen.getByLabelText(messages["validation.accept.all"])).not.toBe(
    acceptAll,
  );
  expect(editable("isAccepted")).not.toBeChecked();
  expect(editable("isRejected")).not.toBeChecked();
  expect(editable("note")).toHaveValue("");
});

test.each([
  [
    "user",
    { authenticated: true, userId: "SIM-USER-B", roles: ["Validation"] },
  ],
  [
    "permission",
    { authenticated: true, userId: "SIM-USER-A", roles: ["Results"] },
  ],
  [
    "session",
    {
      authenticated: true,
      userId: "SIM-USER-A",
      sessionId: "SIM-SESSION-B",
      roles: ["Validation"],
    },
  ],
  ["logout", { authenticated: false, userId: "SIM-USER-A", roles: [] }],
])(
  "a %s change hides old rows and details and ignores the previous request",
  (_case, session) => {
    start();
    fireEvent.click(
      screen.getByRole("button", { name: messages["validation.details.open"] }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const oldRequest = requests[0];
    act(() => changeSession(session));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("SIM-W02-TEST-1 (SERUM)"),
    ).not.toBeInTheDocument();
    expect(oldRequest.signal.aborted).toBe(true);
    act(() =>
      oldRequest.callback({ queryId: "query-test", resultList: [record()] }),
    );
    expect(
      screen.queryByText("SIM-W02-TEST-1 (SERUM)"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText(messages["validation.query.permissionChanged"])
        .length,
    ).toBeGreaterThan(0);
  },
);

test.each([
  ["checking", { sessionPhase: "checking", errorLoadingSessionDetails: false }],
  [
    "error",
    { sessionPhase: "authenticated", errorLoadingSessionDetails: true },
  ],
])(
  "a session %s state hides old review data and blocks further queries",
  (_case, phase) => {
    start();
    const requestCount = requests.length;
    act(() => changeSessionPhase(phase));
    expect(
      screen.queryByText("SIM-W02-TEST-1 (SERUM)"),
    ).not.toBeInTheDocument();
    search();
    expect(requests).toHaveLength(requestCount);
  },
);
