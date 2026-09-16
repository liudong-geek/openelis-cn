import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import Validation from "./Validation";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import { postReviewResults } from "./reviewTransport";

const signState = vi.hoisted(() => ({ enabled: null }));
vi.mock("./reviewTransport", async () => ({
  ...(await vi.importActual("./reviewTransport")),
  postReviewResults: vi.fn(),
}));
vi.mock("../resultPage/unified/resultSignatureApi", () => ({
  createResultSignatureApi: ({ guard }) => ({
    assertCurrent: () => {
      if (!guard()) throw new Error("STALE");
    },
    dispose: vi.fn(),
    isEsigEnabled: () =>
      signState.enabled || Promise.resolve({ enabled: false }),
  }),
}));
const row = (extra = {}) => ({
  id: 0,
  analysisId: "101",
  resultId: "SIM-RESULT",
  testResultComponentId: "SIM-COMPONENT",
  accessionNumber: "SIM-ORDER",
  testName: "SIM-TEST (SERUM)",
  resultType: "N",
  result: "0.00",
  rawResultValue: 0,
  analysisLastupdated: "SIM-ANALYSIS-VERSION",
  patientInfo: "---",
  patientName: "SIM-MASKED-NAME",
  isAccepted: false,
  isRejected: false,
  note: "",
  pastNotes: "SIM history<br>Second line",
  ...extra,
});
const form = (rows = [row()], queryId = "SIM-QUERY") => ({
  queryId,
  doRange: false,
  resultList: rows,
});
const start = (initial = form()) => {
  const addNotification = vi.fn(),
    setNotificationVisible = vi.fn(),
    onContextInvalid = vi.fn(),
    onSubmissionChange = vi.fn();
  const viewFor = (results) => (
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              roles: ["Reception", "Validation"],
            },
          }}
        >
          <ConfigurationContext.Provider
            value={{ configurationProperties: { AccessionFormat: "NUMERIC" } }}
          >
            <NotificationContext.Provider
              value={{ addNotification, setNotificationVisible }}
            >
              <Validation
                results={results}
                onContextInvalid={onContextInvalid}
                onSubmissionChange={onSubmissionChange}
              />
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>
  );
  const view = render(viewFor(initial));
  return {
    ...view,
    addNotification,
    onContextInvalid,
    onSubmissionChange,
    change: (next) => view.rerender(viewFor(next)),
  };
};
beforeEach(() => {
  localStorage.setItem("CSRF", "SIM-review-csrf");
  postReviewResults.mockReset();
  signState.enabled = null;
});

test("shows actual raw zero and member evidence without exposing masked patient data or inventing result version", () => {
  const source = row({
    resultMembers: [
      {
        resultId: "SIM-MEMBER",
        rawResultValue: "",
        resultType: "C",
        testResultComponentId: "SIM-MEMBER-COMPONENT",
        parentResultId: "SIM-PARENT",
        grouping: 0,
      },
    ],
  });
  const snapshot = JSON.stringify(source);
  start(form([source]));
  expect(screen.queryByText("SIM-MASKED-NAME")).not.toBeInTheDocument();
  expect(document.querySelector('a[href*="PatientManagement"]')).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.details.open"] }),
  );
  const dialog = screen.getByRole("dialog");
  expect(
    screen.getByRole("button", { name: messages["validation.details.close"] }),
  ).toBeInTheDocument();
  expect(dialog).toHaveTextContent("SIM-ANALYSIS-VERSION");
  expect(dialog).toHaveTextContent("SIM-MEMBER");
  expect(dialog).toHaveTextContent("SIM-PARENT");
  expect(dialog).toHaveTextContent(messages["validation.details.empty"]);
  expect(dialog).toHaveTextContent("0");
  expect(dialog).toHaveTextContent("0.00");
  expect(dialog).not.toHaveTextContent("Result version");
  expect(dialog).not.toHaveTextContent("SIM-MASKED-NAME");
  expect(JSON.stringify(source)).toBe(snapshot);
});

test("changing query for the same result identity clears the open details", () => {
  const view = start();
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.details.open"] }),
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  view.change(form([row()], "SIM-OTHER-QUERY"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.details.open"] }),
  );
  view.change({ resultList: [] });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test.each([403, 409, 0])(
  "save outcome %s invalidates the context without retry",
  async (status) => {
    const source = form([row({ isAccepted: true })]);
    const view = start(source);
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["validation.review.submit"],
      }),
    );
    await waitFor(() => expect(postReviewResults).toHaveBeenCalledTimes(1));
    expect(postReviewResults.mock.calls[0][0]).toEqual(source);
    expect(postReviewResults.mock.calls[0][0]).not.toBe(source);
    expect(view.onSubmissionChange).toHaveBeenLastCalledWith(true);
    act(() => postReviewResults.mock.calls[0][1](status));
    expect(view.onSubmissionChange).toHaveBeenLastCalledWith(false);
    expect(view.onContextInvalid).toHaveBeenCalledTimes(1);
    expect(view.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["validation.review.submit"],
      }),
    );
    expect(postReviewResults).toHaveBeenCalledTimes(1);
  },
);

test("a late signature configuration response cannot submit an unmounted review", async () => {
  let resolve;
  signState.enabled = new Promise((done) => {
    resolve = done;
  });
  const view = start(form([row({ isAccepted: true })]));
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.review.submit"] }),
  );
  view.unmount();
  await act(async () => resolve({ enabled: false }));
  expect(postReviewResults).not.toHaveBeenCalled();
});

test("late save completion cannot notify or clear another mounted query", async () => {
  const view = start(form([row({ isAccepted: true })]));
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.review.submit"] }),
  );
  await waitFor(() => expect(postReviewResults).toHaveBeenCalledTimes(1));
  const callback = postReviewResults.mock.calls[0][1];
  view.change(form([row()], "SIM-QUERY-NEW"));
  act(() => callback(200));
  expect(view.addNotification).not.toHaveBeenCalled();
  expect(view.onContextInvalid).not.toHaveBeenCalled();
});

test("bulk review skips restricted rows and keeps offscreen selections when paging", () => {
  const rows = Array.from({ length: 12 }, (_, id) =>
    row({ id, analysisId: `SIM-${id}`, normal: true }),
  );
  rows[1].readOnly = true;
  rows[2].showAcceptReject = false;
  start(form(rows));
  const editable = (id, field = "isAccepted") =>
    document.querySelector(`[name="resultList[${id}].${field}"]`);
  fireEvent.change(
    screen.getByLabelText(messages["pagination.items-per-page"]),
    { target: { value: "10" } },
  );
  expect(editable(1)).toBeDisabled();
  expect(editable(2)).toBeDisabled();
  fireEvent.click(screen.getByLabelText(messages["validation.accept.all"]));
  expect(rows.map((item) => item.isAccepted)).toEqual([
    true,
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: messages["pagination.forward"] }),
  );
  expect(editable(10)).toBeChecked();
  expect(editable(11)).toBeChecked();
  expect(rows).toHaveLength(12);
});

test("accept and return stay mutually exclusive for row and bulk decisions", () => {
  const records = [row(), row({ id: 1, analysisId: "SIM-OTHER" })];
  start(form(records));
  const editable = (id, field) =>
    document.querySelector(`[name="resultList[${id}].${field}"]`);
  fireEvent.click(screen.getByLabelText(messages["validation.accept.all"]));
  fireEvent.click(editable(0, "isRejected"));
  expect(records[0]).toMatchObject({ isAccepted: false, isRejected: true });
  expect(editable(0, "isAccepted")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText(messages["validation.reject.all"]));
  expect(
    records.every((record) => record.isRejected && !record.isAccepted),
  ).toBe(true);
  fireEvent.click(editable(1, "isAccepted"));
  expect(records[1]).toMatchObject({ isAccepted: true, isRejected: false });
});

test("same-analysis components share decision and required return reason", () => {
  const rows = [row(), row({ id: 1, resultId: "102" })];
  const view = start(form(rows));
  fireEvent.click(document.querySelector('[name="resultList[0].isRejected"]'));
  expect(rows.every((row) => row.isRejected && !row.isAccepted)).toBe(true);
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.review.submit"] }),
  );
  expect(postReviewResults).not.toHaveBeenCalled();
  expect(view.addNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: messages["validation.review.reasonRequired"],
    }),
  );
  fireEvent.change(document.querySelector('[name="resultList[1].note"]'), {
    target: { value: "SIM repeat required" },
  });
  expect(rows.map((row) => row.note)).toEqual([
    "SIM repeat required",
    "SIM repeat required",
  ]);
});
test("no selection does not begin a review submission", () => {
  const view = start();
  fireEvent.click(
    screen.getByRole("button", { name: messages["validation.review.submit"] }),
  );
  expect(postReviewResults).not.toHaveBeenCalled();
  expect(view.addNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: messages["validation.review.selectRequired"],
    }),
  );
});
test("accept normal does not partially select an analysis with an abnormal component", () => {
  const rows = [row({ normal: true }), row({ id: 1, normal: false })];
  start(form(rows));
  fireEvent.click(screen.getByLabelText(messages["validation.accept.normal"]));
  expect(rows.every((row) => !row.isAccepted)).toBe(true);
});
