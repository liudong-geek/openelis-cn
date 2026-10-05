import {
  convertIsoToBackendDate,
  toLocalIsoDate,
} from "../../order/orderDateUtils";
import { readOpenElisResponse } from "../../utils/readOpenElisResponse";
import { readPendingSummarySession } from "../../home/pendingSummarySession";

// Opaque in-memory owner token: history never stores the server's session ID.
// A full reload intentionally starts a fresh query instead of trusting old history.
const historyOwners = new Map();
export const referralHistoryOwner = (actor) => {
  if (!actor) return "";
  if (!historyOwners.has(actor)) {
    const random = new Uint32Array(4);
    window.crypto.getRandomValues(random);
    historyOwners.set(
      actor,
      Array.from(random, (part) => part.toString(16).padStart(8, "0")).join(""),
    );
  }
  return historyOwners.get(actor);
};
export const forgetReferralHistoryOwner = (actor) =>
  historyOwners.delete(actor);

export const referralModes = ["TEST_AND_DATES", "PATIENT", "LAB_NUMBER"];
export class ReferralQueryError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind;
  }
}
export const recentReferralDraft = (today = new Date()) => {
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 6,
  );
  return {
    mode: "TEST_AND_DATES",
    dateType: "SENT",
    startDate: toLocalIsoDate(start),
    endDate: toLocalIsoDate(today),
    testIds: [],
    testUnitIds: [],
    labNumber: "",
    patientId: "",
  };
};
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};
export const buildReferralParams = (draft, dateLocale) => {
  if (!referralModes.includes(draft.mode))
    throw new ReferralQueryError("invalid");
  const params = new URLSearchParams({ searchType: draft.mode });
  if (draft.mode === "PATIENT") {
    if (!/^[1-9]\d*$/.test(String(draft.patientId || "")))
      throw new ReferralQueryError("patient");
    params.set("selPatient", draft.patientId);
  } else if (draft.mode === "LAB_NUMBER") {
    const number = String(draft.labNumber || "").trim();
    if (!number) throw new ReferralQueryError("number");
    params.set("labNumber", number);
  } else {
    if (!dateLocale) throw new ReferralQueryError("configuration");
    if (
      ![draft.testIds, draft.testUnitIds].every(
        (ids) =>
          Array.isArray(ids) &&
          ids.every((id) => typeof id === "string" && /^[1-9]\d*$/.test(id)),
      )
    )
      throw new ReferralQueryError("invalid");
    if (
      !["SENT", "RESULT"].includes(draft.dateType) ||
      [draft.startDate, draft.endDate].some(
        (value) => value && !validDate(value),
      ) ||
      (draft.startDate && draft.endDate && draft.startDate > draft.endDate)
    )
      throw new ReferralQueryError("date");
    if (
      !draft.startDate &&
      !draft.endDate &&
      !draft.testIds.length &&
      !draft.testUnitIds.length
    )
      throw new ReferralQueryError("conditions");
    params.set("dateType", draft.dateType);
    params.set(
      "startDate",
      convertIsoToBackendDate(draft.startDate, dateLocale),
    );
    params.set("endDate", convertIsoToBackendDate(draft.endDate, dateLocale));
    params.set("testIds", draft.testIds.join(","));
    params.set("testUnitIds", draft.testUnitIds.join(","));
  }
  return params;
};
export async function readReferralRecords(params, signal, expectedOwner) {
  const owner = await readPendingSummarySession(signal);
  if (!expectedOwner || owner !== expectedOwner)
    throw new ReferralQueryError("scope");
  const response = await readOpenElisResponse(
    `/rest/ReferredOutTests?${params}`,
    signal,
  );
  if (response.status === 401) throw new ReferralQueryError("unauthenticated");
  if (response.status === 403) throw new ReferralQueryError("forbidden");
  if (response.status === 400) throw new ReferralQueryError("invalid");
  if (
    response.status !== 200 ||
    response.redirected ||
    !/^application\/json(?:;|$)/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new ReferralQueryError("unavailable");
  const result = await response.json();
  if (
    !result ||
    !Array.isArray(result.referralDisplayItems) ||
    result.referralDisplayItems.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        [
          "resultDate",
          "accessionNumber",
          "referredSendDate",
          "referralStatus",
          "referralStatusDisplay",
          "patientLastName",
          "patientFirstName",
          "referringTestName",
          "referralResultsDisplay",
          "referenceLabDisplay",
          "notes",
        ].some((key) => row[key] != null && typeof row[key] !== "string") ||
        (row.analysisId != null &&
          !(
            (typeof row.analysisId === "string" &&
              /^[1-9]\d*$/.test(row.analysisId)) ||
            (typeof row.analysisId === "number" &&
              Number.isSafeInteger(row.analysisId) &&
              row.analysisId > 0)
          )) ||
        (row.disabled != null && typeof row.disabled !== "boolean"),
    )
  )
    throw new ReferralQueryError("unavailable");
  if (signal.aborted || (await readPendingSummarySession(signal)) !== owner)
    throw new ReferralQueryError("scope");
  return { rows: result.referralDisplayItems, owner };
}
