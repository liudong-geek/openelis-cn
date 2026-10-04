import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";

export const RULE_ENDPOINTS = {
  reflex: {
    list: "/rest/reflexrules",
    detail: "/rest/reflexrule/",
    save: "/rest/reflexrule",
    activate: "/rest/activate-reflexrule/",
    deactivate: "/rest/deactivate-reflexrule/",
  },
  calculation: {
    list: "/rest/test-calculations",
    detail: "/rest/test-calculation/",
    save: "/rest/test-calculation",
    activate: "/rest/activate-test-calculation/",
    deactivate: "/rest/deactivate-test-calculation/",
  },
};

// Local transport boundary: HTTP errors, HTML login redirects and incomplete
// JSON never become an empty successful list or a confirmed write.
const sessionCurrent = (session) => {
  try {
    return Boolean(
      session?.stamp &&
      session.current() &&
      localStorage.getItem("CSRF") === session.stamp.csrf,
    );
  } catch {
    return false;
  }
};
export async function ruleRequest(
  path,
  { method = "GET", body, signal, session } = {},
) {
  if (!sessionCurrent(session))
    return { status: 403, ok: false, data: undefined };
  try {
    const response = await fetch(config.serverBaseUrl + path, {
      method,
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
      signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": getRequestLocale(),
        ...(method !== "GET"
          ? {
              "Content-Type": "application/json",
              "X-CSRF-Token": session.stamp.csrf,
            }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    if (
      (response.headers.get("content-type") || "").includes("application/json")
    ) {
      try {
        data = await response.json();
      } catch {
        /* Invalid JSON is unconfirmed. */
      }
    }
    if (!sessionCurrent(session))
      return { status: 0, ok: false, data: undefined, sessionChanged: true };
    return {
      status: response.status,
      ok:
        response.ok &&
        !response.redirected &&
        response.type !== "opaqueredirect",
      data,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { status: 0, ok: false, data: undefined };
  }
}
