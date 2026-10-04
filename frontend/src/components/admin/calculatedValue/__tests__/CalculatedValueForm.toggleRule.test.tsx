import React from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import messages from "../../../../languages/zh.json";
import UserSessionDetailsContext from "../../../../UserSessionDetailsContext";
import { makeServer, adminSession } from "../../rulesWorkspace/testFixture";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../rulesWorkspace/ruleApi", async (importOriginal) => ({
  ...(await importOriginal()),
  ruleRequest: request,
}));
import CalculatedValue from "../CalculatedValueForm";
const mount = () =>
  render(
    <IntlProvider locale="zh" messages={messages}>
      <UserSessionDetailsContext.Provider value={adminSession}>
        <MemoryRouter initialEntries={["/MasterListsPage/calculatedValue"]}>
          <CalculatedValue />
        </MemoryRouter>
      </UserSessionDetailsContext.Provider>
    </IntlProvider>,
  );
beforeEach(() => {
  request.mockClear();
  sessionStorage.clear();
  localStorage.setItem("CSRF", "token");
});
afterEach(cleanup);
test("legacy calculation entry selects its category and explicit confirmed deactivate persists then reads exact ID", async () => {
  const server = makeServer();
  request.mockImplementation(server.request);
  mount();
  await screen.findByText("计算示例");
  expect(screen.queryByText("白细胞加做")).toBeNull();
  const row = screen.getByText("计算示例").closest("tr");
  await userEvent.click(within(row!).getByRole("button", { name: "停用" }));
  await screen.findByText("确认停用规则");
  expect(
    server.calls.filter((call) => call.options.method === "POST"),
  ).toHaveLength(0);
  await userEvent.click(screen.getAllByRole("button", { name: "停用" }).pop()!);
  await screen.findByText("规则启停状态已更新并核对。");
  expect(
    server.calls
      .filter((call) => call.options.method === "POST")
      .map((call) => call.path),
  ).toEqual(["/rest/deactivate-test-calculation/2"]);
  expect(
    server.calls.some(
      (call) =>
        call.path === "/rest/test-calculation/2" &&
        call.options.method !== "POST",
    ),
  ).toBe(true);
  expect(server.store.calculation[0].active).toBe(false);
});
test.each([0, 500])(
  "unknown activation status %s retains original status and opens no editor; retry only reads",
  async (status) => {
    const server = makeServer();
    server.store.calculation[0].active = false;
    const handler = server.request;
    request.mockImplementation((path, options) =>
      options?.method === "POST"
        ? Promise.resolve({ ok: false, status })
        : handler(path, options),
    );
    mount();
    await screen.findByText("计算示例");
    await userEvent.click(
      within(screen.getByText("计算示例").closest("tr")!).getByRole("button", {
        name: "启用",
      }),
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: "启用" }).pop()!,
    );
    await screen.findByText(
      "启停结果待核实。点击核对只读取当前状态，不会重复提交启停操作。",
    );
    expect(screen.queryByLabelText("规则名称")).toBeNull();
    server.store.calculation[0].active = true;
    await userEvent.click(screen.getByRole("button", { name: "核对保存结果" }));
    await screen.findByText("规则启停状态已更新并核对。");
    expect(
      request.mock.calls.filter(([, options]) => options?.method === "POST"),
    ).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText("确认启用规则")).toBeNull());
  },
);
