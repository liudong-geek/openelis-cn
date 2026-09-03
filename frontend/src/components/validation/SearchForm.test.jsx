import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import SearchForm from "./SearchForm";
import messages from "../../languages/en.json";
import { NotificationContext } from "../layout/Layout";
import { getFromOpenElisServer } from "../utils/Utils";

vi.mock("../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
  };
});

describe("validation SearchForm", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/validation");
    getFromOpenElisServer.mockImplementation((_url, callback) => callback([]));
  });

  test("defaults the dashboard validation link to laboratory-section review", async () => {
    render(
      <IntlProvider locale="en" messages={messages}>
        <NotificationContext.Provider
          value={{
            setNotificationVisible: vi.fn(),
            addNotification: vi.fn(),
          }}
        >
          <SearchForm setParams={vi.fn()} setResults={vi.fn()} />
        </NotificationContext.Provider>
      </IntlProvider>,
    );

    expect(
      await screen.findByLabelText("Select Test Unit"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("Search-btn")).not.toBeInTheDocument();
  });
});
