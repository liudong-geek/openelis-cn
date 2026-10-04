import React from "react";
import { act, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../languages/zh.json";
import SampleManagement from "./SampleManagement";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
const mocks = vi.hoisted(() => ({ search: null, table: null }));
vi.mock("./SampleSearch", () => ({
  default: (props) => {
    mocks.search = props;
    return <div>查询</div>;
  },
}));
vi.mock("./SampleResultsTable", () => ({
  default: (props) => {
    mocks.table = props;
    return (
      <output data-testid="table-data">
        {JSON.stringify({
          items: props.sampleItems,
          canCancelTests: props.canCancelTests,
        })}
      </output>
    );
  },
}));
vi.mock("./CreateAliquotModal", () => ({ default: () => null }));
vi.mock("./AddTestsModal", () => ({ default: () => null }));
vi.mock("../common/PageBreadCrumb", () => ({ default: () => null }));
const entry = (id, code = "NotStarted") => ({
  analysisId: id,
  testId: `test-${id}`,
  testName: `项目-${id}`,
  statusCode: code,
  canCancelByStatus: code !== "Canceled",
});
const payload = (id = "201", allowed = true) => ({
  sampleItems: [{ id, orderedTests: [entry("101"), entry("102")] }],
  totalCount: 1,
  canCancelTests: allowed,
});
const read = () => JSON.parse(screen.getByTestId("table-data").textContent);
const context = {
  userSessionDetails: {
    authenticated: true,
    userId: "1",
    sessionId: "session-1",
    csrf: "csrf-1",
    roles: [],
  },
};
const wrap = (value = context) => (
  <UserSessionDetailsContext.Provider value={value}>
    <IntlProvider locale="zh" messages={messages}>
      <SampleManagement />
    </IntlProvider>
  </UserSessionDetailsContext.Provider>
);
const show = () => render(wrap());
beforeEach(() => {
  mocks.search = null;
  mocks.table = null;
  localStorage.setItem("CSRF", "csrf-1");
  sessionStorage.clear();
});
describe("SampleManagement cancellation query identity", () => {
  it.each([true, false, undefined, null, "true", 1])(
    "passes only explicit server cancellation permission %s",
    (allowed) => {
      show();
      act(() =>
        mocks.search.onSearchResults(
          { ...payload("201"), canCancelTests: allowed },
          null,
        ),
      );
      expect(read().canCancelTests).toBe(allowed === true);
    },
  );
  it("updates a canceled row without dropping the original record", () => {
    show();
    act(() => mocks.search.onSearchResults(payload(), null));
    act(() =>
      mocks.table.onTestCanceled("201", "101", entry("101", "Canceled")),
    );
    expect(read().items[0].orderedTests.map((item) => item.statusCode)).toEqual(
      ["Canceled", "NotStarted"],
    );
    expect(read().items[0].orderedTests).toHaveLength(2);
  });
  it("uses functional updates when two cancellation responses arrive together", () => {
    show();
    act(() => mocks.search.onSearchResults(payload(), null));
    const settle = mocks.table.onTestCanceled;
    act(() => {
      settle("201", "101", entry("101", "Canceled"));
      settle("201", "102", entry("102", "Canceled"));
    });
    expect(read().items[0].orderedTests.map((item) => item.statusCode)).toEqual(
      ["Canceled", "Canceled"],
    );
  });
  it("blocks cancellation while a new query is loading and ignores an older query callback", () => {
    show();
    act(() => mocks.search.onSearchResults(payload(), null));
    const settle = mocks.table.onTestCanceled;
    act(() => mocks.search.onSearchStart());
    expect(read().canCancelTests).toBe(false);
    act(() => mocks.search.onSearchResults(payload("202"), null));
    act(() => settle("201", "101", entry("101", "Canceled")));
    expect(read().items[0].id).toBe("202");
    expect(read().items[0].orderedTests[0].statusCode).toBe("NotStarted");
    expect(
      screen.queryByText(
        messages["sample.management.cancelTest.success"].replace(
          "{testName}",
          "项目-101",
        ),
      ),
    ).not.toBeInTheDocument();
  });
  it("keeps the current list across a masked CSRF rotation and rechecks cancellation capability", () => {
    const { rerender } = show();
    act(() => mocks.search.onSearchResults(payload("201"), null));
    const oldSettle = mocks.table.onTestCanceled;
    const rotated = {
      userSessionDetails: { ...context.userSessionDetails, csrf: "csrf-2" },
    };
    localStorage.setItem("CSRF", "csrf-2");
    rerender(wrap(rotated));
    expect(read().items[0].id).toBe("201");
    expect(read().canCancelTests).toBe(false);
    act(() => oldSettle("201", "101", entry("101", "Canceled")));
    expect(read().items[0].orderedTests[0].statusCode).toBe("NotStarted");
    act(() => mocks.search.onSearchResults(payload("201"), null));
    expect(read().canCancelTests).toBe(true);
  });
  it("clears the old account list when the fixed account/session changes", () => {
    const { rerender } = show();
    act(() => mocks.search.onSearchResults(payload("201"), null));
    const oldSettle = mocks.table.onTestCanceled;
    const switched = {
      userSessionDetails: {
        ...context.userSessionDetails,
        userId: "2",
        sessionId: "session-2",
        csrf: "csrf-2",
      },
    };
    localStorage.setItem("CSRF", "csrf-2");
    rerender(wrap(switched));
    expect(screen.queryByTestId("table-data")).not.toBeInTheDocument();
    act(() => oldSettle("201", "101", entry("101", "Canceled")));
    expect(screen.queryByTestId("table-data")).not.toBeInTheDocument();
  });
});
