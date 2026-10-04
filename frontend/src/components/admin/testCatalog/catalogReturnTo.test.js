import {
  buildCatalogReturnTo,
  getCatalogReturnTo,
  withCatalogReturnTo,
} from "./catalogReturnTo";

const list = "/MasterListsPage/TestCatalogList";
const encode = (value) => `?returnTo=${encodeURIComponent(value)}`;

describe("catalog list return context", () => {
  it.each(["/MasterListsPage", "/admin"])(
    "preserves %s filters, paging and encoded query bytes across navigation",
    (base) => {
      const expected = `${base}/TestCatalogList?q=%E8%A1%80%E7%B3%96%20%2B&page=3&pageSize=20&active=false`;
      const returnTo = buildCatalogReturnTo({
        pathname: `${base}/TestCatalogList`,
        search: expected.slice(expected.indexOf("?")),
      });
      expect(returnTo).toBe(expected);
      const target = withCatalogReturnTo(
        `${base}/TestCatalogEditor/7/ranges`,
        returnTo,
      );
      expect(getCatalogReturnTo(target.slice(target.indexOf("?")), base)).toBe(
        expected,
      );
    },
  );

  it.each([
    "https://example.org/MasterListsPage/TestCatalogList",
    "//example.org/MasterListsPage/TestCatalogList",
    "/\\example.org/TestCatalogList",
    "/MasterListsPage/TestCatalogList#other",
    "/MasterListsPage/TestCatalogList?q=x#fragment",
    "/MasterListsPage/TestCatalogList/",
    "/MasterListsPage/TestCatalogList/../userManagement",
    "/MasterListsPage/other/../TestCatalogList",
    "/MasterListsPage/%54estCatalogList",
    "/MasterListsPage/TestCatalogList%3Fq=x",
    "/MasterListsPage/TestCatalogList\\other",
    "/MasterListsPage/TestCatalogList?q=x\n",
    " /MasterListsPage/TestCatalogList",
    "/masterlistspage/TestCatalogList",
    "/MasterListsPage/SampleTypeManagement",
  ])("rejects untrusted return path %j", (value) => {
    expect(getCatalogReturnTo(encode(value), "/admin")).toBe(
      "/admin/TestCatalogList",
    );
  });

  it("rejects ambiguous repeated return parameters", () => {
    expect(
      getCatalogReturnTo(
        `${encode(list + "?q=first")}&returnTo=${encodeURIComponent(list + "?q=second")}`,
      ),
    ).toBe(list);
  });

  it("keeps legacy deep links without invented query parameters", () => {
    expect(
      withCatalogReturnTo(
        "/admin/TestCatalogEditor/7/ranges",
        getCatalogReturnTo("", "/admin"),
      ),
    ).toBe("/admin/TestCatalogEditor/7/ranges");
    expect(
      getCatalogReturnTo("?returnTo=javascript%3Aalert(1)", "https://invalid"),
    ).toBe(list);
  });

  it("does not turn a foreign current location or hash into a return target", () => {
    expect(
      buildCatalogReturnTo({
        pathname: "/MasterListsPage/TestCatalogList/../elsewhere",
        search: "?q=x",
      }),
    ).toBe(list);
    expect(
      buildCatalogReturnTo({
        pathname: list,
        search: "?q=x",
        hash: "#section",
      }),
    ).toBe(list);
  });
});
