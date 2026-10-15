import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { screen, waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";
import { NCECorrectiveAction } from "./NCECorrectiveAction";

vi.unmock("flatpickr");
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    ConfigurationContext: createContext({}),
    NotificationContext: createContext({}),
  };
});

let record;
let posts;
let saveSuccess;
let dateLocale;
const notification = vi.fn();
const existing = {
  id: 81,
  ncEventId: 7,
  correctiveAction: "既有措施",
  personResponsible: "原责任人",
  actionType: "2",
  dateCompleted: Date.UTC(2026, 9, 2),
  turnAroundTime: 1,
};
beforeEach(() => {
  record = {
    id: "7",
    nceNumber: "CAPA-7",
    labOrderNumber: "DEMO-7",
    cancelAction: "Home",
    reportDate: "2026/10/01",
    dateOfEvent: "2026/10/01",
    dateCompleted: "",
    discussionDate: "2026/10/01",
    actionLog: [],
    severityConsequencesList: [],
    reportingUnits: [],
    labComponentList: [],
    specimens: [],
    nceCategories: [],
    nceTypes: [],
  };
  posts = [];
  saveSuccess = true;
  dateLocale = "zh-CN";
  notification.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const parsed = new URL(url, "http://localhost");
      if (!parsed.pathname.endsWith("/rest/NCECorrectiveAction"))
        throw new Error(parsed.pathname);
      if (options.method === "GET") {
        expect(parsed.searchParams.get("nceNumber")).toBe("CAPA-7");
        return new Response(JSON.stringify(record), {
          headers: { "Content-Type": "application/json" },
        });
      }
      expect(options.method).toBe("POST");
      posts.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ success: saveSuccess }), {
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const change = (selector, value) => {
  const input = document.querySelector(selector);
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const open = async () => {
  render(
    <MemoryRouter>
      <IntlProvider locale="zh-CN" messages={zh}>
        <ConfigurationContext.Provider
          value={{
            configurationProperties: { DEFAULT_DATE_LOCALE: dateLocale },
          }}
        >
          <NotificationContext.Provider
            value={{
              notificationVisible: false,
              setNotificationVisible: vi.fn(),
              addNotification: notification,
            }}
          >
            <NCECorrectiveAction />
          </NotificationContext.Provider>
        </ConfigurationContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
  change("#type", "nceNumber");
  change("[data-cy='fieldName']", "CAPA-7");
  fireEvent.click(screen.getByTestId("nce-search-button"));
  await waitFor(() =>
    expect(screen.getByTestId("nce-number-result")).toHaveTextContent("CAPA-7"),
  );
};
const addDiscussion = (value) => {
  change("#tdiscussionDate", value);
  fireEvent.click(
    screen.getByRole("button", { name: zh["nonconform.add.new.date"] }),
  );
};
const completeDraft = () => {
  change("#dateCompleted:not([disabled])", "2026/10/03");
  change("#dateCompleted-0", "2026/10/05");
  change("#text-area-person:not([disabled])", "测试责任人");
  fireEvent.click(document.querySelector("#correctiveAction:not([disabled])"));
  change("#text-area-corrective:not([disabled])", "核对标本编号并复核");
  fireEvent.click(document.getElementById("yes.option"));
};
const save = async () => {
  expect(screen.getByTestId("nce-submit-button")).toBeEnabled();
  fireEvent.click(screen.getByTestId("nce-submit-button"));
  await waitFor(() => expect(posts).toHaveLength(1));
  return posts[0];
};

test("editing corrective text preserves all added discussion dates and both independent completion dates", async () => {
  await open();
  addDiscussion("2026/10/02");
  addDiscussion("2026/10/03");
  completeDraft();
  const body = await save();
  expect(body.id).toBe("7");
  expect(body.discussionDate).toBe("2026/10/01,2026/10/02,2026/10/03");
  expect(body.dateCompleted).toBe("05/10/2026");
  expect(body.actionLog).toEqual([
    {
      correctiveAction: "核对标本编号并复核",
      personResponsible: "测试责任人",
      actionType: "1",
      dateCompleted: "2026-10-03",
      turnAroundTime: 2,
    },
  ]);
});

test("completion-only save preserves historical logs and submits the independently edited resolution date", async () => {
  record.actionLog = [existing];
  await open();
  change("#dateCompleted-0", "2026/10/06");
  fireEvent.click(document.getElementById("yes.option"));
  const body = await save();
  expect(body.dateCompleted).toBe("06/10/2026");
  expect(body.actionLog).toEqual([existing]);
});

test("incomplete action cannot be submitted without the existing required responsible person", async () => {
  await open();
  completeDraft();
  change("#text-area-person:not([disabled])", "");
  expect(screen.getByTestId("nce-submit-button")).toBeDisabled();
  expect(posts).toHaveLength(0);
});

test("resolution confirmation remains required even when every draft field is complete", async () => {
  await open();
  completeDraft();
  fireEvent.click(document.getElementById("no.option"));
  expect(screen.getByTestId("nce-submit-button")).toBeDisabled();
  expect(posts).toHaveLength(0);
});

test("a failed save preserves the entered event and draft for correction without automatically reposting", async () => {
  saveSuccess = false;
  await open();
  completeDraft();
  await save();
  await waitFor(() => expect(notification).toHaveBeenCalledTimes(1));
  expect(screen.getByTestId("nce-number-result")).toHaveTextContent("CAPA-7");
  expect(
    document.querySelector("#text-area-corrective:not([disabled])"),
  ).toHaveValue("核对标本编号并复核");
  expect(
    document.querySelector("#text-area-person:not([disabled])"),
  ).toHaveValue("测试责任人");
  expect(posts).toHaveLength(1);
});

test("historical fields keep unique identities while appending exactly one new log", async () => {
  record.actionLog = [existing];
  await open();
  const ids = Array.from(document.querySelectorAll("[id]")).map(
    (node) => node.id,
  );
  for (const id of [
    "dateCompleted",
    "text-area-person",
    "text-area-corrective",
    "correctiveAction",
  ]) {
    expect(ids.filter((value) => value === id)).toHaveLength(1);
  }
  completeDraft();
  const body = await save();
  expect(body.actionLog).toHaveLength(2);
  expect(body.actionLog[0]).toEqual(existing);
  expect(body.actionLog[1].dateCompleted).toBe("2026-10-03");
});

test.each([
  ["fr-FR", "01/10/2026", "03/10/2026", "05/10/2026"],
  ["en-US", "10/01/2026", "10/03/2026", "10/05/2026"],
])(
  "%s dates retain the same clinical day in both existing POST date formats",
  async (locale, reported, action, resolved) => {
    dateLocale = locale;
    record.reportDate = reported;
    await open();
    change("#dateCompleted", action);
    change("#dateCompleted-0", resolved);
    change("#text-area-person", "测试责任人");
    fireEvent.click(document.querySelector("#correctiveAction"));
    change("#text-area-corrective", "日期保存核对");
    fireEvent.click(document.getElementById("yes.option"));
    const body = await save();
    expect(body.dateCompleted).toBe("05/10/2026");
    expect(body.actionLog[0].dateCompleted).toBe("2026-10-03");
    expect(body.actionLog[0].turnAroundTime).toBe(2);
  },
);
