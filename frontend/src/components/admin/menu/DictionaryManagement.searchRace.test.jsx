import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/en.json";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import { getFromOpenElisServer } from "../../utils/Utils";
import DictionaryManagement from "./DictionaryManagement";

// Exercise real Carbon controls, table selection and the editor. Only control
// API callback arrival; no table, search, modal or product guard is mocked.
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
}));
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({}),
    ConfigurationContext: createContext({}),
  };
});

let requests;
const category = { id: "1", description: "Core", categoryName: "Core" };
const record = (id, entry) => ({
  id,
  dictEntry: entry,
  dictionaryCategory: category,
  localAbbreviation: entry,
  isActive: "Y",
  loincCode: "",
  lastupdated: "2026-10-14T00:00:00Z",
});
const result = (rows, total = rows.length) => ({
  menuList: rows,
  fromRecordCount: "1",
  toRecordCount: String(rows.length),
  totalRecordCount: String(total),
});
const page = () => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={messages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: vi.fn(),
        }}
      >
        <ConfigurationContext.Provider value={{ reloadConfiguration: vi.fn() }}>
          <DictionaryManagement />
        </ConfigurationContext.Provider>
      </NotificationContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const settle = (request, response) => act(() => request.callback(response));
const baseRequests = () =>
  requests.filter(({ url }) => url.startsWith("/rest/DictionaryMenu"));
const latestSearch = () =>
  requests
    .filter(({ url }) => url.startsWith("/rest/SearchDictionaryMenu"))
    .at(-1);
const search = () => screen.getByRole("searchbox");
const change = (term) =>
  fireEvent.change(search(), { target: { value: term } });
const counter = (view) =>
  view.container.querySelector(
    ".dictionary-management-page__server-pagination p",
  );
const row = (view, id) =>
  view.container
    .querySelector(`[data-cy="cell-dictEntry-${id}"]`)
    .closest("tr");
const modify = (view) =>
  view.container.querySelector('[data-cy="modifyButton"]');
const initialize = () => {
  const view = render(page());
  for (const request of baseRequests())
    settle(request, result([record("11", "Aids"), record("12", "Other")]));
  settle(
    requests.find(({ url }) => url === "/rest/dictionary-categories"),
    [category],
  );
  return view;
};

beforeEach(() => {
  requests = [];
  vi.clearAllMocks();
  getFromOpenElisServer.mockImplementation((url, callback) =>
    requests.push({ url, callback }),
  );
});

test("a delayed shorter prefix cannot replace the current rows, count, selection or edit identity", () => {
  const view = initialize();
  change("T");
  const older = latestSearch();
  change("TESTS");
  settle(latestSearch(), result([record("1378", "TESTS current")]));
  fireEvent.click(within(row(view, "1378")).getByRole("checkbox"));
  expect(modify(view)).toBeEnabled();
  fireEvent.click(modify(view));
  const detail = requests.find(({ url }) =>
    url.startsWith("/rest/Dictionary?ID=1378&"),
  );
  settle(detail, record("1378", "TESTS current"));
  expect(
    screen.getByLabelText(messages["dictionary.number.label"]),
  ).toHaveValue("1378");
  expect(screen.getByLabelText(messages["dictionary.dictEntry"])).toHaveValue(
    "TESTS current",
  );
  settle(older, result([record("11", "Aids")], 20));
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-1378"]'),
  ).toHaveTextContent("TESTS current");
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-11"]'),
  ).toBeNull();
  expect(counter(view)).toHaveTextContent("Showing 1–1 of 1");
  expect(
    row(view, "1378").querySelector('input[type="checkbox"]'),
  ).toBeChecked();
  expect(
    screen.getByLabelText(messages["dictionary.number.label"]),
  ).toHaveValue("1378");
  expect(screen.getByLabelText(messages["dictionary.dictEntry"])).toHaveValue(
    "TESTS current",
  );
});

test("clearing real Carbon search prevents a late query from restoring rows or query counts", () => {
  const view = initialize();
  change("TESTS");
  const older = latestSearch();
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["admin.dashboard.search.clear"],
    }),
  );
  expect(search()).toHaveValue("");
  settle(
    baseRequests().at(-1),
    result([record("11", "Aids"), record("12", "Other")]),
  );
  settle(older, result([record("1378", "TESTS old")], 50));
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-1378"]'),
  ).toBeNull();
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-11"]'),
  ).toHaveTextContent("Aids");
  expect(counter(view)).toHaveTextContent("Showing 1–2 of 2");
  expect(modify(view)).toBeDisabled();
});

test("returning to the same query does not allow its first request to overwrite the new request", () => {
  const view = initialize();
  change("A");
  const firstA = latestSearch();
  change("B");
  const b = latestSearch();
  change("A");
  const newA = latestSearch();
  expect(newA).not.toBe(firstA);
  settle(newA, result([record("303", "A newest")]));
  fireEvent.click(within(row(view, "303")).getByRole("checkbox"));
  settle(b, result([record("202", "B old")], 2));
  settle(firstA, result([record("101", "A old")], 3));
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-303"]'),
  ).toHaveTextContent("A newest");
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-101"]'),
  ).toBeNull();
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-202"]'),
  ).toBeNull();
  expect(counter(view)).toHaveTextContent("Showing 1–1 of 1");
  expect(
    row(view, "303").querySelector('input[type="checkbox"]'),
  ).toBeChecked();
});

test("an initial base-list response cannot overwrite counts belonging to the current search", () => {
  const view = render(page());
  const older = baseRequests()[0];
  change("TESTS");
  settle(latestSearch(), result([record("1378", "TESTS current")]));
  settle(older, result([record("11", "Aids")], 20));
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-1378"]'),
  ).toHaveTextContent("TESTS current");
  expect(counter(view)).toHaveTextContent("Showing 1–1 of 1");
});

test("changing query invalidates the selected identity before replacement results arrive", () => {
  const view = initialize();
  fireEvent.click(within(row(view, "11")).getByRole("checkbox"));
  expect(modify(view)).toBeEnabled();
  change("TESTS");
  expect(modify(view)).toBeDisabled();
  expect(screen.getByText("0 selected")).toBeInTheDocument();
  settle(latestSearch(), result([record("1378", "TESTS current")]));
  expect(modify(view)).toBeDisabled();
});

test("Chinese and ampersand remain one encoded searchString parameter", () => {
  initialize();
  change("中文&A");
  const request = latestSearch();
  const url = new URL(request.url, "https://example.test");
  expect(url.searchParams.get("searchString")).toBe("中文&A");
  expect([...url.searchParams.keys()]).toEqual([
    "search",
    "startingRecNo",
    "searchString",
  ]);
  expect(request.url).toContain("searchString=%E4%B8%AD%E6%96%87%26A");
});

test("an unmounted query cannot populate a later dictionary page", () => {
  const oldView = initialize();
  change("TESTS");
  const older = latestSearch();
  oldView.unmount();
  const view = initialize();
  settle(older, result([record("1378", "TESTS old")], 50));
  expect(
    view.container.querySelector('[data-cy="cell-dictEntry-1378"]'),
  ).toBeNull();
  expect(counter(view)).toHaveTextContent("Showing 1–2 of 2");
  expect(modify(view)).toBeDisabled();
});
