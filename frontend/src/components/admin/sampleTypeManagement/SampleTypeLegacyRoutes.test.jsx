import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import Admin from "../Admin";
import messages from "../../../languages/en.json";

vi.mock("./SampleTypeManagement.jsx", () => ({
  default: () => <span>Sample type workspace</span>,
}));
vi.mock("../testManagementConfigMenu/SampleTypeOrder", () => ({
  default: () => <span>Sample type ordering</span>,
}));
vi.mock("../testManagementConfigMenu/SampleTypeTestAssign", () => ({
  default: () => <span>Sample type associations</span>,
}));

const renderLegacy = (base, legacy) => {
  const entry = {
    pathname: `${base}/${legacy}`,
    search: "?q=Serum&domain=CLINICAL&page=2&pageSize=10",
    state: {
      returnTo: `${base}/SampleTypeManagement?page=2`,
      origin: "legacy-menu",
    },
  };
  const history = createMemoryHistory({ initialEntries: [entry] });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={messages}>
        <Route path={base} component={Admin} />
      </IntlProvider>
    </Router>,
  );
  return { history, entry };
};

describe.each(["/MasterListsPage", "/admin"])(
  "sample type legacy routes under %s",
  (base) => {
    test.each([
      ["SampleTypeCreate", "SampleTypeManagement/new/basic-info"],
      ["SampleTypeRenameEntry", "SampleTypeManagement"],
    ])(
      "redirects %s to the current workspace preserving search and state",
      (legacy, target) => {
        const { history, entry } = renderLegacy(base, legacy);
        expect(screen.getByText("Sample type workspace")).toBeInTheDocument();
        expect(history.location.pathname).toBe(`${base}/${target}`);
        expect(history.location.search).toBe(entry.search);
        expect(history.location.state).toEqual(entry.state);
        expect(history.length).toBe(1);
      },
    );
    test.each([
      ["SampleTypeOrder", "Sample type ordering"],
      ["SampleTypeTestAssign", "Sample type associations"],
    ])("retains the %s configuration entry", (legacy, label) => {
      const { history, entry } = renderLegacy(base, legacy);
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(history.location.pathname).toBe(entry.pathname);
      expect(history.location.search).toBe(entry.search);
      expect(history.location.state).toEqual(entry.state);
    });
  },
);
