import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/en.json";
import chineseMessages from "../../languages/zh.json";
import { NotificationContext } from "../layout/Layout";
import PushNotificationPage from "./PushNotificationPage";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerJsonResponse: mocks.post,
}));
vi.mock("../common/PageBreadCrumb", () => ({ default: () => <div /> }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.get.mockImplementation((_url, callback) =>
    callback([{ id: "7", displayName: "Lab Supervisor" }]),
  );
});

test("saves and reuses a message template without sending", async () => {
  render(
    <IntlProvider locale="en" messages={messages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification: vi.fn(),
        }}
      >
        <PushNotificationPage />
      </NotificationContext.Provider>
    </IntlProvider>,
  );
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Please recollect the specimen" },
  });
  fireEvent.change(screen.getByLabelText("Template name"), {
    target: { value: "Recollection" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save as template" }));
  fireEvent.click(screen.getByRole("button", { name: /Templates/ }));
  expect(screen.getByText("Recollection")).toBeVisible();
  expect(mocks.post).not.toHaveBeenCalled();
});

const openComposer = (translated = messages, locale = "en") => {
  const notices = {
    notificationVisible: false,
    setNotificationVisible: vi.fn(),
    addNotification: vi.fn(),
  };
  render(
    <IntlProvider locale={locale} messages={translated}>
      <NotificationContext.Provider value={notices}>
        <PushNotificationPage />
      </NotificationContext.Provider>
    </IntlProvider>,
  );
  fireEvent.change(screen.getByLabelText(translated["notify.user.by"]), {
    target: { value: "7" },
  });
  fireEvent.change(screen.getByLabelText(translated["notify.message"]), {
    target: { value: "Synthetic notification" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: translated["notify.send"] }),
  );
  expect(mocks.post).toHaveBeenCalledTimes(1);
  expect(mocks.post.mock.calls[0][0]).toBe("/rest/notification/7");
  expect(JSON.parse(mocks.post.mock.calls[0][1])).toEqual({
    message: "Synthetic notification",
  });
  return notices;
};
const completeSend = (receipt) =>
  act(() => mocks.post.mock.calls[0][2](receipt));
const storedHistory = () =>
  JSON.parse(
    localStorage.getItem("openelis.cn.notification.history.v1") || "[]",
  );

test("a saved notification without a push subscription clears once and states the real Chinese outcome", () => {
  const notices = openComposer(chineseMessages, "zh");
  completeSend({ saved: true, id: 301, pushStatus: "NOT_SUBSCRIBED" });
  expect(screen.getByLabelText(chineseMessages["notify.message"])).toHaveValue(
    "",
  );
  expect(
    screen.getByRole("button", { name: chineseMessages["notify.send"] }),
  ).toBeDisabled();
  expect(notices.addNotification).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: chineseMessages["notify.saved.noPush"],
      kind: "success",
    }),
  );
  expect(storedHistory()).toEqual([
    expect.objectContaining({
      id: "301",
      message: "Synthetic notification",
      status: "SAVED",
      pushStatus: "NOT_SUBSCRIBED",
    }),
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: chineseMessages["notify.send"] }),
  );
  expect(mocks.post).toHaveBeenCalledTimes(1);
  fireEvent.click(
    screen.getByRole("button", { name: chineseMessages["notify.tab.history"] }),
  );
  expect(
    screen.getByText(chineseMessages["notify.history.saved"]),
  ).toBeVisible();
  expect(
    screen.getByText(chineseMessages["notify.saved.noPush"]),
  ).toBeVisible();
  expect(
    screen.queryByText(chineseMessages["notify.history.sent"]),
  ).not.toBeInTheDocument();
});

test("push failure after persistence is a saved warning and cannot invite a duplicate send", () => {
  const notices = openComposer();
  completeSend({ saved: true, id: 302, pushStatus: "FAILED" });
  expect(notices.addNotification).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: messages["notify.saved.pushFailed"],
      kind: "warning",
    }),
  );
  expect(screen.getByLabelText(messages["notify.message"])).toHaveValue("");
  expect(
    screen.getByRole("button", { name: messages["notify.send"] }),
  ).toBeDisabled();
  expect(storedHistory()).toEqual([
    expect.objectContaining({
      id: "302",
      status: "SAVED",
      pushStatus: "FAILED",
    }),
  ]);
  expect(mocks.post).toHaveBeenCalledTimes(1);
});

test("push service acceptance is recorded without claiming device delivery", () => {
  const notices = openComposer();
  completeSend({ saved: true, id: 303, pushStatus: "ACCEPTED" });
  expect(notices.addNotification).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: messages["notify.saved.pushAccepted"],
      kind: "success",
    }),
  );
  expect(storedHistory()).toEqual([
    expect.objectContaining({
      id: "303",
      status: "SAVED",
      pushStatus: "ACCEPTED",
    }),
  ]);
  expect(screen.getByLabelText(messages["notify.message"])).toHaveValue("");
});

test("a real save failure retains the unsaved message and writes no success history", () => {
  const notices = openComposer();
  completeSend({
    saved: false,
    id: null,
    pushStatus: "NOT_ATTEMPTED",
    status: 500,
    statusCode: 500,
  });
  expect(notices.addNotification).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: messages["server.error.msg"],
      kind: "error",
    }),
  );
  expect(screen.getByLabelText(messages["notify.message"])).toHaveValue(
    "Synthetic notification",
  );
  expect(
    screen.getByRole("button", { name: messages["notify.send"] }),
  ).toBeEnabled();
  expect(storedHistory()).toEqual([]);
  expect(mocks.post).toHaveBeenCalledTimes(1);
});

test("an invalid success body cannot clear the message or claim it was saved", () => {
  const notices = openComposer();
  completeSend({ saved: true, id: null, pushStatus: "ACCEPTED" });
  expect(notices.addNotification).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: messages["server.error.msg"],
      kind: "error",
    }),
  );
  expect(screen.getByLabelText(messages["notify.message"])).toHaveValue(
    "Synthetic notification",
  );
  expect(storedHistory()).toEqual([]);
  expect(mocks.post).toHaveBeenCalledTimes(1);
});
