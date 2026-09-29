import {
  buildPropertyRows,
  getPropertyCategory,
  paginatePropertyRows,
} from "./CommonProperties";

test("classifies settings, hides sensitive values, and paginates the visible list", () => {
  const rows = buildPropertyRows({
    "org.openelisglobal.login.saml": "true",
    "org.openelisglobal.remote.source.uri": "https://example.test/fhir",
    "org.openelisglobal.remote.source.username": "integration-user",
    "org.openelisglobal.paging.results.pageSize": "50",
  });

  expect(getPropertyCategory("login.saml")).toBe("authentication");
  expect(
    rows.find((row) => row.name === "remote.source.username"),
  ).toMatchObject({
    value: "••••••••",
    sensitive: true,
    category: "integration",
  });
  expect(paginatePropertyRows(rows, 2, 2)).toEqual(rows.slice(2, 4));
});
