import userEvent from "@testing-library/user-event";
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
import NceRegistrationModal from "./NceRegistrationModal";
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

const fillOtherRequiredFieldsAndSubmit = (messages) => {
  fireEvent.change(document.querySelector("#reporting-unit"), {
    target: { value: "3" },
  });
  fireEvent.change(document.querySelector("#nce-category"), {
    target: { value: "3" },
  });
  fireEvent.change(document.querySelector("#nce-description"), {
    target: { value: "Original date input regression" },
  });
  fireEvent.click(document.querySelector("#nce-severity-MINOR"));
  fireEvent.click(
    screen.getByRole("button", { name: messages["nce.button.submit"] }),
  );
};

test.each([
  ["zh-CN", "zh-CN", zh, "2024/07/10"],
  ["fr-FR", "fr-FR", en, "10/07/2024"],
  ["en-US", "en-US", en, "07/10/2024"],
])(
  "real keyboard input keeps every original date prefix for %s and submits the same ISO day",
  async (uiLocale, dateLocale, messages, text) => {
    const { input, onSaved } = await renderForm(uiLocale, dateLocale, messages);
    const user = userEvent.setup();
    await user.clear(input);
    expect(input).toHaveValue("");
    for (let index = 0; index < text.length; index += 1) {
      await user.type(input, text[index], { skipClick: true });
      expect(input).toHaveValue(text.slice(0, index + 1));
    }
    fireEvent.blur(input);
    expect(input).toHaveValue(text);
    expect(
      input._flatpickr.selectedDates.map((date) => [
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
      ]),
    ).toEqual([[2024, 7, 10]]);
    fillOtherRequiredFieldsAndSubmit(messages);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const posts = fetcher.mock.calls.filter(
      ([, options]) => options.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0][1].body)).toMatchObject({
      dateOfEvent: "2024-07-10",
      currentUserId: "1",
    });
  },
);

test.each(["2024/07/", "2024/02/31", "2024/13/10"])(
  "partial or invalid typed date %s cannot normalize into a saved date or reuse the initial date",
  async (text) => {
    const { input, onSaved } = await renderForm("zh-CN", "zh-CN", zh);
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, text, { skipClick: true });
    fireEvent.blur(input);
    fillOtherRequiredFieldsAndSubmit(zh);
    expect(onSaved).not.toHaveBeenCalled();
    expect(
      fetcher.mock.calls.filter(([, options]) => options.method === "POST"),
    ).toHaveLength(0);
  },
);

test("clearing the current real calendar date prevents an implicit previous-date save", async () => {
  const { input, onSaved } = await renderForm("zh-CN", "zh-CN", zh);
  const user = userEvent.setup();
  await user.clear(input);
  fireEvent.blur(input);
  expect(input).toHaveValue("");
  expect(input._flatpickr.selectedDates).toHaveLength(0);
  fillOtherRequiredFieldsAndSubmit(zh);
  expect(onSaved).not.toHaveBeenCalled();
  expect(
    fetcher.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(0);
});

const openRegistrationWithTypedDate = async () => {
  const close = vi.fn();
  render(
    <MemoryRouter>
      <IntlProvider locale="zh-CN" messages={zh}>
        <UserSessionDetailsContext.Provider
          value={{ userSessionDetails: session, isCheckingLogin: () => false }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: { DEFAULT_DATE_LOCALE: "zh-CN" },
            }}
          >
            <NceRegistrationModal onClose={close} onSaved={vi.fn()} />
          </ConfigurationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(document.querySelector("#date-of-event")).toBeEnabled(),
  );
  const input = document.querySelector("#date-of-event");
  const user = userEvent.setup();
  await user.clear(input);
  await user.type(input, "2024/07/10");
  expect(input).toHaveValue("2024/07/10");
  return { input, calendar: input._flatpickr, user, close };
};
const escapeFrom = (target) => {
  fireEvent.keyDown(target, {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
  });
  fireEvent.keyUp(target, {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
  });
};
const noWrite = () =>
  expect(
    fetcher.mock.calls.filter(([, options]) => options.method === "POST"),
  ).toHaveLength(0);

test("modal calendar Escape closes the open calendar without requesting draft discard", async () => {
  const { input, calendar, close } = await openRegistrationWithTypedDate();
  expect(calendar.isOpen).toBe(true);
  expect(input).toHaveFocus();
  escapeFrom(input);
  expect(
    screen.queryByRole("dialog", { name: zh["nce.workspace.discardTitle"] }),
  ).not.toBeInTheDocument();
  expect(calendar.isOpen).toBe(false);
  expect(
    screen.getByRole("dialog", { name: zh["nce.form.title"] }),
  ).toBeInTheDocument();
  expect(input).toHaveValue("2024/07/10");
  expect(close).not.toHaveBeenCalled();
  noWrite();
  escapeFrom(input);
  expect(
    await screen.findByRole("dialog", {
      name: zh["nce.workspace.discardTitle"],
    }),
  ).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  noWrite();
});

test("modal Escape after the calendar is closed retains the original draft confirmation", async () => {
  const { input, calendar, close, user } =
    await openRegistrationWithTypedDate();
  await user.click(document.querySelector("#nce-description"));
  await waitFor(() => expect(calendar.isOpen).toBe(false));
  escapeFrom(document.activeElement);
  expect(
    await screen.findByRole("dialog", {
      name: zh["nce.workspace.discardTitle"],
    }),
  ).toBeInTheDocument();
  expect(close).not.toHaveBeenCalled();
  expect(input).toHaveValue("2024/07/10");
  noWrite();
});

test.each(["close", "cancel"])(
  "modal %s still protects the dirty draft while its calendar is open",
  async (action) => {
    const { calendar, close, user } = await openRegistrationWithTypedDate();
    expect(calendar.isOpen).toBe(true);
    const button =
      action === "close"
        ? document.querySelector(".nce-registration-modal .cds--modal-close")
        : screen.getByRole("button", { name: zh["label.button.cancel"] });
    await user.click(button);
    expect(
      await screen.findByRole("dialog", {
        name: zh["nce.workspace.discardTitle"],
      }),
    ).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    noWrite();
  },
);
