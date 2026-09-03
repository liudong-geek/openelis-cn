import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useContext,
} from "react";
import { DatePicker, DatePickerInput } from "@carbon/react";
import { useIntl } from "react-intl";
import { ConfigurationContext } from "../layout/Layout";
import {
  formatDateForLocale,
  getCarbonDateFormat,
  getDatePickerPlaceholderMessage,
  parseDateForLocale,
  usesDayFirstDate,
  usesYearFirstDate,
} from "./dateLocaleUtils";

const CustomDatePicker = (props) => {
  const [currentDate, setCurrentDate] = useState(
    props.value ? props.value : "",
  );
  const { configurationProperties = {} } =
    useContext(ConfigurationContext) || {};
  const configuredDateLocale = configurationProperties.DEFAULT_DATE_LOCALE;
  const currentDateText = String(currentDate || "");
  const inferredDateLocale = /^\d{4}\//.test(currentDateText)
    ? "zh-CN"
    : /^(?:1[3-9]|2\d|3[01])\//.test(currentDateText)
      ? "fr-FR"
      : "en-US";
  const dateLocale = configuredDateLocale || inferredDateLocale;
  const intl = useIntl();
  const parseConfiguredDate = useCallback(
    (value) => {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }

      // Configuration arrives asynchronously on some legacy pages. During
      // that first render, accept the three supported display orders so a
      // valid configured date is not handed to Flatpickr under the wrong
      // temporary locale.
      const parsedDate =
        parseDateForLocale(value, dateLocale) ||
        ["zh-CN", "en-US", "fr-FR"]
          .map((locale) => parseDateForLocale(value, locale))
          .find(Boolean);
      return parsedDate
        ? new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day)
        : null;
    },
    [dateLocale],
  );
  const carbonValue = useMemo(
    () => parseConfiguredDate(currentDate) || currentDate,
    [currentDate, parseConfiguredDate],
  );
  const parseCarbonDate = useCallback(
    (value) => {
      const parsedDate = parseConfiguredDate(value);
      return parsedDate || false;
    },
    [parseConfiguredDate],
  );
  function handleDatePickerChange(e) {
    const raw = e?.[0];
    if (!raw || isNaN(new Date(raw).getTime())) {
      setCurrentDate("");
      props.onChange("");
      return;
    }
    const formatDate = formatDateForLocale(new Date(raw), dateLocale);
    setCurrentDate(formatDate);
    props.onChange(formatDate);
  }

  function handleInputChange(e) {
    const inputValue = e.target.value;

    // Empty input must clear state and propagate to the parent. The partial
    // regex below accepts the empty string (all groups are zero-or-more), so
    // without this branch a manual clear silently leaves the prior value in
    // place.
    if (inputValue === "") {
      setCurrentDate("");
      return;
    }

    const partialDateRegex = usesYearFirstDate(dateLocale)
      ? /^(\d{0,4})(\/(\d{0,2})(\/(\d{0,2})?)?)?$/
      : /^(\d{0,2})(\/(\d{0,2})(\/(\d{0,4})?)?)?$/;

    const fullDateRegex = usesYearFirstDate(dateLocale)
      ? /^\d{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])$/
      : usesDayFirstDate(dateLocale)
        ? /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/
        : /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;

    if (!partialDateRegex.test(inputValue)) {
      e.target.value = "";
      return;
    }
    if (fullDateRegex.test(inputValue)) {
      setCurrentDate(inputValue);
    }
  }

  useEffect(() => {
    props.onChange(currentDate);
  }, [currentDate]);

  useEffect(() => {
    if (props.updateStateValue) {
      setCurrentDate(props.value);
    }
  }, [props.value]);

  return (
    <>
      <DatePicker
        dateFormat={getCarbonDateFormat(dateLocale)}
        className={["oe-custom-date-picker", props.className]
          .filter(Boolean)
          .join(" ")}
        datePickerType="single"
        // Flatpickr parses a string `value` before Carbon applies dateFormat.
        // Passing a localized value such as 2026/08/27 therefore clears the
        // input and emits warnings. Preserve the public localized-string
        // contract, but give Carbon a locale-neutral Date for valid values.
        value={carbonValue}
        // Carbon only supplies its own parser for the US m/d/Y format. Give
        // Flatpickr an explicit parser for every configured locale so typed
        // and pre-filled Chinese/French dates are interpreted consistently.
        parseDate={parseCarbonDate}
        onChange={(e) => handleDatePickerChange(e)}
        // Carbon passes maxDate/minDate straight to Flatpickr. Supplying the
        // localized display string (for example 2026/08/25) makes Flatpickr
        // parse the boundary before applying this component's dateFormat and
        // emits an "Invalid date provided" warning on every page mount. A
        // real Date keeps the boundary locale-neutral while the visible input
        // still follows the configured Chinese format.
        maxDate={props.disallowFutureDate ? new Date() : undefined}
        minDate={props.disallowPastDate ? new Date() : undefined}
      >
        <DatePickerInput
          id={props.id}
          placeholder={intl.formatMessage(
            getDatePickerPlaceholderMessage(dateLocale),
          )}
          type="text"
          labelText={props.labelText}
          invalid={props.invalid}
          invalidText={props.invalidText}
          disabled={props.disabled}
          onChange={handleInputChange}
        />
      </DatePicker>
    </>
  );
};

export default CustomDatePicker;
