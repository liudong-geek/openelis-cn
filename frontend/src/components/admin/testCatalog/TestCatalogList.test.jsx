/**
 * TestCatalogList — OGC-949 M3 / OGC-928 (RM10/RM11 polish).
 *
 * Validates the list screen's resilience + filter behavior:
 * - rows render from a successful fetch;
 * - a FAILED fetch shows an error state (not a silent empty list — the bug RM10 fixes);
 * - an empty result shows an empty state;
 * - filter state restores from the URL and is sent to the server (RM11 URL-sync + AMR).
 */

// ========== MOCKS (before imports) ==========
const mockHistory = {
  push: vi.fn(),
  replace: vi.fn(),
  location: { search: "" },
};

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useHistory: () => mockHistory };
});

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
}));

vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));

// ========== IMPORTS ==========
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor, within } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { BrowserRouter } from "react-router-dom";
import TestCatalogList from "./TestCatalogList";
import { getFromOpenElisServer } from "../../utils/Utils";
import messages from "../../../languages/en.json";
import zhMessages from "../../../languages/zh_CN.json";

// ========== HELPERS ==========
const renderList = ({ locale = "en", catalogMessages = messages } = {}) =>
  render(
    <BrowserRouter>
      <IntlProvider locale={locale} messages={catalogMessages}>
        <TestCatalogList />
      </IntlProvider>
    </BrowserRouter>,
  );

const pageOf = (rows) => ({ rows, total: rows.length });

// Hold only the list transport callback. Carbon controls and the real list
// lifecycle remain mounted by React throughout the pending query.
function renderWithPendingQueries() {
  const queries = [];
  const existingRows = [
    { testId: "7", name: "Glucose", code: "GLU", active: true },
    { testId: "8", name: "Creatinine", code: "CREA", active: false },
  ];
  getFromOpenElisServer.mockImplementation((url, callback, signal) => {
    if (!url.includes("/tests?")) return callback([]);
    queries.push({ url, callback, signal });
    if (queries.length === 1) callback(pageOf(existingRows));
  });
  const view = renderList();
  const answer = (query, response = pageOf(existingRows)) => {
    // The real transport does not deliver an aborted fetch to its callback.
    if (!query.signal.aborted) act(() => query.callback(response));
  };
  return { ...view, queries, answer };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHistory.location = { search: "" };
});

describe("TestCatalogList loading continuity", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps an open status dropdown usable across the debounced request", () => {
    const { container, queries, answer } = renderWithPendingQueries();
    const search = screen.getByPlaceholderText(
      messages["label.testCatalog.list.search"],
    );
    fireEvent.change(search, { target: { value: "Glucose" } });
    fireEvent.click(container.querySelector(".testCatalogList__filterTrigger"));
    const status = container.querySelector("#filter-status button");
    fireEvent.click(status);
    expect(screen.getByRole("option", { name: "Inactive" })).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(queries).toHaveLength(2);
    expect(queries[1].url).toContain("search=Glucose");
    expect(container.querySelector("#test-search")).toBe(search);
    expect(container.querySelector("#filter-status button")).toBe(status);
    expect(status).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Inactive" })).toBeVisible();
    expect(
      screen.getByText(messages["label.testCatalog.list.loading"]),
    ).toBeVisible();
    expect(container.querySelector("tbody tr")).not.toBeInTheDocument();

    answer(queries[1]);
    expect(container.querySelector("#filter-status button")).toBe(status);
    fireEvent.click(screen.getByRole("option", { name: "Inactive" }));
    expect(queries).toHaveLength(3);
    expect(queries[2].url).toContain("status=inactive");
    expect(queries[2].url).toContain("search=Glucose");
    answer(queries[2]);
    expect(status).toHaveTextContent("Inactive");
  });

  it("retains search focus and cancels the earlier pending query when typing continues", () => {
    const { container, queries, answer } = renderWithPendingQueries();
    const search = screen.getByPlaceholderText(
      messages["label.testCatalog.list.search"],
    );
    search.focus();
    fireEvent.change(search, { target: { value: "Glu" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(container.querySelector("#test-search")).toBe(search);
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "Glucose" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(queries).toHaveLength(3);
    expect(queries[1].signal.aborted).toBe(true);
    expect(queries[2].signal.aborted).toBe(false);
    expect(search).toHaveFocus();
    expect(search).toHaveValue("Glucose");
    answer(queries[2]);
    expect(search).toHaveFocus();
  });

  it("keeps filters available after a failed query and retries the same applied state", () => {
    const { container, queries, answer } = renderWithPendingQueries();
    const search = screen.getByPlaceholderText(
      messages["label.testCatalog.list.search"],
    );
    fireEvent.click(container.querySelector(".testCatalogList__filterTrigger"));
    const status = container.querySelector("#filter-status button");
    fireEvent.click(status);
    fireEvent.click(screen.getByRole("option", { name: "Inactive" }));
    act(() => queries[1].callback(undefined));

    expect(container.querySelector("#test-search")).toBe(search);
    expect(container.querySelector("#filter-status button")).toBe(status);
    expect(status).toHaveTextContent("Inactive");
    expect(
      screen.getByText(messages["label.testCatalog.list.error"]),
    ).toBeVisible();
    expect(
      screen.queryByText(messages["label.testCatalog.list.empty"]),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["button.testCatalog.retry"],
      }),
    );
    expect(queries).toHaveLength(3);
    expect(queries[2].url).toBe(queries[1].url);
    answer(queries[2]);
    expect(screen.getByText("Glucose")).toBeVisible();
    expect(container.querySelector("#test-search")).toBe(search);
  });

  it("removes stale row actions and selection while another page is loading", () => {
    const { container, queries, answer } = renderWithPendingQueries();
    const table = screen.getByRole("table");
    fireEvent.click(within(table).getAllByRole("checkbox")[0]);
    const batchButton = screen.getByRole("button", {
      name: messages["button.testCatalog.editRelated"],
    });
    expect(batchButton).not.toBeDisabled();
    fireEvent.change(
      container.querySelector(".testCatalogList__pagination select"),
      { target: { value: "10" } },
    );
    expect(queries).toHaveLength(2);
    expect(container.querySelector("tbody tr")).not.toBeInTheDocument();
    const pendingBatchButton = container.querySelector(
      ".cds--batch-actions button",
    );
    if (pendingBatchButton) expect(pendingBatchButton).toBeDisabled();
    else expect(batchButton).not.toBeInTheDocument();
    answer(queries[1]);
    expect(
      within(screen.getByRole("table")).getAllByRole("checkbox")[0],
    ).not.toBeChecked();
    expect(
      screen
        .getByText(messages["button.testCatalog.editRelated"])
        .closest("button"),
    ).toBeDisabled();
  });
});

describe("TestCatalogList", () => {
  it("renders the rows returned by the server", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) =>
      cb(
        pageOf([
          {
            testId: "7",
            name: "Glucose",
            code: "GLU",
            domain: "CLINICAL",
            active: true,
          },
        ]),
      ),
    );
    renderList();
    expect(await screen.findByText("Glucose")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails (not a silent empty list)", async () => {
    // getFromOpenElisServer calls back with undefined on a failed fetch.
    getFromOpenElisServer.mockImplementation((url, cb) => cb(undefined));
    renderList();
    expect(
      await screen.findByText(messages["label.testCatalog.list.error"]),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no tests match", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) => cb(pageOf([])));
    const { container } = renderList();
    expect(
      await screen.findByText(messages["label.testCatalog.list.empty"]),
    ).toBeInTheDocument();
    expect(container.querySelector(".cds--pagination")).not.toBeInTheDocument();
  });

  it("retries a failed catalog request without losing the page", async () => {
    let testRequestCount = 0;
    getFromOpenElisServer.mockImplementation((url, cb) => {
      if (!url.includes("/tests?")) return cb([]);
      testRequestCount += 1;
      return cb(
        testRequestCount === 1
          ? undefined
          : pageOf([
              {
                testId: "7",
                name: "Glucose",
                code: "GLU",
                domain: "CLINICAL",
                active: true,
              },
            ]),
      );
    });
    renderList();

    fireEvent.click(
      await screen.findByRole("button", {
        name: messages["button.testCatalog.retry"],
      }),
    );

    expect(await screen.findByText("Glucose")).toBeInTheDocument();
    expect(testRequestCount).toBe(2);
  });

  it("restores filter state from the URL and sends it to the server", async () => {
    mockHistory.location = { search: "?amr=true&domain=CLINICAL&sampleType=2" };
    let requestedUrl = "";
    getFromOpenElisServer.mockImplementation((url, cb) => {
      // Only the tests endpoint carries filter state; ignore the sample-types
      // reference fetch.
      if (url.includes("/tests")) requestedUrl = url;
      cb(pageOf([]));
    });
    renderList();
    await waitFor(() => expect(requestedUrl).toContain("amr=true"));
    expect(requestedUrl).toContain("domain=CLINICAL");
    expect(requestedUrl).toContain("sampleType=2");
  });

  it("aborts the previous request when filters change (stale-result guard)", () => {
    vi.useFakeTimers();
    try {
      const signals = [];
      getFromOpenElisServer.mockImplementation((url, cb, sig) => {
        // Track only the tests endpoint; the sample-types reference fetch is
        // a separate, signal-less call.
        if (url.includes("/tests")) signals.push(sig);
        cb(pageOf([]));
      });
      renderList();
      expect(signals.length).toBe(1); // initial fetch on mount
      const search = screen.getByPlaceholderText(
        messages["label.testCatalog.list.search"],
      );
      fireEvent.change(search, { target: { value: "x" } });
      act(() => vi.advanceTimersByTime(300)); // debounce fires -> a new fetch starts
      expect(signals.length).toBe(2);
      // The earlier request is aborted so its late response can't overwrite the newer one.
      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the editor for the clicked row", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) =>
      cb(
        pageOf([
          { testId: "7", name: "Glucose", domain: "CLINICAL", active: true },
        ]),
      ),
    );
    renderList();
    const cell = await screen.findByText("Glucose");
    fireEvent.click(cell.closest("tr"));
    expect(mockHistory.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      getFromOpenElisServer.mock.calls.some(
        ([url]) => url === "/rest/test-catalog/tests/7/basic-info",
      ),
    ).toBe(true);
  });

  it("provides an explicit edit action for users who do not discover row click", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) =>
      cb(
        url.includes("/tests")
          ? pageOf([
              {
                testId: "7",
                name: "Glucose",
                domain: "CLINICAL",
                active: true,
              },
            ])
          : [],
      ),
    );
    renderList();

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit Glucose" }),
    );

    expect(mockHistory.push).not.toHaveBeenCalled();
    expect(mockHistory.push).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      getFromOpenElisServer.mock.calls.some(
        ([url]) => url === "/rest/test-catalog/tests/7/basic-info",
      ),
    ).toBe(true);
  });

  it("debounces the search — one fetch after the pause, not per keystroke", () => {
    vi.useFakeTimers();
    try {
      getFromOpenElisServer.mockImplementation((url, cb) => cb(pageOf([])));
      renderList();
      const before = getFromOpenElisServer.mock.calls.length;
      const search = screen.getByPlaceholderText(
        messages["label.testCatalog.list.search"],
      );
      fireEvent.change(search, { target: { value: "glu" } });
      act(() => vi.advanceTimersByTime(200));
      expect(getFromOpenElisServer.mock.calls.length).toBe(before); // still debouncing
      act(() => vi.advanceTimersByTime(150));
      expect(getFromOpenElisServer.mock.calls.length).toBe(before + 1); // fired after 300ms
      expect(getFromOpenElisServer.mock.calls.at(-1)[0]).toContain(
        "search=glu",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the sample type in its own column", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) => {
      if (url.includes("/tests")) {
        cb(
          pageOf([
            {
              testId: "7",
              name: "Glucose (Serum)",
              sampleType: "Serum",
              code: "GLU",
              domain: "CLINICAL",
              active: true,
            },
          ]),
        );
      } else {
        cb([]);
      }
    });
    renderList();
    expect(await screen.findByText("Serum")).toBeInTheDocument();
  });

  it("opens the new test form in a modal without leaving the list", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) =>
      cb(url.includes("/tests") ? pageOf([]) : []),
    );
    renderList();
    const button = await screen.findByTestId("new-test-button");
    fireEvent.click(button);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Test name")).toBeInTheDocument();
    expect(mockHistory.push).not.toHaveBeenCalled();
  });

  it("renders the high-frequency list controls in Simplified Chinese", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) =>
      cb(
        url.includes("/tests")
          ? pageOf([
              {
                testId: "7",
                name: "葡萄糖",
                code: "GLU",
                domain: "CLINICAL",
                active: true,
              },
            ])
          : [],
      ),
    );
    renderList({ locale: "zh-CN", catalogMessages: zhMessages });

    expect(await screen.findByText("葡萄糖")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "检验项目目录" }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("按项目名称或项目编码搜索"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "新建检验项目" }),
    ).toBeInTheDocument();
    expect(screen.getByText("项目编码")).toBeInTheDocument();
    expect(screen.getByText("业务域")).toBeInTheDocument();
    expect(screen.getByText("临床检验")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑检验项目“葡萄糖”" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "选择检验项目“葡萄糖”" }),
    );
    expect(screen.getByText("已选择 1 个检验项目")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("取消")).toBeInTheDocument();
    expect(screen.getByText("每页项数")).toBeInTheDocument();
    expect(screen.getByText("第 1–1 项，共 1 项")).toBeInTheDocument();
  });
});

it("opens related configuration with allowed list context and no modal", async () => {
  getFromOpenElisServer.mockImplementation((url, cb) =>
    cb(
      url.includes("/tests")
        ? pageOf([{ testId: "7", name: "Glucose", active: true }])
        : [],
    ),
  );
  renderList();
  fireEvent.click(
    await screen.findByRole("button", { name: "Related configuration" }),
  );
  expect(mockHistory.push).toHaveBeenCalledWith(
    "/MasterListsPage/TestCatalogEditor/7/basic-info",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("carries the legacy lab unit filter in requests and clears it explicitly", async () => {
  mockHistory.location.search = "?testSection=7&page=3&pageSize=10";
  getFromOpenElisServer.mockImplementation((url, cb) =>
    cb(
      url.endsWith("/lab-units")
        ? [{ id: "7", name: "Biochemistry" }]
        : url.includes("/tests?")
          ? pageOf([])
          : [],
    ),
  );
  renderList();
  await screen.findByText(messages["label.testCatalog.list.empty"]);
  expect(
    getFromOpenElisServer.mock.calls.some(
      ([url]) => url.includes("testSection=7") && url.includes("page=3"),
    ),
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["button.testCatalog.clearFilters"],
    }),
  );
  await waitFor(() =>
    expect(
      getFromOpenElisServer.mock.calls
        .filter(([url]) => url.includes("/tests?"))
        .at(-1)[0],
    ).not.toContain("testSection="),
  );
});
