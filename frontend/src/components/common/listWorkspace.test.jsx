import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import {
  fromList,
  listReturnLocation,
  pushWithListContext,
} from "./listWorkspace";
import ListReturnButton from "./ListReturnButton";
import messages from "../../languages/zh.json";

test("asks before leaving a workflow with unsaved changes", () => {
  const history = createMemoryHistory({ initialEntries: ["/order/enter"] });
  render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={messages}>
        <ListReturnButton fallback="/order" confirmLeave />
      </IntlProvider>
    </Router>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: messages["button.back"] }),
  );
  expect(history.location.pathname).toBe("/order/enter");
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(history.location.pathname).toBe("/order/enter");
  fireEvent.click(
    screen.getByRole("button", { name: messages["button.back"] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "放弃修改并返回" }));
  expect(history.location.pathname).toBe("/order");
});

test("returns to the original list with its query and page", () => {
  const state = fromList("/order", { searchQuery: "DEMO-12", page: 3 });
  const history = createMemoryHistory({
    initialEntries: [{ pathname: "/ModifyOrder", state }],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={{ "button.back": "返回列表" }}>
        <ListReturnButton fallback="/order" />
      </IntlProvider>
    </Router>,
  );
  fireEvent.click(screen.getByRole("button", { name: "返回列表" }));
  expect(history.location.pathname).toBe("/order");
  expect(history.location.state.listState).toEqual({
    searchQuery: "DEMO-12",
    page: 3,
  });
});

test("never uses an external or arbitrary destination from router state", () => {
  for (const pathname of [
    "https://example.com",
    "//example.com",
    "/admin",
    "/order/../../admin",
  ]) {
    expect(listReturnLocation({ listOrigin: { pathname } }, "/order")).toEqual({
      pathname: "/order",
    });
  }
});

test("workflow step changes preserve the originating list", () => {
  const state = fromList("/order", { page: 2 });
  const history = createMemoryHistory({
    initialEntries: [{ pathname: "/order/enter", state }],
  });
  pushWithListContext(history, "/order/collect");
  expect(history.location.pathname).toBe("/order/collect");
  expect(history.location.state).toEqual(state);
});
