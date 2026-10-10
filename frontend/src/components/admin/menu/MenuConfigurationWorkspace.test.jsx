import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { beforeEach, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import MenuConfigurationWorkspace from "./MenuConfigurationWorkspace";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
}));
const notification = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};
const item = (id, active = true) => ({
  menu: {
    elementId: id,
    displayKey: "menu.patient.title",
    isActive: active,
    actionURL: "/PatientManagement",
  },
  childMenus: [],
});
const renderWorkspace = () => {
  const history = createMemoryHistory({
    initialEntries: ["/MasterListsPage/menuConfiguration"],
  });
  return {
    ...render(
      <Router history={history}>
        <IntlProvider locale="zh" messages={messages}>
          <NotificationContext.Provider value={notification}>
            <MenuConfigurationWorkspace />
          </NotificationContext.Provider>
        </IntlProvider>
      </Router>,
    ),
    history,
  };
};
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/menu") callback([item("menu_patient")]);
    else callback(item(url.split("/").at(-1)));
  });
});
const select = (id) =>
  fireEvent.change(screen.getByLabelText("配置类别"), {
    target: { value: id },
  });
test("opens a working menu list with five real categories and one title", async () => {
  const { container } = renderWorkspace();
  expect(
    screen.getByRole("heading", { name: "菜单配置", level: 1 }),
  ).toBeVisible();
  expect(
    within(screen.getByLabelText("配置类别")).getAllByRole("option"),
  ).toHaveLength(5);
  expect(container.querySelectorAll(".oe-page-header h1")).toHaveLength(1);
  expect(
    await screen.findByRole("checkbox", { name: "患者菜单管理" }),
  ).toBeVisible();
  expect(mocks.get).toHaveBeenCalledWith("/rest/menu", expect.any(Function));
});
test.each([
  ["patient", "menu_patient"],
  ["nonconformity", "menu_nonconformity"],
])(
  "keeps %s writes on the exact existing menu resource and reopens its persisted response",
  async (category, id) => {
    const { container, history } = renderWorkspace();
    select(category);
    expect(mocks.get).toHaveBeenCalledWith(
      `/rest/admin/menu/${id}`,
      expect.any(Function),
    );
    fireEvent.click(container.querySelector(`#${id}_checkbox`));
    const persisted = item(id, false);
    mocks.post.mockImplementation((url, payload, callback) =>
      callback({ status: 200, json: async () => persisted }),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "提交" })),
    );
    expect(mocks.post).toHaveBeenCalledWith(
      `/rest/menu/${id}`,
      JSON.stringify(persisted),
      expect.any(Function),
    );
    expect(container.querySelector(`#${id}_checkbox`)).not.toBeChecked();
    select("global");
    select(category);
    expect(
      mocks.get.mock.calls.filter(([url]) => url === `/rest/admin/menu/${id}`),
    ).toHaveLength(2);
    expect(history.location.pathname).toBe(
      "/MasterListsPage/menuConfiguration",
    );
  },
);
test("preserves unsaved menu changes when category switching is cancelled", async () => {
  const { container } = renderWorkspace();
  select("patient");
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  select("billing");
  expect(screen.getByText("存在未保存的修改")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "保留编辑" }));
  expect(screen.getByLabelText("配置类别")).toHaveValue("patient");
  expect(container.querySelector("#menu_patient_checkbox")).not.toBeChecked();
  expect(mocks.post).not.toHaveBeenCalled();
  select("billing");
  fireEvent.click(
    await screen.findByRole("button", { name: "danger 放弃修改并继续" }),
  );
  expect(screen.getByLabelText("配置类别")).toHaveValue("billing");
});
test("guards a real return navigation and cancelled return leaves the draft in place", async () => {
  const { container, history } = renderWorkspace();
  select("patient");
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  act(() => history.push("/MasterListsPage/userManagement"));
  expect(history.location.pathname).toBe("/MasterListsPage/menuConfiguration");
  fireEvent.click(screen.getByRole("button", { name: "保留编辑" }));
  expect(container.querySelector("#menu_patient_checkbox")).not.toBeChecked();
  act(() => history.push("/MasterListsPage/userManagement"));
  fireEvent.click(
    await screen.findByRole("button", { name: "danger 放弃修改并继续" }),
  );
  expect(history.location.pathname).toBe("/MasterListsPage/userManagement");
  expect(mocks.post).not.toHaveBeenCalled();
});
test("keeps the billing URL and activation in the original nested DTO", async () => {
  renderWorkspace();
  select("billing");
  fireEvent.change(screen.getByLabelText("计费URL"), {
    target: { value: "https://billing.example.test/entry" },
  });
  fireEvent.click(screen.getByLabelText("计费菜单活跃"));
  mocks.post.mockImplementation((url, payload, callback) =>
    callback({ status: 200, json: async () => JSON.parse(payload) }),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "提交" })),
  );
  const [url, raw] = mocks.post.mock.calls[0];
  expect(url).toBe("/rest/menu/menu_billing");
  expect(JSON.parse(raw)).toEqual({
    ...item("menu_billing", false),
    menu: {
      ...item("menu_billing", false).menu,
      actionURL: "https://billing.example.test/entry",
    },
  });
  expect(JSON.parse(raw).menu.actionURL).toBe(
    "https://billing.example.test/entry",
  );
});
test("a rejected menu save keeps the draft and blocks navigation while submitting", async () => {
  const { container, history } = renderWorkspace();
  select("patient");
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  let response;
  mocks.post.mockImplementation((url, payload, callback) => {
    response = callback;
  });
  fireEvent.click(screen.getByRole("button", { name: "提交" }));
  expect(screen.getByLabelText("配置类别")).toBeDisabled();
  act(() => history.push("/MasterListsPage/userManagement"));
  expect(history.location.pathname).toBe("/MasterListsPage/menuConfiguration");
  await act(async () => response({ status: 403 }));
  expect(container.querySelector("#menu_patient_checkbox")).not.toBeChecked();
  select("billing");
  expect(screen.getByText("存在未保存的修改")).toBeVisible();
  expect(notification.addNotification).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "error" }),
  );
});

test("one permitted same-route query navigation never bypasses a later dirty guard", async () => {
  const { container, history } = renderWorkspace();
  select("patient");
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  act(() => history.push("/MasterListsPage/menuConfiguration?view=retained"));
  fireEvent.click(
    await screen.findByRole("button", { name: "danger 放弃修改并继续" }),
  );
  expect(history.location.search).toBe("?view=retained");
  expect(container.querySelector("#menu_patient_checkbox")).toBeChecked();
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  act(() => history.push("/MasterListsPage/userManagement"));
  expect(history.location.pathname).toBe("/MasterListsPage/menuConfiguration");
  expect(history.location.search).toBe("?view=retained");
  expect(await screen.findByText("存在未保存的修改")).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
});
test("discarding a blocked browser POP preserves its history stack and the next actual Back", async () => {
  const { container, history } = renderWorkspace();
  act(() => history.push("/MasterListsPage/menuConfiguration?view=second"));
  select("patient");
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  const previousEntries = history.entries.map((entry) => entry.key);
  act(() => history.goBack());
  expect(history.location.search).toBe("?view=second");
  fireEvent.click(
    await screen.findByRole("button", { name: "danger 放弃修改" }),
  );
  expect(screen.getByText("修改已放弃，请再次使用返回或前进。")).toBeVisible();
  expect(history.entries.map((entry) => entry.key)).toEqual(previousEntries);
  expect(history.index).toBe(1);
  act(() => history.goBack());
  expect(history.location.search).toBe("");
  expect(history.index).toBe(0);
  act(() => history.goForward());
  expect(history.location.search).toBe("?view=second");
  expect(history.entries.map((entry) => entry.key)).toEqual(previousEntries);
  expect(mocks.post).not.toHaveBeenCalled();
});

test("a failed read after POP discard shows an error and cannot save an empty menu", async () => {
  const { container, history } = renderWorkspace();
  act(() => history.push("/MasterListsPage/menuConfiguration?view=second"));
  select("patient");
  fireEvent.click(container.querySelector("#menu_patient_checkbox"));
  act(() => history.goBack());
  expect(container.querySelector("#menu_patient_checkbox")).not.toBeChecked();
  mocks.get.mockImplementation((url, callback) => callback(undefined));
  fireEvent.click(
    await screen.findByRole("button", { name: "danger 放弃修改" }),
  );
  expect(
    container.querySelector("#menu_patient_checkbox"),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "提交" })).toBeDisabled();
  expect(notification.addNotification).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "error" }),
  );
  expect(screen.getByLabelText("配置类别")).not.toBeDisabled();
  expect(history.index).toBe(1);
  act(() => history.goBack());
  expect(history.index).toBe(0);
  expect(mocks.post).not.toHaveBeenCalled();
});
