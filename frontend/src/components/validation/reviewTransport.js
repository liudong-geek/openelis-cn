import config from "../../config.json";
import { getRequestLocale } from "../utils/LocaleUtils";

// This endpoint must expose HTTP failures to its caller: a JSON error body is
// never a review batch, and a login redirect is never a successful submission.
export const getReviewResults = async (endpoint, callback, signal) => {
  try {
    const response = await fetch(config.serverBaseUrl + endpoint, {
      credentials: "include",
      method: "GET",
      signal,
      headers: { "Accept-Language": getRequestLocale() },
    });
    if (response.redirected) return callback(undefined, 401);
    if (!response.ok) return callback(undefined, response.status);
    if (!response.headers.get("content-type")?.includes("application/json")) {
      return callback(undefined, 0);
    }
    callback(await response.json(), response.status);
  } catch (error) {
    if (error.name !== "AbortError") callback(undefined, 0);
  }
};

export const postReviewResults = async (payload, callback) => {
  try {
    const response = await fetch(
      config.serverBaseUrl + "/rest/AccessionValidation",
      {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": localStorage.getItem("CSRF") || "",
          "Accept-Language": getRequestLocale(),
        },
        body: JSON.stringify(payload),
      },
    );
    // Drain and verify the response before navigating. A direct login/error
    // page with HTTP 200 is not proof that a clinical write succeeded.
    const body = await response.text();
    if (response.redirected) return callback(401);
    if (!response.ok) return callback(response.status);
    if (!response.headers.get("content-type")?.includes("application/json"))
      return callback(0);
    const form = JSON.parse(body);
    callback(form?.queryId === payload.queryId ? response.status : 0);
  } catch {
    callback(0);
  }
};

export const hasReviewQuery = (value) =>
  typeof value === "string" && value.trim().length > 0;

export const reviewContextErrorKey = (status) =>
  status === 401 || status === 403
    ? "validation.query.permissionChanged"
    : "validation.query.expired";
