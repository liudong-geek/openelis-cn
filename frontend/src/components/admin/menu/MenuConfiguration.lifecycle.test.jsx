import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import PatientMenuManagement from "./PatientMenuManagement";
import BillingMenuManagement from "./BillingMenuManagement";
import NonConformityMenuManagement from "./NonConformityMenuManagement";

// Keep the product adapters, Carbon, menu editing and transport real. Control
// only fetch timing; isolate the notification context from application startup.
vi.unmock("../../utils/Utils");
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return { NotificationContext: createContext({}) };
});

const adapters = [
  ["patient", "menu_patient", PatientMenuManagement],
  ["billing", "menu_billing", BillingMenuManagement],
  ["nonconformity", "menu_nonconformity", NonConformityMenuManagement],
];
let requests;
let states;
let notifications;
const menu = (id, active) => ({
  menu: {
    id: `lifecycle-${id}`,
    elementId: id,
    displayKey: "menu.patient.active",
    isActive: active,
    actionURL: "https://billing.example.test/original",
    lastupdated: "2026-10-10T10:00:00Z",
  },
  childMenus: [],
});
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const page = (Editor) => (
  <MemoryRouter>
    <IntlProvider locale="zh" messages={messages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: notifications,
        }}
      >
        <Editor
          embedded
          onEditorStateChange={(state) => states.push({ ...state })}
        />
      </NotificationContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const lastState = () => states.at(-1);
const settle = async (request, body, status) => {
  await act(async () => request.resolve(jsonResponse(body, status)));
};
const restore = async () => {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  await act(async () => window.dispatchEvent(event));
};

beforeEach(() => {
  requests = [];
  states = [];
  notifications = vi.fn();
  localStorage.setItem("CSRF", "synthetic-menu-lifecycle-token");
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      let resolve;
      let reject;
      const promise = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      requests.push({ url, options, resolve, reject });
      return promise;
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test.each(adapters)(
  "STD-01 %s preserves the submitted edit across a delayed real save",
  async (name, id, Editor) => {
    render(page(Editor));
    expect(requests).toHaveLength(1);
    await settle(requests[0], menu(id, false));
    const checkbox = screen.getByRole("checkbox");
    const submit = screen.getByRole("button", { name: "提交" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(checkbox);
    await waitFor(() => expect(lastState().dirty).toBe(true));
    fireEvent.click(submit);
    await waitFor(() => expect(requests).toHaveLength(2));
    const post = requests[1];
    expect(post.options.method).toBe("POST");
    expect(post.url).toContain(`/rest/menu/${id}`);
    expect(post.options.headers["X-CSRF-Token"]).toBe(
      "synthetic-menu-lifecycle-token",
    );
    const dispatched = JSON.parse(post.options.body);
    expect(dispatched).toEqual(menu(id, true));
    const editingLocked = checkbox.disabled;
    fireEvent.click(checkbox);
    const draftAfterLaterClick = checkbox.checked;
    if (name === "billing") {
      const url = screen.getByLabelText("计费URL");
      if (editingLocked) expect(url).toBeDisabled();
    }
    await settle(post, dispatched);
    await waitFor(() => expect(submit).toBeEnabled());
    console.log(
      "[LIS-MENU-LIFECYCLE]" +
        JSON.stringify({
          id: "STD-01",
          adapter: name,
          editingLocked,
          draftAfterLaterClick,
          returnedActive: checkbox.checked,
          returnedEditorState: lastState(),
        }),
    );
    expect(editingLocked || (!checkbox.checked && lastState().dirty)).toBe(
      true,
    );
    expect(
      requests.filter((request) => request.options.method === "POST"),
    ).toHaveLength(1);
  },
);

test.each(adapters)(
  "STD-02 %s reloads after GET cancellation and simulated persisted pageshow",
  async (name, id, Editor) => {
    render(page(Editor));
    const original = requests[0];
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(original.options.signal.aborted).toBe(true);
    await restore();
    await settle(original, menu(id, false));
    const reads = requests.filter(
      (request) => request.options.method === "GET",
    );
    console.log(
      "[LIS-MENU-LIFECYCLE]" +
        JSON.stringify({
          id: "STD-02",
          adapter: name,
          originalAborted: original.options.signal.aborted,
          getCountAfterSimulatedPersistedPageshow: reads.length,
          browserBfcacheAcceptance: false,
        }),
    );
    expect(reads).toHaveLength(2);
    await settle(reads[1], menu(id, true));
    expect(await screen.findByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled();
    expect(lastState()).toEqual({ dirty: false, busy: false });
  },
);

test.each(adapters)(
  "%s keeps a rejected save draft and its original version available for retry",
  async (_name, id, Editor) => {
    render(page(Editor));
    await settle(requests[0], menu(id, false));
    const checkbox = screen.getByRole("checkbox");
    const submit = screen.getByRole("button", { name: "提交" });
    fireEvent.click(checkbox);
    fireEvent.click(submit);
    await settle(requests[1], { error: "forbidden" }, 403);
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeEnabled();
    expect(submit).toBeEnabled();
    expect(lastState()).toEqual({ dirty: true, busy: false });
    expect(notifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" }),
    );
    expect(
      notifications.mock.calls.some(([notice]) => notice.kind === "success"),
    ).toBe(false);
    fireEvent.click(submit);
    expect(JSON.parse(requests[2].options.body)).toEqual(menu(id, true));
    await settle(requests[2], menu(id, true));
    expect(lastState()).toEqual({ dirty: false, busy: false });
  },
);

test.each(adapters)(
  "%s restores a dirty page without overwriting its draft or lastupdated",
  async (name, id, Editor) => {
    render(page(Editor));
    await settle(requests[0], menu(id, false));
    fireEvent.click(screen.getByRole("checkbox"));
    if (name === "billing") {
      fireEvent.change(screen.getByLabelText("计费URL"), {
        target: { value: "https://billing.example.test/draft" },
      });
    }
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await restore();
    const fresh = menu(id, false);
    fresh.menu.lastupdated = "2026-10-11T01:00:00Z";
    await settle(requests[1], fresh);
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(lastState()).toEqual({ dirty: true, busy: false });
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    const expected = menu(id, true);
    if (name === "billing")
      expected.menu.actionURL = "https://billing.example.test/draft";
    expect(JSON.parse(requests[2].options.body)).toEqual(expected);
    await settle(requests[2], expected);
  },
);

test.each(adapters)(
  "%s recovers a failed initial read through a fresh persisted pageshow",
  async (_name, id, Editor) => {
    render(page(Editor));
    await settle(requests[0], { error: "unavailable" }, 503);
    expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
    const unavailableControl = screen.queryByRole("checkbox");
    if (unavailableControl) expect(unavailableControl).toBeDisabled();
    expect(notifications).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" }),
    );
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    await restore();
    await settle(requests[1], menu(id, false));
    expect(await screen.findByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled();
  },
);

test.each(adapters)(
  "%s aborts an unmounted read and drops its late response",
  async (_name, id, Editor) => {
    const { unmount } = render(page(Editor));
    const original = requests[0];
    const stateCount = states.length;
    await act(async () => unmount());
    expect(original.options.signal.aborted).toBe(true);
    await settle(original, menu(id, false));
    expect(states).toHaveLength(stateCount);
    expect(notifications).not.toHaveBeenCalled();
  },
);

test.each(adapters)(
  "%s ignores an unmounted save without retrying or notifying a new editor",
  async (_name, id, Editor) => {
    const { unmount } = render(page(Editor));
    await settle(requests[0], menu(id, false));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    const post = requests[1];
    const stateCount = states.length;
    await act(async () => unmount());
    await settle(post, menu(id, true));
    expect(states).toHaveLength(stateCount);
    expect(notifications).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
  },
);

test.each([
  ["unreadable JSON", new Response("{broken", { status: 200 })],
  ["another menu ID", jsonResponse(menu("menu_billing", true))],
])(
  "a save with %s retains the patient's draft and releases saving",
  async (_name, response) => {
    render(page(PatientMenuManagement));
    await settle(requests[0], menu("menu_patient", false));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "提交" }));
    await act(async () => requests[1].resolve(response));
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByRole("button", { name: "提交" })).toBeEnabled();
    expect(lastState()).toEqual({ dirty: true, busy: false });
    expect(
      notifications.mock.calls.some(([notice]) => notice.kind === "success"),
    ).toBe(false);
  },
);

test("restoring a page during a pending POST fresh-reads without automatically retrying it", async () => {
  render(page(PatientMenuManagement));
  await settle(requests[0], menu("menu_patient", false));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "提交" }));
  const oldPost = requests[1];
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  await restore();
  await settle(requests[2], menu("menu_patient", false));
  await settle(oldPost, menu("menu_patient", true));
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(lastState()).toEqual({ dirty: true, busy: false });
  expect(notifications).not.toHaveBeenCalled();
  expect(requests.map((request) => request.options.method)).toEqual([
    "GET",
    "POST",
    "GET",
  ]);
});
