import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import messages from "../../../languages/zh.json";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { NotificationContext } from "../../layout/Layout";
import StudyMenuManagement from "./StudyMenuManagement";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
  Roles: { GLOBAL_ADMIN: "Global Administrator" },
}));
const details = (id = "administrator") => ({
  authenticated: true,
  userId: id,
  sessionId: `${id}-session`,
  roles: ["Global Administrator"],
  loginLabUnit: "生化",
  userLabRolesMap: { 生化: ["Reception"] },
});
const notification = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};
const view = (owner = details()) => (
  <MemoryRouter>
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider value={{ userSessionDetails: owner }}>
        <NotificationContext.Provider value={notification}>
          <StudyMenuManagement />
        </NotificationContext.Provider>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>
  </MemoryRouter>
);
const reads = () =>
  mocks.get.mock.calls.map(([url, callback, signal]) => ({
    url,
    callback,
    signal,
  }));
const dto = (url, active = true) => ({
  menu: {
    elementId: url.split("/").at(-1),
    displayKey: "menu.study.title",
    actionURL: `/existing/${url.split("/").at(-1)}`,
    isActive: active,
  },
  childMenus: [],
});
const load = async (requests, active = true) => {
  const values = requests.map((request, index) =>
    dto(request.url, typeof active === "function" ? active(index) : active),
  );
  await act(async () =>
    requests.forEach((request, index) => request.callback(values[index])),
  );
  return values;
};
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  notification.addNotification.mockClear();
});
test("waits for all twelve exact real menu reads and forbids early save", async () => {
  const { container } = render(view());
  const requests = reads();
  expect(requests).toHaveLength(12);
  expect(new Set(requests.map((request) => request.url)).size).toBe(12);
  expect(
    requests.every(
      (request) =>
        request.url.startsWith("/rest/admin/menu/") &&
        request.signal instanceof AbortSignal,
    ),
  ).toBe(true);
  await load(requests.slice(0, 11));
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  expect(container.querySelector("#menu_study_checkbox")).toBeNull();
  await load(requests.slice(11));
  expect(screen.getByRole("button", { name: "提交" })).toBeEnabled();
  expect(container.querySelector("#menu_study_checkbox")).toBeChecked();
  expect(mocks.post).not.toHaveBeenCalled();
  expect(screen.getByRole("switch", { name: "显示配置项" })).toBeVisible();
  expect(container.querySelector("form.study-menu-editor")).not.toBeNull();
});
test("wrong real identity or current read failure keeps the editor unsavable", async () => {
  render(view());
  const requests = reads();
  await load(requests.slice(0, 11));
  await act(async () =>
    requests[11].callback({
      ...dto(requests[11].url),
      menu: { elementId: "wrong", isActive: true },
    }),
  );
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  expect(screen.getByText(messages["server.error.msg"])).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
});
test("uses all twelve flags for a mixed virtual root rather than the first child", async () => {
  const { container } = render(view());
  const requests = reads();
  await load(requests, (index) => index === 0);
  const root = container.querySelector("#menu_study_checkbox");
  expect(root).not.toBeChecked();
  expect(root.indeterminate).toBe(true);
  expect(screen.getByText("已启用 1 / 12 项")).toBeVisible();
  expect(
    screen.getByText(messages["menu.study.configuration.scope"]),
  ).toBeVisible();
});
test("natural root ON and OFF submit the same twelve records and original action URLs", async () => {
  const { container } = render(view());
  const loaded = await load(reads(), false);
  const expected = loaded.map((value) => ({
    id: value.menu.elementId,
    actionURL: value.menu.actionURL,
  }));
  mocks.post.mockImplementation((_url, payload, callback) =>
    callback({ status: 200, json: async () => JSON.parse(payload) }),
  );
  await act(async () =>
    fireEvent.click(
      container.querySelector("label[for='menu_study_checkbox']"),
    ),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "提交" })),
  );
  const on = JSON.parse(mocks.post.mock.calls[0][1]);
  expect(mocks.post.mock.calls[0][0]).toBe("/rest/menu/");
  expect(on).toHaveLength(12);
  expect(
    on.map((value) => ({
      id: value.menu.elementId,
      actionURL: value.menu.actionURL,
    })),
  ).toEqual(expected);
  expect(on.every((value) => value.menu.isActive === true)).toBe(true);
  await act(async () =>
    fireEvent.click(
      container.querySelector("label[for='menu_study_checkbox']"),
    ),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "提交" })),
  );
  const off = JSON.parse(mocks.post.mock.calls[1][1]);
  expect(
    off.map((value) => ({
      id: value.menu.elementId,
      actionURL: value.menu.actionURL,
    })),
  ).toEqual(expected);
  expect(off.every((value) => value.menu.isActive === false)).toBe(true);
  expect(container.querySelector("#menu_study_checkbox")).not.toBeChecked();
});
test("late reads from a replaced real session owner do not populate the new editor", async () => {
  const rendered = render(view());
  const oldReads = reads();
  rendered.rerender(view(details("different-administrator")));
  const newReads = reads().slice(12);
  expect(oldReads.every((request) => request.signal.aborted)).toBe(true);
  await load(oldReads, true);
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  await load(newReads, false);
  expect(
    rendered.container.querySelector("#menu_study_checkbox"),
  ).not.toBeChecked();
});
test("actual unmount aborts its own twelve-read generation", async () => {
  const rendered = render(view());
  const requested = reads();
  await act(async () => rendered.unmount());
  expect(requested.every((request) => request.signal.aborted)).toBe(true);
  await load(requested);
  expect(mocks.post).not.toHaveBeenCalled();
});
test("incomplete pagehide reads are cancelled and BFCache pageshow starts real reads anew", async () => {
  render(view());
  const requested = reads();
  await load(requested.slice(0, 3));
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(requested.every((request) => request.signal.aborted)).toBe(true);
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true });
  await act(async () => window.dispatchEvent(event));
  expect(reads()).toHaveLength(24);
  await load(reads().slice(12), false);
  expect(screen.getByRole("button", { name: "提交" })).toBeEnabled();
});
test("a malformed successful save response keeps the draft and reports a real failure", async () => {
  const { container } = render(view());
  await load(reads(), false);
  await act(async () =>
    fireEvent.click(
      container.querySelector("label[for='menu_study_checkbox']"),
    ),
  );
  mocks.post.mockImplementation((_url, _payload, callback) =>
    callback({ status: 200, json: async () => [] }),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "提交" })),
  );
  expect(container.querySelector("#menu_study_checkbox")).toBeChecked();
  expect(notification.addNotification).toHaveBeenLastCalledWith(
    expect.objectContaining({ kind: "error" }),
  );
});
