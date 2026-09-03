import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UnifiedResults from "./UnifiedResults";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import messages from "../../../languages/en.json";
import zhMessages from "../../../languages/zh.json";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
  postToOpenElisServer: vi.fn(),
}));

vi.mock("./usePresence", () => ({
  usePresence: () => ({}),
}));

vi.mock("../../esignature/ESignatureButton", () => ({
  default: ({ onSign, children }) => (
    <button type="button" onClick={() => onSign(null)}>
      {children}
    </button>
  ),
  SignatureMeaning: { AUTHORED: "AUTHORED" },
}));

const pendingRow = {
  id: "0",
  analysisId: "42",
  accessionNumber: "DEV01260000000000003",
  patientInfo: "P1-20260821-NID-0002",
  sampleType: "Whole blood",
  testName: "White blood cell count",
  normalRange: "4.0 - 10.0",
  unitsOfMeasure: "10^9/L",
  analysisStatusId: "4",
  resultType: "N",
  resultValue: "",
  reportable: "Y",
};

const renderWorkbench = (
  pendingRows = [pendingRow],
  { dateLocale = "en-US", intlLocale = "en", intlMessages = messages } = {},
) => {
  getFromOpenElisServer.mockImplementation((url, callback) => {
    if (url === "/rest/results-entry/lab-units") {
      callback([{ id: "1", value: "Hematology", domain: "CLINICAL" }]);
      return;
    }
    if (url === "/rest/analysis-status-types") {
      callback([
        { id: "4", value: "Not started" },
        { id: "15", value: "Technical Acceptance" },
      ]);
      return;
    }
    if (url === "/rest/results-entry/pending") {
      callback({ testResult: pendingRows, total: pendingRows.length });
    }
  });

  window.history.pushState({}, "", "/Results?scope=pending");
  return render(
    <MemoryRouter initialEntries={["/Results?scope=pending"]}>
      <IntlProvider locale={intlLocale} messages={intlMessages}>
        <ConfigurationContext.Provider
          value={{
            configurationProperties: { DEFAULT_DATE_LOCALE: dateLocale },
          }}
        >
          <NotificationContext.Provider
            value={{
              notificationVisible: false,
              setNotificationVisible: vi.fn(),
              addNotification: vi.fn(),
            }}
          >
            <UnifiedResults />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
};

describe("UnifiedResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads the dashboard pending queue without requiring a manual search", async () => {
    renderWorkbench();

    expect(
      await screen.findByRole("heading", {
        name: "Result entry workbench",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/DEV01260000000000003/)).toBeInTheDocument();
    expect(screen.getByText("White blood cell count")).toBeInTheDocument();
    expect(
      document.querySelector("#unifiedResultValue-42-primary"),
    ).toBeEnabled();
    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      "/rest/results-entry/pending",
      expect.any(Function),
    );
  });

  test("shows an actionable localized empty state", async () => {
    renderWorkbench([]);

    expect(
      await screen.findByText("No results are waiting for entry"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("There are no records to display"),
    ).not.toBeInTheDocument();
  });

  test("uses the configured Chinese date order in the result filter", async () => {
    renderWorkbench([pendingRow], {
      dateLocale: "zh-CN",
      intlLocale: "zh-CN",
      intlMessages: zhMessages,
    });

    expect(document.getElementById("unifiedResultsDate")).toHaveAttribute(
      "placeholder",
      "年/月/日",
    );
    expect(
      document
        .getElementById("unifiedResultsDate")
        .closest(".oe-custom-date-picker"),
    ).toBeInTheDocument();
  });

  test("shows the new workflow status immediately after a result is saved", async () => {
    postToOpenElisServerJsonResponse.mockImplementation(
      (_url, _body, callback) =>
        callback({
          status: 200,
          analysisStatusId: "15",
          analysisLastupdated: "1755900000000",
        }),
    );

    renderWorkbench();

    await screen.findByText("White blood cell count");
    const input = document.querySelector("#unifiedResultValue-42-primary");
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "7.2" } });
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));

    expect(await screen.findByText("Technical acceptance")).toBeInTheDocument();
    expect(screen.queryByText("Not started")).not.toBeInTheDocument();
  });
});
