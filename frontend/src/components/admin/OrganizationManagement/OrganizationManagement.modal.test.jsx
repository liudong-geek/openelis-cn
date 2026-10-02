import { act } from "react-dom/test-utils";
import { waitFor } from "@testing-library/dom";
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import OrganizationManagement from "./OrganizationManagement";
import messages from "../../../languages/en.json";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerJsonResponse: api.post,
}));
vi.mock("../../layout/Layout", async () => {
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
function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}
function setup() {
  api.get.mockImplementation((url, cb) => {
    if (url.includes("OrganizationMenu"))
      cb({
        menuList: [
          {
            id: "42",
            organizationName: "Cardiology",
            shortName: "CARD",
            isActive: "Y",
          },
        ],
        totalRecordCount: "1",
        fromRecordCount: "1",
        toRecordCount: "1",
      });
    else if (url.includes("/rest/Organization?"))
      cb({
        id: "42",
        organizationName: "Cardiology",
        shortName: "CARD",
        isActive: "Y",
        selectedTypes: ["1"],
        orgTypes: [{ id: "1", name: "hospital" }],
      });
    else if (url.includes("ACTIVE_ORG_LIST")) cb([]);
  });
  render(
    <MemoryRouter initialEntries={["/MasterListsPage/organizationManagement"]}>
      <IntlProvider locale="en" messages={messages}>
        <OrganizationManagement />
        <Path />
      </IntlProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => vi.clearAllMocks());
test("editing an organization keeps the current search and route after cancel", async () => {
  setup();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Cardio" },
  });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining("searchString=Cardio"),
      expect.any(Function),
    ),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["externalconnections.action.edit"],
      exact: true,
    }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: messages["organization.edit.title"],
  });
  expect(
    within(dialog).getByLabelText(messages["organization.organizationName"]),
  ).toHaveValue("Cardiology");
  expect(api.get).toHaveBeenCalledWith(
    "/rest/Organization?ID=42&startingRecNo=1",
    expect.any(Function),
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.cancel"],
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible"),
  );
  expect(screen.getByRole("searchbox")).toHaveValue("Cardio");
  expect(screen.getByTestId("path")).toHaveTextContent(
    "/MasterListsPage/organizationManagement",
  );
  expect(api.post).not.toHaveBeenCalled();
});
test("save failure retains entered data, success closes and reloads the same search", async () => {
  setup();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "Cardio" },
  });
  await waitFor(() =>
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining("searchString=Cardio"),
      expect.any(Function),
    ),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["externalconnections.action.edit"],
      exact: true,
    }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: messages["organization.edit.title"],
  });
  fireEvent.change(
    within(dialog).getByLabelText(messages["organization.organizationName"]),
    { target: { value: "Cardiology updated" } },
  );
  api.post.mockImplementationOnce((_url, _body, cb) =>
    cb({ status: 500, error: "failure" }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.save"],
      exact: true,
    }),
  );
  expect(
    within(dialog).getByLabelText(messages["organization.organizationName"]),
  ).toHaveValue("Cardiology updated");
  expect(api.post).toHaveBeenCalledWith(
    "/rest/Organization?ID=42&startingRecNo=1",
    expect.stringContaining("Cardiology updated"),
    expect.any(Function),
  );
  api.post.mockImplementationOnce((_url, _body, cb) => cb({}));
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.save"],
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible"),
  );
  expect(screen.getByRole("searchbox")).toHaveValue("Cardio");
  expect(screen.getByTestId("path")).toHaveTextContent(
    "/MasterListsPage/organizationManagement",
  );
});

test("blocks close and Escape while the organization save request is pending", async () => {
  setup();
  fireEvent.click(
    screen.getByRole("button", {
      name: messages["externalconnections.action.edit"],
      exact: true,
    }),
  );
  const dialog = screen.getByRole("dialog", {
    name: messages["organization.edit.title"],
  });
  fireEvent.change(
    within(dialog).getByLabelText(messages["organization.organizationName"]),
    { target: { value: "Cardiology pending" } },
  );
  let complete;
  api.post.mockImplementation((_url, _body, callback) => {
    complete = callback;
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.save"],
      exact: true,
    }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.close"],
      exact: true,
    }),
  );
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape", keyCode: 27 });
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  expect(api.post).toHaveBeenCalledTimes(1);
  // Pending writes replace the editable form with the loading indicator.
  expect(
    within(dialog).queryByLabelText(messages["organization.organizationName"]),
  ).not.toBeInTheDocument();
  act(() => complete({ status: 503, error: "unavailable" }));
  expect(
    within(dialog).getByLabelText(messages["organization.organizationName"]),
  ).toHaveValue("Cardiology pending");
  expect(
    within(dialog).getByLabelText(messages["organization.organizationName"]),
  ).toBeEnabled();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.cancel"],
      exact: true,
    }),
  );
  expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
});
