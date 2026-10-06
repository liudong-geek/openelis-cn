import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import WorkplanFilterSelect, {
  shouldFilterWorkplanItem,
} from "./WorkplanFilterSelect";
import messages from "../../languages/en.json";
import { readWorkplanOptions } from "./workplanRequest";
vi.mock("./workplanRequest", () => ({
  readWorkplanOptions: vi.fn(),
  workplanSessionKey: (value) => value?.owner || null,
}));
const items = [
  { id: "41", value: "Haemoglobin" },
  { id: "42", value: "White blood cell count" },
  { id: "43", value: "Platelet count" },
];
const defer = () => {
  let resolve, reject;
  const promise = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
};
const picker = (
  value,
  owner = "actor-A",
  endpoint = "/rest/displayList/ALL_TESTS",
) => (
  <UserSessionDetailsContext.Provider value={{ userSessionDetails: { owner } }}>
    <IntlProvider locale="en" messages={messages}>
      <WorkplanFilterSelect
        id="test-filter"
        endpoint={endpoint}
        queryParameter="testId"
        placeholderId="input.placeholder.selectTest"
        title="Test"
        value={value}
      />
    </IntlProvider>
  </UserSessionDetailsContext.Provider>
);
beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/WorkPlanByTest");
  readWorkplanOptions.mockResolvedValue(items);
});
afterEach(() => vi.useRealTimers());
test("filters a long master-data list and returns the selected item", async () => {
  const value = vi.fn();
  render(picker(value));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Test" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Test" }), {
    target: { value: "white blood" },
  });
  fireEvent.click(await screen.findByText("White blood cell count"));
  expect(value).toHaveBeenLastCalledWith("42", "White blood cell count", {
    restored: false,
  });
});
test("restores an exact selection from the page URL", async () => {
  window.history.replaceState({}, "", "/WorkPlanByTest?testId=42");
  const value = vi.fn();
  render(picker(value));
  await waitFor(() =>
    expect(value).toHaveBeenLastCalledWith("42", "White blood cell count", {
      restored: true,
    }),
  );
  expect(screen.getByRole("combobox", { name: "Test" })).toHaveValue(
    "White blood cell count",
  );
});
test("treats Carbon's empty filter value as an unfiltered list", () => {
  expect(shouldFilterWorkplanItem({ item: items[0], inputValue: null })).toBe(
    true,
  );
  expect(
    shouldFilterWorkplanItem({ item: items[1], inputValue: "white" }),
  ).toBe(true);
});
test("options failure has explicit error and retriable selection loading", async () => {
  readWorkplanOptions
    .mockRejectedValueOnce(new Error("failure"))
    .mockResolvedValueOnce(items);
  render(picker(vi.fn()));
  await screen.findByText(messages["workplan.options.failed"]);
  expect(screen.getByRole("combobox", { name: "Test" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: messages["workplan.options.retry"] }),
  );
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Test" })).toBeEnabled(),
  );
  expect(
    screen.queryByText(messages["workplan.options.failed"]),
  ).not.toBeInTheDocument();
});
test("endpoint ABA ignores late catalogues, even if the transport ignores abort", async () => {
  const oldA = defer(),
    b = defer(),
    newA = defer();
  readWorkplanOptions
    .mockReturnValueOnce(oldA.promise)
    .mockReturnValueOnce(b.promise)
    .mockReturnValueOnce(newA.promise);
  const value = vi.fn();
  const view = render(picker(value, "actor-A", "/A"));
  view.rerender(picker(value, "actor-A", "/B"));
  view.rerender(picker(value, "actor-A", "/A"));
  await act(async () => newA.resolve([{ id: "9", value: "Current" }]));
  await act(async () => oldA.resolve(items));
  await act(async () => b.resolve(items));
  fireEvent.click(screen.getByRole("button", { name: "Open", exact: true }));
  expect(screen.getByRole("option", { name: "Current" })).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Haemoglobin" }),
  ).not.toBeInTheDocument();
});
test("owner replacement clears selection and suppresses the previous actor catalogue", async () => {
  const old = defer(),
    current = defer();
  readWorkplanOptions
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(current.promise);
  const value = vi.fn();
  const view = render(picker(value));
  view.rerender(picker(value, "actor-B"));
  await act(async () => old.resolve(items));
  expect(screen.getByRole("combobox", { name: "Test" })).toBeDisabled();
  await act(async () => current.resolve(items));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "Test" })).toBeEnabled(),
  );
  expect(readWorkplanOptions.mock.lastCall[2]).toBe("actor-B");
});
test("options timeout aborts and displays failure rather than an empty catalogue", async () => {
  vi.useFakeTimers();
  readWorkplanOptions.mockReturnValue(new Promise(() => {}));
  render(picker(vi.fn()));
  const signal = readWorkplanOptions.mock.lastCall[1];
  await act(async () => vi.advanceTimersByTime(20000));
  expect(signal.aborted).toBe(true);
  expect(
    screen.getByText(messages["workplan.options.failed"]),
  ).toBeInTheDocument();
});
