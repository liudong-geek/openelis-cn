import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";
import { intakeFailure } from "./intakeDecision";

export async function postIntakeDecision(
  body: string,
  signal: AbortSignal,
  csrf: string,
  denied: () => void = () => {},
) {
  const response = await fetch(
    config.serverBaseUrl + "/rest/specimen-intake-decisions",
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
  if (response.status === 401 || response.status === 403) {
    denied();
    throw intakeFailure("denied");
  }
  if (
    response.status !== 200 ||
    response.redirected ||
    !response.headers.get("content-type")?.includes("application/json") ||
    Number(response.headers.get("content-length")) > 65536 ||
    !response.body
  )
    throw intakeFailure();
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > 65536) throw intakeFailure();
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw intakeFailure();
    return JSON.parse(text);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
