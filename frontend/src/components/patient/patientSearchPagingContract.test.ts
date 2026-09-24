import { describe, expect, it } from "vitest";
import {
  validatePatientSearchPage,
  type PatientSearchPagingContext,
} from "./patientSearchPagingContract";
import type { PatientSearchResponse } from "./types";

const patient = (id: string) => ({ patientID: id });

const response = (
  results: ReturnType<typeof patient>[],
  currentPage: string,
  totalPages: string,
  totalItems?: number,
): PatientSearchResponse => ({
  patientSearchResults: results,
  paging: { currentPage, totalPages },
  queryId: totalPages === "1" ? "" : "query-1",
  ...(totalItems === undefined ? {} : { totalItems }),
});

const invalidTotals: Array<[string, number | undefined]> = [
  ["missing", undefined],
  ["fractional", 1.5],
  ["less than the current rows", 1],
];

describe("patient search paging contract", () => {
  it("establishes the first-page size and validates the exact final row count", () => {
    const first = validatePatientSearchPage(
      response([patient("1"), patient("2")], "1", "2", 3),
      1,
    );

    expect(first).toMatchObject({
      currentPage: 1,
      totalPages: 2,
      totalItems: 3,
      pageSize: 2,
    });

    const context: PatientSearchPagingContext = {
      queryId: first!.queryId,
      totalPages: first!.totalPages,
      totalItems: first!.totalItems,
      pageSize: first!.pageSize,
    };
    expect(
      validatePatientSearchPage(
        response([patient("3")], "2", "2", 3),
        2,
        context,
      ),
    ).toMatchObject({ currentPage: 2, totalItems: 3, pageSize: 2 });
  });

  it.each(invalidTotals)(
    "rejects a %s totalItems value",
    (_label, totalItems) => {
      expect(
        validatePatientSearchPage(
          response([patient("1"), patient("2")], "1", "1", totalItems),
          1,
        ),
      ).toBeNull();
    },
  );

  it("rejects a total-page count that cannot be produced by the current rows", () => {
    expect(
      validatePatientSearchPage(
        response([patient("1"), patient("2")], "1", "3", 3),
        1,
      ),
    ).toBeNull();
  });

  it("rejects later pages that change totals or return the wrong row count", () => {
    const context: PatientSearchPagingContext = {
      queryId: "query-1",
      totalPages: 2,
      totalItems: 3,
      pageSize: 2,
    };

    expect(
      validatePatientSearchPage(
        response([patient("3")], "2", "2", 4),
        2,
        context,
      ),
    ).toBeNull();
    expect(
      validatePatientSearchPage(
        response([patient("3"), patient("4")], "2", "2", 3),
        2,
        context,
      ),
    ).toBeNull();
  });
});
