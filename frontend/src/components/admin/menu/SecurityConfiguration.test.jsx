import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import {
  CommonProperties,
  buildPropertyRows,
  getPropertyCategory,
} from "./CommonProperties";
import GlobalMenuManagement, {
  flattenMenuTree,
  updateMenuTree,
} from "./GlobalMenuManagement";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
}));

const notificationContext = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};

const renderPage = (component) =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <NotificationContext.Provider value={notificationContext}>
          {component}
        </NotificationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  notificationContext.setNotificationVisible.mockReset();
  notificationContext.addNotification.mockReset();
});

test("groups properties and masks sensitive values", () => {
  expect(getPropertyCategory("org.itech.login.saml")).toBe("authentication");
  expect(getPropertyCategory("org.openelisglobal.fhir.subscriber")).toBe(
    "integration",
  );

  expect(
    buildPropertyRows({
      "org.openelisglobal.odoo.username": "administrator",
      "org.openelisglobal.odoo.enabled": "false",
      "org.openelisglobal.paging.results.pageSize": "25",
    }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "odoo.username",
        value: "••••••••",
        sensitive: true,
      }),
      expect.objectContaining({
        name: "odoo.enabled",
        valueType: "boolean",
      }),
      expect.objectContaining({
        name: "paging.results.pageSize",
        valueType: "number",
      }),
    ]),
  );
});

test("shows runtime properties as a searchable read-only list", async () => {
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/properties") {
      callback({
        "org.openelisglobal.fhir.subscriber.allowHTTP": "true",
        "org.openelisglobal.odoo.username": "administrator",
      });
    }
  });

  renderPage(<CommonProperties />);

  expect(await screen.findByText("fhir.subscriber.allowHTTP")).toBeVisible();
  expect(screen.getByText("••••••••")).toBeVisible();
  expect(screen.queryByText("administrator")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "保存修改" }),
  ).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "搜索参数" }), {
    target: { value: "odoo" },
  });
  expect(screen.getByText("odoo.username")).toBeVisible();
  expect(
    screen.queryByText("fhir.subscriber.allowHTTP"),
  ).not.toBeInTheDocument();
});

test("updates a menu subtree without changing its sibling", () => {
  const source = [
    {
      menu: { elementId: "menu_parent", isActive: true },
      childMenus: [
        { menu: { elementId: "menu_child", isActive: true }, childMenus: [] },
      ],
    },
    { menu: { elementId: "menu_sibling", isActive: true }, childMenus: [] },
  ];

  const updated = updateMenuTree(source, "menu_parent", false);
  expect(flattenMenuTree(updated)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ elementId: "menu_parent", isActive: false }),
      expect.objectContaining({
        elementId: "menu_child",
        isActive: false,
        depth: 1,
      }),
      expect.objectContaining({ elementId: "menu_sibling", isActive: true }),
    ]),
  );
  expect(source[0].menu.isActive).toBe(true);
});

test("renders named menu rows and requires confirmation before saving", async () => {
  mocks.get.mockImplementation((url, callback) => {
    if (url === "/rest/menu") {
      callback([
        {
          menu: { elementId: "menu_home", isActive: true },
          childMenus: [
            {
              menu: { elementId: "menu_results", isActive: true },
              childMenus: [],
            },
          ],
        },
      ]);
    }
  });

  renderPage(<GlobalMenuManagement />);

  expect(await screen.findByRole("checkbox", { name: "Home" })).toBeChecked();
  const saveButton = screen.getByRole("button", { name: "保存修改" });
  expect(saveButton).toBeDisabled();

  fireEvent.click(screen.getByRole("checkbox", { name: "Home" }));
  expect(saveButton).toBeEnabled();
  expect(screen.getByRole("checkbox", { name: "Results" })).not.toBeChecked();

  fireEvent.click(saveButton);
  expect(
    screen.getByRole("heading", { name: "保存菜单权限配置？" }),
  ).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
});
