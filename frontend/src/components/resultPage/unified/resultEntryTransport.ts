import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";
import { readOpenElisResponse } from "../../utils/readOpenElisResponse";

export interface EntryRequestError {
  status: number;
  errorKey: string;
}
const failure = (status: number): EntryRequestError => ({
  status,
  errorKey:
    status === 401
      ? "security.sessionExpired"
      : status === 403
        ? "security.accessDenied"
        : "common.api.invalidResponse",
});
const readPath = (path: string) =>
  path === "/rest/results-entry/pending" ||
  path === "/rest/results-entry/lab-units" ||
  path === "/rest/analysis-status-types" ||
  /^\/rest\/LogbookResults\?[^#]*$/.test(path);
async function readJson(response: Response, signal: AbortSignal) {
  if (
    response.redirected ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    ) ||
    Number(response.headers.get("content-length")) > 4 * 1024 * 1024 ||
    !response.body
  )
    throw failure(response.status);
  const reader = response.body.getReader(),
    decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (signal.aborted || size > 4 * 1024 * 1024)
        throw failure(response.status);
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw failure(response.status);
    return JSON.parse(text);
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Results-only boundary: bounded, no redirect, no retry, no body logging. */
export function readResultWorkbench<T>(
  path: string,
  callback: (data?: T, error?: EntryRequestError) => void,
): void {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(failure(0));
    }, 30000);
  });
  const operation = async (): Promise<T> => {
    if (!readPath(path)) throw failure(0);
    const response = await readOpenElisResponse(path, abort.signal);
    if (response.status !== 200) throw failure(response.status);
    return await readJson(response, abort.signal);
  };
  void Promise.race([operation(), deadline])
    .then(
      (data) => callback(data),
      (error) => {
        const status =
          error && typeof error === "object" && "status" in error
            ? Number(error.status)
            : 0;
        callback(
          undefined,
          status
            ? failure(status)
            : { status: 0, errorKey: "common.api.networkError" },
        );
      },
    )
    .finally(() => clearTimeout(timer));
}

export function saveResultWorkbench<T>(
  path: string,
  body: string,
  callback: (data: T) => void,
  csrf: string,
): void {
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout>,
    status = 0;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      abort.abort();
      reject(failure(0));
    }, 30000);
  });
  const operation = async (): Promise<T> => {
    if (
      !/^\/rest\/results-entry\/analysis\/[1-9][0-9]{0,9}\/result$/.test(
        path,
      ) ||
      !csrf
    )
      throw failure(0);
    const response = await fetch(config.serverBaseUrl + path, {
      method: "POST",
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal: abort.signal,
      body,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
        "X-CSRF-Token": csrf,
      },
    });
    status = response.status;
    if (![200, 400, 409].includes(status)) throw failure(status);
    const payload = await readJson(response, abort.signal);
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw failure(status);
    return { ...payload, status } as T;
  };
  void Promise.race([operation(), deadline])
    .then(
      (data) => callback(data),
      () => {
        callback({
          status,
          errorKey: failure(status).errorKey,
          unconfirmed: true,
        } as T);
      },
    )
    .finally(() => clearTimeout(timer));
}
