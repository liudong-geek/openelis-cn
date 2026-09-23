import type { EntrySession } from "./resultEntryState";
import { pendingSummarySessionKey } from "../../home/pendingSummarySession";

/** Read identity deliberately excludes write credentials and CSRF masks. */
export function resultReadSessionKey(context: EntrySession): string | null {
  if (
    context.errorLoadingSessionDetails ||
    (context.sessionPhase && context.sessionPhase !== "authenticated")
  )
    return null;
  try {
    return pendingSummarySessionKey(context.userSessionDetails);
  } catch {
    return null;
  }
}
