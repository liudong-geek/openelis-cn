import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { Route, Router, Switch } from "react-router-dom";
import { createBrowserHistory } from "history";
import UnifiedResults from "./UnifiedResults";
import SearchForm from "../../validation/SearchForm";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import en from "../../../languages/en.json";

const json = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

test("the real frontend save/readback/navigation/search chain queries the complete order exactly", async () => {
  const accessionNumber = "SIM-ORDER-301 + &?段";
  let committed = {
    id: "0",
    analysisId: "101",
    sampleItemId: "201",
    testId: "401",
    accessionNumber,
    sampleItemExternalId: "SIM-TUBE-201",
    testName: "SIM-HANDOFF-TEST",
    resultType: "N",
    resultValue: "",
    analysisLastupdated: "1000",
    analysisStatusId: "4",
    reportable: "Y",
    patientInfo: "---",
  };
  const requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init = {}) => {
      const parsed = new URL(String(url), window.location.origin);
      const path = parsed.pathname;
      requests.push({ path, query: parsed.searchParams, init });
      if (
        path.endsWith("/results-entry/lab-units") ||
        path.endsWith("/analysis-status-types")
      )
        return json([]);
      if (
        path.endsWith("/results-entry/pending") ||
        path.endsWith("/LogbookResults")
      )
        return json({ testResult: [{ ...committed }] });
      if (path.endsWith("/results-entry/presence")) return json({});
      if (path.endsWith("/esig/enabled")) return json({ enabled: false });
      if (path.endsWith("/analysis/101/result")) {
        const item = JSON.parse(init.body).testResult;
        committed = {
          ...item,
          rawResultValue: item.resultValue,
          resultId: "601",
          analysisLastupdated: "2000",
          analysisStatusId: "15",
        };
        return json({
          analysisLastupdated: "2000",
          analysisStatusId: "15",
          reflex: [],
          calculated: [],
        });
      }
      if (path.endsWith("/AccessionValidation"))
        return json({
          resultList: [
            {
              analysisId: committed.analysisId,
              accessionNumber: committed.accessionNumber,
              resultId: committed.resultId,
              result: committed.rawResultValue,
            },
          ],
        });
      throw new Error(`Unexpected test request: ${path}`);
    }),
  );
  localStorage.setItem("CSRF", "SIM-CSRF");
  window.history.replaceState({}, "", "/Results");
  const reviewResults = vi.fn();
  const view = render(
    <Router history={createBrowserHistory()}>
      <IntlProvider locale="en" messages={en}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: "701",
              sessionId: "SIM-SESSION",
              csrf: "SIM-CSRF",
              loginName: "SIM-USER",
              roles: ["Results", "Validation"],
            },
          }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: {
                AccessionFormat: "NUMERIC",
                DEFAULT_DATE_LOCALE: "en",
              },
            }}
          >
            <NotificationContext.Provider
              value={{
                addNotification: vi.fn(),
                setNotificationVisible: vi.fn(),
              }}
            >
              <Switch>
                <Route path="/Results">
                  <UnifiedResults />
                </Route>
                <Route path="/AccessionValidation">
                  <SearchForm setParams={vi.fn()} setResults={reviewResults} />
                </Route>
              </Switch>
            </NotificationContext.Provider>
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </Router>,
  );
  try {
    const resultRow = within(
      (await screen.findByText("SIM-HANDOFF-TEST")).closest("tr"),
    );
    fireEvent.change(resultRow.getByRole("spinbutton"), {
      target: { value: "0" },
    });
    fireEvent.click(
      resultRow.getByRole("button", { name: en["label.results.save"] }),
    );
    const review = await screen.findByRole("button", {
      name:
        en["results.workbench.review.open"] ||
        "View this order's results awaiting review",
    });
    fireEvent.click(review);
    await waitFor(() =>
      expect(reviewResults).toHaveBeenCalledWith(
        expect.objectContaining({
          resultList: [
            expect.objectContaining({
              analysisId: "101",
              accessionNumber,
              resultId: "601",
              result: "0",
            }),
          ],
        }),
      ),
    );
    expect(window.location.pathname).toBe("/AccessionValidation");
    expect(
      new URLSearchParams(window.location.search).get("accessionNumber"),
    ).toBe(accessionNumber);
    const reviewRead = requests.find((request) =>
      request.path.endsWith("/AccessionValidation"),
    );
    expect(reviewRead.query.get("accessionNumber")).toBe(accessionNumber);
    expect(reviewRead.query.get("doRange")).toBe("false");
    expect([...reviewRead.query.keys()].sort()).toEqual([
      "accessionNumber",
      "date",
      "doRange",
      "unitType",
    ]);
    expect(reviewRead.init.method || "GET").toBe("GET");
    expect(
      requests.filter((request) =>
        request.path.endsWith("/analysis/101/result"),
      ),
    ).toHaveLength(1);
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});
