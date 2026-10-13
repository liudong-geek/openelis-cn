import React from "react";
import { render, screen } from "@testing-library/react";
import { Router, Route } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import Admin from "../Admin";
import messages from "../../../languages/en.json";
vi.mock("./TestCatalogList", () => ({
  default: () => <span>Catalog list</span>,
}));
vi.mock("./TestCatalogEditor", () => ({
  default: () => <span>Related configuration</span>,
}));
function setup(base, leaf, search = "", state) {
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
}
describe.each(["/admin", "/MasterListsPage"])(
  "legacy catalog under %s",
  (base) => {
    it.each(["TestAdd", "TestCatalogEditor/new/basic-info"])(
      "opens %s as the list create modal",
      (leaf) => {
        const state = { from: "admin" };
        const history = setup(
          base,
          leaf,
          "?sampleType=2&testSection=4&search=%E8%A1%80&page=3&pageSize=10",
          state,
        );
        expect(screen.getByText("Catalog list")).toBeInTheDocument();
        expect(history.location.pathname).toBe(`${base}/TestCatalogList`);
        const q = new URLSearchParams(history.location.search);
        expect(Object.fromEntries(q)).toEqual({
          sampleType: "2",
          testSection: "4",
          search: "血",
          page: "3",
          pageSize: "10",
          create: "true",
        });
        expect(history.location.state).toEqual(state);
        expect(history.length).toBe(1);
      },
    );
    it("preserves the saved list context from related configuration", () => {
      const target = `${base}/TestCatalogList?testSection=8&page=4`;
      const history = setup(
        base,
        "TestCatalogEditor/new/basic-info",
        `?returnTo=${encodeURIComponent(target)}`,
      );
      expect(history.location.pathname).toBe(`${base}/TestCatalogList`);
      expect(new URLSearchParams(history.location.search).get("page")).toBe(
        "4",
      );
      expect(new URLSearchParams(history.location.search).get("create")).toBe(
        "true",
      );
    });
    it("keeps old modification links and their filters", () => {
      const history = setup(base, "TestModifyEntry", "?testSection=8&page=4");
      expect(history.location.pathname).toBe(`${base}/TestCatalogList`);
      expect(history.location.search).toBe("?testSection=8&page=4");
    });
    it("rejects foreign return destinations", () => {
      const history = setup(
        base,
        "TestAdd",
        "?returnTo=https%3A%2F%2Fevil.invalid%2F",
      );
      expect(history.location.pathname).toBe(`${base}/TestCatalogList`);
      expect(history.location.search).toBe("?create=true");
    });
    it("retains existing related configuration deep links", () => {
      const history = setup(
        base,
        "TestCatalogEditor/42/ranges",
        "?returnTo=list",
      );
      expect(screen.getByText("Related configuration")).toBeInTheDocument();
      expect(history.location.pathname).toBe(
        `${base}/TestCatalogEditor/42/ranges`,
      );
    });
  },
);
