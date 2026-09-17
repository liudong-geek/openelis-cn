import React from "react";
import { waitFor } from "@testing-library/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import en from "../../../languages/en.json";
import ReportGroupingConfiguration from "./ReportGroupingConfiguration";
import {
  json,
  rules,
  session,
  clone,
} from "../../patient/resultsViewer/__tests__/reportFixtures";
function view(roles = session.userSessionDetails.roles) {
  return (
    <IntlProvider locale="en" messages={en}>
      <UserSessionDetailsContext.Provider
        value={{
          ...session,
          userSessionDetails: { ...session.userSessionDetails, roles },
        }}
      >
        <ReportGroupingConfiguration />
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
}
beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
});
afterEach(() => vi.unstubAllGlobals());
it("edits named tests and sends expected grouping version from existing configuration", async () => {
  let current = clone(rules);
  const fetcher = vi.fn(async (u: any, o: any) => {
    if (String(u).endsWith("/test-list"))
      return json([
        { id: "90", value: "Glucose" },
        { id: "91", value: "Albumin" },
      ]);
    if (o.method === "PUT") {
      const body = JSON.parse(o.body);
      expect(body.expectedRuleVersion).toBe("v1");
      current = { ruleVersion: "v2", groups: body.groups };
    }
    return json(current);
  });
  vi.stubGlobal("fetch", fetcher);
  render(view());
  fireEvent.click(await screen.findByLabelText("Albumin"));
  fireEvent.click(screen.getByRole("button", { name: "Save report grouping" }));
  await screen.findByText("Grouping rules saved and verified.");
  expect(fetcher.mock.calls.filter(([, o]) => o.method === "PUT")).toHaveLength(
    1,
  );
  expect(current.groups[0].testIds).toEqual(["90", "91"]);
});
it("does not expose configuration to a report-only account", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(view(["Reports"]));
  expect(
    screen.getByText("Report grouping can be configured by administrators."),
  ).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});
it("blocks duplicate group codes before sending a save", async () => {
  const fetcher = vi.fn(async (u: any) =>
    String(u).endsWith("/test-list")
      ? json([{ id: "90", value: "Glucose" }])
      : json(rules),
  );
  vi.stubGlobal("fetch", fetcher);
  render(view());
  await screen.findByLabelText("Glucose");
  fireEvent.click(screen.getByRole("button", { name: "Add group" }));
  fireEvent.click(screen.getByRole("button", { name: "Save report grouping" }));
  await screen.findByText(
    "Use unique group codes, names and at least one test per group.",
  );
  expect(fetcher.mock.calls.some(([, o]: any) => o?.method === "PUT")).toBe(
    false,
  );
});
it("cannot resubmit an unknown configuration save after reload", async () => {
  const fetcher = vi.fn(async (u: any, o: any) => {
    if (o.method === "PUT") throw new TypeError("lost");
    return String(u).endsWith("/test-list")
      ? json([{ id: "90", value: "Glucose" }])
      : json(rules);
  });
  vi.stubGlobal("fetch", fetcher);
  render(view());
  await screen.findByLabelText("Glucose");
  fireEvent.click(screen.getByRole("button", { name: "Save report grouping" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Reload grouping rules" }),
    ).not.toBeDisabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Reload grouping rules" }),
  );
  await screen.findByLabelText("Glucose");
  expect(
    screen.getByRole("button", { name: "Save report grouping" }),
  ).toBeDisabled();
  expect(fetcher.mock.calls.filter(([, o]) => o.method === "PUT")).toHaveLength(
    1,
  );
});

it("initializes only through null expected version after unconfigured response", async () => {
  let current: any = null;
  const fetcher = vi.fn(async (u: any, o: any) => {
    if (String(u).endsWith("/test-list"))
      return json([{ id: "90", value: "Glucose" }]);
    if (o.method === "PUT") {
      const body = JSON.parse(o.body);
      expect(body.expectedRuleVersion).toBeNull();
      current = { ruleVersion: "v1", groups: body.groups };
    }
    return current ? json(current) : json({}, 409);
  });
  vi.stubGlobal("fetch", fetcher);
  render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "Start initial configuration" }),
  );
  fireEvent.change(screen.getByLabelText("Group code"), {
    target: { value: "chemistry" },
  });
  fireEvent.change(screen.getByLabelText("Group name"), {
    target: { value: "Biochemistry" },
  });
  fireEvent.click(screen.getByLabelText("Glucose"));
  fireEvent.click(screen.getByRole("button", { name: "Save report grouping" }));
  await screen.findByText("Grouping rules saved and verified.");
});
