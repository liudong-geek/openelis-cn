import config from "../../../config.json";
import type {
  PatientMergeApiError,
  PatientMergeRequest,
  PatientMergeResult,
  PatientRecord,
  PatientSearchCriteria,
  PatientSearchResponse,
} from "../types";
import {
  validatePatientSearchPage,
  type PatientSearchPagingContext,
} from "../patientSearchPagingContract";

/**
 * Patient Merge API Service
 * Handles all API calls for the patient merge feature
 */

/**
 * Get patient details for merge preview
 * @param {string} patientId - The patient ID
 * @returns {Promise<Object>} Patient merge details
 */
type FormatMessage = (descriptor: { id: string }) => string;

/** Technical guard for the merge screen's client-side result aggregation. */
export const MAX_PATIENT_MERGE_SEARCH_PAGES = 200;

const throwIfSearchAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("Patient search aborted", "AbortError");
  }
};

const readErrorData = async (
  response: Response,
  fallbackMessage: string,
): Promise<PatientMergeApiError> => {
  const rawErrorData: unknown = await response.json().catch(() => ({}));
  const errorData =
    rawErrorData &&
    typeof rawErrorData === "object" &&
    !Array.isArray(rawErrorData)
      ? (rawErrorData as PatientMergeApiError)
      : {};
  return {
    ...errorData,
    status: response.status,
    message: errorData.message || fallbackMessage,
  };
};

export const getPatientMergeDetails = async (
  patientId: string,
): Promise<PatientRecord> => {
  const response = await fetch(
    `${config.serverBaseUrl}/rest/patient/merge/details/${patientId}`,
    {
      credentials: "include",
      method: "GET",
    },
  );

  if (!response.ok) {
    throw await readErrorData(response, "Failed to get patient details");
  }

  return response.json();
};

/**
 * Validate patient merge eligibility
 * @param {Object} request - Merge validation request
 * @param {string} request.patient1Id - First patient ID
 * @param {string} request.patient2Id - Second patient ID
 * @param {string} request.primaryPatientId - ID of patient to keep
 * @returns {Promise<Object>} Validation result with errors/warnings
 */
export const validatePatientMerge = async (
  request: PatientMergeRequest,
): Promise<PatientMergeResult> => {
  const response = await fetch(
    `${config.serverBaseUrl}/rest/patient/merge/validate`,
    {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": localStorage.getItem("CSRF"),
      },
      body: JSON.stringify({
        patient1Id: request.patient1Id,
        patient2Id: request.patient2Id,
        primaryPatientId: request.primaryPatientId,
        reason: request.reason || "",
        confirmed: false,
      }),
    },
  );

  if (!response.ok) {
    throw await readErrorData(response, "Validation failed");
  }

  return response.json();
};

/**
 * Execute patient merge
 * @param {Object} request - Merge execution request
 * @param {string} request.patient1Id - First patient ID
 * @param {string} request.patient2Id - Second patient ID
 * @param {string} request.primaryPatientId - ID of patient to keep
 * @param {string} request.reason - Reason for merge
 * @returns {Promise<Object>} Execution result with audit ID
 */
export const executePatientMerge = async (
  request: PatientMergeRequest,
): Promise<PatientMergeResult> => {
  const response = await fetch(
    `${config.serverBaseUrl}/rest/patient/merge/execute`,
    {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": localStorage.getItem("CSRF"),
      },
      body: JSON.stringify({
        patient1Id: request.patient1Id,
        patient2Id: request.patient2Id,
        primaryPatientId: request.primaryPatientId,
        reason: request.reason,
        confirmed: true,
      }),
    },
  );

  if (!response.ok) {
    throw await readErrorData(response, "Merge execution failed");
  }

  return response.json();
};

/**
 * Search patients (using existing patient search endpoint)
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Object>} Search results
 */
export const searchPatients = async (
  searchParams: PatientSearchCriteria,
  signal?: AbortSignal,
): Promise<PatientSearchResponse> => {
  const queryParams = new URLSearchParams({
    lastName: searchParams.lastName || "",
    firstName: searchParams.firstName || "",
    STNumber: searchParams.patientId || "",
    subjectNumber: searchParams.patientId || "",
    nationalID: searchParams.patientId || "",
    labNumber: searchParams.labNumber || "",
    guid: searchParams.guid || "",
    dateOfBirth: searchParams.dateOfBirth || "",
    gender: searchParams.gender || "",
    suppressExternalSearch: String(searchParams.suppressExternalSearch ?? true),
  });

  const endpoint = `${config.serverBaseUrl}/rest/patient-search-results`;
  const loadPage = async (params: URLSearchParams) => {
    throwIfSearchAborted(signal);
    const response = await fetch(`${endpoint}?${params}`, {
      credentials: "include",
      method: "GET",
      signal,
    });
    if (!response.ok) throw await readErrorData(response, "");
    const page = (await response.json()) as PatientSearchResponse;
    throwIfSearchAborted(signal);
    return page;
  };

  const firstPage = await loadPage(queryParams);
  const first = validatePatientSearchPage(firstPage, 1);
  if (!first || first.totalPages > MAX_PATIENT_MERGE_SEARCH_PAGES) {
    throw new Error("Failed to search patients");
  }
  if (first.totalPages === 1) {
    return {
      ...firstPage,
      queryId: first.queryId,
      totalItems: first.totalItems,
      patientSearchResults: first.results,
    };
  }

  const context: PatientSearchPagingContext = {
    queryId: first.queryId,
    totalItems: first.totalItems,
    totalPages: first.totalPages,
    pageSize: first.pageSize,
  };

  const allResults = [...first.results];
  for (let pageNumber = 2; pageNumber <= first.totalPages; pageNumber += 1) {
    const pageParams = new URLSearchParams(queryParams);
    pageParams.set("queryId", first.queryId);
    pageParams.set("page", String(pageNumber));
    const page = await loadPage(pageParams);
    const validated = validatePatientSearchPage(page, pageNumber, context);
    if (!validated) {
      throw new Error("Failed to search patients");
    }
    allResults.push(...validated.results);
  }
  if (allResults.length !== first.totalItems) {
    throw new Error("Failed to search patients");
  }

  return {
    ...firstPage,
    queryId: first.queryId,
    totalItems: first.totalItems,
    patientSearchResults: allResults,
  };
};

/**
 * Handle API errors and return user-friendly messages
 * @param {Object} error - Error object with status
 * @param {Function} intl - React Intl formatMessage function
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (
  error: PatientMergeApiError,
  intl: { formatMessage: FormatMessage },
): string => {
  switch (error.status) {
    case 401:
      return intl.formatMessage({ id: "accessDenied.message" });
    case 403:
      return intl.formatMessage({ id: "patient.merge.error.noPermission" });
    case 404:
      return intl.formatMessage({ id: "patient.merge.error.patientNotFound" });
    case 400:
      return (
        error.message ||
        intl.formatMessage({ id: "patient.merge.error.validationFailed" })
      );
    default:
      return (
        error.message ||
        intl.formatMessage({ id: "patient.merge.error.executionFailed" })
      );
  }
};
