import { waitFor } from "@testing-library/dom";
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";
import messages from "../../../languages/zh.json";
import LanguageManagement from "./LanguageManagement";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
  putToOpenElisServerFullResponse: mocks.put,
  deleteFromOpenElisServerFullResponse: mocks.remove,
}));
const locales = [
  {
    id: "1",
    localeCode: "zh",
    displayName: "简体中文",
    active: true,
    fallback: true,
    sortOrder: 1,
  },
  {
    id: "2",
    localeCode: "en",
    displayName: "English",
    active: false,
    fallback: false,
    sortOrder: 2,
  },
];
const renderPage = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <LanguageManagement />
      </IntlProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((_url, callback) =>
    callback(structuredClone(locales)),
  );
});

test("opens an existing locale for editing, keeps its code and fallback flag, and returns to the search after save", async () => {
  renderPage();
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "中文" } });
  fireEvent.click(screen.getByRole("button", { name: "编辑", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "编辑语言环境" });
  expect(within(dialog).getByLabelText("语言代码")).toBeDisabled();
  expect(within(dialog).getByLabelText("语言代码")).toHaveValue("zh");
  fireEvent.change(within(dialog).getByLabelText("显示名称"), {
    target: { value: "中文" },
  });
  mocks.put.mockImplementation((_url, _body, callback) =>
    callback({ ok: true }),
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "保存", exact: true }),
  );
  await waitFor(() =>
    expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible"),
  );
  expect(mocks.put.mock.calls[0][0]).toBe("/rest/supportedlocales/1");
  expect(JSON.parse(mocks.put.mock.calls[0][1])).toEqual(
    expect.objectContaining({
      localeCode: "zh",
      displayName: "中文",
      fallback: true,
    }),
  );
  expect(search).toHaveValue("中文");
  expect(screen.getByText("语言环境更新成功")).toBeVisible();
});

test("failed create stays open and preserves input, then cancel makes no further request", async () => {
  renderPage();
  fireEvent.click(
    screen.getByRole("button", { name: "添加语言环境", exact: true }),
  );
  const dialog = screen.getByRole("dialog", { name: "添加语言环境" });
  fireEvent.change(within(dialog).getByLabelText("语言代码"), {
    target: { value: "fr" },
  });
  fireEvent.change(within(dialog).getByLabelText("显示名称"), {
    target: { value: "法语" },
  });
  const save = within(dialog).getByRole("button", {
    name: "保存",
    exact: true,
  });
  fireEvent.click(save);
  expect(save).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  fireEvent.click(save);
  expect(mocks.post).toHaveBeenCalledTimes(1);
  await act(async () => mocks.post.mock.calls[0][2](undefined));
  expect(within(dialog).getByLabelText("显示名称")).toHaveValue("法语");
  expect(
    within(dialog).getByText(messages["error.add.edited.msg"]),
  ).toBeVisible();
  expect(save).toBeEnabled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "取消", exact: true }),
  );
  expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
  expect(mocks.post).toHaveBeenCalledTimes(1);
});

test("load failure is distinguished from an empty list and can be retried", async () => {
  mocks.get.mockImplementationOnce((_url, callback) => callback(undefined));
  renderPage();
  expect(screen.getByText(messages["server.error.msg"])).toBeVisible();
  expect(
    screen.getByRole("button", { name: "添加语言环境", exact: true }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByText("简体中文")).toBeVisible();
  expect(
    screen.queryByText(messages["server.error.msg"]),
  ).not.toBeInTheDocument();
});

test("cannot dismiss a pending delete with Escape and preserves its error for retry", async () => {
  renderPage();
  const row = screen.getByRole("row", { name: /English/ });
  fireEvent.click(within(row).getByRole("button", { name: /删除/ }));
  const dialog = screen.getByRole("alertdialog", { name: "确认删除语言环境" });
  fireEvent.click(within(dialog).getByRole("button", { name: /删除/ }));
  fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
  expect(dialog.closest(".cds--modal")).toHaveClass("is-visible");
  expect(mocks.remove).toHaveBeenCalledTimes(1);
  await act(async () => mocks.remove.mock.calls[0][1](undefined));
  expect(within(dialog).getByText("删除语言环境失败")).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
  expect(dialog.closest(".cds--modal")).not.toHaveClass("is-visible");
});
