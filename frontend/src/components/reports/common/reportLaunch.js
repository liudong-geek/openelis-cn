import { parseDateForLocale } from "../../common/dateLocaleUtils";

/**
 * Builds a report URL without exposing report criteria to string-concatenation
 * bugs. Empty criteria are omitted so only the active search method reaches the
 * backend.
 */
export const buildReportUrl = (serverBaseUrl, params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const baseUrl = String(serverBaseUrl || "").replace(/\/$/, "");
  return `${baseUrl}/ReportPrint?${query.toString()}`;
};

const parseReportDate = (value, locale) => {
  const parts = parseDateForLocale(value, locale);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null;
};

export const isReportDateRangeValid = (startDate, endDate, locale) => {
  const start = parseReportDate(startDate, locale);
  const end = parseReportDate(endDate, locale);
  return start !== null && end !== null && start <= end;
};

/**
 * Opens the generated report and reports whether the browser accepted it.
 * Callers use the boolean to show a visible popup-blocked error instead of a
 * false success message.
 */
export const openReportWindow = (url) => {
  const reportWindow = window.open(url, "_blank");
  if (!reportWindow) {
    return false;
  }

  try {
    reportWindow.opener = null;
  } catch (_error) {
    // Some browsers expose a read-only WindowProxy; the report is still open.
  }
  return true;
};
