import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import { NotificationContext } from "../layout/Layout";
import PushNotificationPage from "./PushNotificationPage";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServer: mocks.post,
}));
vi.mock("../common/PageBreadCrumb", () => ({ default: () => <div /> }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.get.mockImplementation((_url, callback) =>
    callback([{ id: "7", displayName: "Lab Supervisor" }]),
  );
});

test("saves and reuses a message template without sending", async () => {
  render(
    <IntlProvider locale="en" messages={messages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: vi.fn(),
        }}
      >
        <PushNotificationPage />
      </NotificationContext.Provider>
    </IntlProvider>,
  );
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Please recollect the specimen" },
  });
  fireEvent.change(screen.getByLabelText("Template name"), {
    target: { value: "Recollection" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
  fireEvent.click(screen.getByRole("button", { name: /Templates/ }));
  expect(screen.getByText("Recollection")).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
});
