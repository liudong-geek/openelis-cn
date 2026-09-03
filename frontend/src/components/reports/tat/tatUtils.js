/**
 * Format TAT hours as a human-readable string (e.g., "2h 30m").
 */
const PRIORITY_MESSAGE_IDS = {
  ROUTINE: "order.priority.option.ROUTINE",
  STAT: "order.priority.option.STAT",
  ASAP: "order.priority.option.ASAP",
  TIMED: "order.priority.option.TIMED",
  FUTURE_STAT: "order.priority.option.FUTURE_STAT",
  ALL: "reports.tat.all",
};

const formatMessage = (intl, id, values, fallback) =>
  intl?.formatMessage ? intl.formatMessage({ id }, values) : fallback;

export function formatTat(hours, intl) {
  if (hours == null) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0 && m === 0)
    return formatMessage(intl, "reports.tat.duration.zero", {}, "0h 0m");
  if (h === 0)
    return formatMessage(
      intl,
      "reports.tat.duration.minutes",
      { minutes: m },
      `${m}m`,
    );
  if (m === 0)
    return formatMessage(
      intl,
      "reports.tat.duration.hours",
      { hours: h },
      `${h}h`,
    );
  return formatMessage(
    intl,
    "reports.tat.duration.hoursMinutes",
    { hours: h, minutes: m },
    `${h}h ${m}m`,
  );
}

export function formatTatPriority(priority, intl) {
  const raw = String(priority || "").trim();
  if (!raw) return "";
  const normalized = raw.replaceAll(" ", "_").toUpperCase();
  const id = PRIORITY_MESSAGE_IDS[normalized];
  if (id) return formatMessage(intl, id, {}, raw);
  if (/[\u3400-\u9fff]/.test(raw)) return raw;
  return formatMessage(
    intl,
    "reports.tat.priority.other",
    {},
    "Other priority",
  );
}

export function formatTatDimension(value, intl) {
  const raw = String(value || "").trim();
  const normalized = raw.replaceAll(" ", "_").toUpperCase();
  return PRIORITY_MESSAGE_IDS[normalized] ? formatTatPriority(raw, intl) : raw;
}

export function formatHistogramBin(binLabel, intl) {
  const range = /^(\d+)-(\d+)h$/.exec(String(binLabel || ""));
  if (range) {
    return formatMessage(
      intl,
      "reports.tat.duration.range",
      { from: range[1], to: range[2] },
      binLabel,
    );
  }
  const atLeast = /^(\d+)h\+$/.exec(String(binLabel || ""));
  if (atLeast) {
    return formatMessage(
      intl,
      "reports.tat.duration.atLeast",
      { hours: atLeast[1] },
      binLabel,
    );
  }
  return String(binLabel || "");
}
