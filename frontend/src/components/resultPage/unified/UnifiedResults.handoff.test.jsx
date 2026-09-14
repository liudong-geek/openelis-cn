import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import UnifiedResults from "./UnifiedResults";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import en from "../../../languages/en.json";

const io = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("./resultEntryTransport", () => ({
  readResultWorkbench: (...args) => io.read(...args),
  saveResultWorkbench: (...args) => io.save(...args),
}));
vi.mock("./useResultPresence", () => ({
  useResultPresence: () => ({ presence: {}, unavailable: false }),
}));
vi.mock("../../esignature/ESignatureButton", () => ({
  default: ({ onSign, children, disabled }) => (
    <button disabled={disabled} onClick={onSign}>
      {children}
    </button>
  ),
  SignatureMeaning: { AUTHORED: "AUTHORED" },
}));

// Synthetic records; no test data is loaded by the application.
const record = (analysisId, sampleItemId) => ({
  id: "0",
  analysisId,
  sampleItemId,
  testId: "401",
  resultType: "N",
  accessionNumber: "SIM-ORDER-301&part=2",
  sampleItemExternalId: `SIM-TUBE-${sampleItemId}`,
  testName: `SIM-TEST-${analysisId}`,
  patientInfo: "---",
  patientName: "SIM-NAME",
  resultValue: "",
  analysisLastupdated: "1000",
  analysisStatusId: "4",
  reportable: "Y",
});
const reviewLabel = "View this order's results awaiting review";
let records, session, history, readback;
const view = () => (
  <Router history={history}>
    <IntlProvider
      locale="en"
      messages={{ ...en, "results.workbench.review.open": reviewLabel }}
    >
      <UserSessionDetailsContext.Provider value={session}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "en" } }}
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
  </Router>
);
const resultRow = (id) =>
  within(
    within(screen.getByRole("table")).getByText(`SIM-TEST-${id}`).closest("tr"),
  );
const enter = (id, value) =>
  fireEvent.change(resultRow(id).getByRole("spinbutton"), {
    target: { value },
  });
const save = (id) =>
  fireEvent.click(
    resultRow(id).getByRole("button", { name: en["label.results.save"] }),
  );
const tube = (id) =>
  within(screen.getByRole("complementary")).getByRole("button", {
    name: new RegExp(`SIM-TUBE-${id}`),
  });
const receipt = {
  analysisLastupdated: "2000",
  analysisStatusId: "15",
  reflex: [],
  calculated: [],
};
const respondToSave = () => act(() => io.save.mock.calls.at(-1)[2](receipt));
const confirmReadback = () => {
  const submitted = JSON.parse(io.save.mock.calls.at(-1)[1]).testResult;
  records = records.map((row) =>
    row.analysisId === submitted.analysisId
      ? {
          ...row,
          ...submitted,
          resultId: "601",
          rawResultValue: submitted.resultValue,
          analysisLastupdated: "2000",
          analysisStatusId: "15",
        }
      : row,
  );
  act(() => readback({ testResult: records }));
};
const saveAndConfirm = (id) => {
  enter(id, "0");
  save(id);
  respondToSave();
  confirmReadback();
};

beforeEach(() => {
  io.read.mockReset();
  io.save.mockReset();
  readback = undefined;
  records = [record("101", "201"), record("102", "202")];
  history = createMemoryHistory({ initialEntries: ["/Results"] });
  window.history.replaceState({}, "", "/Results");
  localStorage.setItem("CSRF", "SIM-CSRF");
  session = {
    userSessionDetails: {
      authenticated: true,
      userId: "701",
      sessionId: "SIM-SESSION",
      csrf: "SIM-CSRF",
      loginName: "SIM-USER",
      roles: ["Results", "Validation"],
    },
  };
  io.read.mockImplementation((url, callback) => {
    if (url.includes("lab-units") || url.includes("status-types")) callback([]);
    else if (url.startsWith("/rest/LogbookResults?")) readback = callback;
    else callback({ testResult: records });
  });
});

test("only an independent confirmed readback enables the exact existing review route", () => {
  render(view());
  enter("101", "0");
  expect(screen.queryByRole("button", { name: reviewLabel })).toBeNull();
  save("101");
  respondToSave();
  expect(screen.queryByRole("button", { name: reviewLabel })).toBeNull();
  confirmReadback();
  fireEvent.click(resultRow("101").getByRole("button", { name: reviewLabel }));
  expect(history.location.pathname).toBe("/AccessionValidation");
  expect([...new URLSearchParams(history.location.search)]).toEqual([
    ["accessionNumber", "SIM-ORDER-301&part=2"],
  ]);
  expect(io.save).toHaveBeenCalledTimes(1);
});

test("a failed or mismatching readback never offers review", () => {
  render(view());
  enter("101", "0");
  save("101");
  respondToSave();
  act(() => readback({ testResult: records }));
  expect(screen.queryByRole("button", { name: reviewLabel })).toBeNull();
  expect(history.location.pathname).toBe("/Results");
});

test("the shortcut follows the actual Validation role and disappears on session change", () => {
  session.userSessionDetails.roles = ["Results"];
  const rendered = render(view());
  saveAndConfirm("101");
  expect(screen.queryByRole("button", { name: reviewLabel })).toBeNull();
  session = {
    userSessionDetails: {
      ...session.userSessionDetails,
      roles: ["Results", "Validation"],
    },
  };
  rendered.rerender(view());
  expect(screen.getByRole("button", { name: reviewLabel })).toBeEnabled();
  session = {
    userSessionDetails: {
      ...session.userSessionDetails,
      userId: "702",
      sessionId: "SIM-OTHER",
    },
  };
  rendered.rerender(view());
  expect(screen.queryByRole("button", { name: reviewLabel })).toBeNull();
});

test("drafts on another specimen and unknown saves prevent leaving for review", () => {
  render(view());
  saveAndConfirm("101");
  enter("102", "8");
  fireEvent.click(tube("201"));
  const review = resultRow("101").getByRole("button", { name: reviewLabel });
  expect(review).toBeDisabled();
  fireEvent.click(review);
  expect(history.location.pathname).toBe("/Results");
  fireEvent.click(tube("202"));
  expect(resultRow("102").getByRole("spinbutton")).toHaveValue(8);
  save("102");
  act(() =>
    io.save.mock.calls.at(-1)[2]({
      status: 0,
      errorKey: "common.api.networkError",
    }),
  );
  fireEvent.click(tube("201"));
  expect(
    resultRow("101").getByRole("button", { name: reviewLabel }),
  ).toBeDisabled();
  expect(history.location.pathname).toBe("/Results");
});

test("reopening a confirmed result for editing withdraws its old shortcut", () => {
  render(view());
  saveAndConfirm("101");
  fireEvent.click(
    resultRow("101").getByRole("button", { name: en["label.results.edit"] }),
  );
  expect(screen.queryByRole("button", { name: reviewLabel })).toBeNull();
  expect(resultRow("101").getByRole("spinbutton")).toHaveValue(0);
});
