type DateLocale = string | null | undefined;

export interface ParsedLocaleDate {
  year: number;
  month: number;
  day: number;
}

const normalizeDateLocale = (dateLocale: DateLocale): string =>
  String(dateLocale || "en-US")
    .trim()
    .replaceAll("_", "-")
    .toLowerCase();

const isLocaleFamily = (dateLocale: DateLocale, language: string): boolean => {
  const normalized = normalizeDateLocale(dateLocale);
  return normalized === language || normalized.startsWith(`${language}-`);
};

export const usesYearFirstDate = (dateLocale: DateLocale): boolean =>
  isLocaleFamily(dateLocale, "zh");

export const usesDayFirstDate = (dateLocale: DateLocale): boolean =>
  isLocaleFamily(dateLocale, "fr");

export const getDateFnsDateFormat = (dateLocale: DateLocale): string => {
  if (usesYearFirstDate(dateLocale)) return "yyyy/MM/dd";
  if (usesDayFirstDate(dateLocale)) return "dd/MM/yyyy";
  return "MM/dd/yyyy";
};

export const getCarbonDateFormat = (dateLocale: DateLocale): string => {
  if (usesYearFirstDate(dateLocale)) return "Y/m/d";
  if (usesDayFirstDate(dateLocale)) return "d/m/Y";
  return "m/d/Y";
};

export const getDatePickerPlaceholderMessage = (
  dateLocale: DateLocale,
): { id: string; defaultMessage: string } => {
  if (usesYearFirstDate(dateLocale)) {
    return {
      id: "datepicker.placeholder.ymd",
      defaultMessage: "yyyy/mm/dd",
    };
  }
  if (usesDayFirstDate(dateLocale)) {
    return {
      id: "datepicker.placeholder.dmy",
      defaultMessage: "dd/mm/yyyy",
    };
  }
  return {
    id: "datepicker.placeholder.mdy",
    defaultMessage: "mm/dd/yyyy",
  };
};

export const getDefaultDatePickerPlaceholder = (
  dateLocale: DateLocale,
): string => getDatePickerPlaceholderMessage(dateLocale).defaultMessage;

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const formatDatePartsForLocale = (
  year: number,
  month: number,
  day: number,
  dateLocale: DateLocale,
): string => {
  const yyyy = String(year).padStart(4, "0");
  const mm = pad2(month);
  const dd = pad2(day);

  if (usesYearFirstDate(dateLocale)) return `${yyyy}/${mm}/${dd}`;
  if (usesDayFirstDate(dateLocale)) return `${dd}/${mm}/${yyyy}`;
  return `${mm}/${dd}/${yyyy}`;
};

export const formatDateForLocale = (
  date: Date,
  dateLocale: DateLocale,
): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return formatDatePartsForLocale(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    dateLocale,
  );
};

export const parseDateForLocale = (
  value: unknown,
  dateLocale: DateLocale,
): ParsedLocaleDate | null => {
  const parts = String(value || "")
    .trim()
    .split("/");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  let year: number;
  let month: number;
  let day: number;
  if (usesYearFirstDate(dateLocale)) {
    [year, month, day] = parts.map(Number);
  } else if (usesDayFirstDate(dateLocale)) {
    [day, month, year] = parts.map(Number);
  } else {
    [month, day, year] = parts.map(Number);
  }

  if (String(year).length !== 4) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};
