// Only an opaque submission marker is persisted. Patient drafts and media stay
// in memory. Account identity is stable across token refreshes and role changes.
export const patientMaintenancePendingKey = (
  account: string,
  patientId: string,
) =>
  account && patientId
    ? `oe.patient-maintenance.pending:${encodeURIComponent(account)}:${encodeURIComponent(patientId)}`
    : null;

export const readPatientMaintenancePending = (
  key: string | null,
): "clear" | "pending" | "unavailable" => {
  if (!key) return "unavailable";
  try {
    return window.sessionStorage.getItem(key) === null ? "clear" : "pending";
  } catch {
    return "unavailable";
  }
};

export const beginPatientMaintenancePending = (
  key: string | null,
): "started" | "pending" | "unavailable" => {
  const previous = readPatientMaintenancePending(key);
  if (previous !== "clear") return previous;
  try {
    window.sessionStorage.setItem(key!, "pending");
    return window.sessionStorage.getItem(key!) === "pending"
      ? "started"
      : "unavailable";
  } catch {
    return "unavailable";
  }
};

export const clearPatientMaintenancePending = (key: string | null): boolean => {
  if (!key) return false;
  try {
    window.sessionStorage.removeItem(key);
    return window.sessionStorage.getItem(key) === null;
  } catch {
    return false;
  }
};
