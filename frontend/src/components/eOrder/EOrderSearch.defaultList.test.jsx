import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";

vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({}),
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});

import messages from "../../languages/zh.json";
import UserSessionDetailsContext from "../../UserSessionDetailsContext";
import { ConfigurationContext } from "../layout/Layout";
import EOrder from "./EOrder";
import EOrderPage from "./Index";

const actor = {
  authenticated: true,
  userId: "7",
  sessionId: "synthetic-default-list-session",
  roles: ["Reception"],
};
const defaultOrder = {
  electronicOrderId: "101",
  externalOrderId: "SIM-EXTERNAL-101",
  patientLastName: "测试",
  patientFirstName: "患者",
  statusId: "21",
  statusCode: "ENTERED",
  status: "Entered",
  canReceive: true,
  actionUnavailableReason: null,
  warningCodes: [],
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const orderRequests = () =>
  fetch.mock.calls.filter(([url]) =>
    String(url).includes("/rest/ElectronicOrders?"),
  );
const renderPage = () =>
  render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <UserSessionDetailsContext.Provider value={{ userSessionDetails: actor }}>
        <ConfigurationContext.Provider
          value={{ configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" } }}
        >
          <MemoryRouter initialEntries={["/ElectronicOrders"]}>
            <EOrderPage />
          </MemoryRouter>
        </ConfigurationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("locale", "zh_CN");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (String(url).endsWith("/session")) return json(actor);
      return json({
        queryVersion: "2",
        currentUserId: "7",
        canReceive: true,
        pendingOnly: true,
        eOrders: [defaultOrder],
        paging: {
          currentPage: "1",
          totalPages: "1",
          totalResults: 1,
          pageSize: 50,
        },
        statusSelectionList: [{ id: "21", value: "Entered" }],
        warningCodes: [],
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("loads the pending electronic request list and unique business row when the page opens", async () => {
  renderPage();
  await waitFor(() =>
    expect(screen.getByRole("cell", { name: "测试患者" })).toBeVisible(),
  );
  expect(screen.getByRole("cell", { name: "测试患者" })).toHaveTextContent(
    defaultOrder.patientLastName + defaultOrder.patientFirstName,
  );
  const url = new URL(orderRequests()[0][0], "http://sim.invalid");
  expect(url.pathname).toContain("/rest/ElectronicOrders");
  expect(url.searchParams.get("queryVersion")).toBe("2");
  expect(url.searchParams.get("searchType")).toBe("DATE_STATUS");
  expect(url.searchParams.get("startDate")).toBe("");
  expect(url.searchParams.get("endDate")).toBe("");
  expect(url.searchParams.get("statusId")).toBe("");
  expect(url.searchParams.get("pendingOnly")).toBe("true");
  expect(url.searchParams.get("useAllInfo")).toBe("false");
  expect(screen.getByRole("button", { name: "展开当前行" })).toHaveAttribute(
    "aria-controls",
    expect.stringContaining("101"),
  );
});

test("an empty quick search restores the default pending criteria", async () => {
  renderPage();
  await waitFor(() => expect(orderRequests()).toHaveLength(1));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "搜索" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await waitFor(() => expect(orderRequests()).toHaveLength(2));
  const url = new URL(orderRequests()[1][0], "http://sim.invalid");
  expect(url.searchParams.get("searchType")).toBe("DATE_STATUS");
  expect(url.searchParams.get("searchValue")).toBe("");
  expect(url.searchParams.get("pendingOnly")).toBe("true");
  expect(url.searchParams.get("startDate")).toBe("");
  expect(url.searchParams.get("endDate")).toBe("");
});

test("keeps the electronic request list visible when there are no rows", () => {
  render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <EOrder eOrders={[]} setEOrders={vi.fn()} eOrderRef={{ current: null }} />
    </IntlProvider>,
  );
  expect(screen.getByRole("heading", { name: "电子申请列表" })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("未找到电子检验申请");
  expect(screen.getByRole("table")).toBeVisible();
});

test("translates list codes while a received request cannot edit, generate or receive again", () => {
  const order = {
    id: "101",
    electronicOrderId: "101",
    externalOrderId: "SIM-EXTERNAL-1",
    patientLastName: "张",
    patientFirstName: "伟",
    priority: "STAT",
    status: "Realized",
    statusId: "23",
    statusCode: "REALIZED",
    canReceive: false,
    actionUnavailableReason: "NOT_PENDING",
    warningCodes: [],
  };
  const review = vi.fn();
  render(
    <IntlProvider locale="zh-CN" messages={messages}>
      <EOrder
        eOrders={[order]}
        setEOrders={vi.fn()}
        eOrderRef={{ current: null }}
        queryState={{ phase: "success", owner: "synthetic-owner", epoch: 1 }}
        onReviewOrder={review}
        readAction={vi.fn()}
      />
    </IntlProvider>,
  );
  expect(screen.getByRole("cell", { name: "急诊" })).toBeVisible();
  expect(screen.getByRole("cell", { name: "已接收" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "展开当前行" }));
  // CHG-072 merges the two old routes into explicit manual review in the same
  // tab. Preserve both old protections: no editing and no repeat receiving.
  expect(screen.queryByRole("button", { name: "修改申请" })).toBeNull();
  expect(screen.getByRole("button", { name: "核对并接收" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "核对并接收" }));
  expect(review).not.toHaveBeenCalled();
  expect(order.status).toBe("Realized");
});
