vi.mock("./reviewTransport", async () => ({
  ...(await vi.importActual("./reviewTransport")),
  getReviewResults: vi.fn(),
  postReviewResults: vi.fn(),
}));
import { getReviewResults, postReviewResults } from "./reviewTransport";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import SearchForm from "./SearchForm";
import messages from "../../languages/en.json";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
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
    getFromOpenElisServer.mockReset();
    getReviewResults.mockReset();
    getReviewResults.mockImplementation((_url, callback) =>
      callback({ queryId: "query-test", resultList: [] }),
    );
    getFromOpenElisServer.mockImplementation((_url, callback) => callback([]));
  });

  test("defaults the dashboard validation link to laboratory-section review", async () => {
    renderSearch();

    expect(
      await screen.findByLabelText("Select Test Unit"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("Search-btn")).not.toBeInTheDocument();
  });

  test("switches review search modes inside one workbench", async () => {
    renderSearch();
    await screen.findByLabelText("Select Test Unit");

    fireEvent.click(
      screen.getByRole("button", {
        name: messages["validation.search.mode.order"],
      }),
    );

    expect(window.location.pathname).toBe("/validation");
    expect(new URLSearchParams(window.location.search).get("type")).toBe(
      "order",
    );
    expect(
      await screen.findByLabelText(messages["search.label.accession"]),
    ).toBeInTheDocument();
    expect(screen.getByTestId("Search-btn")).toBeInTheDocument();
    expect(screen.queryByLabelText("Select Test Unit")).not.toBeInTheDocument();
  });

  const renderSearch = (format = "NUMERIC") => {
    const setParams = vi.fn();
    render(
      <IntlProvider locale="en" messages={messages}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { AccessionFormat: format } }}
        >
          <NotificationContext.Provider
            value={{
              setNotificationVisible: vi.fn(),
              addNotification: vi.fn(),
            }}
          >
            <SearchForm setParams={setParams} setResults={vi.fn()} />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>,
    );
    return setParams;
  };
  const query = () => {
    const request = getReviewResults.mock.calls.findLast(([url]) =>
      url.startsWith("/rest/AccessionValidation?"),
    );
    return new URLSearchParams(request?.[0].split("?")[1]);
  };

  test.each(["NUMERIC", "ALPHANUM"])(
    "a review handoff preserves a complete dashed URL identity under %s",
    (format) => {
      const accessionNumber = "SIM-ORDER-301&part=2";
      window.history.replaceState(
        {},
        "",
        "/AccessionValidation?" + new URLSearchParams({ accessionNumber }),
      );
      const setParams = renderSearch(format);
      expect(query().get("accessionNumber")).toBe(accessionNumber);
      expect(query().get("doRange")).toBe("false");
      expect(
        new URLSearchParams(setParams.mock.calls.at(-1)[0]).get(
          "accessionNumber",
        ),
      ).toBe(accessionNumber);
    },
  );

  test("a URL identity that resembles an old analysis suffix remains exact when searched again", async () => {
    window.history.replaceState(
      {},
      "",
      "/AccessionValidation?accessionNumber=12345678-01",
    );
    renderSearch("ALPHANUM");
    expect(query().get("accessionNumber")).toBe("12345678-01");
    getReviewResults.mockClear();
    fireEvent.click(screen.getByTestId("Search-btn"));
    await waitFor(() =>
      expect(query().get("accessionNumber")).toBe("12345678-01"),
    );
  });

  test("manual non-ALPHANUM input retains its full identity and order scope", async () => {
    window.history.replaceState({}, "", "/AccessionValidation");
    const setParams = renderSearch();
    fireEvent.change(document.querySelector('input[name="accessionNumber"]'), {
      target: { value: "SIM-ORDER-302" },
    });
    fireEvent.click(screen.getByTestId("Search-btn"));
    await waitFor(() =>
      expect(query().get("accessionNumber")).toBe("SIM-ORDER-302"),
    );
    expect(query().get("doRange")).toBe("false");
    expect(
      new URLSearchParams(setParams.mock.calls.at(-1)[0]).get("type"),
    ).toBe("order");
  });

  test.each([
    ["12345678-01", "12345678"],
    ["12-345-678-01", "12345678"],
    ["DEV01263000000000001-01", "DEV01263000000000001"],
  ])(
    "manual ALPHANUM input %s retains the existing base-order conversion",
    async (input, expected) => {
      window.history.replaceState({}, "", "/AccessionValidation");
      renderSearch("ALPHANUM");
      fireEvent.change(
        document.querySelector('input[name="display_accessionNumber"]'),
        { target: { value: input } },
      );
      fireEvent.click(screen.getByTestId("Search-btn"));
      await waitFor(() =>
        expect(query().get("accessionNumber")).toBe(expected),
      );
      expect(query().get("doRange")).toBe("false");
    },
  );

  test("range links retain the complete starting order and existing range mode", () => {
    window.history.replaceState(
      {},
      "",
      "/AccessionValidationRange?accessionNumber=SIM-ORDER-300",
    );
    const setParams = renderSearch();
    expect(query().get("accessionNumber")).toBe("SIM-ORDER-300");
    expect(query().get("doRange")).toBe("true");
    expect(
      new URLSearchParams(setParams.mock.calls.at(-1)[0]).get("type"),
    ).toBe("range");
  });
});
