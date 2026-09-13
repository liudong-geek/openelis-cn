// Store no clinical identity, payload, PDF or credential. An unresolved
// generation protects this tab; reopening a panel is not rollback evidence.
const KEY = "lis.labels.pending.v1";
export const labelFailure = (code) => Object.assign(new Error(code), { code });
export function hasPendingLabels() {
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}
export function rememberLabels() {
  if (hasPendingLabels()) throw labelFailure("UNCONFIRMED");
  try {
    const marker = JSON.stringify({ version: 1, nonce: crypto.randomUUID() });
    sessionStorage.setItem(KEY, marker);
    if (sessionStorage.getItem(KEY) !== marker) throw new Error();
    return marker;
  } catch {
    throw labelFailure("STORAGE_UNAVAILABLE");
  }
}
export function forgetLabels(marker) {
  try {
    if (!marker || sessionStorage.getItem(KEY) !== marker) throw new Error();
    sessionStorage.removeItem(KEY);
    if (sessionStorage.getItem(KEY) !== null) throw new Error();
  } catch {
    throw labelFailure("UNCONFIRMED");
  }
}
