import {
  PendingSummaryError,
  readPendingSummaryJson,
} from "./pendingResultSummary";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function rolesKey(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((role) => typeof role === "string" && role.trim())
  )
    throw new PendingSummaryError("unavailable");
  return [...new Set(value as string[])].sort();
}

// /session exposes a freshly XOR-masked CSRF token on every read. That token
// is a write credential, not an identity. Compare the server's stable actor,
// session and permission scope without copying credentials to shared storage.
export function pendingSummarySessionKey(
  value: unknown,
  requiredRole: "Results" | "Validation" = "Results",
): string {
  if (!record(value)) throw new PendingSummaryError("unavailable");
  if (value.authenticated === false)
    throw new PendingSummaryError("unauthenticated");
  if (
    value.authenticated !== true ||
    typeof value.userId !== "string" ||
    !/^[1-9]\d{0,9}$/.test(value.userId) ||
    typeof value.sessionId !== "string" ||
    !value.sessionId.trim() ||
    (value.loginLabUnit != null && typeof value.loginLabUnit !== "string")
  )
    throw new PendingSummaryError("unavailable");
  const roles = rolesKey(value.roles);
  if (!roles.includes(requiredRole)) throw new PendingSummaryError("forbidden");
  const map = value.userLabRolesMap;
  if (map != null && !record(map)) throw new PendingSummaryError("unavailable");
  const scope =
    map == null
      ? null
      : Object.keys(map)
          .sort()
          .map((unit) => [unit, rolesKey(map[unit])]);
  return JSON.stringify([
    value.userId,
    value.sessionId,
    roles,
    value.loginLabUnit ?? null,
    scope,
  ]);
}

export async function readPendingSummarySession(
  signal: AbortSignal,
  requiredRole: "Results" | "Validation" = "Results",
): Promise<string> {
  return pendingSummarySessionKey(
    await readPendingSummaryJson("/session", signal),
    requiredRole,
  );
}
