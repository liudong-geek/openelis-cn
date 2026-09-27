import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
}));

vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
      addNotification: vi.fn(),
    }),
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});

vi.mock("../common/CustomNotification", () => ({
  NotificationKinds: { warning: "warning" },
  AlertDialog: () => null,
}));

import messages from "../../languages/zh.json";
import { ConfigurationContext, NotificationContext } from "../layout/Layout";
import EOrder from "./EOrder";
import EOrderSearch from "./EOrderSearch";

const defaultOrder = {
  electronicOrderId: "SIM-EORDER-1",
  patientLastName: "测试",
  patientFirstName: "患者",
};

const renderSearch = (setEOrders = vi.fn()) => {
  render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: vi.fn(),
        }}
      >
        <EOrderSearch setEOrders={setEOrders} eOrderRef={{ current: null }} />
      </NotificationContext.Provider>
    </IntlProvider>,
  );
  return setEOrders;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/displayList/ELECTRONIC_ORDER_STATUSES") {
      callback([]);
      return;
    }
    callback({
      eOrders: [defaultOrder],
      paging: { currentPage: 1, totalPages: 1 },
    });
  });
});

test("loads the unfiltered electronic request list when the page opens", async () => {
  const setEOrders = renderSearch();

  await waitFor(() =>
    expect(setEOrders).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "SIM-EORDER-1",
        electronicOrderId: "SIM-EORDER-1",
      }),
    ]),
  );

  const firstRequest = mocks.get.mock.calls[0][0];
  const url = new URL(firstRequest, "http://sim.invalid");
  expect(url.pathname).toBe("/rest/ElectronicOrders");
  expect(url.searchParams.get("searchType")).toBe("DATE_STATUS");
  expect(url.searchParams.get("startDate")).toBe("");
  expect(url.searchParams.get("endDate")).toBe("");
  expect(url.searchParams.get("statusId")).toBe("");
  expect(url.searchParams.get("useAllInfo")).toBe("false");
});

test("an empty quick search restores the default list", async () => {
  renderSearch();
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));

  fireEvent.click(screen.getByRole("button", { name: "搜索" }));

  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(3));
  const url = new URL(mocks.get.mock.calls[2][0], "http://sim.invalid");
  expect(url.searchParams.get("searchType")).toBe("DATE_STATUS");
  expect(url.searchParams.get("searchValue")).toBeNull();
});

test("keeps the electronic request list visible when there are no rows", () => {
  render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <ConfigurationContext.Provider value={{ configurationProperties: {} }}>
        <NotificationContext.Provider
          value={{
            setNotificationVisible: vi.fn(),
            addNotification: vi.fn(),
          }}
        >
          <EOrder
            eOrders={[]}
            setEOrders={vi.fn()}
            eOrderRef={{ current: null }}
          />
        </NotificationContext.Provider>
      </ConfigurationContext.Provider>
    </IntlProvider>,
  );

  expect(screen.getByRole("heading", { name: "电子申请列表" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("未找到电子检验申请");
  expect(screen.getByRole("table")).toBeVisible();
});
