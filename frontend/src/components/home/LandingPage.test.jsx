import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import LandingPage from "./LandingPage";
import messages from "../../languages/en.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext } from "../layout/Layout";
import { getFromOpenElisServer, postToOpenElisServer } from "../utils/Utils";

vi.mock("../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../utils/Utils");
  return {
    ...actualUtils,
    getFromOpenElisServer: vi.fn(),
    postToOpenElisServer: vi.fn(),
  };
});

const renderLandingPage = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{ userSessionDetails: { loginLabUnit: false } }}
      >
        <ConfigurationContext.Provider
          value={{
            configurationProperties: { REQUIRE_LAB_UNIT_AT_LOGIN: "true" },
          }}
        >
          <LandingPage />
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );

describe("LandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("selects an accessible laboratory unit before saving", async () => {
    const user = userEvent.setup();
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback([
        { id: "12", value: "Chemistry" },
        { id: "13", value: "Haematology" },
      ]),
    );
    postToOpenElisServer.mockImplementation(() => {});

    renderLandingPage();

    const continueButton = await screen.findByRole("button", {
      name: "Continue",
    });
    expect(continueButton).toBeDisabled();

    const chemistry = screen.getByRole("option", { name: /Chemistry/ });
    await user.click(chemistry);

    expect(chemistry).toHaveAttribute("aria-selected", "true");
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(postToOpenElisServer).toHaveBeenCalledWith(
      "/rest/setUserLoginLabUnit/12",
      {},
      expect.any(Function),
    );
    expect(screen.getByText("Saving selection…")).toBeInTheDocument();
  });

  test("shows a recoverable message when laboratory units fail to load", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback(undefined),
    );

    renderLandingPage();

    expect(await screen.findByText("Units unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });
});
