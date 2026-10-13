import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Router } from "react-router-dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/zh.json";
import { waitFor } from "@testing-library/dom";
import { createMemoryHistory } from "history";
import {
  getFromOpenElisServer,
  postToOpenElisServerFullResponse,
} from "../../utils/Utils";

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
}));
import TestManagementConfigMenu from "./TestManagementConfigMenu";

test("groups master data by object and removes duplicate test CRUD entry points", () => {
  render(
    <MemoryRouter
      initialEntries={["/MasterListsPage/testManagementConfigMenu"]}
    >
      <IntlProvider locale="zh" messages={messages}>
        <TestManagementConfigMenu />
      </IntlProvider>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("heading", { name: "检验主数据", level: 1 }),
  ).toBeVisible();
  const paths = screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
  expect(paths).toContain("/MasterListsPage/TestCatalogList");
  expect(paths).toContain("/MasterListsPage/SampleTypeManagement");
  expect(paths).toContain("/MasterListsPage/PanelManagement");
  for (const old of [
    "TestAdd",
    "TestRenameEntry",
    "TestModifyEntry",
    "TestActivation",
    "TestOrderability",
  ]) {
    expect(paths).not.toContain("/MasterListsPage/" + old);
  }
});

test("filters configuration areas by category and translated search text", () => {
  render(
    <MemoryRouter
      initialEntries={["/MasterListsPage/testManagementConfigMenu"]}
    >
      <IntlProvider locale="zh" messages={messages}>
        <TestManagementConfigMenu />
      </IntlProvider>
    </MemoryRouter>,
  );

  expect(screen.getAllByTestId("master-data-area")).toHaveLength(8);

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "样本类型" },
  });
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "管理样本类型" })).toBeVisible();

  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "不存在的配置" },
  });
  expect(screen.queryByTestId("master-data-area")).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配的检验主数据")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(8);

  fireEvent.click(screen.getByRole("combobox", { name: "配置分类" }));
  fireEvent.click(screen.getByRole("option", { name: "规则与计算" }));
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "反射检测配置" })).toBeVisible();
});

test("opens unit creation in place and keeps workspace filters after confirmed save", async () => {
  const history = createMemoryHistory({
    initialEntries: [
      {
        pathname: "/admin/testManagementConfigMenu",
        search: "?from=reference",
        state: { retained: true },
      },
    ],
  });
  const units = {
    existingUomList: [],
    inactiveUomList: [],
    existingEnglishNames: "$",
  };
  getFromOpenElisServer.mockImplementation((_url, cb) => cb(units));
  postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    getFromOpenElisServer.mockImplementation((_url, read) =>
      read({ ...units, existingUomList: [{ id: "3", value: "IU/L" }] }),
    );
    cb({ status: 200 });
  });
  render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={messages}>
        <TestManagementConfigMenu />
      </IntlProvider>
    </Router>,
  );
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: messages["configuration.uom.manage"] },
  });
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(1);
  fireEvent.click(
    within(screen.getByTestId("master-data-area")).getByRole("link", {
      name: messages["common.openManagement"],
    }),
  );
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(history.location.pathname).toBe("/admin/testManagementConfigMenu");
  fireEvent.change(screen.getByRole("textbox", { name: messages["uom.new"] }), {
    target: { value: "IU/L" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: messages["label.button.save"] }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen.getByText(messages["uom.notification.save"]),
  ).toBeInTheDocument();
  expect(screen.getByRole("searchbox")).toHaveValue(
    messages["configuration.uom.manage"],
  );
  expect(screen.getAllByTestId("master-data-area")).toHaveLength(1);
  expect(history.location.search).toBe("?from=reference");
  expect(history.location.state).toEqual({ retained: true });
});

test("closing and reopening the workspace editor preserves an uncertain submission, including late readback", async () => {
  vi.clearAllMocks();
  const units = {
    existingUomList: [],
    inactiveUomList: [],
    existingEnglishNames: "$",
  };
  let postCallback, readCallback;
  getFromOpenElisServer.mockImplementation((_url, cb) => cb(units));
  postToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    postCallback = cb;
  });
  render(
    <MemoryRouter initialEntries={["/admin/testManagementConfigMenu"]}>
      <IntlProvider locale="zh" messages={messages}>
        <TestManagementConfigMenu />
      </IntlProvider>
    </MemoryRouter>,
  );
  const open = () =>
    fireEvent.click(
      within(screen.getByTestId("master-data-area")).getByRole("link", {
        name: messages["common.openManagement"],
      }),
    );
  const save = () =>
    screen.getByRole("button", { name: messages["label.button.save"] });
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: messages["configuration.uom.manage"] },
  });
  open();
  fireEvent.change(screen.getByRole("textbox", { name: messages["uom.new"] }), {
    target: { value: "IU/L" },
  });
  fireEvent.click(save());
  fireEvent.click(
    screen.getByRole("button", { name: messages["label.button.cancel"] }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  act(() => postCallback(undefined));
  open();
  expect(
    screen.getByRole("textbox", { name: messages["uom.new"] }),
  ).toHaveValue("IU/L");
  expect(save()).toBeDisabled();
  expect(postToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
  getFromOpenElisServer.mockImplementation((_url, cb) => {
    readCallback = cb;
  });
  fireEvent.click(
    screen.getByRole("button", { name: messages["button.retry"] }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: messages["label.button.cancel"] }),
  );
  act(() =>
    readCallback({ ...units, existingUomList: [{ id: "3", value: "IU/L" }] }),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText(messages["uom.notification.save"])).toBeVisible();
  expect(screen.getByRole("searchbox")).toHaveValue(
    messages["configuration.uom.manage"],
  );
  expect(postToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
});
