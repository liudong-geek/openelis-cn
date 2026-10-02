import { waitFor } from "@testing-library/dom";
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import messages from "../../../languages/en.json";
import PanelManagement from "./PanelManagement";
import TestSectionManagement from "./TestSectionManagement";
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
