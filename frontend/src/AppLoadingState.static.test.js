import { readFileSync } from "node:fs";

test("lazy application routes never use an invisible suspense fallback", () => {
  const appSource = readFileSync(`${process.cwd()}/src/App.jsx`, "utf8");

  expect(appSource).not.toContain("Suspense fallback={null}");
  expect(appSource).toContain("fallback={<PageLoadingState />}");
});

test("legacy data refreshes re-mount only the active route", () => {
  const appSource = readFileSync(`${process.cwd()}/src/App.jsx`, "utf8");

  expect(appSource).toContain("INTERNAL_ROUTE_REFRESH_EVENT");
  expect(appSource).toContain("setRouteRefreshKey");
  expect(appSource).toContain("<Switch key={routeRefreshKey}>");
});
