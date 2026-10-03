import { waitFor } from "@testing-library/dom";
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import messages from "../../../languages/en.json";
import PanelManagement from "./PanelManagement";
import TestSectionManagement from "./TestSectionManagement";
import ConfigurationNameEditor from "./ConfigurationNameEditor";
import chineseMessages from "../../../languages/zh.json";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerJsonResponse: api.post,
}));
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({
      addNotification: vi.fn(),
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
    }),
  };
});
function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}
const cases = [
  {
    entity: "panel",
    Component: PanelManagement,
    route: "PanelManagement",
    get: "PanelCreate",
    post: "PanelRenameEntry",
    idField: "panelId",
    label: "english.label",
    payload: {
      existingPanelList: [
        {
          typeOfSampleName: "Serum",
          panels: [
            { id: "42", panelName: "Chemistry" },
            { id: "43", panelName: "Other" },
          ],
        },
      ],
    },
  },
  {
    entity: "testSection",
    Component: TestSectionManagement,
    route: "TestSectionManagement",
    get: "TestSectionCreate",
    post: "TestSectionRenameEntry",
    idField: "testSectionId",
    label: "english.label",
    payload: {
      existingTestUnitList: [
        { id: "42", value: "Chemistry" },
        { id: "43", value: "Other" },
      ],
      inactiveTestUnitList: [],
    },
  },
];
function setup(item) {
  api.get.mockImplementation((url, cb) => {
    if (url === `/rest/${item.get}`) cb(item.payload);
    else if (url.includes("EntityNamesProvider"))
      cb({ name: { english: "Chemistry", french: "Chimie" } });
  });
  render(
    <MemoryRouter initialEntries={[`/MasterListsPage/${item.route}`]}>
      <IntlProvider locale="en" messages={messages}>
        <item.Component />
        <Path />
      </IntlProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => vi.clearAllMocks());
for (const item of cases)
  describe(item.entity, () => {
    test("opens the selected row and cancel preserves the filtered list", async () => {
      setup(item);
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "Chemistry" },
      });
      fireEvent.click(
        screen.getByRole("button", {
          name: messages["button.edit"],
          exact: true,
        }),
      );
      const dialog = await screen.findByRole("dialog");
      expect(api.get).toHaveBeenCalledWith(
        `/rest/EntityNamesProvider?entityId=42&entityName=${item.entity}`,
        expect.any(Function),
      );
      expect(within(dialog).getByLabelText(messages[item.label])).toHaveValue(
        "Chemistry",
      );
      expect(screen.getByTestId("path")).toHaveTextContent(
        `/MasterListsPage/${item.route}`,
      );
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: messages["label.button.cancel"],
          exact: true,
        }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("searchbox")).toHaveValue("Chemistry");
      expect(screen.queryByText("Other")).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
    test("keeps an unsuccessful edit open then refreshes the same filter on retry success", async () => {
      setup(item);
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "Chemistry" },
      });
      fireEvent.click(
        screen.getByRole("button", {
          name: messages["button.edit"],
          exact: true,
        }),
      );
      const dialog = await screen.findByRole("dialog");
      const input = within(dialog).getByLabelText(messages[item.label]);
      fireEvent.change(input, { target: { value: "Chemistry revised" } });
      api.post.mockImplementationOnce((_url, _body, cb) =>
        cb({ status: 500, error: "failed" }),
      );
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: messages["label.button.save"],
          exact: true,
        }),
      );
      expect(input).toHaveValue("Chemistry revised");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledWith(
        `/rest/${item.post}`,
        JSON.stringify({
          [item.idField]: "42",
          nameEnglish: "Chemistry revised",
          nameFrench: "Chimie",
        }),
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
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("searchbox")).toHaveValue("Chemistry");
      expect(screen.getByTestId("path")).toHaveTextContent(
        `/MasterListsPage/${item.route}`,
      );
    });
    test("failed detail load disables save without substituting the row display name", async () => {
      setup(item);
      api.get.mockImplementationOnce((_url, cb) =>
        cb({ status: 500, error: "failed" }),
      );
      fireEvent.click(
        screen.getAllByRole("button", {
          name: messages["button.edit"],
          exact: true,
        })[0],
      );
      const dialog = await screen.findByRole("dialog");
      expect(
        within(dialog).getByRole("button", {
          name: messages["label.button.save"],
          exact: true,
        }),
      ).toBeDisabled();
      expect(within(dialog).getByLabelText(messages[item.label])).toHaveValue(
        "",
      );
      expect(api.post).not.toHaveBeenCalled();
    });
  });

function setupChineseEditor(entity, response) {
  const callbacks = { onClose: vi.fn(), onSaved: vi.fn() };
  api.get.mockImplementation((_url, cb) =>
    cb(
      response || {
        name: { english: "Chemistry", french: "Chimie", chinese: "旧显示值" },
        translations: { en: "Chemistry", fr: "Chimie", zh: "生化检验" },
      },
    ),
  );
  render(
    <IntlProvider locale="zh-CN" messages={chineseMessages}>
      <ConfigurationNameEditor
        entity={entity}
        record={{ id: "42", name: "生化检验" }}
        {...callbacks}
      />
    </IntlProvider>,
  );
  return callbacks;
}
for (const item of cases)
  describe(`${item.entity} Chinese names`, () => {
    test("saves the real Chinese translation by business ID and preserves English and French", async () => {
      const callbacks = setupChineseEditor(item.entity);
      const input = screen.getByLabelText(
        chineseMessages["configuration.entityName.chinese"],
      );
      expect(input).toHaveValue("生化检验");
      fireEvent.change(input, {
        target: { value: "  生化检验组合（常规）  " },
      });
      api.post.mockImplementation((_url, _body, cb) => cb({}));
      fireEvent.click(
        screen.getByRole("button", {
          name: chineseMessages["label.button.save"],
          exact: true,
        }),
      );
      expect(api.post).toHaveBeenCalledWith(
        `/rest/${item.post}`,
        JSON.stringify({
          [item.idField]: "42",
          nameEnglish: "Chemistry",
          nameFrench: "Chimie",
          nameChinese: "生化检验组合（常规）",
        }),
        expect.any(Function),
      );
      expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
    });
    test("does not substitute the English fallback for a missing Chinese translation", async () => {
      setupChineseEditor(item.entity, {
        name: { english: "Chemistry", french: "Chimie" },
        translations: { en: "Chemistry", fr: "Chimie" },
      });
      expect(
        screen.getByLabelText(
          chineseMessages["configuration.entityName.chinese"],
        ),
      ).toHaveValue("");
      expect(
        screen.getByRole("button", {
          name: chineseMessages["label.button.save"],
          exact: true,
        }),
      ).toBeDisabled();
      expect(api.post).not.toHaveBeenCalled();
    });
    test("retains Chinese drafts on a failed save and unlocks retry", async () => {
      const callbacks = setupChineseEditor(item.entity);
      const input = screen.getByLabelText(
        chineseMessages["configuration.entityName.chinese"],
      );
      fireEvent.change(input, { target: { value: "生化检验修订" } });
      api.post.mockImplementationOnce((_url, _body, cb) =>
        cb({ status: 500, error: "failed" }),
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: chineseMessages["label.button.save"],
          exact: true,
        }),
      );
      expect(
        screen.getByText(chineseMessages["server.error.msg"]),
      ).toBeVisible();
      expect(input).toHaveValue("生化检验修订");
      expect(input).toBeEnabled();
      expect(callbacks.onSaved).not.toHaveBeenCalled();
      api.post.mockImplementationOnce((_url, _body, cb) => cb({}));
      fireEvent.click(
        screen.getByRole("button", {
          name: chineseMessages["label.button.save"],
          exact: true,
        }),
      );
      expect(callbacks.onSaved).toHaveBeenCalledTimes(1);
    });
    test("blocks duplicate submission, field changes and dismissal while saving", async () => {
      const callbacks = setupChineseEditor(item.entity);
      const input = screen.getByLabelText(
        chineseMessages["configuration.entityName.chinese"],
      );
      fireEvent.change(input, { target: { value: "生化检验修订" } });
      let finish;
      api.post.mockImplementation((_url, _body, cb) => {
        finish = cb;
      });
      const save = screen.getByRole("button", {
        name: chineseMessages["label.button.save"],
        exact: true,
      });
      fireEvent.click(save);
      fireEvent.click(save);
      expect(input).toBeDisabled();
      expect(save).toBeDisabled();
      fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
      fireEvent.click(
        screen.getByRole("button", {
          name: chineseMessages["label.button.cancel"],
          exact: true,
        }),
      );
      expect(callbacks.onClose).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledTimes(1);
      finish({ status: 500, error: "failed" });
      await waitFor(() => expect(input).toBeEnabled());
    });
  });

for (const item of cases) {
  test(`${item.entity}: raw locale map does not inherit a displayed English fallback`, () => {
    setupChineseEditor(item.entity, {
      name: { english: "Chemistry", french: "Chimie", chinese: "Chemistry" },
      translations: { en: "Chemistry", fr: "Chimie" },
    });
    expect(
      screen.getByLabelText(
        chineseMessages["configuration.entityName.chinese"],
      ),
    ).toHaveValue("");
  });
  test(`${item.entity}: missing required French translation expands its validation`, () => {
    setupChineseEditor(item.entity, {
      name: { english: "Chemistry", chinese: "生化" },
      translations: { en: "Chemistry", zh: "生化" },
    });
    expect(
      screen.getByLabelText(
        chineseMessages["configuration.entityName.secondary"],
      ),
    ).toBeVisible();
    expect(
      screen.getByLabelText(
        chineseMessages["configuration.entityName.secondary"],
      ),
    ).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", {
        name: chineseMessages["label.button.save"],
        exact: true,
      }),
    ).toBeDisabled();
  });
  test(`${item.entity}: English UI cannot silently discard an existing Chinese translation`, () => {
    api.get.mockImplementation((_url, callback) =>
      callback({
        name: { english: "Chemistry", french: "Chimie", chinese: "生化" },
        translations: { en: "Chemistry", fr: "Chimie", zh: "生化" },
      }),
    );
    render(
      <IntlProvider locale="en" messages={messages}>
        <ConfigurationNameEditor
          entity={item.entity}
          record={{ id: "42", name: "Chemistry" }}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </IntlProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: messages["configuration.entityName.translations"],
      }),
    );
    const input = screen.getByLabelText(
      messages["configuration.entityName.chinese"],
    );
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", {
        name: messages["label.button.save"],
        exact: true,
      }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
}
