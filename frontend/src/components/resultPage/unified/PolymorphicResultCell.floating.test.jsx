import React from "react";
import { act, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import PolymorphicResultCell from "./PolymorphicResultCell";
import ResultMultiSelect from "../../common/multiSelect";
import CascadingMultiSelect from "../../common/cascadingMultiSelect";

// Real Carbon components: these assertions verify its floating DOM strategy
// and keyboard callbacks, not browser geometry or a mocked autoAlign prop.
const dictionaryValues = [
  { id: "0", value: "Alpha zero" },
  { id: "2", value: "Beta positive" },
];
const baseRow = {
  id: "0",
  analysisId: "42",
  testResultComponentId: "12",
  resultType: "M",
  dictionaryResults: dictionaryValues,
  multiSelectResultValues: "{}",
};
const messages = {
  "label.button.add": "添加",
  "label.button.remove": "移除",
};
const tree = (content) => (
  <IntlProvider locale="zh" messages={messages}>
    {content}
  </IntlProvider>
);
const openWithKeyboard = async (trigger) => {
  act(() => trigger.focus());
  await userEvent.keyboard("{ArrowDown}");
  const menu = trigger
    .closest(".cds--list-box")
    .querySelector('[role="listbox"]');
  await waitFor(() => expect(menu).not.toHaveAttribute("hidden"));
  return menu;
};

test("workbench multiselect uses Carbon fixed positioning and preserves zero ID keyboard selection", async () => {
  const onValueChange = vi.fn();
  const view = render(
    tree(
      <PolymorphicResultCell
        row={baseRow}
        editable
        onValueChange={onValueChange}
      />,
    ),
  );
  const menu = await openWithKeyboard(screen.getByRole("combobox"));
  expect(menu).toHaveClass("cds--list-box__menu");
  expect(menu.closest(".cds--list-box")).toHaveClass("cds--autoalign");
  await waitFor(() => expect(menu.style.position).toBe("fixed"));
  await userEvent.keyboard("{Enter}");
  expect(onValueChange).toHaveBeenLastCalledWith(
    "multiSelectResultValues",
    '{"0":"0"}',
  );
  await userEvent.keyboard("{Escape}");
  view.rerender(
    tree(
      <PolymorphicResultCell
        row={{ ...baseRow, multiSelectResultValues: '{"0":"2"}' }}
        editable
        onValueChange={onValueChange}
      />,
    ),
  );
  const controlledMenu = await openWithKeyboard(screen.getByRole("combobox"));
  // JSDOM has zero-size boxes; Carbon correctly marks a floating menu hidden
  // there. Assert the real option state, leaving visibility to browser QA.
  expect(
    controlledMenu.querySelector('[role="option"][aria-label="Beta positive"]'),
  ).toHaveAttribute("aria-selected", "true");
});

test("workbench cascades retain original groups when adding selecting and removing with floating menus", async () => {
  const onValueChange = vi.fn();
  const content = (value) =>
    tree(
      <PolymorphicResultCell
        row={{ ...baseRow, resultType: "C", multiSelectResultValues: value }}
        editable
        onValueChange={onValueChange}
      />,
    );
  const view = render(content('{"7":"2"}'));
  const existingMenu = await openWithKeyboard(screen.getByRole("combobox"));
  expect(existingMenu.closest(".cds--list-box")).toHaveClass("cds--autoalign");
  await waitFor(() => expect(existingMenu.style.position).toBe("fixed"));
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Add" }));
  const triggers = screen.getAllByRole("combobox");
  expect(triggers).toHaveLength(2);
  const menu = await openWithKeyboard(triggers[1]);
  await waitFor(() => expect(menu.style.position).toBe("fixed"));
  await userEvent.keyboard("{Enter}");
  expect(onValueChange).toHaveBeenLastCalledWith(
    "multiSelectResultValues",
    '{"7":"2","8":"0"}',
  );
  await userEvent.keyboard("{Escape}");
  view.rerender(content('{"7":"2","8":"0"}'));
  await userEvent.click(screen.getAllByRole("button", { name: "移除" })[0]);
  expect(onValueChange).toHaveBeenLastCalledWith(
    "multiSelectResultValues",
    '{"8":"0"}',
  );
  view.rerender(content('{"8":"0"}'));
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  const controlledMenu = await openWithKeyboard(screen.getByRole("combobox"));
  expect(
    controlledMenu.querySelector('[role="option"][aria-label="Alpha zero"]'),
  ).toHaveAttribute("aria-selected", "true");
});

test.each([
  ["multi", ResultMultiSelect, "{}"],
  ["cascade", CascadingMultiSelect, '{"7":"2"}'],
])(
  "shared %s selector keeps legacy positioning when autoAlign is omitted",
  async (_name, Component, value) => {
    render(
      tree(
        <Component
          id="legacy-selection"
          name="legacy-result"
          dictionaryValues={dictionaryValues}
          value={value}
          onChange={vi.fn()}
        />,
      ),
    );
    const menu = await openWithKeyboard(screen.getByRole("combobox"));
    expect(menu.closest(".cds--list-box")).not.toHaveClass("cds--autoalign");
    expect(menu.style.position).not.toBe("fixed");
  },
);

test("read-only result display remains text without a floating control", () => {
  render(
    tree(
      <PolymorphicResultCell
        row={{ ...baseRow, multiSelectResultValues: '{"0":"0,2"}' }}
        editable={false}
        onValueChange={vi.fn()}
      />,
    ),
  );
  expect(screen.getByText("Alpha zero, Beta positive")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("listbox", { hidden: true }),
  ).not.toBeInTheDocument();
});
