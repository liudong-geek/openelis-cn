import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../../languages/zh.json";
import { NotificationContext } from "../../../layout/Layout";
import ConfigMenuDisplay, { normalizeConfigRows } from "./ConfigMenuDisplay";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServer: vi.fn(),
  postToOpenElisServerFormData: vi.fn(),
}));

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderWorkspace = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <NotificationContext.Provider value={notificationContext}>
          <ConfigMenuDisplay
            id="sidenav.label.admin.formEntry.siteInfoconfig"
            label="Site Information Menu"
            menuType="SiteInformationMenu"
          />
        </NotificationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.get.mockReset();
  notificationContext.setNotificationVisible.mockReset();
  notificationContext.addNotification.mockReset();
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/SiteInformationMenu") {
      callback({
        menuList: [
          {
            id: "1",
            name: "allowOrderEntry",
            description: "允许录入申请",
            value: "true",
            valueType: "boolean",
          },
          {
            id: "2",
            name: "facilityName",
            description: "机构显示名称",
            value: "示例检验科",
            valueType: "text",
          },
        ],
      });
      return;
    }
    if (url === "/rest/SiteInformation?ID=1") {
      callback({
        paramName: "allowOrderEntry",
        description: "允许录入申请",
        value: "true",
        valueType: "boolean",
      });
    }
  });
});

test("normalizes missing legacy values without throwing", () => {
  expect(
    normalizeConfigRows([
      { id: "legacy", valueType: "text" },
      {
        id: "localized",
        valueType: "text",
        tag: "localization",
        localization: {
          localesAndValuesOfLocalesWithValues: "中文 / English",
        },
      },
    ]),
  ).toEqual([
    {
      id: "legacy",
      name: "",
      description: "",
      value: "",
      valueType: "text",
    },
    {
      id: "localized",
      name: "",
      description: "",
      value: "中文 / English",
      valueType: "text",
    },
  ]);
});

test("searches settings and opens the row editor directly", async () => {
  renderWorkspace();

  expect(await screen.findByText("allowOrderEntry")).toBeVisible();
  expect(screen.getByText("配置总数").parentElement).toHaveTextContent("2");

  fireEvent.change(screen.getByRole("searchbox", { name: "搜索配置" }), {
    target: { value: "机构显示" },
  });
  expect(screen.getByText("facilityName")).toBeVisible();
  expect(screen.queryByText("allowOrderEntry")).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "搜索配置" }), {
    target: { value: "允许录入" },
  });
  fireEvent.click(screen.getByRole("button", { name: /编辑/ }));

  expect(mocks.get).toHaveBeenCalledWith(
    "/rest/SiteInformation?ID=1",
    expect.any(Function),
  );
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(screen.getByLabelText("值")).toHaveValue("true");
  expect(screen.getByRole("option", { name: "是" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "否" })).toBeInTheDocument();
});
