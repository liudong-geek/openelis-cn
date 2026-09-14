import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import ResultMultiSelect from "../multiSelect";
import CascadingMultiSelect from "../cascadingMultiSelect";

vi.mock("@carbon/react", () => ({
  Column: ({ children }) => <div>{children}</div>,
  Button: ({ children, onClick, iconDescription }) => (
    <button onClick={onClick} aria-label={iconDescription}>
      {children}
    </button>
  ),
  MultiSelect: ({ id, items, selectedItems, onChange }) => (
    <div>
      <output data-testid={id}>
        {selectedItems.map((item) => String(item.id)).join(",")}
      </output>
      <button onClick={() => onChange({ selectedItems: items })}>
        {`${id}:全部`}
      </button>
      <button
        onClick={() => onChange({ selectedItems: [] })}
      >{`${id}:清空`}</button>
    </div>
  ),
}));

const dictionaryValues = [
  { id: 0, value: "阴性" },
  { id: "2", value: "阳性" },
];

test("多选保留零值标识、回显和既有 JSON 回写格式", () => {
  const onChange = vi.fn();
  const view = render(
    <ResultMultiSelect
      id="multi"
      name="result"
      dictionaryValues={dictionaryValues}
      value={'{"0":"0"}'}
      onChange={onChange}
    />,
  );
  expect(screen.getByTestId("multi")).toHaveTextContent("0");
  fireEvent.click(screen.getByRole("button", { name: "multi:全部" }));
  expect(onChange).toHaveBeenLastCalledWith({
    target: { id: "multi", name: "result", value: '{"0":"0,2"}' },
  });
  view.rerender(
    <ResultMultiSelect
      id="multi"
      name="result"
      dictionaryValues={dictionaryValues}
      value={'{"0":"0,2"}'}
      onChange={onChange}
    />,
  );
  expect(screen.getByTestId("multi")).toHaveTextContent("0,2");
  fireEvent.click(screen.getByRole("button", { name: "multi:清空" }));
  expect(onChange).toHaveBeenLastCalledWith({
    target: { id: "multi", name: "result", value: "{}" },
  });
});

test.each([null, undefined, "not-json"])(
  "多选空值或损坏 JSON 不伪造选中项：%s",
  (value) => {
    render(
      <ResultMultiSelect
        id="empty"
        name="result"
        value={value}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("empty")).toBeEmptyDOMElement();
  },
);

test("级联多选保留分组编号，新增及移除分组仍使用原格式", () => {
  const onChange = vi.fn();
  const tree = (value) => (
    <IntlProvider
      locale="zh"
      messages={{ "label.button.remove": "移除", "label.button.add": "添加" }}
    >
      <CascadingMultiSelect
        id="cascade"
        name="result"
        dictionaryValues={dictionaryValues}
        value={value}
        onChange={onChange}
      />
    </IntlProvider>
  );
  const view = render(tree('{"1":"2"}'));
  expect(screen.getByTestId("cascade_1")).toHaveTextContent("2");
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByTestId("cascade_2")).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole("button", { name: "cascade_2:全部" }));
  expect(onChange).toHaveBeenLastCalledWith({
    target: { id: "cascade", name: "result", value: '{"1":"2","2":"0,2"}' },
  });
  view.rerender(tree('{"1":"2","2":"0,2"}'));
  fireEvent.click(screen.getAllByRole("button", { name: "移除" })[0]);
  expect(onChange).toHaveBeenLastCalledWith({
    target: { id: "cascade", name: "result", value: '{"2":"0,2"}' },
  });
});
