import {
  getCarbonDateFormat,
  getDatePickerPlaceholderMessage,
  getDefaultDatePickerPlaceholder,
  usesDayFirstDate,
  usesYearFirstDate,
} from "../common/dateLocaleUtils";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export { getDatePickerPlaceholderMessage, usesDayFirstDate, usesYearFirstDate };

/**
 * The REST backend parses dates with DEFAULT_DATE_LOCALE. Keep ISO dates in
 * React state, then convert only at the API boundary.
 */
export const convertIsoToBackendDate = (dateValue, dateLocale) => {
  if (!dateValue) return "";

  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) return dateValue;

  const [, year, month, day] = match;
  if (usesYearFirstDate(dateLocale)) return `${year}/${month}/${day}`;
  return usesDayFirstDate(dateLocale)
    ? `${day}/${month}/${year}`
    : `${month}/${day}/${year}`;
};

export const formatIsoDateForPicker = (dateValue, dateLocale) =>
  convertIsoToBackendDate(dateValue, dateLocale);

export const getDatePickerFormat = (dateLocale) =>
  getCarbonDateFormat(dateLocale);

export const getDatePickerPlaceholder = (dateLocale) =>
  getDefaultDatePickerPlaceholder(dateLocale);

/** Return the calendar date in the workstation's local time zone. */
export const toLocalIsoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
