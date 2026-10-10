import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";

// This endpoint must expose HTTP failures to its caller: a JSON error body is
// never a review batch, and a login redirect is never a successful submission.
export const getReviewResults = async (endpoint, callback, signal) => {
  if (signal?.aborted) return;
  const controller = new AbortController();
  let stop;
  const stopped = new Promise((resolve) => {
    stop = resolve;
  });
  const cancel = () => {
    controller.abort();
    stop({ cancelled: true });
  };
  const timer = setTimeout(() => {
    controller.abort();
    stop({ data: undefined, status: 0 });
  }, 30000);
  signal?.addEventListener("abort", cancel, { once: true });
  let result;
  try {
    result = await Promise.race([
      stopped,
      (async () => {
        const response = await fetch(config.serverBaseUrl + endpoint, {
          credentials: "include",
          method: "GET",
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
          headers: { "Accept-Language": getRequestLocale() },
        });
        if (response.redirected || response.type === "opaqueredirect")
          return { data: undefined, status: 401 };
        if (!response.ok) return { data: undefined, status: response.status };
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            response.headers.get("content-type") || "",
          )
        )
          return { data: undefined, status: 0 };
        return { data: await response.json(), status: response.status };
      })(),
    ]);
  } catch {
    result = { data: undefined, status: 0 };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
  if (!signal?.aborted && !result?.cancelled)
    callback(result.data, result.status);
};

export const postReviewResults = async (payload, callback, options = {}) => {
  const controller = new AbortController();
  let timer;
  let cancel;
  const stopped = new Promise((_, reject) => {
    cancel = () => {
      controller.abort();
      reject(new Error("REVIEW_STOPPED"));
    };
    timer = setTimeout(cancel, 30000);
  });
  options.signal?.addEventListener("abort", cancel, { once: true });
  if (options.signal?.aborted) cancel();
  let status = 0;
  try {
    status = await Promise.race([
      stopped,
      (async () => {
        if (controller.signal.aborted) return 0;
        const response = await fetch(
          config.serverBaseUrl + "/rest/AccessionValidation",
          {
            credentials: "include",
            method: "POST",
            cache: "no-store",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token":
                options.csrf ?? localStorage.getItem("CSRF") ?? "",
              "Accept-Language": getRequestLocale(),
            },
            body: JSON.stringify(payload),
          },
        );
        if (response.redirected || response.type === "opaqueredirect")
          return 401;
        if (!response.ok) return response.status;
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            response.headers.get("content-type") || "",
          )
        )
          return 0;
        const form = JSON.parse(await response.text());
        if (controller.signal.aborted || form?.error || form?.success === false)
          return 0;
        return form?.queryId === payload.queryId ? response.status : 0;
      })(),
    ]);
  } catch {
    status = 0;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
    controller.abort();
  }
  callback(status);
};

export const hasReviewQuery = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const reviewContextErrorKey = (status) =>
  status === 401 || status === 403
    ? "validation.query.permissionChanged"
    : "validation.query.expired";
