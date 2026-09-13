import config from "../../config.json";
import { getRequestLocale } from "./LocaleUtils";

// Preserve status and JSON for explicit receipt reads. Never follow a login
// redirect, cache a clinical response, log its body, or turn a GET into a write.
export const readOpenElisResponse = (
  endpoint: string,
  signal: AbortSignal,
): Promise<Response> =>
  fetch(config.serverBaseUrl + endpoint, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    redirect: "manual",
    signal,
    headers: {
      Accept: "application/json",
      "Accept-Language": getRequestLocale(),
    },
  });
