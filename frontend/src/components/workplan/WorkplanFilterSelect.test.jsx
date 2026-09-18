import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import WorkplanFilterSelect from "./WorkplanFilterSelect";
import messages from "../../languages/en.json";
import { getFromOpenElisServer } from "../utils/Utils";

vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
}));

const tests = [
  { id: "41", value: "Haemoglobin" },
  { id: "42", value: "White blood cell count" },
  { id: "43", value: "Platelet count" },
];

const renderSelect = (value = vi.fn()) =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <WorkplanFilterSelect
        id="workplan-test-filter"
        endpoint="/rest/displayList/ALL_TESTS"
        queryParameter="testId"
        placeholderId="input.placeholder.selectTest"
        title="Test"
        value={value}
      />
    </IntlProvider>,
  );

describe("WorkplanFilterSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/WorkPlanByTest");
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback(tests),
    );
  });

  test("filters a long master-data list and returns the selected item", async () => {
    const onChange = vi.fn();
    renderSelect(onChange);

    const input = await screen.findByRole("combobox", { name: "Test" });
    fireEvent.change(input, { target: { value: "white blood" } });

    const option = await screen.findByText("White blood cell count");
    fireEvent.click(option);

    expect(onChange).toHaveBeenLastCalledWith("42", "White blood cell count");
  });

  test("restores an exact selection from the page URL", async () => {
    const onChange = vi.fn();
    window.history.replaceState({}, "", "/WorkPlanByTest?testId=42");

    renderSelect(onChange);

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("42", "White blood cell count"),
    );
    expect(screen.getByRole("combobox", { name: "Test" })).toHaveValue(
      "White blood cell count",
    );
  });
});
