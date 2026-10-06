import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import WorkplanSearchForm from "./WorkplanSearchForm";
import messages from "../../languages/en.json";
import { readWorkplan } from "./workplanRequest";
vi.mock("./workplanRequest", () => ({ readWorkplan: vi.fn() }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: vi.fn() }));
const Picker = ({ value }) => (
  <>
    <button onClick={() => value("42", "A")}>A</button>
    <button onClick={() => value("43", "B")}>B</button>
    <button onClick={() => value("", "clear")}>clear</button>
  </>
);
vi.mock("./TestSelectForm", () => ({
  default: ({ value }) => <Picker value={value} />,
}));
vi.mock("./PanelSelectForm", () => ({
  default: ({ value }) => <Picker value={value} />,
}));
vi.mock("./TestSectionSelectForm", () => ({
  default: ({ value }) => <Picker value={value} />,
}));
vi.mock("./PrioritySelectForm", () => ({
  default: ({ value }) => (
    <button onClick={() => value("STAT", "urgent")}>A</button>
  ),
}));
const dto = (id) => ({
  rows: [{ analysisId: id }],
  paging: { currentPage: 1, totalPages: 1, totalResults: 1, pageSize: 10 },
});
const defer = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
const renderForm = (props = {}) =>
  render(
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <WorkplanSearchForm
          type="test"
          owner="actor-A"
          pageRequest={{ page: 1, pageSize: 10 }}
          onSelectionChange={vi.fn()}
          onQueryStateChange={vi.fn()}
          createTestsList={vi.fn()}
          selectedValue={vi.fn()}
          selectedLabel={vi.fn()}
          {...props}
        />
      </IntlProvider>
    </MemoryRouter>,
  );
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.useRealTimers());
test("does not request an unbounded workplan before a filter is selected", () => {
  renderForm();
  expect(readWorkplan).not.toHaveBeenCalled();
});
test.each(["test", "panel", "unit", "priority"])(
  "loads %s criteria with page and actor, then publishes current result",
  async (type) => {
    readWorkplan.mockResolvedValue(dto("101"));
    const onQueryStateChange = vi.fn();
    renderForm({ type, onQueryStateChange });
    fireEvent.click(screen.getByText("A"));
    await waitFor(() =>
      expect(onQueryStateChange.mock.lastCall[0]).toMatchObject({
        phase: "success",
        query: { type, filterId: type === "priority" ? "STAT" : "42" },
        rows: [{ analysisId: "101" }],
      }),
    );
    expect(readWorkplan).toHaveBeenLastCalledWith(
      { type, filterId: type === "priority" ? "STAT" : "42" },
      1,
      10,
      expect.any(AbortSignal),
      "actor-A",
    );
  },
);
test("A/B late success cannot overwrite newer B, even when transport ignores abort", async () => {
  const a = defer(),
    b = defer();
  readWorkplan.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const changed = vi.fn();
  renderForm({ onQueryStateChange: changed });
  fireEvent.click(screen.getByText("A"));
  fireEvent.click(screen.getByText("B"));
  await act(async () => b.resolve(dto("B")));
  await act(async () => a.resolve(dto("A")));
  expect(changed.mock.lastCall[0]).toMatchObject({
    phase: "success",
    rows: [{ analysisId: "B" }],
  });
});
test("A/B/A recurrence does not let first A bypass current generation", async () => {
  const oldA = defer(),
    b = defer(),
    newA = defer();
  readWorkplan
    .mockReturnValueOnce(oldA.promise)
    .mockReturnValueOnce(b.promise)
    .mockReturnValueOnce(newA.promise);
  const changed = vi.fn();
  renderForm({ onQueryStateChange: changed });
  fireEvent.click(screen.getByText("A"));
  fireEvent.click(screen.getByText("B"));
  fireEvent.click(screen.getByText("A"));
  await act(async () => newA.resolve(dto("new-A")));
  await act(async () => oldA.resolve(dto("old-A")));
  await act(async () => b.resolve(dto("B")));
  expect(changed.mock.lastCall[0]).toMatchObject({
    phase: "success",
    rows: [{ analysisId: "new-A" }],
  });
});
test("clear immediately publishes idle with no old rows and rejects late response", async () => {
  const pending = defer();
  readWorkplan.mockReturnValue(pending.promise);
  const changed = vi.fn();
  renderForm({ onQueryStateChange: changed });
  fireEvent.click(screen.getByText("A"));
  fireEvent.click(screen.getByText("clear"));
  await act(async () => pending.resolve(dto("stale")));
  expect(changed.mock.lastCall[0]).toMatchObject({ phase: "idle", rows: [] });
});
test("failure is an error state, never a successful empty queue", async () => {
  readWorkplan.mockRejectedValue(
    Object.assign(new Error(), { kind: "forbidden" }),
  );
  const changed = vi.fn();
  renderForm({ onQueryStateChange: changed });
  fireEvent.click(screen.getByText("A"));
  await waitFor(() =>
    expect(changed.mock.lastCall[0]).toMatchObject({
      phase: "error",
      errorCode: "forbidden",
      rows: [],
    }),
  );
});
test("unmount aborts and suppresses late callback", async () => {
  const pending = defer();
  readWorkplan.mockReturnValue(pending.promise);
  const changed = vi.fn();
  const view = renderForm({ onQueryStateChange: changed });
  fireEvent.click(screen.getByText("A"));
  const signal = readWorkplan.mock.lastCall[3];
  view.unmount();
  const count = changed.mock.calls.length;
  await act(async () => pending.resolve(dto("late")));
  expect(signal.aborted).toBe(true);
  expect(changed.mock.calls.slice(count)).toEqual([]);
});
test("same page object replacement retries current bounded query", async () => {
  readWorkplan.mockResolvedValue(dto("fresh"));
  const changed = vi.fn();
  const props = {
    type: "test",
    owner: "actor-A",
    onQueryStateChange: changed,
    onSelectionChange: vi.fn(),
  };
  const wrapper = (pageRequest) => (
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <WorkplanSearchForm {...props} pageRequest={pageRequest} />
      </IntlProvider>
    </MemoryRouter>
  );
  const view = render(wrapper({ page: 1, pageSize: 10 }));
  fireEvent.click(screen.getByText("A"));
  await waitFor(() => expect(changed.mock.lastCall[0].phase).toBe("success"));
  view.rerender(wrapper({ page: 1, pageSize: 10 }));
  await waitFor(() => expect(readWorkplan).toHaveBeenCalledTimes(2));
});
test("owner change clears selection and rejects the previous owner response", async () => {
  const pending = defer();
  readWorkplan.mockReturnValue(pending.promise);
  const changed = vi.fn();
  const pageRequest = { page: 1, pageSize: 10 };
  const wrapper = (owner) => (
    <MemoryRouter>
      <IntlProvider locale="en" messages={messages}>
        <WorkplanSearchForm
          type="test"
          owner={owner}
          pageRequest={pageRequest}
          onSelectionChange={vi.fn()}
          onQueryStateChange={changed}
        />
      </IntlProvider>
    </MemoryRouter>
  );
  const view = render(wrapper("actor-A"));
  fireEvent.click(screen.getByText("A"));
  view.rerender(wrapper("actor-B"));
  await act(async () => pending.resolve(dto("old")));
  expect(changed.mock.lastCall[0]).toMatchObject({
    phase: "idle",
    owner: "actor-B",
    rows: [],
  });
});
test("timeout aborts the transport and publishes a retriable error", async () => {
  vi.useFakeTimers();
  readWorkplan.mockReturnValue(new Promise(() => {}));
  const changed = vi.fn();
  renderForm({ onQueryStateChange: changed });
  fireEvent.click(screen.getByText("A"));
  const requestSignal = readWorkplan.mock.lastCall[3];
  await act(async () => vi.advanceTimersByTime(20000));
  expect(requestSignal.aborted).toBe(true);
  expect(changed.mock.lastCall[0]).toMatchObject({
    phase: "error",
    errorCode: "timeout",
    rows: [],
  });
});
