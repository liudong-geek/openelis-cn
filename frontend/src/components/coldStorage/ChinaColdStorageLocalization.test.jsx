import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, test, vi } from "vitest";
import zh from "../../languages/zh.json";
import AddDeviceModal from "./shared/AddDeviceModal";

const renderInChinese = (component) =>
  render(
    <IntlProvider locale="zh-CN" messages={zh}>
      {component}
    </IntlProvider>,
  );

describe("China cold-storage workflow", () => {
  test("shows the monitoring-device form in laboratory Chinese", () => {
    renderInChinese(
      <AddDeviceModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        locations={[{ id: 1, name: "标本库A区" }]}
      />,
    );

    expect(screen.getByText("新增监控设备")).toBeInTheDocument();
    expect(screen.getByText("基本信息")).toBeInTheDocument();
    expect(screen.getByLabelText("设备名称 *")).toBeInTheDocument();
    expect(screen.getByText("连接设置")).toBeInTheDocument();
    expect(screen.getByText("Modbus数据配置")).toBeInTheDocument();
    expect(screen.getByText("湿度数据（选填）")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "增加数值" }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("button", { name: "减少数值" }),
    ).not.toHaveLength(0);

    expect(screen.queryByText("Add New Device")).not.toBeInTheDocument();
    expect(screen.queryByText("Basic Information")).not.toBeInTheDocument();
  });
});
