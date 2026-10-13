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
  notify: vi.fn(),
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
      addNotification: api.notify,
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
    }),
    ConfigurationContext: createContext({
      reloadConfiguration: api.reload,
      configurationProperties: {},
    }),
  };
});
const providerUuid = (id) =>
  `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
const records = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  fhirUuid: providerUuid(i + 1),
  person: { lastName: "Smith", firstName: `Doctor ${i + 1}` },
  active: true,
}));
function Path() {
  return <output data-testid="provider-path">{useLocation().pathname}</output>;
}
function setup(providerRecords = records) {
  api.get.mockImplementation((url, cb) => {
    if (url.includes("ProviderMenu"))
      cb({
        providers: providerRecords,
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
beforeEach(() => Object.values(api).forEach((mock) => mock.mockReset()));
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
  api.post.mockImplementation((_url, body, cb) =>
    cb(savedResponse({ ...records[10], ...JSON.parse(body) })),
  );
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
    "/rest/Provider/FhirUuid?fhirUuid=00000000-0000-4000-8000-000000000011",
    expect.stringContaining("Revised"),
    expect.any(Function),
  );
  await waitFor(() =>
    expect(api.get.mock.calls.length).toBeGreaterThan(loadCount),
  );
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
  await act(async () => {
    await complete({ status: 422 });
  });
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

function savedResponse(record, overrides = {}) {
  return {
    status: 200,
    redirected: false,
    json: async () => record,
    ...overrides,
  };
}
function openEditor(mode = "add") {
  if (mode === "add") {
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["provider.management.action.add"],
      }),
    );
  } else {
    fireEvent.click(
      screen.getAllByRole("button", {
        name: messages["externalconnections.action.edit"],
        exact: true,
      })[0],
    );
  }
  return screen.getByRole("dialog", {
    name: messages[`provider.modal.${mode}.heading`],
  });
}
function changeField(dialog, id, value) {
  fireEvent.change(dialog.querySelector(`[id$="-${id}"]`), {
    target: { value },
  });
}
function submitEditor(dialog, mode = "add") {
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages[`label.button.${mode}`],
      exact: true,
    }),
  );
}
function isOpen(dialog) {
  return expect(dialog.closest(".cds--modal"));
}

test("shared editor creates Chinese provider names, keeps field IDs and accepts empty optional contacts", async () => {
  setup();
  const dialog = openEditor();
  expect(
    within(dialog).getByRole("button", {
      name: messages["label.button.add"],
      exact: true,
    }),
  ).toBeDisabled();
  changeField(dialog, "last-name", "张");
  changeField(dialog, "first-name", "伟");
  changeField(dialog, "active", "no");
  api.post.mockImplementation((_url, body, cb) =>
    cb(
      savedResponse({
        id: "99",
        fhirUuid: "00000000-0000-4000-8000-000000000099",
        ...JSON.parse(body),
      }),
    ),
  );
  submitEditor(dialog);
  await waitFor(() => isOpen(dialog).not.toHaveClass("is-visible"));
  expect(api.post).toHaveBeenCalledWith(
    "/rest/Provider/FhirUuid?fhirUuid=",
    JSON.stringify({
      person: {
        lastName: "张",
        firstName: "伟",
        workPhone: "",
        fax: "",
        email: "",
      },
      active: false,
    }),
    expect.any(Function),
  );
  const edit = openEditor("update");
  expect(edit.querySelector("#provider-update-last-name")).toHaveValue("Smith");
  expect(edit.querySelector("#provider-update-first-name")).toHaveValue(
    "Doctor 1",
  );
  expect(edit.querySelector("#provider-add-last-name")).toBeNull();
});

test.each([
  ["connection lost", undefined],
  ["server error", { status: 503 }],
  ["login redirect", savedResponse({}, { redirected: true })],
  ["invalid success body", savedResponse({})],
])(
  "uncertain creation (%s) retains the draft and prevents a second POST even after reopening",
  async (_label, response) => {
    setup();
    const dialog = openEditor();
    changeField(dialog, "last-name", "王");
    changeField(dialog, "first-name", "芳");
    api.post.mockImplementation((_url, _body, cb) => cb(response));
    submitEditor(dialog);
    await waitFor(() =>
      expect(
        within(dialog).getByText(messages["provider.save.unconfirmed"]),
      ).toBeInTheDocument(),
    );
    expect(dialog.querySelector("#provider-add-first-name")).toBeDisabled();
    expect(api.reload).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages["label.button.close"],
        exact: true,
      }),
    );
    isOpen(dialog).not.toHaveClass("is-visible");
    const reopened = openEditor();
    expect(reopened.querySelector("#provider-add-first-name")).toHaveValue(
      "芳",
    );
    expect(
      within(reopened).queryByRole("button", {
        name: messages["label.button.add"],
        exact: true,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(reopened).getByRole("button", {
        name: messages["provider.save.check"],
        exact: true,
      }),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
  },
);

test("unknown creation searches candidates, requires explicit identity selection and verifies it by ID", async () => {
  setup();
  const dialog = openEditor();
  changeField(dialog, "last-name", "张");
  changeField(dialog, "first-name", "伟");
  const stored = {
    id: "99",
    fhirUuid: "00000000-0000-4000-8000-000000000099",
    person: {
      lastName: "张",
      firstName: "伟",
      email: "",
      fax: "",
      workPhone: "",
    },
    active: true,
  };
  api.post.mockImplementation((_url, _body, cb) => cb(undefined));
  submitEditor(dialog);
  api.get.mockImplementation((url, cb) => {
    if (url.includes("SearchProviderMenu"))
      cb({
        providers: [
          stored,
          {
            ...stored,
            id: "100",
            person: { ...stored.person, email: "other@example.com" },
          },
        ],
      });
    else if (url.includes("/Provider/raw/99")) cb(stored);
    else if (url.includes("ProviderMenu"))
      cb({ providers: records, totalRecordCount: "12" });
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["provider.save.check"],
      exact: true,
    }),
  );
  expect(api.get).toHaveBeenCalledWith(
    expect.stringContaining("searchString=" + encodeURIComponent("伟 张")),
    expect.any(Function),
  );
  expect(api.reload).not.toHaveBeenCalled();
  const matches = within(dialog).getAllByRole("button", {
    name: messages["provider.save.confirmRecord"],
  });
  expect(matches).toHaveLength(1);
  fireEvent.click(matches[0]);
  await waitFor(() => isOpen(dialog).not.toHaveClass("is-visible"));
  expect(api.get).toHaveBeenCalledWith(
    "/rest/Provider/raw/99",
    expect.any(Function),
  );
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.reload).toHaveBeenCalledTimes(1);
  expect(api.notify).toHaveBeenCalledWith(
    expect.objectContaining({ message: messages["provider.save.confirmed"] }),
  );
});

test("unknown update checks the exact identity and draft instead of accepting a different provider or resending", async () => {
  setup();
  const dialog = openEditor("update");
  changeField(dialog, "first-name", "Revised");
  api.post.mockImplementation((_url, body, cb) =>
    cb(
      savedResponse({
        ...JSON.parse(body),
        id: "777",
        fhirUuid: "different-provider",
      }),
    ),
  );
  submitEditor(dialog, "update");
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", {
        name: messages["provider.save.check"],
      }),
    ).toBeInTheDocument(),
  );
  const stored = {
    ...records[0],
    person: { lastName: "Smith", firstName: "Revised" },
  };
  api.get.mockImplementationOnce((_url, cb) =>
    cb({ ...stored, fhirUuid: "other-provider" }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["provider.save.check"],
    }),
  );
  isOpen(dialog).toHaveClass("is-visible");
  expect(api.reload).not.toHaveBeenCalled();
  api.get.mockImplementationOnce((_url, cb) => cb(stored));
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["provider.save.check"],
    }),
  );
  await waitFor(() => isOpen(dialog).not.toHaveClass("is-visible"));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith(
    "/rest/Provider/raw/1",
    expect.any(Function),
  );
});

test("both modes validate current email and telephone values, including cleared optional fields and late validation replies", async () => {
  setup();
  const dialog = openEditor();
  changeField(dialog, "last-name", "陈");
  changeField(dialog, "first-name", "敏");
  changeField(dialog, "first-name", "123");
  expect(dialog.querySelector("#provider-add-first-name")).toHaveValue("敏");
  const submit = within(dialog).getByRole("button", {
    name: messages["label.button.add"],
    exact: true,
  });
  changeField(dialog, "email", "not-an-email");
  expect(submit).toBeDisabled();
  changeField(dialog, "email", "");
  expect(submit).toBeEnabled();
  const phone = dialog.querySelector("#provider-add-telephone");
  let firstValidation;
  api.get.mockImplementationOnce((_url, cb) => {
    firstValidation = cb;
  });
  changeField(dialog, "telephone", "123");
  fireEvent(phone, new FocusEvent("focusout", { bubbles: true }));
  expect(submit).toBeDisabled();
  changeField(dialog, "telephone", "");
  act(() => firstValidation({ status: false, body: "Invalid phone" }));
  expect(submit).toBeEnabled();
  expect(within(dialog).queryByText("Invalid phone")).not.toBeInTheDocument();
  let lateValidation;
  api.get.mockImplementationOnce((_url, cb) => {
    lateValidation = cb;
  });
  changeField(dialog, "telephone", "02112345678");
  fireEvent(phone, new FocusEvent("focusout", { bubbles: true }));
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["label.button.cancel"],
      exact: true,
    }),
  );
  const edit = openEditor("update");
  act(() => lateValidation({ status: false, body: "Invalid old phone" }));
  expect(within(edit).queryByText("Invalid old phone")).not.toBeInTheDocument();
  expect(
    within(edit).getByRole("button", {
      name: messages["label.button.update"],
      exact: true,
    }),
  ).toBeEnabled();
  changeField(edit, "email", "bad");
  expect(
    within(edit).getByRole("button", {
      name: messages["label.button.update"],
      exact: true,
    }),
  ).toBeDisabled();
  changeField(edit, "email", "chen@example.com");
  expect(
    within(edit).getByRole("button", {
      name: messages["label.button.update"],
      exact: true,
    }),
  ).toBeEnabled();
});

test("permission rejection leaves the draft editable and retry sends it only after the user requests it", async () => {
  setup();
  const dialog = openEditor("update");
  changeField(dialog, "fax", "02176543210");
  api.post.mockImplementationOnce((_url, _body, cb) => cb({ status: 403 }));
  submitEditor(dialog, "update");
  expect(
    within(dialog).getByText(messages["server.error.msg"]),
  ).toBeInTheDocument();
  expect(dialog.querySelector("#provider-update-fax")).toBeEnabled();
  expect(api.reload).not.toHaveBeenCalled();
  changeField(dialog, "email", "new@example.com");
  api.post.mockImplementationOnce((_url, body, cb) =>
    cb(savedResponse({ ...records[0], ...JSON.parse(body) })),
  );
  submitEditor(dialog, "update");
  await waitFor(() => expect(api.reload).toHaveBeenCalledTimes(1));
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(JSON.parse(api.post.mock.calls[1][1]).person).toMatchObject({
    email: "new@example.com",
    fax: "02176543210",
  });
});

test("empty or failed reconciliation keeps the submitted values frozen and never claims success", async () => {
  setup();
  const dialog = openEditor("update");
  changeField(dialog, "first-name", "Revised");
  changeField(dialog, "fax", "02176543210");
  api.post.mockImplementationOnce((_url, _body, cb) => cb(undefined));
  submitEditor(dialog, "update");
  const check = within(dialog).getByRole("button", {
    name: messages["provider.save.check"],
  });
  api.get.mockImplementationOnce((_url, cb) => cb(undefined));
  fireEvent.click(check);
  expect(
    within(dialog).getByText(messages["provider.save.checkFailed"]),
  ).toBeInTheDocument();
  api.get.mockImplementationOnce((_url, cb) =>
    cb({
      ...records[0],
      person: { lastName: "Smith", firstName: "Revised", fax: "old fax" },
    }),
  );
  fireEvent.click(check);
  expect(dialog.querySelector("#provider-update-fax")).toHaveValue(
    "02176543210",
  );
  expect(dialog.querySelector("#provider-update-fax")).toBeDisabled();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.reload).not.toHaveBeenCalled();
  expect(api.notify).not.toHaveBeenCalledWith(
    expect.objectContaining({ kind: "success" }),
  );
});

test.each([null, "", " ", "not-a-uuid"])(
  "editing a legacy provider without a valid UUID (%s) never sends the create endpoint",
  async (fhirUuid) => {
    setup([{ ...records[0], fhirUuid }]);
    const dialog = openEditor("update");
    expect(
      within(dialog).getByText(messages["provider.save.identityUnavailable"]),
    ).toBeInTheDocument();
    changeField(dialog, "first-name", "Revised");
    expect(
      within(dialog).getByRole("button", {
        name: messages["label.button.update"],
        exact: true,
      }),
    ).toBeDisabled();
    submitEditor(dialog, "update");
    expect(api.post).not.toHaveBeenCalled();
    expect(api.reload).not.toHaveBeenCalled();
    expect(dialog.querySelector("#provider-update-first-name")).toHaveValue(
      "Revised",
    );
  },
);

test("unknown creation can find the second page without another POST and ignores the unfiltered total", async () => {
  setup();
  const dialog = openEditor();
  changeField(dialog, "last-name", "张");
  changeField(dialog, "first-name", "伟");
  changeField(dialog, "active", "no");
  const stored = {
    id: "99",
    fhirUuid: providerUuid(99),
    person: { lastName: "张", firstName: "伟" },
    active: false,
  };
  const other = (id) => ({
    ...stored,
    id: String(id),
    fhirUuid: providerUuid(id),
    active: true,
  });
  api.post.mockImplementationOnce((_url, _body, cb) => cb(undefined));
  submitEditor(dialog);
  api.get.mockImplementation((url, cb) => {
    if (url.includes("SearchProviderMenu") && url.includes("startingRecNo=1&"))
      cb({
        providers: [other(20), other(21), other(22)],
        fromRecordCount: "1",
        toRecordCount: "2",
        totalRecordCount: "2000",
      });
    else if (
      url.includes("SearchProviderMenu") &&
      url.includes("startingRecNo=3&")
    )
      cb({
        providers: [other(22), stored],
        fromRecordCount: "3",
        toRecordCount: "4",
        totalRecordCount: "2000",
      });
    else if (url.includes("/Provider/raw/99")) cb(stored);
    else if (url.includes("ProviderMenu")) cb({ providers: records });
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["provider.save.check"],
    }),
  );
  expect(
    within(dialog).queryByRole("button", {
      name: messages["provider.save.confirmRecord"],
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["provider.save.nextCandidates"],
    }),
  );
  expect(api.get).toHaveBeenCalledWith(
    expect.stringContaining("startingRecNo=3&"),
    expect.any(Function),
  );
  expect(
    within(dialog).queryByRole("button", {
      name: messages["provider.save.nextCandidates"],
    }),
  ).not.toBeInTheDocument();
  expect(api.reload).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: messages["provider.save.confirmRecord"],
    }),
  );
  await waitFor(() => expect(api.reload).toHaveBeenCalledTimes(1));
  expect(api.get).toHaveBeenCalledWith(
    "/rest/Provider/raw/99",
    expect.any(Function),
  );
  expect(api.post).toHaveBeenCalledTimes(1);
});
