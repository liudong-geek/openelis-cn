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

    expect(screen.getByText("No results loaded")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /validate/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("There are no records to display"),
    ).not.toBeInTheDocument();
  });
});
