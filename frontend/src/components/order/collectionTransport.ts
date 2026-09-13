import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";

// Dedicated collection transport: one attempt, no redirects, no response/body
// logging, and no legacy response handler that can navigate away from the draft.
export async function postRecoveredCollection(
  body: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    config.serverBaseUrl + "/rest/SamplePatientEntry",
    {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
        "X-CSRF-Token": localStorage.getItem("CSRF") || "",
      },
    },
  );
  if (
    response.status !== 200 ||
    response.redirected ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error("order.collectionRecovery.unknown");
  const maximum = 1024 * 1024;
  if (
    Number(response.headers.get("content-length")) > maximum ||
    !response.body
  )
    throw new Error("order.collectionRecovery.unknown");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > maximum)
        throw new Error("order.collectionRecovery.unknown");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw new Error("order.collectionRecovery.unknown");
    return {
      status: response.status,
      redirected: response.redirected,
      data: JSON.parse(text),
    };
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
