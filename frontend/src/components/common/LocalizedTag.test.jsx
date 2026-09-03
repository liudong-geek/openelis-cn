import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import LocalizedTag from "./LocalizedTag";

const renderTag = (element) =>
  render(
    <IntlProvider locale="zh-CN" messages={{ "label.button.remove": "移除" }}>
      {element}
    </IntlProvider>,
  );

describe("LocalizedTag", () => {
  test("keeps ordinary status tags non-dismissible", () => {
    renderTag(<LocalizedTag type="green">已完成</LocalizedTag>);

    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("uses a localized accessible action for removable tags", () => {
    const onClose = vi.fn();
    renderTag(
      <LocalizedTag filter onClose={onClose}>
        血常规
      </LocalizedTag>,
    );

    fireEvent.click(screen.getByRole("button", { name: "移除" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
