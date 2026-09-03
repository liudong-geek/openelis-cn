import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const visibleChinaRoutes = [
  "components/modifyOrder/SearchOrder.jsx",
  "components/batchOrderEntry/SampleBatchEntry.jsx",
  "components/validation/Validation.jsx",
  "components/reports/routine/Index.jsx",
  "components/reports/auditTrailReport/Index.jsx",
  "components/shipment/AddToBoxModal.jsx",
  "components/analyzers/FieldMapping/CopyMappingsModal.jsx",
  "components/layout/search/searchOutput.tsx",
  "components/layout/search/searchService.ts",
];

test.each(visibleChinaRoutes)(
  "%s uses client-side routing for internal application links",
  (file) => {
    const source = readFileSync(`${process.cwd()}/src/${file}`, "utf8");
    expect(source).not.toMatch(/window\.location\.(?:href|assign|replace)/);
  },
);

const intentionalBrowserNavigation = new Set([
  "App.jsx",
  "RedirectOldUI.jsx",
  "components/ChangePassword.jsx",
  "components/Login.jsx",
  "components/common/RouteErrorBoundary.jsx",
  "components/home/LandingPage.tsx",
  "components/patient/resultsViewer/commons/framework/navigation/navigate.ts",
  "components/security/SecureRoute.jsx",
  "components/utils/Utils.ts",
]);

const sourceRoot = `${process.cwd()}/src`;
const sourceExtensions = /\.(?:js|jsx|ts|tsx)$/;

const listProductionSourceFiles = (directory) =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) {
      return listProductionSourceFiles(fullPath);
    }
    const relativePath = relative(sourceRoot, fullPath);
    if (
      !sourceExtensions.test(entry) ||
      /\.(?:test|spec)\.[jt]sx?$/.test(entry) ||
      / 2\.[jt]sx?$/.test(entry)
    ) {
      return [];
    }
    return [relativePath];
  });

test("production pages do not reload the browser for in-app actions", () => {
  const offendingFiles = listProductionSourceFiles(sourceRoot).filter(
    (file) => {
      if (intentionalBrowserNavigation.has(file)) {
        return false;
      }
      const source = readFileSync(join(sourceRoot, file), "utf8");
      return /window\.location\.(?:href\s*=|assign\s*\(|replace\s*\(|reload\s*\()/.test(
        source,
      );
    },
  );

  expect(offendingFiles).toEqual([]);
});
