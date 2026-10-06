import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { screen, waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { ConfigurationContext } from "../../layout/Layout";
import zh from "../../../languages/zh.json";
import en from "../../../languages/en.json";
import ReportNonConformingEvent from "./ReportNonConformingEvent";
import {
  jsonResponse,
  metadata,
  receipt,
  session,
  urlPath,
} from "./nceWorkspace.testData";

// This file runs only with the calendar config, which removes the ordinary
// flatpickr alias. The actual Carbon component and vendor calendar must render.
vi.unmock("flatpickr");
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return { ConfigurationContext: createContext({}) };
});

let fetcher;
beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 6, 12));
  fetcher = vi.fn(async (url, options) => {
    if (urlPath(url).endsWith("/session")) return jsonResponse(session);
    if (urlPath(url).endsWith("/registration/meta"))
      return jsonResponse(metadata());
    if (options.method === "POST") {
      const command = JSON.parse(options.body);
      return jsonResponse(receipt(command.requestId));
    }
    throw new Error(`Unexpected calendar contract endpoint ${urlPath(url)}`);
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const renderForm = async (uiLocale, dateLocale, messages, beforeOpenText) => {
  const onSaved = vi.fn();
  render(
    <MemoryRouter>
      <IntlProvider locale={uiLocale} messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: session, isCheckingLogin: () => false }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: { DEFAULT_DATE_LOCALE: dateLocale },
            }}
          >
            <ReportNonConformingEvent onSaved={onSaved} />
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(document.querySelector("#date-of-event")).toBeInTheDocument(),
  );
  const input = document.querySelector("#date-of-event");
  expect(input).not.toBeDisabled();
  expect(input._flatpickr.calendarContainer).toBeInstanceOf(HTMLElement);
  if (beforeOpenText) {
    expect(input).toHaveValue("2026/10/06");
    fireEvent.change(input, { target: { value: beforeOpenText } });
    fireEvent.blur(input);
  }
  fireEvent.focus(input);
  fireEvent.click(input);
  await waitFor(() =>
    expect(input._flatpickr.calendarContainer).toHaveClass("open"),
  );
  const calendar = input._flatpickr.calendarContainer;
  return { input, calendar, onSaved };
};

const selectAndSubmit = async (
  calendar,
  input,
  expectedText,
  messages,
  onSaved,
) => {
  const day = Array.from(calendar.querySelectorAll(".flatpickr-day")).find(
    (node) =>
      node.textContent === "5" &&
      !node.classList.contains("prevMonthDay") &&
      !node.classList.contains("nextMonthDay"),
  );
  expect(day).toBeDefined();
  fireEvent.click(day);
  expect(input).toHaveValue(expectedText);
  fireEvent.change(document.querySelector("#reporting-unit"), {
    target: { value: "3" },
  });
  fireEvent.change(document.querySelector("#nce-category"), {
    target: { value: "3" },
  });
  fireEvent.change(document.querySelector("#nce-description"), {
    target: { value: "真实日历选择后的日期合同" },
  });
  fireEvent.click(document.querySelector("#nce-severity-MINOR"));
  fireEvent.click(
    screen.getByRole("button", { name: messages["nce.button.submit"] }),
  );
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  const posts = fetcher.mock.calls.filter(
    ([, options]) => options.method === "POST",
  );
  expect(posts).toHaveLength(1);
  expect(
    new URL(posts[0][0], "http://localhost").searchParams.get("queryVersion"),
  ).toBe("2");
  expect(JSON.parse(posts[0][1].body)).toMatchObject({
    dateOfEvent: "2026-10-05",
    currentUserId: "1",
  });
};

test.each([
  ["zh", null],
  ["zh-CN", "2026/09/06"],
])(
  "real Carbon and Flatpickr show Chinese month, weekdays and month navigation for %s and preserve ISO submission",
  async (uiLocale, beforeOpenText) => {
    const { input, calendar, onSaved } = await renderForm(
      uiLocale,
      "zh-CN",
      zh,
      beforeOpenText,
    );
    if (beforeOpenText) {
      expect(input).toHaveValue(beforeOpenText);
      await waitFor(() =>
        expect(calendar.querySelector(".cur-month")).toHaveTextContent(
          /^九月$/,
        ),
      );
      fireEvent.click(
        screen
          .getByRole("img", { name: "下个月" })
          .closest(".flatpickr-next-month"),
      );
    } else expect(input).toHaveValue("2026/10/06");
    await waitFor(() =>
      expect(calendar.querySelector(".cur-month")).toHaveTextContent(/^十月$/),
    );
    expect(
      Array.from(calendar.querySelectorAll(".flatpickr-weekday")).map((node) =>
        node.textContent.trim(),
      ),
    ).toEqual(["周日", "周一", "周二", "周三", "周四", "周五", "周六"]);
    expect(calendar.textContent).not.toContain("October");
    fireEvent.click(
      screen
        .getByRole("img", { name: "上个月" })
        .closest(".flatpickr-prev-month"),
    );
    await waitFor(() => {
      expect(calendar.querySelector(".cur-month")).toHaveTextContent(/^九月$/);
      expect(input._flatpickr.currentMonth).toBe(8);
    });
    fireEvent.click(
      screen
        .getByRole("img", { name: "下个月" })
        .closest(".flatpickr-next-month"),
    );
    await waitFor(() =>
      expect(calendar.querySelector(".cur-month")).toHaveTextContent(/^十月$/),
    );
    expect(
      screen.queryByRole("img", { name: "Previous month" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "Next month" }),
    ).not.toBeInTheDocument();
    await selectAndSubmit(calendar, input, "2026/10/05", zh, onSaved);
  },
);

test.each([
  ["en-US", "zh-CN", "October", "2026/10/06", "2026/10/05"],
  ["fr-FR", "fr-FR", "octobre", "06/10/2026", "05/10/2026"],
])(
  "calendar uses the %s UI language and retains the separately configured %s date order",
  async (uiLocale, dateLocale, month, initialText, selectedText) => {
    const { input, calendar, onSaved } = await renderForm(
      uiLocale,
      dateLocale,
      en,
    );
    expect(input).toHaveValue(initialText);
    expect(calendar.querySelector(".cur-month").textContent).toBe(month);
    expect(
      screen.getByRole("img", { name: "Previous month" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Next month" })).toBeInTheDocument();
    await selectAndSubmit(calendar, input, selectedText, en, onSaved);
  },
);
