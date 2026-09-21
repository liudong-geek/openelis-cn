import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";
import { NotificationContext } from "../../layout/Layout";
import BatchTestReassignmentWorkspace from "./BatchTestReassignmentWorkspace";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerJsonResponse: mocks.post,
}));
vi.mock("../../common/PageBreadCrumb", () => ({
  default: () => <div data-testid="breadcrumb" />,
}));

const renderPage = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: vi.fn(),
        }}
      >
        <BatchTestReassignmentWorkspace />
      </NotificationContext.Provider>
    </IntlProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/BatchTestReassignment")
      callback({
        formName: "batch",
        sampleList: [{ id: "1", value: "Serum" }],
      });
    else if (url.includes("AllTestsForSampleTypeProvider"))
      callback({
        tests: [
          { id: "11", name: "Glucose" },
          { id: "12", name: "HbA1c" },
        ],
      });
    else if (url.includes("getPendingAnalysisForTestProvider"))
      callback({
        notStarted: [{ id: "100", labNo: "LAB-100" }],
        technicianRejection: [],
        biologistRejection: [],
        notValidated: [{ id: "101", labNo: "LAB-101" }],
      });
  });
});

test("guides the user from scope to a counted review", async () => {
  renderPage();
  expect(
    await screen.findByRole("heading", {
      name: "Batch test reassignment and cancelation",
    }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText("Sample Type"), {
    target: { value: "1" },
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Current test")).not.toBeDisabled(),
  );
  fireEvent.change(screen.getByLabelText("Current test"), {
    target: { value: "11" },
  });
  expect(await screen.findByText("LAB-100")).toBeVisible();
  expect(screen.getByText("LAB-101")).toBeVisible();
  expect(screen.getByRole("button", { name: "Review changes" })).toBeEnabled();
});
