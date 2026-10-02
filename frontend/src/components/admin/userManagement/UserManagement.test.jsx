import { waitFor } from "@testing-library/dom";
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import UserManagement from "./UserManagement";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  navigate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerJsonResponse: mocks.post,
}));
vi.mock("../../utils/NavigationUtils", () => ({
  navigateToInternalPath: mocks.navigate,
  refreshCurrentRoute: mocks.refresh,
}));
const notice = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};
const user = {
  loginUserId: "11",
  systemUserId: "7",
  systemUserLastupdated: "2026-09-30T12:00:00",
  userLoginName: "reviewer",
  userFirstName: "小明",
  userLastName: "张",
  expirationDate: "01/01/2030",
  timeout: "480",
  accountActive: "Y",
  accountDisabled: "N",
  accountLocked: "N",
  userPassword: "",
  confirmPassword: "",
  selectedRoles: ["3"],
  selectedTestSectionLabUnits: { 10: ["5"] },
  globalRoles: [
    { roleId: "3", roleName: "Audit Trail", elementID: "audit-role" },
  ],
  labUnitRoles: [
    { roleId: "5", roleName: "Validation", elementID: "validation-role" },
  ],
  testSections: [{ id: "10", value: "生化" }],
};
const list = {
  totalRecordCount: 1,
  testSections: [{ id: "10", value: "生化" }],
  menuList: [
    {
      systemUserId: "7",
      combinedUserID: "7_11",
      firstName: "小明",
      lastName: "张",
      loginName: "reviewer",
      active: "Y",
    },
  ],
};
function RouteProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/MasterListsPage/userManagement"]}>
      <IntlProvider locale="zh" messages={messages}>
        <ConfigurationContext.Provider value={{ configurationProperties: {} }}>
          <NotificationContext.Provider value={notice}>
            <UserManagement />
            <RouteProbe />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockReset();
  mocks.get.mockImplementation((url, callback) => {
    if (url.startsWith("/rest/SearchUnifiedSystemUserMenu")) callback(list);
    else if (url.startsWith("/rest/UnifiedSystemUser?"))
      callback(structuredClone(user));
    else if (url === "/rest/users") callback([]);
  });
});
const openEdit = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: "编辑", exact: true }),
  );
  const dialog = await screen.findByRole("dialog", { name: "修改用户" });
  await waitFor(() =>
    expect(within(dialog).getByLabelText("登录名")).toHaveValue("reviewer"),
  );
  return dialog;
};

test("edits the selected ID in a modal and cancels without losing the search or posting", async () => {
  renderPage();
  const search = await screen.findByRole("searchbox");
  fireEvent.change(search, { target: { value: "reviewer" } });
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith(
      expect.stringContaining("searchString=reviewer"),
      expect.any(Function),
    ),
  );
  const dialog = await openEdit();
  expect(mocks.get).toHaveBeenCalledWith(
    expect.stringContaining("ID=7_11&"),
    expect.any(Function),
  );
  expect(dialog.querySelector("#audit-role")).toBeChecked();
  expect(dialog.querySelector("#validation-role-10")).toBeChecked();
  fireEvent.change(within(dialog).getByLabelText("名"), {
    target: { value: "新姓名" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "取消", exact: true }),
  );
  expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
  expect(search).toHaveValue("reviewer");
  expect(screen.getByTestId("location")).toHaveTextContent(
    "/MasterListsPage/userManagement",
  );
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

test("successful edit preserves role assignments and refreshes the current filtered list", async () => {
  renderPage();
  const search = await screen.findByRole("searchbox");
  fireEvent.change(search, { target: { value: "reviewer" } });
  await waitFor(() =>
    expect(mocks.get).toHaveBeenCalledWith(
      expect.stringContaining("searchString=reviewer"),
      expect.any(Function),
    ),
  );
  const dialog = await openEdit();
  fireEvent.change(within(dialog).getByLabelText("名"), {
    target: { value: "晓明" },
  });
  mocks.post.mockImplementation((_url, _body, callback) =>
    callback({ success: true }),
  );
  const listRequestsBefore = mocks.get.mock.calls.filter(([url]) =>
    url.startsWith("/rest/SearchUnified"),
  ).length;
  fireEvent.click(
    within(dialog).getByRole("button", { name: "保存", exact: true }),
  );
  await waitFor(() =>
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible"),
  );
  expect(JSON.parse(mocks.post.mock.calls[0][1])).toEqual(
    expect.objectContaining({
      systemUserId: "7",
      loginUserId: "11",
      userFirstName: "晓明",
      selectedRoles: ["3"],
      selectedTestSectionLabUnits: { 10: ["5"] },
      systemUserLastupdated: user.systemUserLastupdated,
    }),
  );
  expect(
    mocks.get.mock.calls.filter(([url]) =>
      url.startsWith("/rest/SearchUnified"),
    ),
  ).toHaveLength(listRequestsBefore + 1);
  expect(search).toHaveValue("reviewer");
  expect(mocks.navigate).not.toHaveBeenCalled();
});

test("save failure keeps the editor values and visible error for retry, with no duplicate submission", async () => {
  renderPage();
  const dialog = await openEdit();
  fireEvent.change(within(dialog).getByLabelText("名"), {
    target: { value: "晓明" },
  });
  const save = within(dialog).getByRole("button", {
    name: "保存",
    exact: true,
  });
  fireEvent.click(save);
  expect(save).toBeDisabled();
  expect(within(dialog).getByLabelText("名")).toBeDisabled();
  expect(dialog.querySelector("#audit-role")).toBeDisabled();
  expect(dialog.querySelector("#permission-profile")).toBeDisabled();
  expect(dialog.querySelector(".admin-form-workspace__body")).toHaveAttribute(
    "inert",
  );
  expect(dialog.querySelector(".admin-form-workspace__body")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  fireEvent.click(save);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await act(async () =>
    mocks.post.mock.calls[0][2]({ error: "failed", status: 500 }),
  );
  expect(within(dialog).getByLabelText("名")).toHaveValue("晓明");
  expect(within(dialog).getByText(messages["server.error.msg"])).toBeVisible();
  expect(save).toBeEnabled();
  expect(within(dialog).getByLabelText("名")).toBeEnabled();
  expect(dialog.querySelector("#audit-role")).toBeEnabled();
  expect(
    dialog.querySelector(".admin-form-workspace__body"),
  ).not.toHaveAttribute("inert");
  expect(mocks.navigate).not.toHaveBeenCalled();
});
