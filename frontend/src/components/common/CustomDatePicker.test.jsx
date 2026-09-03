import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import CustomDatePicker from "./CustomDatePicker";
import { ConfigurationContext } from "../layout/Layout";
import enMessages from "../../languages/en.json";
import zhMessages from "../../languages/zh.json";

const renderWithConfig = (
  props,
  locale = "en-US",
  intlLocale = "en",
  messages = enMessages,
) =>
  render(
    <IntlProvider locale={intlLocale} messages={messages} onError={() => {}}>
      <ConfigurationContext.Provider
        value={{ configurationProperties: { DEFAULT_DATE_LOCALE: locale } }}
      >
        <CustomDatePicker {...props} />
      </ConfigurationContext.Provider>
    </IntlProvider>,
  );

const findInput = () => {
  const inputs = screen.getAllByRole("textbox");
  // Carbon's DatePickerInput is the visible text input.
  return inputs[inputs.length - 1];
};

describe("CustomDatePicker — controlled input contract", () => {
  test("typing a full date calls onChange with the typed value", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithConfig({ id: "dob", value: "", onChange });
    const input = findInput();
    expect(input).toHaveClass("cds--date-picker__input");
    expect(input.closest(".oe-custom-date-picker")).toBeInTheDocument();

    // Initial mount fires onChange("") via the useEffect on currentDate. Ignore
    // that and only count post-mount typing.
    onChange.mockClear();

    await user.type(input, "01/15/1990");

    expect(
      onChange,
      "fully-typed valid date must propagate to the parent",
    ).toHaveBeenCalledWith("01/15/1990");
  });

  test("clearing a fully-typed date calls onChange with empty string", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithConfig({ id: "dob", value: "", onChange });
    const input = findInput();

    await user.type(input, "01/15/1990");
    onChange.mockClear();

    await user.clear(input);

    expect(
      onChange,
      "manual clear of a previously-valid date must reach the parent so " +
        "Formik does not keep submitting the stale value",
    ).toHaveBeenCalledWith("");
  });

  test.each(["zh", "zh-CN"])(
    "accepts a year-first Chinese date and shows the Chinese placeholder for %s",
    async (locale) => {
      const onChange = vi.fn();
      const user = userEvent.setup();

      renderWithConfig(
        { id: "dob", value: "", onChange },
        locale,
        "zh-CN",
        zhMessages,
      );
      const input = findInput();
      expect(input).toHaveAttribute("placeholder", "年/月/日");
      onChange.mockClear();

      await user.type(input, "2026/08/21");

      expect(onChange).toHaveBeenCalledWith("2026/08/21");
    },
  );

  test.each([
    ["en-US", "mm/dd/yyyy", "08/21/2026"],
    ["fr-FR", "dd/mm/yyyy", "21/08/2026"],
  ])("keeps the %s input contract", async (locale, placeholder, value) => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    renderWithConfig({ id: "dob", value: "", onChange }, locale);
    const input = findInput();
    expect(input).toHaveAttribute("placeholder", placeholder);
    onChange.mockClear();

    await user.type(input, value);

    expect(onChange).toHaveBeenCalledWith(value);
  });

  test.each([
    ["zh-CN", { disallowFutureDate: true }],
    ["zh-CN", { disallowPastDate: true }],
  ])(
    "passes a locale-neutral Date boundary for %s",
    (locale, boundaryProps) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      renderWithConfig(
        {
          id: "bounded-date",
          value: "",
          onChange: vi.fn(),
          ...boundaryProps,
        },
        locale,
        "zh-CN",
        zhMessages,
      );

      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining("Invalid date provided"),
      );
      expect(error).not.toHaveBeenCalledWith(
        expect.stringContaining("Invalid date provided"),
      );

      warn.mockRestore();
      error.mockRestore();
    },
  );

  test("renders a configured Chinese value without Flatpickr parse warnings", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithConfig(
      {
        id: "configured-date",
        value: "2026/08/27",
        onChange: vi.fn(),
      },
      "zh-CN",
      "zh-CN",
      zhMessages,
    );

    expect(findInput()).toHaveValue("2026/08/27");
    expect(document.querySelectorAll("#configured-date")).toHaveLength(1);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Invalid date provided"),
    );
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining("Invalid date provided"),
    );

    warn.mockRestore();
    error.mockRestore();
  });

  test("keeps a year-first configured value while locale configuration is loading", () => {
    renderWithConfig(
      {
        id: "early-configured-date",
        value: "2026/08/27",
        onChange: vi.fn(),
      },
      "",
    );

    expect(findInput()).toHaveValue("2026/08/27");
  });
});
