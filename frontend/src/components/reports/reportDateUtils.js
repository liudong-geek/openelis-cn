import {
  formatDatePartsForLocale,
  parseDateForLocale,
} from "../common/dateLocaleUtils";

const pad2 = (value) => String(value).padStart(2, "0");

export const formatLocalDateForReportApi = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${String(date.getFullYear()).padStart(4, "0")}-${pad2(
    date.getMonth() + 1,
  )}-${pad2(date.getDate())}`;
};

export const parseReportDisplayDateToApi = (value, dateLocale) => {
  const parsed = parseDateForLocale(value, dateLocale);
  if (!parsed) return "";
  return `${String(parsed.year).padStart(4, "0")}-${pad2(
    parsed.month,
  )}-${pad2(parsed.day)}`;
};

export const formatReportApiDateForLocale = (value, dateLocale) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return "";
  }
  return formatDatePartsForLocale(year, month, day, dateLocale);
};
