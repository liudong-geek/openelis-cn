import React from "react";
import { act } from "react-dom/test-utils";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import ConfigMenuDisplay from "./ConfigMenuDisplay";
import messages from "../../../../languages/en.json";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  upload: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServer: api.post,
  postToOpenElisServerFormData: api.upload,
}));
vi.mock("../../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
      addNotification: api.notify,
    }),
  };
});

const fixture = (type: "text" | "logoUpload") => ({
  paramName: type === "text" ? "facilityName" : "facilityLogo",
  description: "Current facility configuration",
  value: "Original facility",
  valueType: type,
});
const workspace = () => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={messages}>
      <ConfigMenuDisplay
        id="sidenav.label.admin.formEntry.siteInfoconfig"
        label="Site Information Menu"
        menuType="SiteInformationMenu"
      />
    </IntlProvider>
  </MemoryRouter>
);
const setup = async (
  type: "text" | "logoUpload",
  overrides: Record<string, unknown> = {},
) => {
  const config = { ...fixture(type), ...overrides };
  api.get.mockImplementation((url, callback) => {
    if (url === "/rest/SiteInformationMenu")
      callback({
        menuList: [
          { ...config, id: "1", name: config.paramName },
          {
            id: "2",
            name: "labDirectorName",
            description: "Report director",
            value: "Second facility",
            valueType: "text",
          },
        ],
      });
    else if (url === "/rest/SiteInformation?ID=1") callback(config);
    else if (url === "/rest/SiteInformation?ID=2")
      callback({
        paramName: "labDirectorName",
        description: "Report director",
        value: "Second facility",
        valueType: "text",
      });
    else if (url.startsWith("/dbImage/")) callback({ value: null });
  });
  const rendered = render(workspace());
  const user = userEvent.setup();
  const editors = await screen.findAllByRole("button", {
    name: messages["config.workspace.edit"],
  });
  await user.click(editors[0]);
  const dialog = screen.getByRole("dialog");
  if (
    (config.valueType === "text" || config.valueType === "freeText") &&
    config.tag !== "localization"
  ) {
    const field = within(dialog).getByLabelText(
      messages["admin.page.configuration.formEntryConfigMenu.value"],
    );
    await user.clear(field);
    await user.type(field, "Pending facility");
  } else if (type === "logoUpload") {
    await user.click(
      within(dialog).getByText(messages["config.workspace.removeImage"]),
    );
  }
  return {
    ...rendered,
    user,
    dialog,
    editors,
    transport: type === "text" ? api.post : api.upload,
  };
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.upload.mockReset();
  api.notify.mockReset();
});

test("a pending text save locks its draft until a rejected write permits editing again", async () => {
  const { user, dialog, transport } = await setup("text");
  const field = within(dialog).getByLabelText(
    messages["admin.page.configuration.formEntryConfigMenu.value"],
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await user.type(field, " after submit");
  expect(field).toHaveValue("Pending facility");
  expect(field).toBeDisabled();
  act(() => transport.mock.calls[0][2](403));
  expect(field).toBeEnabled();
  await user.type(field, " corrected");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(JSON.parse(transport.mock.calls[1][1])).toMatchObject({
    value: "Pending facility corrected",
  });
});

test.each([
  { valueType: "boolean", value: "true", next: "false" },
  {
    valueType: "dictionary",
    value: "A",
    dictionaryValues: ["A", "B"],
    next: "B",
  },
  { valueType: "freeText", value: "Original facility", next: " after submit" },
])(
  "a pending $valueType save locks its value and restores editing after rejection",
  async (configuration) => {
    const { user, dialog, transport } = await setup("text", configuration);
    const field = within(dialog).getByLabelText(
      messages["admin.page.configuration.formEntryConfigMenu.value"],
    );
    const original =
      configuration.valueType === "freeText"
        ? "Pending facility"
        : configuration.value;
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    if (configuration.valueType === "freeText")
      await user.type(field, configuration.next);
    else await user.selectOptions(field, configuration.next);
    expect(field).toHaveValue(original);
    expect(field).toBeDisabled();
    act(() => transport.mock.calls[0][2](403));
    expect(field).toBeEnabled();
    if (configuration.valueType === "freeText")
      await user.type(field, configuration.next);
    else await user.selectOptions(field, configuration.next);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(JSON.parse(transport.mock.calls[1][1])).toMatchObject({
      value:
        configuration.valueType === "freeText"
          ? original + configuration.next
          : configuration.next,
    });
  },
);

test("a pending localized save locks both labels, including changes in the submit event batch", async () => {
  const { user, dialog, transport } = await setup("text", {
    tag: "localization",
    localization: { english: "English draft", french: "French draft" },
  });
  const english = within(dialog).getByLabelText(messages["english.label"]);
  const french = within(dialog).getByLabelText(messages["french.label"]);
  act(() => {
    within(dialog).getByRole("button", { name: "Save" }).click();
    fireEvent.change(english, { target: { value: "Late English" } });
    fireEvent.change(french, { target: { value: "Late French" } });
  });
  await user.type(english, " later");
  await user.type(french, " later");
  expect(english).toHaveValue("English draft");
  expect(french).toHaveValue("French draft");
  expect(english).toBeDisabled();
  expect(french).toBeDisabled();
  act(() => transport.mock.calls[0][2](0));
  expect(english).toBeEnabled();
  expect(french).toBeEnabled();
  await user.type(english, " corrected");
  await user.type(french, " corrected");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(JSON.parse(transport.mock.calls[1][1])).toMatchObject({
    localization: {
      english: "English draft corrected",
      french: "French draft corrected",
    },
  });
});

test("a pending Logo save locks replacement, removal and deletion, retaining its selected image after rejection", async () => {
  const { user, dialog, transport } = await setup("logoUpload");
  await user.click(
    within(dialog).getByText(messages["config.workspace.removeImage"]),
  );
  const upload = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  const selected = new File(["original logo"], "original.png", {
    type: "image/png",
  });
  await user.upload(upload, selected);
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await user.upload(
    upload,
    new File(["late logo"], "late.png", { type: "image/png" }),
  );
  await user.click(
    within(dialog).getByText(messages["config.workspace.removeImage"]),
  );
  const remove = within(dialog).getByLabelText(
    messages["config.workspace.removeImage"],
  );
  expect(remove).not.toBeChecked();
  expect(remove).toBeDisabled();
  expect(upload).toBeDisabled();
  expect(within(dialog).getByText("original.png")).toBeInTheDocument();
  expect(
    within(dialog).queryByRole("button", {
      name: messages["label.button.delete"],
    }),
  ).not.toBeInTheDocument();
  act(() => transport.mock.calls[0][2](403));
  expect(upload).toBeEnabled();
  expect(remove).toBeEnabled();
  expect(within(dialog).getByText("original.png")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  expect((transport.mock.calls[1][1] as FormData).get("logoFile")).toBe(
    selected,
  );
  expect((transport.mock.calls[1][1] as FormData).get("removeImage")).toBe(
    "false",
  );
});

test.each(["text", "logoUpload"] as const)(
  "a pending %s save keeps the real parent dialog open when its X is clicked",
  async (type) => {
    const { user, dialog, transport } = await setup(type);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(transport).toHaveBeenCalledTimes(1);
    await user.click(
      within(dialog).getByRole("button", { name: messages["button.close"] }),
    );
    expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
    expect(
      within(dialog).getByRole("button", {
        name: messages["config.workspace.saving"],
      }),
    ).toBeDisabled();
  },
);

test.each(["text", "logoUpload"] as const)(
  "a pending %s save blocks same-batch double submit, Escape, Cancel, overlay and opening another row",
  async (type) => {
    const { user, dialog, editors, transport } = await setup(type);
    const save = within(dialog).getByRole("button", { name: "Save" });
    const close = within(dialog).getByRole("button", {
      name: messages["button.close"],
    });
    act(() => {
      save.click();
      save.click();
      close.click();
      editors[1].click();
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
    await user.keyboard("{Escape}");
    await user.click(
      within(dialog).getByRole("button", { name: messages["button.cancel"] }),
    );
    await user.click(dialog.closest(".cds--modal") as HTMLElement);
    expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
    expect(
      api.get.mock.calls.some(([url]) => url === "/rest/SiteInformation?ID=2"),
    ).toBe(false);
    if (type === "text") {
      expect(
        within(dialog).getByLabelText(
          messages["admin.page.configuration.formEntryConfigMenu.value"],
        ),
      ).toHaveValue("Pending facility");
      expect(JSON.parse(transport.mock.calls[0][1])).toMatchObject({
        paramName: "facilityName",
        value: "Pending facility",
      });
    } else {
      const body = transport.mock.calls[0][1] as FormData;
      expect(transport.mock.calls[0][0]).toBe("/rest/logoUpload");
      expect(body.get("logoName")).toBe("facilityLogo");
      expect(body.get("removeImage")).toBe("true");
      expect(
        within(dialog).getByLabelText(messages["config.workspace.removeImage"]),
      ).toBeChecked();
    }
  },
);

test.each([
  ["text", 403],
  ["text", 0],
  ["logoUpload", 403],
  ["logoUpload", 0],
] as const)(
  "a %s save rejected with %s releases the lock, retains its draft and closes only once after a successful retry",
  async (type, status) => {
    const { user, dialog, transport } = await setup(type);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const first = transport.mock.calls[0][2];
    act(() => first(status));
    expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(
      within(dialog).getByRole("button", { name: messages["button.cancel"] }),
    ).toBeEnabled();
    expect(api.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "error" }),
    );
    if (type === "text")
      expect(
        within(dialog).getByLabelText(
          messages["admin.page.configuration.formEntryConfigMenu.value"],
        ),
      ).toHaveValue("Pending facility");
    else
      expect(
        within(dialog).getByLabelText(messages["config.workspace.removeImage"]),
      ).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const retry = transport.mock.calls[1][2];
    act(() => first(200));
    expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
    act(() => {
      retry(200);
      retry(200);
    });
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
    expect(
      api.get.mock.calls.filter(([url]) => url === "/rest/SiteInformationMenu"),
    ).toHaveLength(2);
    expect(
      api.notify.mock.calls.filter(([notice]) => notice.kind === "success"),
    ).toHaveLength(1);
    await user.click(
      screen.getAllByRole("button", {
        name: messages["config.workspace.edit"],
      })[1],
    );
    const next = screen.getByRole("dialog");
    act(() => retry(200));
    expect(next.closest(".cds--modal")).toHaveClass("is-visible");
    expect(
      within(next).getByLabelText(
        messages["admin.page.configuration.formEntryConfigMenu.value"],
      ),
    ).toHaveValue("Second facility");
    expect(
      api.get.mock.calls.filter(([url]) => url === "/rest/SiteInformationMenu"),
    ).toHaveLength(2);
  },
);

test.each(["text", "logoUpload"] as const)(
  "a %s synchronous transport failure retains the draft and permits cancel",
  async (type) => {
    const { user, dialog, transport } = await setup(type);
    transport.mockImplementation(() => {
      throw new Error("transport unavailable");
    });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    expect(api.notify).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: "error" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: messages["button.cancel"] }),
    );
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
  },
);

test("a rejected Logo upload retains the selected file for the next attempt", async () => {
  const { user, dialog, transport } = await setup("logoUpload");
  await user.click(
    within(dialog).getByText(messages["config.workspace.removeImage"]),
  );
  const upload = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(
    upload,
    new File(["logo bytes"], "facility.png", { type: "image/png" }),
  );
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  const firstFile = (transport.mock.calls[0][1] as FormData).get(
    "logoFile",
  ) as File;
  expect(firstFile.name).toBe("facility.png");
  expect(firstFile.size).toBe(10);
  act(() => transport.mock.calls[0][2](403));
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  const retry = transport.mock.calls[1][1] as FormData;
  expect(retry.get("logoFile")).toBe(firstFile);
  expect(retry.get("removeImage")).toBe("false");
});
