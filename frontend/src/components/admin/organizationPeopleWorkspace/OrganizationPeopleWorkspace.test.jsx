import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import messages from "../../../languages/zh.json";
import OrganizationPeopleWorkspace from "./OrganizationPeopleWorkspace";

const renderWorkspace = (
  route = "/MasterListsPage/organizationPeopleWorkspace",
) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <IntlProvider locale="zh" messages={messages}>
        <OrganizationPeopleWorkspace />
      </IntlProvider>
    </MemoryRouter>,
  );

test("offers one workspace for users, organizations, and ordering providers", () => {
  renderWorkspace();

  expect(
    screen.getByRole("heading", { name: "机构与人员", level: 1 }),
  ).toBeVisible();
  expect(screen.getAllByTestId("organization-people-area")).toHaveLength(3);

  const paths = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
  expect(paths).toContain("/MasterListsPage/userManagement");
  expect(paths).toContain("/MasterListsPage/organizationManagement");
  expect(paths).toContain("/MasterListsPage/providerMenu");
});

test("searches all organization and people areas using translated text", () => {
  renderWorkspace();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "申请医生" },
  });
  expect(screen.getAllByTestId("organization-people-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "申请医生管理" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "不存在的人员配置" },
  });
  expect(
    screen.queryByTestId("organization-people-area"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配的机构或人员配置")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(screen.getAllByTestId("organization-people-area")).toHaveLength(3);
});

test("keeps the admin route family when opened from /admin", () => {
  renderWorkspace("/admin/organizationPeopleWorkspace");

  expect(screen.getByRole("link", { name: "用户管理" })).toHaveAttribute(
    "href",
    "/admin/userManagement",
  );
});
