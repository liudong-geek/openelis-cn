import React from "react";
import { act } from "react-dom/test-utils";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import messages from "../../../languages/en.json";
import ProviderMenu from "./ProviderMenu";
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  refresh: vi.fn(),
  reload: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerFullResponse: api.post,
}));
vi.mock("../../utils/NavigationUtils", () => ({
  refreshCurrentRoute: api.refresh,
}));
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({
      addNotification: vi.fn(),
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
    }),
    ConfigurationContext: createContext({
      reloadConfiguration: api.reload,
      configurationProperties: {},
    }),
  };
});
const records = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  fhirUuid: `provider-${i + 1}`,
  person: { lastName: "Smith", firstName: `Doctor ${i + 1}` },
  active: true,
}));
function Path() {
  return <output data-testid="provider-path">{useLocation().pathname}</output>;
}
function setup() {
  api.get.mockImplementation((url, cb) => {
    if (url.includes("ProviderMenu"))
      cb({
        providers: records,
        totalRecordCount: "12",
        fromRecordCount: "1",
        toRecordCount: "12",
      });
  });
  render(
    <MemoryRouter initialEntries={["/MasterListsPage/providerMenu"]}>
      <IntlProvider locale="en" messages={messages}>
        <ProviderMenu />
        <Path />
      </IntlProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => vi.clearAllMocks());
test("successful update refreshes the same search and page instead of reloading the application", async () => {
  setup();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Smith" },
  });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining("searchString=Smith"),
      expect.any(Function),
    ),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["pagination.forward"],
      exact: true,
    }),
  );
  expect(screen.getByText("Smith Doctor 11")).toBeInTheDocument();
  fireEvent.click(
    screen.getAllByRole("button", {
      name: messages["externalconnections.action.edit"],
      exact: true,
    })[0],
  );
  const dialog = screen.getByRole("dialog", {
    name: messages["provider.modal.update.heading"],
  });
  fireEvent.change(
    within(dialog).getByLabelText(messages["provider.providerFirstName"]),
    { target: { value: "Revised" } },
  );
  const loadCount = api.get.mock.calls.length;
  api.post.mockImplementation((_url, _body, cb) => cb({ status: 200 }));
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.update"],
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible"),
  );
  expect(api.post).toHaveBeenCalledWith(
    "/rest/Provider/FhirUuid?fhirUuid=provider-11",
    expect.stringContaining("Revised"),
    expect.any(Function),
  );
  expect(api.get.mock.calls.length).toBeGreaterThan(loadCount);
  expect(api.get).toHaveBeenLastCalledWith(
    expect.stringContaining("searchString=Smith"),
    expect.any(Function),
  );
  expect(screen.getByRole("searchbox")).toHaveValue("Smith");
  expect(screen.getByText("Smith Doctor 11")).toBeInTheDocument();
  expect(screen.queryByText("Smith Doctor 1")).not.toBeInTheDocument();
  expect(screen.getByTestId("provider-path")).toHaveTextContent(
    "/MasterListsPage/providerMenu",
  );
  expect(api.reload).toHaveBeenCalled();
  expect(api.refresh).not.toHaveBeenCalled();
});
test("pending request cannot be closed and a failed update keeps entered values for retry", async () => {
  setup();
  fireEvent.click(
    screen.getAllByRole("button", {
      name: messages["externalconnections.action.edit"],
      exact: true,
    })[0],
  );
  const dialog = screen.getByRole("dialog", {
    name: messages["provider.modal.update.heading"],
  });
  const input = within(dialog).getByLabelText(
    messages["provider.providerFirstName"],
  );
  fireEvent.change(input, { target: { value: "Revised" } });
  let complete;
  api.post.mockImplementation((_url, _body, cb) => {
    complete = cb;
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.update"],
      exact: true,
    }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.cancel"],
      exact: true,
    }),
  );
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape", keyCode: 27 });
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  expect(api.post).toHaveBeenCalledTimes(1);
  within(dialog)
    .getAllByRole("textbox")
    .forEach((field) => expect(field).toBeDisabled());
  expect(within(dialog).getByRole("combobox")).toBeDisabled();
  act(() => complete({ status: 503 }));
  expect(input).toHaveValue("Revised");
  expect(input).toBeEnabled();
  expect(within(dialog).getByRole("combobox")).toBeEnabled();
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  expect(
    within(dialog).getByRole("button", {
      name: messages["label.button.update"],
      exact: true,
    }),
  ).toBeEnabled();
  expect(api.reload).not.toHaveBeenCalled();
  expect(api.refresh).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.cancel"],
      exact: true,
    }),
  );
  expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
});
