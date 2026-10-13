import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { Route, Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import Admin from "./Admin";
import AdminSideNav from "./AdminSideNav";
import messages from "../../languages/en.json";

vi.mock("./testManagement/ManageMethod", () => ({
  default: () => <span>Method management</span>,
}));
vi.mock("../utils/Utils", async (importOriginal) => ({
  ...(await importOriginal()),
  getFromOpenElisServer: vi.fn((_url, cb) =>
    cb({ existingUomList: [], inactiveUomList: [], existingEnglishNames: "$" }),
  ),
}));
const setup = (base, leaf, search = "", state) => {
  const history = createMemoryHistory({
    initialEntries: [{ pathname: `${base}/${leaf}`, search, state }],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <Route path={base} component={Admin} />
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe.each(["/admin", "/MasterListsPage"])(
  "compatibility under %s",
  (base) => {
    it("replaces the misspelled method bookmark while retaining query and state", () => {
      const state = { from: "saved-location" };
      const history = setup(
        base,
        "MethodManagment",
        "?search=method&page=3",
        state,
      );
      expect(screen.getByText("Method management")).toBeInTheDocument();
      expect(history.location.pathname).toBe(`${base}/MethodManagement`);
      expect(history.location.search).toBe("?search=method&page=3");
      expect(history.location.state).toEqual(state);
      expect(history.length).toBe(1);
    });
    it.each(["UomManagement", "UomCreate"])(
      "opens %s in the workspace modal and cancellation does not reopen it",
      async (leaf) => {
        const state = { from: "saved-location" };
        const history = setup(base, leaf, "?search=unit&page=3", state);
        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(history.location.pathname).toBe(
          `${base}/testManagementConfigMenu`,
        );
        expect(history.location.search).toBe("?search=unit&page=3");
        expect(history.location.state).toEqual(state);
        expect(history.length).toBe(1);
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() =>
          expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
        );
        expect(history.location.pathname).toBe(
          `${base}/testManagementConfigMenu`,
        );
        expect(history.location.search).toBe("?search=unit&page=3");
        expect(history.location.state).toEqual(state);
      },
    );
  },
);

it.each([
  ["MethodManagement", "Test catalog"],
  ["MethodCreate", "Test catalog"],
  ["PanelCreate", "Test catalog"],
  ["PanelOrder", "Test catalog"],
  ["PanelRenameEntry", "Test catalog"],
  ["SampleTypeCreate", "Test catalog"],
  ["SampleTypeRenameEntry", "Test catalog"],
  ["SelectListRenameEntry", "Test catalog"],
  ["TestActivation", "Test catalog"],
  ["TestAdd", "Test catalog"],
  ["TestRenameEntry", "Test catalog"],
  ["TestSectionRenameEntry", "Test catalog"],
  ["UomRenameEntry", "Test catalog"],
  ["menuConfiguration", "System & security"],
  ["PluginFile", "System & security"],
])("direct %s access stays in its management domain", (leaf, title) => {
  render(
    <Router
      history={createMemoryHistory({ initialEntries: [`/admin/${leaf}`] })}
    >
      <IntlProvider locale="en" messages={messages}>
        <AdminSideNav />
      </IntlProvider>
    </Router>,
  );
  expect(screen.getByRole("button", { name: title })).toBeInTheDocument();
  expect(
    screen.queryByText(messages["admin.navigation.useCenter"]),
  ).not.toBeInTheDocument();
});
