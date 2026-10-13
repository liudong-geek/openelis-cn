import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import TestCatalogList from "./TestCatalogList";
import { getFromOpenElisServer } from "../../utils/Utils";
import messages from "../../../languages/en.json";

vi.mock("../../utils/Utils", () => ({ getFromOpenElisServer: vi.fn() }));
vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));
vi.mock("./sections/BasicInfoSection", () => ({
  default: ({ onCancel, onCreated }) => (
    <div role="dialog" aria-label="Create test">
      <button onClick={onCancel}>Cancel draft</button>
      <button onClick={() => onCreated({ testId: "99" })}>
        Saved by server
      </button>
    </div>
  ),
}));

function setup() {
  vi.clearAllMocks();
  getFromOpenElisServer.mockImplementation((url, cb) =>
    cb(url.includes("/tests?") ? { rows: [], total: 40 } : []),
  );
  const history = createMemoryHistory({
    initialEntries: [
      {
        pathname: "/MasterListsPage/TestCatalogList",
        search: "?testSection=7&search=血&page=3&pageSize=10&create=true",
        state: { from: "catalog" },
      },
    ],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <TestCatalogList />
      </IntlProvider>
    </Router>,
  );
  return history;
}

it.each(["Cancel draft", "Saved by server"])(
  "keeps list filters and page after %s",
  async (action) => {
    const history = setup();
    fireEvent.click(await screen.findByRole("button", { name: action }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      Object.fromEntries(new URLSearchParams(history.location.search)),
    ).toEqual({
      testSection: "7",
      search: "血",
      page: "3",
      pageSize: "10",
    });
    expect(history.location.state).toEqual({ from: "catalog" });
    expect(history.length).toBe(1);
    const requests = getFromOpenElisServer.mock.calls.filter(([url]) =>
      url.includes("/tests?"),
    );
    expect(requests).toHaveLength(action === "Saved by server" ? 2 : 1);
    for (const [url] of requests) expect(url).toContain("page=3&pageSize=10");
  },
);

it("opens the saved test configuration with the original list as its return destination", async () => {
  const history = setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Saved by server" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Related configuration" }),
  );
  expect(history.location.pathname).toBe(
    "/MasterListsPage/TestCatalogEditor/99/basic-info",
  );
  const destination = new URLSearchParams(history.location.search).get(
    "returnTo",
  );
  expect(destination).toContain("TestCatalogList?");
  expect(new URLSearchParams(destination.split("?")[1]).get("page")).toBe("3");
});
