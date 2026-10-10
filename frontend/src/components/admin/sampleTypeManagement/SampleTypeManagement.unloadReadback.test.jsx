import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { IntlProvider } from "react-intl";
import { Route, Router } from "react-router-dom";
import { createMemoryHistory } from "history";
import SampleTypeManagement from "./SampleTypeManagement";
import messages from "../../../languages/zh.json";

// This regression uses the actual component, GET/PUT helpers and Response body
// handling. Only the server transport is deferred; no API helper is replaced.
const detail = {
  id: "5",
  name: "血清",
  description: "Serum-internal",
  domain: "CLINICAL",
  isActive: true,
  testCount: 8,
  abbreviation: "SR",
  sortOrder: 7,
  whonetCode: "SER",
  disposalInstructions: "原处置配置",
  translations: { zh: "血清", en: "Serum", fr: "Sérum", ar: "مصل" },
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
  });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let savedRead, savedReadSignal, writes, detailReads;
beforeEach(() => {
  savedRead = deferred();
  savedReadSignal = null;
  writes = [];
  detailReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url, options) => {
      if (options.method === "PUT") {
        writes.push({ url, options });
        return Promise.resolve(json({ success: true, data: detail }));
      }
      if (String(url).endsWith("/rest/domains"))
        return Promise.resolve(
          json([{ id: "CLINICAL", labelKey: "label.domain.CLINICAL" }]),
        );
      if (String(url).endsWith("/rest/sample-types"))
        return Promise.resolve(json({ success: true, data: [detail] }));
      if (String(url).endsWith("/rest/sample-types/5")) {
        detailReads += 1;
        if (detailReads === 2) {
          savedReadSignal = options.signal;
          return savedRead.promise;
        }
        return Promise.resolve(json({ success: true, data: detail }));
      }
      throw new Error("Unexpected transport endpoint");
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const beginSavedRead = async () => {
  const history = createMemoryHistory({
    initialEntries: ["/MasterListsPage/SampleTypeManagement"],
  });
  render(
    <Router history={history}>
      <IntlProvider locale="zh" messages={messages}>
        <Route
          path="/MasterListsPage/SampleTypeManagement/:sampleTypeId?/:section?"
          render={() => <SampleTypeManagement />}
        />
        <Route exact path="/elsewhere">
          <p>Elsewhere</p>
        </Route>
      </IntlProvider>
    </Router>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  const dialog = await screen.findByRole("dialog");
  await screen.findByDisplayValue("血清");
  fireEvent.change(within(dialog).getByLabelText("中文显示名称"), {
    target: { value: "新血清" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await vi.waitFor(() => expect(savedReadSignal).toBeInstanceOf(AbortSignal));
  expect(writes).toHaveLength(1);
  const event = new Event("beforeunload", { cancelable: true });
  Object.defineProperty(event, "returnValue", { value: "", writable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); // actual savingRef guard
  expect(savedReadSignal.aborted).toBe(false);
  return { history, dialog };
};

test("a canceled leave during the real saved-record GET completes verification and releases the editor without another PUT", async () => {
  const { history } = await beginSavedRead();
  await act(async () =>
    savedRead.resolve(
      json({
        success: true,
        data: {
          ...detail,
          name: "新血清",
          translations: { ...detail.translations, zh: "新血清" },
        },
      }),
    ),
  );
  expect(await screen.findByText("标本类型已保存。")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(writes).toHaveLength(1);
  await act(async () => history.push("/elsewhere"));
  expect(screen.getByText("Elsewhere")).toBeVisible();
});

test("a current network failure after a canceled leave settles save finally and exposes refresh failure without retrying PUT", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { dialog } = await beginSavedRead();
  const failure = new TypeError("Failed to fetch");
  await act(async () => savedRead.reject(failure));
  expect(
    await screen.findByText(
      "保存已完成，但列表或详情刷新失败。请重新加载，勿重复保存。",
    ),
  ).toBeVisible();
  expect(error).toHaveBeenCalledExactlyOnceWith(failure);
  expect(
    within(dialog).getByRole("button", { name: "重新加载已保存记录" }),
  ).toBeEnabled();
  expect(within(dialog).getByRole("button", { name: "取消" })).toBeEnabled();
  expect(writes).toHaveLength(1);
});
