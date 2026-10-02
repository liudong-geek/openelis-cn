const STATUS_MESSAGES = {
  entered: "eorder.status.entered",
  cancelled: "eorder.status.cancelled",
  canceled: "eorder.status.cancelled",
  realized: "eorder.status.realized",
  已实现: "eorder.status.realized",
  nonconforming: "eorder.status.nonConforming",
  nonconformingorder: "eorder.status.nonConforming",
  不符合订单: "eorder.status.nonConforming",
  awaitingspecimen: "eorder.status.awaitingSpecimen",
};

const PRIORITY_MESSAGES = {
  ROUTINE: "order.priority.option.ROUTINE",
  STAT: "order.priority.option.STAT",
  ASAP: "order.priority.option.ASAP",
  TIMED: "order.priority.option.TIMED",
  FUTURE_STAT: "order.priority.option.FUTURE_STAT",
};

// Translate only the visible label. The original codes still control receiving
// and editing, and unknown/localized values remain visible without guessing.
export function electronicOrderStatusLabel(value, intl) {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/[\s_-]/g, "");
  const id = STATUS_MESSAGES[key];
  return id ? intl.formatMessage({ id, defaultMessage: raw }) : raw;
}

export function electronicOrderPriorityLabel(value, intl) {
  const raw = String(value ?? "").trim();
  const key = raw.toUpperCase().replace(/[\s-]/g, "_");
  const id = PRIORITY_MESSAGES[key];
  return id ? intl.formatMessage({ id, defaultMessage: raw }) : raw;
}
