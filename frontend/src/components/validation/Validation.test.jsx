import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import Validation from "./Validation";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";

const renderValidation = (results = { resultList: [] }) =>
  render(
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: { authenticated: true, roles: [] } }}
        >
          <ConfigurationContext.Provider
            value={{ configurationProperties: { AccessionFormat: "ALPHANUM" } }}
          >
            <NotificationContext.Provider
              value={{
                setNotificationVisible: vi.fn(),
                addNotification: vi.fn(),
              }}
            >
              <Validation results={results} params="" />
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

describe("Validation", () => {
  test("does not show an empty table, pagination, or approval action before results are loaded", () => {
    renderValidation();

    expect(
      screen.getByText(messages["validation.queryState.unqueried.title"]),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /validate/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("There are no records to display"),
    ).not.toBeInTheDocument();
  });

  test("shows the QC release block and disables acceptance while return remains available", () => {
    renderValidation({
      queryId: "query-1",
      resultList: [
        {
          id: 0,
          analysisId: "101",
          accessionNumber: "SIM-101",
          patientInfo: "---",
          testName: "Glucose (Serum)",
          result: "7.1",
          resultType: "N",
          normal: false,
          showAcceptReject: true,
          readOnly: false,
          qcReleaseBlocked: true,
          qcBlockingViolations: [{ violationId: "v-1", ruleCode: "1_3S" }],
        },
      ],
    });

    expect(
      screen.getByText("Quality control blocks result release"),
    ).toBeInTheDocument();
    expect(document.getElementById("resultList0.isAccepted")).toBeDisabled();
    expect(document.getElementById("resultList0.isRejected")).toBeEnabled();
  });
});
