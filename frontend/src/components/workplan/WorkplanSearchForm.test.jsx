import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import WorkplanSearchForm from "./WorkplanSearchForm";
import messages from "../../languages/en.json";
import { getFromOpenElisServer } from "../utils/Utils";

vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
}));

vi.mock("./TestSelectForm", () => ({
  default: ({ value }) => (
    <button type="button" onClick={() => value("42", "White blood cells")}>
      choose test
    </button>
  ),
}));

vi.mock("./PanelSelectForm", () => ({ default: () => null }));
vi.mock("./PrioritySelectForm", () => ({ default: () => null }));
vi.mock("./TestSectionSelectForm", () => ({ default: () => null }));

const renderForm = (props = {}) =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <WorkplanSearchForm
        type="test"
        createTestsList={vi.fn()}
        selectedValue={vi.fn()}
        selectedLabel={vi.fn()}
        {...props}
      />
    </IntlProvider>,
  );

describe("WorkplanSearchForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does not request an unbounded workplan before a filter is selected", () => {
    renderForm();

    expect(getFromOpenElisServer).not.toHaveBeenCalled();
    expect(
      screen.getByText("Select a workplan filter to view pending tests."),
    ).toBeInTheDocument();
  });

  test("loads the selected workplan and clears the initial guidance", async () => {
    const createTestsList = vi.fn();
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({ workplanTests: [], paging: null }),
    );
    renderForm({ createTestsList });

    fireEvent.click(screen.getByRole("button", { name: "choose test" }));

    await waitFor(() =>
      expect(getFromOpenElisServer).toHaveBeenCalledWith(
        "/rest/WorkPlanByTest?test_id=42",
        expect.any(Function),
      ),
    );
    expect(createTestsList).toHaveBeenCalledWith({
      workplanTests: [],
      paging: null,
    });
    expect(
      screen.queryByText("Select a workplan filter to view pending tests."),
    ).not.toBeInTheDocument();
  });
});
