// i18n-keys: nce.category.*
// i18n-keys: nce.type.*
export const nceOptionLabel = (option, intl) =>
  option?.displayKey &&
  /^nce\.(?:category|type)\.[A-Za-z0-9_]+$/.test(option.displayKey) &&
  intl.messages[option.displayKey]
    ? intl.formatMessage({ id: option.displayKey })
    : option?.name || "";
export const NCE_STATUS_KEYS = {
  Pending: "nce.status.open",
  "Under Investigation": "nce.status.underInvestigation",
  CAPA: "nce.status.correctiveAction",
  Completed: "nce.status.completed",
  Closed: "nce.status.closed",
};
export const nceStatusLabel = (status, intl) =>
  intl.formatMessage({ id: NCE_STATUS_KEYS[status] || "nce.status.unknown" });

// i18n-keys: nce.history.activity.*
const HISTORY_KEYS = {
  CREATED: "nce.history.activity.created",
  ACKNOWLEDGED: "nce.history.activity.acknowledged",
  ASSIGNED: "nce.history.activity.assigned",
  NOTE_ADDED: "nce.history.activity.noteAdded",
};
export const nceHistoryActivity = (entry, intl) =>
  HISTORY_KEYS[entry.activity]
    ? intl.formatMessage({ id: HISTORY_KEYS[entry.activity] })
    : entry.activity || "—";
export const nceHistoryDescription = (entry, intl) => {
  if (
    entry.activity === "CREATED" &&
    entry.description === "Non-conforming event registered"
  )
    return intl.formatMessage({ id: "nce.history.default.created" });
  if (
    entry.activity === "ACKNOWLEDGED" &&
    entry.description === "Non-conforming event acknowledged"
  )
    return intl.formatMessage({ id: "nce.history.default.acknowledged" });
  if (
    entry.activity === "ASSIGNED" &&
    entry.description?.startsWith("Assigned to ")
  )
    return intl.formatMessage(
      { id: "nce.history.default.assigned" },
      { name: entry.description.slice("Assigned to ".length) },
    );
  return entry.description || "—";
};
