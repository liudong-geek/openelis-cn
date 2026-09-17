import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";

export class RecollectionTransportError extends Error {
  code: string;
  status: number;

  constructor(code = "RECOLLECTION_UNKNOWN", status = 0) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function readJson(response: Response, signal: AbortSignal) {
  if (
    response.redirected ||
    !response.headers.get("content-type")?.includes("application/json") ||
    Number(response.headers.get("content-length")) > 65536 ||
    !response.body
  )
    throw new RecollectionTransportError(
      "RECOLLECTION_UNKNOWN",
      response.status,
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > 65536)
        throw new RecollectionTransportError();
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw new RecollectionTransportError();
    const value = JSON.parse(text);
    if (!response.ok)
      throw new RecollectionTransportError(
        typeof value?.code === "string" ? value.code : "RECOLLECTION_UNKNOWN",
        response.status,
      );
    return value;
  } catch (error) {
    if (error instanceof RecollectionTransportError) throw error;
    throw new RecollectionTransportError();
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function createRecollection(
  body: string,
  csrf: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    config.serverBaseUrl + "/rest/specimen-recollections",
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
  return readJson(response, signal);
}

export async function readRecollection(
  sampleId: string,
  sourceSampleItemId: string,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ sampleId, sourceSampleItemId });
  const response = await fetch(
    config.serverBaseUrl + `/rest/specimen-recollections/current?${query}`,
    {
      method: "GET",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
      },
    },
  );
  return readJson(response, signal);
}
