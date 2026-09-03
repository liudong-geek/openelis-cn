import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import OrderDashboard from "./OrderDashboard";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  load: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mocks.get }));
vi.mock("./OrderContext", () => ({
  useOrderContext: () => ({ loadOrder: mocks.load, resetOrder: mocks.reset }),
}));
vi.mock("./BarcodeScannerBar", () => ({ default: () => null }));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({ configurationProperties: {} }),
    NotificationContext: createContext({
      notificationVisible: false,
      addNotification: vi.fn(),
      setNotificationVisible: vi.fn(),
    }),
  };
});

const order = {
  id: "12",
  labNumber: "DEMO-12",
  patientName: "Demo patient",
  facilityName: "Demo lab",
  priority: "routine",
  stepProgress: { enter: true },
  samples: [],
};
const mount = (state) => {
  const history = createMemoryHistory({
    initialEntries: [{ pathname: "/order", state }],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <OrderDashboard />
      </IntlProvider>
    </Router>,
  );
  return history;
};
beforeEach(() => {
  mocks.get.mockReset();
  mocks.load.mockReset();
  mocks.reset.mockReset();
  mocks.load.mockResolvedValue({});
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [order], totalCount: 200 }),
  );
});

test("restores the list filters and page and opens an identified request for editing", async () => {
  const history = mount({
    listState: {
      page: 2,
      pageSize: 25,
      searchQuery: "DEMO-12",
      statusFilter: "in_progress",
    },
  });
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringMatching(
      /page=2&pageSize=25.*search=DEMO-12.*status=in_progress/,
    ),
    expect.any(Function),
  );
  fireEvent.click(within(row).getByRole("button", { name: "Edit request" }));
  expect(history.location.pathname).toBe("/ModifyOrder");
  expect(history.location.search).toBe("?accessionNumber=DEMO-12");
  expect(history.location.state.listOrigin.state.listState.page).toBe(2);
  history.goBack();
  expect(history.location.pathname).toBe("/order");
  expect(history.location.state.listState.page).toBe(2);
  expect(history.location.state.listState.searchQuery).toBe("DEMO-12");
});

test("opens reprinting from a list row with its request number", async () => {
  const history = mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  fireEvent.click(within(row).getByRole("button", { name: "Reprint labels" }));
  expect(history.location.pathname).toBe("/PrintBarcode");
  expect(history.location.search).toBe("?labNumber=DEMO-12");
});

test("view loads a request read-only instead of silently enabling editing", async () => {
  const history = mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  fireEvent.click(
    within(row).getByRole("button", { name: "View", exact: true }),
  );
  await waitFor(() => expect(history.location.pathname).toBe("/order/enter"));
  expect(mocks.load).toHaveBeenCalledWith("DEMO-12", true);
});

test("does not expose internal editing or printing for unaccepted external requests", async () => {
  mocks.get.mockImplementation((_url, callback) =>
    callback({ orders: [{ ...order, isExternal: true }], totalCount: 1 }),
  );
  mount();
  const row = await screen.findByRole("row", { name: /DEMO-12/ });
  expect(
    within(row).queryByRole("button", { name: "Edit request" }),
  ).toBeNull();
  expect(
    within(row).queryByRole("button", { name: "Reprint labels" }),
  ).toBeNull();
  expect(
    within(row).getByRole("button", { name: messages["order.accept"] }),
  ).toBeVisible();
});
