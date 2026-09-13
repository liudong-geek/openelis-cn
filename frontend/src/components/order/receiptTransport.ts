import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";

// One dispatch only. An HTTP error is not a rollback receipt.
export async function postSpecimenReceipt(
  body: string,
  signal: AbortSignal,
  csrf: string,
) {
  const response = await fetch(
    config.serverBaseUrl + "/rest/specimen-receipts",
    {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
      body,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
        "X-CSRF-Token": csrf,
      },
    },
  );
  if (
    response.status !== 200 ||
    response.redirected ||
    !response.headers.get("content-type")?.includes("application/json") ||
    Number(response.headers.get("content-length")) > 65536 ||
    !response.body
  )
    throw new Error("order.receiving.unknown");
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > 65536)
        throw new Error("order.receiving.unknown");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw new Error("order.receiving.unknown");
    return JSON.parse(text);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
