import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";
import { MAX_JSON_BODY_BYTES, readBoundedJson } from "./readBoundedJson";

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
    Number(response.headers.get("content-length")) > MAX_JSON_BODY_BYTES ||
    !response.body
  )
    throw new RecollectionTransportError(
      "RECOLLECTION_UNKNOWN",
      response.status,
    );
  const reader = response.body.getReader();
  try {
    const value = await readBoundedJson(reader, signal, {
      invalidBody: () => new RecollectionTransportError(),
      cancelOnComplete: true,
    });
    if (!response.ok)
      throw new RecollectionTransportError(
        typeof value?.code === "string" ? value.code : "RECOLLECTION_UNKNOWN",
        response.status,
      );
    return value;
  } catch (error) {
    if (error instanceof RecollectionTransportError) throw error;
    throw new RecollectionTransportError();
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
