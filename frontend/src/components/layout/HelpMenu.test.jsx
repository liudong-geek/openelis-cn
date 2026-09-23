import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import HelpMenu from "./HelpMenu";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import messages from "../../languages/en.json";
import { getFromOpenElisServer } from "../utils/Utils";

vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
}));

// Replaced inline utils require

const renderWithIntl = (component) =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <UserSessionDetailsContext.Provider
        value={{
          userSessionDetails: {
            authenticated: true,
            userId: "SIM-help",
            sessionId: "SIM-session",
          },
        }}
      >
        {component}
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );

describe("HelpMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does not crash when /rest/properties returns non-JSON (undefined)", () => {
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/properties") {
        callback(undefined);
      }
    });

    expect(() =>
      renderWithIntl(
        <HelpMenu helpOpen={false} handlePanelToggle={() => {}} />,
      ),
    ).not.toThrow();
  });

  test("opens the bundled China LIS manual when no server URL is configured", () => {
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/properties") {
        callback(undefined);
      }
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const handlePanelToggle = vi.fn();

    renderWithIntl(<HelpMenu helpOpen handlePanelToggle={handlePanelToggle} />);
    fireEvent.click(screen.getByText(messages["banner.menu.help.usermanual"]));

    expect(openSpy).toHaveBeenCalledWith(
      "/docs/china-lis-user-manual.html",
      "_blank",
      "noopener,noreferrer",
    );
    expect(handlePanelToggle).toHaveBeenCalledWith("");
    openSpy.mockRestore();
  });

  test("does not crash when /rest/properties returns a valid object", () => {
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/properties") {
        callback({
          "org.openelisglobal.help.manual.url": "https://example.com/manual",
          "org.openelisglobal.help.tutorials.url":
            "https://example.com/tutorials",
          "org.openelisglobal.help.release-notes.url":
            "https://example.com/release-notes",
        });
      }
    });

    expect(() =>
      renderWithIntl(
        <HelpMenu helpOpen={false} handlePanelToggle={() => {}} />,
      ),
    ).not.toThrow();
  });

  test("keeps the bundled manual when the server exposes a generic manual", () => {
    getFromOpenElisServer.mockImplementation((url, callback) => {
      if (url === "/rest/properties") {
        callback({
          "org.openelisglobal.help.manual.url": "https://example.com/manual",
        });
      }
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderWithIntl(<HelpMenu helpOpen handlePanelToggle={() => {}} />);
    fireEvent.click(screen.getByText(messages["banner.menu.help.usermanual"]));

    expect(openSpy).toHaveBeenCalledWith(
      "/docs/china-lis-user-manual.html",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
