import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import ExistingOrder from "./ExistingOrder";
const mockGet = vi.hoisted(() => vi.fn());
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mockGet }));
vi.mock("../barcodeWorkflow/PostSavePrintDialog", () => ({
  default: () => null,
}));
vi.mock("../common/CustomLabNumberInput", () => ({
  default: ({ value, onChange }) => (
    <input aria-label="Request number" value={value} onChange={onChange} />
  ),
}));
vi.mock("../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({
      notificationVisible: false,
      addNotification: vi.fn(),
      setNotificationVisible: vi.fn(),
    }),
  };
});
const mount = (number) =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <ExistingOrder initialLabNumber={number} />
    </IntlProvider>,
  );
beforeEach(() => {
  mockGet.mockReset();
});

test("automatically queries the selected request without a second search", () => {
  mockGet.mockImplementation((url, callback) =>
    callback(
      url.includes("patient-search")
        ? { patientSearchResults: [{ firstName: "Demo", lastName: "Patient" }] }
        : { existingTests: [] },
    ),
  );
  mount("DEMO-12");
  expect(mockGet).toHaveBeenCalledWith(
    "/rest/patient-search-results?labNumber=DEMO-12",
    expect.any(Function),
  );
  expect(mockGet).toHaveBeenCalledWith(
    "/rest/SampleEdit?accessionNumber=DEMO-12",
    expect.any(Function),
  );
  expect(screen.getByText("Demo Patient")).toBeVisible();
});

test("invalid responses show an error and never enable label printing", () => {
  mockGet.mockImplementation((_url, callback) => callback(undefined));
  mount("DEMO-12");
  expect(screen.getByText(messages["order.load.error"])).toBeVisible();
  expect(
    screen.queryByRole("button", {
      name: messages["barcode.print.set.button"],
    }),
  ).toBeNull();
});

test("changing the number invalidates late responses from the previous request", () => {
  const callbacks = [];
  mockGet.mockImplementation((_url, callback) => callbacks.push(callback));
  mount("DEMO-12");
  fireEvent.change(screen.getByLabelText("Request number"), {
    target: { value: "DEMO-13" },
  });
  act(() => {
    callbacks[0]({
      patientSearchResults: [{ firstName: "Previous", lastName: "Patient" }],
    });
    callbacks[1]({ existingTests: [] });
  });
  expect(screen.queryByText("Previous Patient")).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: messages["barcode.print.set.button"],
    }),
  ).toBeNull();
});
