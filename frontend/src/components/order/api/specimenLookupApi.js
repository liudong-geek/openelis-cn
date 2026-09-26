import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";

export class SpecimenLookupError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}

const errorKind = (status, code) => {
  if (status === 400) return "invalid";
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 409) {
    if (code === "SPECIMEN_LOOKUP_AMBIGUOUS") return "ambiguous";
    if (
      code === "SPECIMEN_LOOKUP_UNSUPPORTED" ||
      code === "SPECIMEN_LOOKUP_LEGACY_READONLY"
    )
      return "unsupported";
    return "conflict";
  }
  return "unavailable";
};

const validLookup = (data) =>
  data?.version === 1 &&
  data?.source === "specimen_lookup" &&
  data?.readOnly === true &&
  ["order", "specimen"].includes(data?.matchedKind) &&
  typeof data?.current?.labNo === "string" &&
  data.current.labNo.length > 0 &&
  Array.isArray(data.current.requestedSpecimens) &&
  Array.isArray(data.current.physicalSpecimens) &&
  data?.selection?.sampleId === data.current.sampleId &&
  (data.matchedKind !== "specimen" ||
    (data.selection.sampleItemId && data.selection.requestId));

export async function lookupSpecimen(code, { signal } = {}) {
  const input = String(code ?? "").trim();
  if (!input || input.length > 30) throw new SpecimenLookupError("invalid");

  try {
    const response = await fetch(
      `${config.serverBaseUrl}/rest/specimen-intake/lookup?code=${encodeURIComponent(input)}`,
      {
        method: "GET",
        credentials: "include",
        redirect: "manual",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Accept-Language": getRequestLocale(),
        },
        signal,
      },
    );
    if (response.redirected || response.type === "opaqueredirect")
      throw new SpecimenLookupError("unauthenticated");
    const json = response.headers
      .get("content-type")
      ?.includes("application/json");
    const body = json ? await response.json() : null;
    if (!response.ok)
      throw new SpecimenLookupError(errorKind(response.status, body?.code));
    if (!json || !validLookup(body))
      throw new SpecimenLookupError("unavailable");
    return body;
  } catch (error) {
    if (error?.name === "AbortError" || error instanceof SpecimenLookupError)
      throw error;
    throw new SpecimenLookupError("unavailable");
  }
}
