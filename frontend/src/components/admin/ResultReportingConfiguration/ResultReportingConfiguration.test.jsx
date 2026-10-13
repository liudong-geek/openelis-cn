import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { Router, useLocation } from "react-router-dom";
import { createMemoryHistory } from "history";
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
    <>
      <output data-testid="location">
        {location.pathname}
        {location.search}
      </output>
      <output data-testid="location-state">
        {JSON.stringify(location.state)}
      </output>
    </>
  );
}
const view = (route = "/MasterListsPage/resultReportingConfiguration") => {
  const history = createMemoryHistory({ initialEntries: [route] });
  const tree = (currentSession) => (
    <IntlProvider locale="en" messages={en}>
      <UserSessionDetailsContext.Provider value={currentSession}>
        <Router history={history}>
          <ResultReportingConfiguration />
          <Location />
        </Router>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  );
  const result = render(tree(session));
  return {
    ...result,
    history,
    changeSession: (next) => result.rerender(tree(next)),
  };
};
beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
  current = clone(form);
});
afterEach(() => vi.unstubAllGlobals());
const urlField = () => document.getElementById("url-0");
const save = () => screen.getByRole("button", { name: "Save" });
const cancel = () => screen.getByRole("button", { name: "Cancel" });
const changeSection = (value) =>
  fireEvent.change(screen.getByLabelText("Configuration category"), {
    target: { value },
  });
const requests = (fake, path, method = "GET") =>
  fake.mock.calls.filter(
    ([url, options]) => String(url).includes(path) && options.method === method,
  );
it("defaults to channels, displays translated titles and retains original opaque URL and minute", async () => {
  const fake = fetcher();
  view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  expect(urlField()).toHaveValue("disable");
  expect(screen.getByText(/14:37/)).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Report grouping configuration" }),
  ).toBeNull();
  expect(save()).toBeDisabled();
  expect(fake).toHaveBeenCalledTimes(1);
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(1);
});
it("switches section through URL without losing channel edits or duplicating writes", async () => {
  const fake = fetcher();
  view({
    pathname: "/admin/resultReportingConfiguration",
    search: "?context=retained",
    state: { returnTo: "configuration-list" },
  });
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), { target: { value: "unsaved" } });
  fireEvent.change(screen.getByLabelText("Configuration category"), {
    target: { value: "groups" },
  });
  expect(screen.getByTestId("location").textContent).toBe(
    "/admin/resultReportingConfiguration?context=retained&section=groups",
  );
  expect(screen.getByTestId("location-state").textContent).toBe(
    JSON.stringify({ returnTo: "configuration-list" }),
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
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(1);
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
  changeSection("groups");
  await screen.findByLabelText("Group name");
  changeSection("channels");
  expect(urlField()).toHaveValue("https://example.org/new");
  expect(urlField()).toBeDisabled();
  expect(save()).toBeDisabled();
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(1);
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

it.each(["groups", "operations"])(
  "direct %s entry loads only that section",
  async (section) => {
    const fake = fetcher();
    view(`/admin/resultReportingConfiguration?section=${section}&context=keep`);
    if (section === "groups") {
      await screen.findByLabelText("Group name");
      expect(requests(fake, "/test-list")).toHaveLength(1);
      expect(requests(fake, "/group-rules")).toHaveLength(1);
      expect(requests(fake, "/his-result-outbox")).toHaveLength(0);
    } else {
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: en["his.outbox.reload"] }),
        ).toBeEnabled(),
      );
      expect(requests(fake, "/his-result-outbox")).toHaveLength(1);
      expect(requests(fake, "/test-list")).toHaveLength(0);
      expect(requests(fake, "/group-rules")).toHaveLength(0);
    }
    expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(0);
    expect(urlField()).toBeNull();
    expect(screen.getByLabelText("Configuration category")).toHaveValue(
      section,
    );
  },
);

it("uses channels for an invalid section without loading other sections", async () => {
  const fake = fetcher();
  view("/MasterListsPage/resultReportingConfiguration?section=unknown");
  await screen.findByRole("heading", { name: "Result report delivery" });
  expect(screen.getByLabelText("Configuration category")).toHaveValue(
    "channels",
  );
  expect(fake).toHaveBeenCalledTimes(1);
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(1);
});

it("keeps grouping edits when navigating through browser history and loads each section once", async () => {
  const fake = fetcher();
  const { history } = view(
    "/admin/resultReportingConfiguration?section=groups",
  );
  fireEvent.change(await screen.findByLabelText("Group name"), {
    target: { value: "Unsaved grouping" },
  });
  act(() =>
    history.push("/admin/resultReportingConfiguration?section=channels"),
  );
  await screen.findByRole("heading", { name: "Result report delivery" });
  act(() => history.goBack());
  expect(screen.getByLabelText("Group name")).toHaveValue("Unsaved grouping");
  expect(screen.getByLabelText("Group name")).toBeVisible();
  expect(urlField()).not.toBeVisible();
  expect(requests(fake, "/test-list")).toHaveLength(1);
  expect(requests(fake, "/group-rules")).toHaveLength(1);
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(1);
  expect(requests(fake, "/his-result-outbox")).toHaveLength(0);
});

it("keeps an unknown grouping save locked across section changes and verifies it without resending", async () => {
  let savedRules = clone(rules);
  const fake = vi.fn(async (url, options) => {
    const path = String(url);
    if (path.endsWith("/test-list"))
      return json([{ id: "90", value: "Glucose" }]);
    if (path.endsWith("/group-rules")) {
      if (options.method === "PUT") {
        savedRules = {
          ruleVersion: "v2",
          groups: JSON.parse(options.body).groups,
        };
        throw new TypeError("lost grouping reply");
      }
      return json(savedRules);
    }
    if (path.includes("/his-result-outbox")) return json([]);
    throw new Error(path);
  });
  vi.stubGlobal("fetch", fake);
  view("/admin/resultReportingConfiguration?section=groups");
  fireEvent.change(await screen.findByLabelText("Group name"), {
    target: { value: "Pending grouping" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save report grouping" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Read current grouping" }),
    ).toBeEnabled(),
  );
  changeSection("operations");
  changeSection("groups");
  expect(screen.getByLabelText("Group name")).toHaveValue("Pending grouping");
  expect(
    screen.getByRole("button", { name: "Save report grouping" }),
  ).toBeDisabled();
  expect(requests(fake, "/group-rules")).toHaveLength(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Read current grouping" }),
  );
  await screen.findByText(en["report.groups.saved"]);
  expect(requests(fake, "/group-rules", "PUT")).toHaveLength(1);
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(0);
});

it("resets visited sections for a new session and ignores the old session's late channel save", async () => {
  let complete;
  const fake = fetcher((options) =>
    options.method === "POST"
      ? new Promise((resolve) => {
          const submitted = JSON.parse(options.body);
          complete = () => resolve(json(submitted));
        })
      : json(current),
  );
  const { changeSession } = view();
  await screen.findByRole("heading", { name: "Result report delivery" });
  fireEvent.change(urlField(), { target: { value: "Old session draft" } });
  fireEvent.click(save());
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  changeSection("groups");
  await screen.findByLabelText("Group name");
  const nextSession = clone(session);
  nextSession.userSessionDetails.sessionId = "replacement-session";
  changeSession(nextSession);
  await screen.findByLabelText("Group name");
  expect(urlField()).toBeNull();
  expect(requests(fake, "/test-list")).toHaveLength(2);
  await act(async () => complete());
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(1);
  expect(screen.queryByText(en["resultreporting.channels.saved"])).toBeNull();
  changeSection("channels");
  await screen.findByRole("heading", { name: "Result report delivery" });
  expect(urlField()).toHaveValue("disable");
  expect(urlField()).toBeEnabled();
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(2);
  expect(requests(fake, "/ResultReportingConfiguration", "POST")).toHaveLength(
    1,
  );
});

it("does not mount any section for an unauthorized account after a session change", async () => {
  const fake = fetcher();
  const { changeSession } = view(
    "/admin/resultReportingConfiguration?section=groups",
  );
  await screen.findByLabelText("Group name");
  const nextSession = clone(session);
  nextSession.userSessionDetails.roles = ["Reports"];
  changeSession(nextSession);
  expect(screen.getByText(en["resultreporting.adminOnly"])).toBeVisible();
  changeSection("channels");
  expect(urlField()).toBeNull();
  expect(requests(fake, "/ResultReportingConfiguration")).toHaveLength(0);
});
