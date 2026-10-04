import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import en from "../../../languages/en.json";
import {
  clone,
  json,
  session,
} from "../../patient/resultsViewer/__tests__/reportFixtures";
import HisResultOutboxPanel from "./HisResultOutboxPanel";
const records = [
  {
    id: 1,
    businessId: "REPORT-001",
    eventType: "REPORT",
    status: "FAILED",
    attemptCount: 1,
    maxAttempts: 3,
    lastError: "endpoint unavailable",
    payloadHash: "1234567890abcdef",
  },
  {
    id: 2,
    businessId: "REPORT-002",
    eventType: "REPORT",
    status: "ACKNOWLEDGED",
    attemptCount: 1,
    maxAttempts: 3,
    responseCode: "AA",
    payloadHash: "abcdef1234567890",
  },
];
let current;
const fakeFetch = (handler) => {
  const fake = vi.fn((url, options) =>
    handler ? handler(String(url), options) : Promise.resolve(json(current)),
  );
  vi.stubGlobal("fetch", fake);
  return fake;
};
const view = () =>
  render(
    <IntlProvider locale="en" messages={en}>
      <UserSessionDetailsContext.Provider value={session}>
        <HisResultOutboxPanel />
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );
beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
  current = clone(records);
});
afterEach(() => vi.unstubAllGlobals());
it("shows only loaded-message metrics and keeps simulation tools folded", async () => {
  fakeFetch();
  view();
  expect(await screen.findByText("REPORT-001")).toBeVisible();
  expect(screen.getByText("endpoint unavailable")).toBeVisible();
  expect(screen.getByText("1234567890ab")).toBeVisible();
  expect(screen.getByText(en["his.outbox.loadedScope"])).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Simulation tools" }),
  ).toHaveAttribute("aria-expanded", "false");
});
it("creates an explicitly simulated message only after opening the tools", async () => {
  const fake = fakeFetch(async (_url, options) => {
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      expect(body.sourceSystem).toBe("HIS-SIM");
      expect(body.outcome).toBe("ACKNOWLEDGED");
      return json({
        ...records[1],
        id: 9,
        idempotencyKey: body.idempotencyKey,
      });
    }
    return json(current);
  });
  view();
  await screen.findByText("REPORT-001");
  fireEvent.click(screen.getByRole("button", { name: "Simulation tools" }));
  expect(screen.getByText(en["his.outbox.simulationHelp"])).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Simulate accepted receipt" }),
  );
  await screen.findByText(en["his.outbox.actionSucceeded"]);
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(1);
});
it("requeues a failed message with a stable response identity", async () => {
  const fake = fakeFetch(async (url, options) => {
    if (options.method === "PUT") {
      expect(url).toContain("/1/retry");
      current[0] = { ...current[0], status: "PENDING" };
      return json(current[0]);
    }
    return json(current);
  });
  view();
  await screen.findByText("REPORT-001");
  fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
  await screen.findByText(en["his.outbox.actionSucceeded"]);
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "PUT"),
  ).toHaveLength(1);
});
it("closes in a themed modal, requires a reason, and cancels without mutation", async () => {
  const fake = fakeFetch();
  view();
  await screen.findByText("REPORT-001");
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
  expect(screen.getByRole("dialog")).toHaveClass("cds--modal-container");
  expect(document.querySelector(".oe-admin-modal")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Confirm close" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Close reason"), {
    target: { value: "Retained reason" },
  });
  expect(screen.getByRole("button", { name: "Confirm close" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.querySelector(".oe-admin-modal")).not.toHaveClass(
    "is-visible",
  );
  expect(fake.mock.calls.some(([, options]) => options.method !== "GET")).toBe(
    false,
  );
});
it("retains a rejected close reason and action error across a successful ledger refresh", async () => {
  fakeFetch(async (_url, options) =>
    options.method === "PUT"
      ? json({ error: "FORBIDDEN" }, 403)
      : json(current),
  );
  view();
  await screen.findByText("REPORT-001");
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
  fireEvent.change(screen.getByLabelText("Close reason"), {
    target: { value: "Retained reason" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm close" }));
  await waitFor(() =>
    expect(
      screen.getAllByText(en["his.outbox.actionError"]).length,
    ).toBeGreaterThan(0),
  );
  expect(screen.getByLabelText("Close reason")).toHaveValue("Retained reason");
  expect(screen.getByRole("button", { name: "Confirm close" })).toBeEnabled();
});
it("ignores an older status-query response instead of replacing the latest filter", async () => {
  let older, newer;
  fakeFetch(
    (_url, _options) =>
      new Promise((resolve) => {
        if (!older) older = resolve;
        else newer = resolve;
      }),
  );
  view();
  fireEvent.change(screen.getByLabelText("Status filter"), {
    target: { value: "FAILED" },
  });
  newer(json([{ ...records[0], businessId: "LATEST-FILTER" }]));
  await screen.findByText("LATEST-FILTER");
  older(json([{ ...records[1], businessId: "STALE-ALL" }]));
  await waitFor(() => expect(screen.queryByText("STALE-ALL")).toBeNull());
  expect(screen.getByText("LATEST-FILTER")).toBeVisible();
});
it("locks outstanding actions, preserves close reason, and prevents duplicate writes", async () => {
  let complete;
  const fake = fakeFetch((_url, options) =>
    options.method === "PUT"
      ? new Promise((resolve) => {
          complete = () => resolve(json({ ...records[0], status: "CLOSED" }));
        })
      : Promise.resolve(json(current)),
  );
  view();
  await screen.findByText("REPORT-001");
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);
  fireEvent.change(screen.getByLabelText("Close reason"), {
    target: { value: "HIS order withdrawn" },
  });
  const confirm = screen.getByRole("button", { name: "Confirm close" });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(screen.getByLabelText("Close reason")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("dialog")).toBeVisible();
  complete();
  await waitFor(() =>
    expect(document.querySelector(".oe-admin-modal")).not.toHaveClass(
      "is-visible",
    ),
  );
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "PUT"),
  ).toHaveLength(1);
});
it("keeps an uncertain operation blocked after read refresh and remount", async () => {
  const fake = fakeFetch(async (_url, options) => {
    if (options.method === "PUT") throw new TypeError("lost reply");
    return json(current);
  });
  const first = view();
  await screen.findByText("REPORT-001");
  fireEvent.click(screen.getAllByRole("button", { name: "Retry" })[0]);
  await waitFor(() =>
    expect(
      screen.getAllByText(en["his.outbox.unknown"]).length,
    ).toBeGreaterThan(0),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Refresh ledger" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh ledger" }));
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Retry" })[0]).toBeDisabled(),
  );
  first.unmount();
  view();
  await screen.findByText("REPORT-001");
  expect(screen.getAllByRole("button", { name: "Retry" })[0]).toBeDisabled();
  expect(
    fake.mock.calls.filter(([, options]) => options.method === "PUT"),
  ).toHaveLength(1);
});
