import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";
import { MAX_JSON_BODY_BYTES, readBoundedJson } from "./readBoundedJson";

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
    Number(response.headers.get("content-length")) > MAX_JSON_BODY_BYTES ||
    !response.body
  )
    throw new Error("order.receiving.unknown");
  return readBoundedJson(response.body.getReader(), signal, {
    invalidBody: () => new Error("order.receiving.unknown"),
    cancelOnComplete: false,
  });
}
