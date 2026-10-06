import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import WorkplanFilterSelect, {
  shouldFilterWorkplanItem,
} from "./WorkplanFilterSelect";
import messages from "../../languages/en.json";
import chineseMessages from "../../languages/zh_CN.json";
import PrioritySelectForm from "./PrioritySelectForm";
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
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["carbon.open.menu"],
      exact: true,
    }),
  );
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

const priorityOptions = [
  { id: "ROUTINE", value: "Routine" },
  { id: "ASAP", value: "ASAP" },
  { id: "STAT", value: "STAT" },
  { id: "TIMED", value: "Timed" },
  { id: "FUTURE_STAT", value: "Future STAT" },
];
const priorityPicker = (value) => (
  <UserSessionDetailsContext.Provider
    value={{ userSessionDetails: { owner: "actor-A" } }}
  >
    <IntlProvider locale="zh-CN" messages={chineseMessages}>
      <PrioritySelectForm title="优先级" value={value} />
    </IntlProvider>
  </UserSessionDetailsContext.Provider>
);
test("Chinese priority options preserve actual enum IDs and localize clear/open controls", async () => {
  readWorkplanOptions.mockResolvedValue(priorityOptions);
  const value = vi.fn();
  render(priorityPicker(value));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "优先级" })).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "展开选项", exact: true }),
  );
  for (const name of ["常规", "尽快处理", "急诊", "指定时间", "预定急诊"]) {
    expect(
      screen.getByRole("option", { name, exact: true }),
    ).toBeInTheDocument();
  }
  expect(
    screen.queryByRole("option", { name: "Routine", exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "收起选项", exact: true }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "优先级" }), {
    target: { value: "急诊" },
  });
  expect(
    screen.queryByRole("option", { name: "常规", exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("option", { name: "急诊", exact: true }));
  expect(value).toHaveBeenLastCalledWith("STAT", "急诊", { restored: false });
  fireEvent.click(
    screen.getByRole("button", { name: "清除所选条件", exact: true }),
  );
  expect(value).toHaveBeenLastCalledWith(
    "",
    chineseMessages["input.placeholder.selectPriority"],
    { restored: false },
  );
});
test("Chinese priority restoration uses enum ID and retains the restored page intent", async () => {
  window.history.replaceState(
    {},
    "",
    "/WorkPlanByPriority?type=priority&priority=FUTURE_STAT&page=2&pageSize=10",
  );
  readWorkplanOptions.mockResolvedValue(priorityOptions);
  const value = vi.fn();
  render(priorityPicker(value));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "优先级" })).toHaveValue(
      "预定急诊",
    ),
  );
  expect(value).toHaveBeenLastCalledWith("FUTURE_STAT", "预定急诊", {
    restored: true,
  });
  expect(window.location.search).toContain("page=2");
});
