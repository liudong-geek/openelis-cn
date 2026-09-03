const ALERT_TYPE_MESSAGE_IDS = Object.freeze({
  CRITICAL_UNACKNOWLEDGED: "alerts.type.critical_unacknowledged",
  EQUIPMENT_FAILURE: "alerts.type.equipment_failure",
  EQA_DEADLINE: "alerts.type.eqa_deadline",
  FREEZER_TEMPERATURE: "alerts.type.freezer_temperature",
  INVENTORY_LOW: "alerts.type.inventory_low",
  OTHER: "alerts.type.other",
  SAMPLE_EXPIRATION: "alerts.type.sample_expiration",
  SAMPLE_TRACKING: "alerts.type.sample_tracking",
  STAT_OVERDUE: "alerts.type.stat_overdue",
  STAT_UPCOMING: "alerts.type.stat_upcoming",
});

const ALERT_MESSAGE_IDS = Object.freeze({
  CRITICAL_UNACKNOWLEDGED: "alerts.message.critical_unacknowledged",
  EQUIPMENT_FAILURE: "alerts.message.equipment_failure",
  EQA_DEADLINE: "alerts.message.eqa_deadline",
  FREEZER_TEMPERATURE: "alerts.message.freezer_temperature",
  INVENTORY_LOW: "alerts.message.inventory_low",
  SAMPLE_EXPIRATION: "alerts.message.sample_expiration",
  SAMPLE_TRACKING: "alerts.message.sample_tracking",
  STAT_OVERDUE: "alerts.message.stat_overdue",
  STAT_UPCOMING: "alerts.message.stat_upcoming",
});

export const formatAlertType = (alertType, intl) =>
  intl.formatMessage({
    id: ALERT_TYPE_MESSAGE_IDS[alertType] || "alerts.type.other",
  });

export const formatAlertMessage = (alert, intl) =>
  intl.formatMessage({
    id: ALERT_MESSAGE_IDS[alert?.alertType] || "alerts.message.generic",
  });
