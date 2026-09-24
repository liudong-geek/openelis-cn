import type { PatientRecord, PatientSearchResponse } from "./types";

export interface PatientSearchPagingContext {
  queryId: string;
  totalItems: number;
  totalPages: number;
  pageSize: number;
}

export interface ValidatedPatientSearchPage extends PatientSearchPagingContext {
  currentPage: number;
  results: PatientRecord[];
}

const parseNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/**
 * Validates the server-owned paging snapshot before any patient rows or paging
 * controls are updated. The first page establishes a fixed page size; later
 * pages must keep the same query identity, totals and exact expected row count.
 */
export const validatePatientSearchPage = (
  response: PatientSearchResponse | undefined,
  requestedPage: number,
  established?: PatientSearchPagingContext | null,
): ValidatedPatientSearchPage | null => {
  const results = response?.patientSearchResults;
  const currentPage = parseNonNegativeInteger(response?.paging?.currentPage);
  const totalPages = parseNonNegativeInteger(response?.paging?.totalPages);
  const totalItems = parseNonNegativeInteger(response?.totalItems);
  const queryId = String(response?.queryId || "").trim();

  if (
    !Array.isArray(results) ||
    !Number.isSafeInteger(requestedPage) ||
    requestedPage < 1 ||
    currentPage !== requestedPage ||
    totalPages === null ||
    totalPages < currentPage ||
    totalItems === null ||
    totalItems < results.length ||
    (totalPages > 1 && !queryId)
  ) {
    return null;
  }

  if (established) {
    const expectedRows =
      requestedPage < established.totalPages
        ? established.pageSize
        : established.totalItems -
          established.pageSize * (established.totalPages - 1);
    if (
      !established.queryId ||
      queryId !== established.queryId ||
      totalItems !== established.totalItems ||
      totalPages !== established.totalPages ||
      !Number.isSafeInteger(established.pageSize) ||
      established.pageSize < 1 ||
      !Number.isSafeInteger(expectedRows) ||
      expectedRows < 0 ||
      results.length !== expectedRows
    ) {
      return null;
    }
    return {
      queryId,
      currentPage,
      totalPages,
      totalItems,
      pageSize: established.pageSize,
      results,
    };
  }

  const paginationIsConsistent =
    totalPages === 1
      ? totalItems === results.length
      : results.length > 0 &&
        Math.ceil(totalItems / results.length) === totalPages;
  if (!paginationIsConsistent) return null;

  return {
    queryId,
    currentPage,
    totalPages,
    totalItems,
    pageSize:
      totalPages > 1
        ? results.length
        : Math.max(1, totalItems || results.length),
    results,
  };
};
