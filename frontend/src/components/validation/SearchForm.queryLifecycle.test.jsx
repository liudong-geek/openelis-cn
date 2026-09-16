vi.mock("./reviewTransport", async () => ({
  ...(await vi.importActual("./reviewTransport")),
  getReviewResults: vi.fn(),
  postReviewResults: vi.fn(),
}));
import { getReviewResults, postReviewResults } from "./reviewTransport";
import React, { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";

vi.mock("../utils/Utils", async () => {
  const actualUtils = await vi.importActual("../utils/Utils");
  return { ...actualUtils, getFromOpenElisServer: vi.fn() };
});

import SearchForm from "./SearchForm";
import { getFromOpenElisServer } from "../utils/Utils";
import { NotificationKinds } from "../common/CustomNotification";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import messages from "../../languages/en.json";

const makeRow = (accessionNumber, overrides = {}) => ({
  id: "server-row-id",
  accessionNumber,
  analysisId: "analysis-201",
  resultId: "result-301",
  testId: "test-401",
  testResultComponentId: "component-501",
  sampleId: "sample-601",
  sampleItemId: "tube-701",
  statusId: "technical-acceptance",
  lastUpdated: "2026-09-16T03:04:05.123Z",
  result: "1.23",
  resultType: "N",
  testName: "Test (Serum)",
  normal: false,
  nonconforming: true,
  readOnly: false,
  showAcceptReject: true,
  isAccepted: false,
  isRejected: false,
  note: "",
  ...overrides,
});

const makeResponse = (accessionNumber, paging) => ({
  queryId: "query-test",
  resultList: [makeRow(accessionNumber)],
  ...(paging ? { paging } : {}),
});

const renderSearch = ({ beforeQuery } = {}) => {
  const requests = [];
  const setResults = vi.fn();
  const setParams = vi.fn();
  const addNotification = vi.fn();
  const setNotificationVisible = vi.fn();
  getReviewResults.mockImplementation((url, callback, signal) => {
    requests.push({
      url,
      callback,
      signal,
      resultsAtDispatch: setResults.mock.calls.at(-1)?.[0],
    });
  });

  const Harness = () => {
    const [results, updateResults] = useState({ resultList: [] });
    return (
      <IntlProvider locale="en" messages={messages}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { AccessionFormat: "NUMERIC" } }}
        >
          <NotificationContext.Provider
            value={{ addNotification, setNotificationVisible }}
          >
            <SearchForm
              setParams={setParams}
              beforeQuery={beforeQuery}
              setResults={(next) => {
                setResults(next);
                updateResults(next);
              }}
            />
            <output data-testid="loaded-accessions">
              {results?.resultList
                ?.map((row) => row.accessionNumber)
                .join(" | ")}
            </output>
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    );
  };

  const view = render(<Harness />);
  return {
    ...view,
    requests,
    setResults,
    setParams,
    addNotification,
    setNotificationVisible,
    user: userEvent.setup(),
    latestResults: () => setResults.mock.calls.at(-1)?.[0],
  };
};

const search = async (harness, accessionNumber) => {
  const previousCount = harness.requests.length;
  const input = screen.getByRole("textbox");
  await harness.user.clear(input);
  await harness.user.type(input, accessionNumber);
  await harness.user.click(screen.getByTestId("Search-btn"));
  await waitFor(() =>
    expect(harness.requests.length).toBeGreaterThan(previousCount),
  );
  return harness.requests.at(-1);
};

const respond = async (request, response) => {
  // Deliver even aborted requests: the component must reject late callbacks
  // independently of whether the transport honored AbortSignal.
  await act(async () => request.callback(response));
};

describe("validation SearchForm query lifecycle", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/AccessionValidation");
    getReviewResults.mockReset();
  });

  test("clears the previous result batch before dispatching a new query", async () => {
    const harness = renderSearch();
    await respond(
      await search(harness, "ORDER-OLD"),
      makeResponse("ORDER-OLD"),
    );
    expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
      "ORDER-OLD",
    );

    const request = await search(harness, "ORDER-NEW");

    expect(request.resultsAtDispatch).toEqual({ resultList: [] });
    expect(harness.latestResults()).toEqual({ resultList: [] });
    expect(screen.getByTestId("loaded-accessions")).toBeEmptyDOMElement();
    expect(request.signal?.aborted).toBe(false);
    expect(harness.addNotification).not.toHaveBeenCalled();
  });

  test("preserves response fields and row order with the existing index id contract", async () => {
    const harness = renderSearch();
    const rows = [
      makeRow("ORDER-B", {
        rawResult: "1.2300",
        resultComponentSnapshots: [
          { resultId: "component-result-1", rawResult: "0", lastUpdated: 0 },
        ],
        patientInfo: "---",
      }),
      makeRow("ORDER-A", {
        resultId: "result-302",
        resultType: "M",
        result: null,
        multiSelectResultValues: '{"1":"17,18"}',
        dictionaryResults: [{ id: "17", value: "Positive" }],
        readOnly: true,
        showAcceptReject: false,
        note: "Existing server note",
      }),
    ];
    const response = {
      queryId: "query-test",
      resultList: rows,
      paging: { currentPage: 1, totalPages: 1, searchToPageMapping: [] },
      accessionNumber: "ORDER-B",
      testSectionId: "section-17",
      searchFinished: true,
    };

    await respond(await search(harness, "ORDER-B"), response);

    expect(harness.latestResults()).toEqual({
      ...response,
      resultList: rows.map((row, id) => ({ ...row, id })),
    });
    expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
      "ORDER-B | ORDER-A",
    );
    expect(rows.map((row) => row.id)).toEqual([
      "server-row-id",
      "server-row-id",
    ]);
  });

  test("an older success cannot replace a newer result batch or its pagination", async () => {
    const harness = renderSearch();
    const older = await search(harness, "ORDER-OLDER");
    const latest = await search(harness, "ORDER-LATEST");
    expect(older.signal?.aborted).toBe(true);
    await respond(latest, makeResponse("ORDER-LATEST"));
    const acceptedResults = harness.latestResults();
    harness.setResults.mockClear();

    await respond(
      older,
      makeResponse("ORDER-OLDER", { currentPage: 1, totalPages: 9 }),
    );

    expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
      "ORDER-LATEST",
    );
    expect(acceptedResults.resultList[0].accessionNumber).toBe("ORDER-LATEST");
    expect(harness.setResults).not.toHaveBeenCalled();
    expect(harness.addNotification).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: messages["pagination.forward"] }),
    ).not.toBeInTheDocument();
  });

  test("an older failure cannot clear a newer result batch or its pagination", async () => {
    const harness = renderSearch();
    const older = await search(harness, "ORDER-OLDER");
    const latest = await search(harness, "ORDER-LATEST");
    await respond(
      latest,
      makeResponse("ORDER-LATEST", { currentPage: 2, totalPages: 3 }),
    );
    harness.setResults.mockClear();

    await respond(older, undefined);

    expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
      "ORDER-LATEST",
    );
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: messages["pagination.forward"] }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: messages["pagination.backward"] }),
    ).toBeEnabled();
    expect(harness.setResults).not.toHaveBeenCalled();
    expect(harness.addNotification).not.toHaveBeenCalled();
    expect(harness.setNotificationVisible).not.toHaveBeenCalled();
  });

  test.each([
    ["transport failure", undefined],
    ["missing resultList", {}],
    ["null resultList", { resultList: null }],
    ["string resultList", { resultList: "invalid" }],
    [
      "indexed object resultList",
      { resultList: { 0: makeRow("BAD"), length: 1 } },
    ],
  ])(
    "clears results and reports an error for a current %s",
    async (_name, response) => {
      const harness = renderSearch();
      await respond(
        await search(harness, "ORDER-OLD"),
        makeResponse("ORDER-OLD", { currentPage: 1, totalPages: 2 }),
      );

      await respond(await search(harness, "ORDER-FAILED"), response);

      expect(harness.latestResults()).toEqual({ resultList: [] });
      expect(screen.getByTestId("loaded-accessions")).toBeEmptyDOMElement();
      expect(harness.addNotification).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: NotificationKinds.error,
          message: messages["validation.search.error"],
        }),
      );
      expect(harness.setNotificationVisible).toHaveBeenLastCalledWith(true);
      expect(
        screen.queryByRole("button", { name: messages["pagination.forward"] }),
      ).not.toBeInTheDocument();
    },
  );

  test("a valid empty result batch remains a no-results warning", async () => {
    const harness = renderSearch();

    await respond(await search(harness, "ORDER-EMPTY"), {
      queryId: "query-test",
      resultList: [],
    });

    expect(harness.latestResults()).toEqual({
      queryId: "query-test",
      resultList: [],
    });
    expect(harness.addNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: NotificationKinds.warning,
        message: messages["validation.search.noresult"],
      }),
    );
  });

  test.each([
    [
      "success",
      makeResponse("ORDER-UNMOUNTED", { currentPage: 1, totalPages: 3 }),
    ],
    ["failure", undefined],
  ])("ignores a %s callback after unmounting", async (_name, response) => {
    const harness = renderSearch();
    const request = await search(harness, "ORDER-UNMOUNTED");
    await act(async () => harness.unmount());
    harness.setResults.mockClear();
    harness.setParams.mockClear();
    harness.addNotification.mockClear();
    harness.setNotificationVisible.mockClear();

    await respond(request, response);

    expect(request.signal?.aborted).toBe(true);
    expect(harness.setResults).not.toHaveBeenCalled();
    expect(harness.setParams).not.toHaveBeenCalled();
    expect(harness.addNotification).not.toHaveBeenCalled();
    expect(harness.setNotificationVisible).not.toHaveBeenCalled();
  });

  test("backend next and previous pages clear old rows and retain the exact query", async () => {
    const harness = renderSearch();
    const first = await search(harness, "SITE-ORDER-301&part=2");
    await respond(
      first,
      makeResponse("PAGE-ONE", { currentPage: 1, totalPages: 3 }),
    );

    await harness.user.click(
      screen.getByRole("button", { name: messages["pagination.forward"] }),
    );
    const next = harness.requests.at(-1);
    const nextQuery = new URLSearchParams(next.url.split("?")[1]);
    expect(nextQuery.get("page")).toBe("2");
    expect(nextQuery.get("accessionNumber")).toBe("SITE-ORDER-301&part=2");
    expect(nextQuery.get("doRange")).toBe("false");
    expect(next.resultsAtDispatch).toEqual({ resultList: [] });
    expect(screen.getByTestId("loaded-accessions")).toBeEmptyDOMElement();
    expect(first.signal?.aborted).toBe(true);
    await respond(
      next,
      makeResponse("PAGE-TWO", { currentPage: 2, totalPages: 3 }),
    );

    await harness.user.click(
      screen.getByRole("button", { name: messages["pagination.backward"] }),
    );
    const previous = harness.requests.at(-1);
    expect(new URLSearchParams(previous.url.split("?")[1]).get("page")).toBe(
      "1",
    );
    expect(previous.resultsAtDispatch).toEqual({ resultList: [] });
    expect(screen.getByTestId("loaded-accessions")).toBeEmptyDOMElement();
    await respond(
      previous,
      makeResponse("PAGE-ONE-REFRESHED", { currentPage: 1, totalPages: 3 }),
    );
    await respond(next, undefined);

    expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
      "PAGE-ONE-REFRESHED",
    );
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(harness.addNotification).not.toHaveBeenCalled();
  });

  test("a rejected beforeQuery keeps the loaded batch and query parameters intact", async () => {
    const beforeQuery = vi.fn(() => true);
    const harness = renderSearch({ beforeQuery });
    const first = await search(harness, "ORDER-WITH-UNSUBMITTED-DECISIONS");
    await respond(
      first,
      makeResponse("ORDER-WITH-UNSUBMITTED-DECISIONS", {
        currentPage: 2,
        totalPages: 3,
      }),
    );
    const batch = harness.latestResults();
    beforeQuery.mockReturnValue(false);
    harness.setResults.mockClear();
    harness.setParams.mockClear();

    const input = screen.getByRole("textbox");
    await harness.user.clear(input);
    await harness.user.type(input, "ORDER-REPLACEMENT");
    await harness.user.click(screen.getByTestId("Search-btn"));

    expect(harness.requests).toHaveLength(1);
    expect(first.signal?.aborted).toBe(false);
    expect(harness.setResults).not.toHaveBeenCalled();
    expect(harness.setParams).not.toHaveBeenCalled();
    expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
      batch.resultList[0].accessionNumber,
    );
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(harness.addNotification).not.toHaveBeenCalled();
  });

  test.each(["pagination.forward", "pagination.backward"])(
    "a rejected beforeQuery preserves the batch when clicking %s",
    async (buttonKey) => {
      const beforeQuery = vi.fn(() => true);
      const harness = renderSearch({ beforeQuery });
      const first = await search(harness, "ORDER-WITH-NOTE");
      await respond(
        first,
        makeResponse("ORDER-WITH-NOTE", { currentPage: 2, totalPages: 3 }),
      );
      beforeQuery.mockReturnValue(false);
      harness.setResults.mockClear();
      harness.setParams.mockClear();

      await harness.user.click(
        screen.getByRole("button", { name: messages[buttonKey] }),
      );

      expect(harness.requests).toHaveLength(1);
      expect(first.signal?.aborted).toBe(false);
      expect(harness.setResults).not.toHaveBeenCalled();
      expect(harness.setParams).not.toHaveBeenCalled();
      expect(screen.getByTestId("loaded-accessions")).toHaveTextContent(
        "ORDER-WITH-NOTE",
      );
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
      expect(harness.addNotification).not.toHaveBeenCalled();
    },
  );
});

test.each([401, 403, 409])(
  "context failure %s clears rows and requires a fresh query",
  async (status) => {
    window.history.replaceState({}, "", "/AccessionValidation");
    const harness = renderSearch();
    const first = await search(harness, "SIM-CONTEXT-A");
    await respond(
      first,
      makeResponse("SIM-CONTEXT-A", { currentPage: 1, totalPages: 2 }),
    );
    await harness.user.click(
      screen.getByRole("button", { name: messages["pagination.forward"] }),
    );
    const page = harness.requests.at(-1);
    expect(new URLSearchParams(page.url.split("?")[1]).get("queryId")).toBe(
      "query-test",
    );
    await act(async () => page.callback(undefined, status));
    expect(harness.latestResults()).toEqual({ resultList: [] });
    expect(harness.addNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message:
          messages[
            status === 409
              ? "validation.query.expired"
              : "validation.query.permissionChanged"
          ],
      }),
    );
    const retry = await search(harness, "SIM-CONTEXT-A");
    expect(new URLSearchParams(retry.url.split("?")[1]).has("queryId")).toBe(
      false,
    );
  },
);

test.each([
  ["missing token", { resultList: [makeRow("SIM-INVALID")] }],
  ["blank token", { queryId: " ", resultList: [] }],
  ["null row", { queryId: "query-test", resultList: [null] }],
])("rejects %s without leaving rows reviewable", async (_case, payload) => {
  window.history.replaceState({}, "", "/AccessionValidation");
  const harness = renderSearch();
  await respond(await search(harness, "SIM-INVALID"), payload);
  expect(harness.latestResults()).toEqual({ resultList: [] });
  expect(harness.addNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: NotificationKinds.error }),
  );
});

test.each([
  [
    "different query",
    { queryId: "other-query", paging: { currentPage: 2, totalPages: 3 } },
  ],
  [
    "wrong page",
    { queryId: "query-test", paging: { currentPage: 1, totalPages: 3 } },
  ],
  [
    "invalid total",
    { queryId: "query-test", paging: { currentPage: 2, totalPages: 1 } },
  ],
])("rejects a page response for %s", async (_case, extra) => {
  window.history.replaceState({}, "", "/AccessionValidation");
  const harness = renderSearch();
  await respond(
    await search(harness, "SIM-PAGE-A"),
    makeResponse("SIM-PAGE-A", { currentPage: 1, totalPages: 3 }),
  );
  await harness.user.click(
    screen.getByRole("button", { name: messages["pagination.forward"] }),
  );
  await respond(harness.requests.at(-1), {
    resultList: [makeRow("SIM-WRONG")],
    ...extra,
  });
  expect(harness.latestResults()).toEqual({ resultList: [] });
  expect(harness.addNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ message: messages["validation.query.expired"] }),
  );
});
