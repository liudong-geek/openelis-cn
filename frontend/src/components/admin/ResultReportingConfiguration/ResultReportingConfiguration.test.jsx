import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import en from "../../../languages/en.json";
import {
  clone,
  json,
  rules,
  session,
} from "../../patient/resultsViewer/__tests__/reportFixtures";
import ResultReportingConfiguration from "./ResultReportingConfiguration";
const form = {
  reports: [
    {
      enabledId: "11",
      urlId: "12",
      enabled: "disable",
      url: "disable",
      title: "Result Reporting",
      connectionTestIdentifier: "resultReport",
      isScheduled: true,
      schedulerId: "13",
      scheduleHours: "14",
      scheduleMin: "37",
      showBacklog: true,
      backlogSize: "0",
    },
  ],
  hourList: [],
  minList: [],
  formName: "ResultReportingConfigurationForm",
};
let current;
const fetcher = (handler) => {
  const fake = vi.fn(async (url, options) => {
    const path = String(url);
    if (path.includes("/ResultReportingConfiguration"))
      return handler ? handler(options) : json(current);
    if (path.endsWith("/test-list"))
      return json([{ id: "90", value: "Glucose" }]);
    if (path.endsWith("/group-rules")) return json(rules);
    if (path.includes("/his-result-outbox")) return json([]);
    throw new Error(path);
  });
  vi.stubGlobal("fetch", fake);
  return fake;
};
function Location() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}
const view = (route = "/MasterListsPage/resultReportingConfiguration") =>
  render(
    <IntlProvider locale="en" messages={en}>
      <UserSessionDetailsContext.Provider value={session}>
        <MemoryRouter initialEntries={[route]}>
          <ResultReportingConfiguration />
          <Location />
        </MemoryRouter>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );
beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
  current = clone(form);
});
afterEach(() => vi.unstubAllGlobals());
const urlField = () => document.getElementById("url-0");
const save = () => screen.getByRole("button", { name: "Save" });
const cancel = () => screen.getByRole("button", { name: "Cancel" });
it("defaults to channels, displays translated titles and retains original opaque URL and minute", async () => {
  fetcher();
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  expect(urlField()).toHaveValue("disable");
  expect(screen.getByText(/14:37/)).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Report grouping configuration" }),
  ).toBeNull();
  expect(save()).toBeDisabled();
});
it("switches section through URL without losing channel edits or duplicating writes", async () => {
  const fake = fetcher();
  view("/admin/resultReportingConfiguration?context=retained");
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), { target: { value: "unsaved" } });
  fireEvent.change(screen.getByLabelText("Configuration category"), {
    target: { value: "groups" },
  });
  expect(screen.getByTestId("location").textContent).toBe(
    "/admin/resultReportingConfiguration?context=retained&section=groups",
  );
  fireEvent.change(screen.getByLabelText("Configuration category"), {
    target: { value: "channels" },
  });
  expect(urlField()).toHaveValue("unsaved");
  fireEvent.click(cancel());
  expect(urlField()).toHaveValue("disable");
  expect(fake.mock.calls.some(([, options]) => options.method !== "GET")).toBe(
    false,
  );
});
it("rejects HTTP 400 error objects while preserving the draft", async () => {
  fetcher(async (options) =>
    options.method === "POST"
      ? json({ ...current, error: "INVALID" }, 400)
      : json(current),
  );
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), { target: { value: "bad URL" } });
  fireEvent.click(save());
  await screen.findByText(en["resultreporting.channels.rejected"]);
  expect(urlField()).toHaveValue("bad URL");
  expect(urlField()).toBeEnabled();
  expect(save()).toBeEnabled();
  expect(screen.queryByText(en["resultreporting.channels.saved"])).toBeNull();
});
it("does not treat a 200 echoed draft as success when GET does not match", async () => {
  const fake = fetcher(async (options) =>
    options.method === "POST" ? json(JSON.parse(options.body)) : json(current),
  );
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), {
    target: { value: "https://example.org/new" },
  });
  fireEvent.click(save());
  await waitFor(() =>
    expect(
      screen.getAllByText(en["resultreporting.channels.unknown"]).length,
    ).toBe(1),
  );
  expect(urlField()).toHaveValue("https://example.org/new");
  expect(save()).toBeDisabled();
  expect(cancel()).toBeDisabled();
  const readsBefore = fake.mock.calls.filter(
    ([url, options]) =>
      String(url).includes("ResultReportingConfiguration") &&
      options.method === "GET",
  ).length;
  fireEvent.click(
    screen.getByRole("button", { name: "Read current settings" }),
  );
  await waitFor(() =>
    expect(
      fake.mock.calls.filter(
        ([url, options]) =>
          String(url).includes("ResultReportingConfiguration") &&
          options.method === "GET",
      ).length,
    ).toBeGreaterThan(readsBefore),
  );
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
});
it("verifies a lost reply using only GET and unblocks after exact identity/value confirmation", async () => {
  const fake = fetcher(async (options) => {
    if (options.method === "POST") {
      current = JSON.parse(options.body);
      throw new TypeError("lost reply");
    }
    return json(current);
  });
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), {
    target: { value: "https://example.org/new" },
  });
  fireEvent.click(save());
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Read current settings" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Read current settings" }),
  );
  await screen.findByText(en["resultreporting.channels.saved"]);
  expect(urlField()).toBeEnabled();
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
  expect(current.reports[0].scheduleMin).toBe("37");
});
it("locks all editable fields and cancellation during one outstanding save", async () => {
  let complete;
  const fake = fetcher((options) =>
    options.method === "POST"
      ? new Promise((resolve) => {
          current = JSON.parse(options.body);
          complete = () => resolve(json(current));
        })
      : json(current),
  );
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), {
    target: { value: "https://example.org/new" },
  });
  fireEvent.click(save());
  fireEvent.click(save());
  expect(urlField()).toBeDisabled();
  expect(cancel()).toBeDisabled();
  expect(document.getElementById("report-channel-0-enabled")).toBeDisabled();
  complete();
  await screen.findByText(en["resultreporting.channels.saved"]);
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
});
it("detects schedule drift and preserves full original payload", async () => {
  const fake = fetcher((options) => {
    if (options.method === "POST") {
      current = JSON.parse(options.body);
      current.reports[0].scheduleMin = "30";
      return json(current);
    }
    return json(current);
  });
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), {
    target: { value: "https://example.org/new" },
  });
  fireEvent.click(save());
  await waitFor(() => expect(save()).toBeDisabled());
  await waitFor(() =>
    expect(
      screen.getAllByText(en["resultreporting.channels.unknown"]).length,
    ).toBe(1),
  );
  const payload = JSON.parse(
    fake.mock.calls.find(([, options]) => options.method === "POST")[1].body,
  );
  expect(payload.reports[0]).toMatchObject({
    scheduleHours: "14",
    scheduleMin: "37",
    schedulerId: "13",
    enabledId: "11",
    urlId: "12",
  });
});
it("shows read failure with retry instead of zero-channel success", async () => {
  let fail = true;
  fetcher(() => (fail ? json({}, 500) : json(current)));
  view();
  await screen.findByText(en["resultreporting.channels.loadError"]);
  expect(
    document.querySelector(
      ".result-reporting-channels .result-reporting-workspace__summary",
    ),
  ).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Reload channels" }));
  await screen.findByRole("heading", { name: "Result report delivery" });
});
