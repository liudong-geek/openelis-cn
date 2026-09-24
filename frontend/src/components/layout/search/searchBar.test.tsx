import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../languages/en.json";
import SearchBar from "./searchBar";
import type { PatientSearchData, PatientSearchResult } from "./searchService";

const searchApi = vi.hoisted(() => ({
  fetchPatientData: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
  navigateToInternalPath: vi.fn(),
}));

vi.mock("./searchService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./searchService")>();
  return { ...actual, fetchPatientData: searchApi.fetchPatientData };
});

vi.mock("./searchOutput", () => ({
  default: ({ patientData }: { patientData: PatientSearchResult[] }) => (
    <div data-testid="patient-results">
      {patientData.map((patient) => (
        <span key={patient.patientID}>{patient.lastName}</span>
      ))}
    </div>
  ),
}));

vi.mock("../../utils/NavigationUtils", () => navigation);

interface PendingSearch {
  query: string;
  callback: (data: PatientSearchData) => void;
  signal: AbortSignal;
}

const pendingSearches: PendingSearch[] = [];

const patient = (patientID: string, lastName: string): PatientSearchResult => ({
  patientID,
  firstName: "Patient",
  lastName,
});

const successfulSearch = (
  results: PatientSearchResult[],
  totalItems = results.length,
): PatientSearchData => ({ results, totalItems, error: null });

const renderSearchBar = () =>
  render(
    <IntlProvider locale="en" messages={enMessages}>
      <SearchBar />
    </IntlProvider>,
  );

const searchInput = () => screen.getByRole("searchbox", { name: "Search" });

describe("global patient search request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pendingSearches.length = 0;
    searchApi.fetchPatientData.mockReset();
    navigation.navigateToInternalPath.mockReset();
    searchApi.fetchPatientData.mockImplementation(
      (
        query: string,
        callback: (data: PatientSearchData) => void,
        signal: AbortSignal,
      ) => {
        pendingSearches.push({ query, callback, signal });
      },
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("debounces input, aborts the previous request, and ignores its late response", () => {
    renderSearchBar();

    fireEvent.change(searchInput(), { target: { value: "old query" } });
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(searchApi.fetchPatientData).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pendingSearches[0].query).toBe("old query");

    fireEvent.change(searchInput(), { target: { value: "new query" } });
    expect(pendingSearches[0].signal.aborted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(searchApi.fetchPatientData).toHaveBeenCalledTimes(2);

    act(() => {
      pendingSearches[1].callback(successfulSearch([patient("2", "Newest")]));
    });
    expect(screen.getByText("Newest")).toBeVisible();

    act(() => {
      pendingSearches[0].callback(successfulSearch([patient("1", "Outdated")]));
    });
    expect(screen.getByText("Newest")).toBeVisible();
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });

  it("clear cancels both a queued search and an active request", () => {
    renderSearchBar();

    fireEvent.change(searchInput(), { target: { value: "queued" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(searchApi.fetchPatientData).not.toHaveBeenCalled();

    fireEvent.change(searchInput(), { target: { value: "active" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(searchApi.fetchPatientData).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(pendingSearches[0].signal.aborted).toBe(true);
    expect(searchInput()).toHaveValue("");

    act(() => {
      pendingSearches[0].callback(successfulSearch([patient("1", "Outdated")]));
    });
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });

  it("search button cancels the debounce and searches immediately", () => {
    renderSearchBar();

    fireEvent.change(searchInput(), { target: { value: "button query" } });
    expect(searchApi.fetchPatientData).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(searchApi.fetchPatientData).toHaveBeenCalledTimes(1);
    expect(pendingSearches[0].query).toBe("button query");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(searchApi.fetchPatientData).toHaveBeenCalledTimes(1);
  });

  it("unmount cancels an active request", () => {
    const view = renderSearchBar();
    fireEvent.change(searchInput(), { target: { value: "leaving" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    act(() => {
      view.unmount();
    });

    expect(pendingSearches[0].signal.aborted).toBe(true);
  });

  it("shows the server total and opens the compatible patient-management deep link", () => {
    renderSearchBar();
    fireEvent.change(searchInput(), { target: { value: "张 三 & A/B?" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    act(() => {
      pendingSearches[0].callback(
        successfulSearch([patient("1", "Visible")], 125),
      );
    });

    expect(screen.getByText("125 matching patients")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "View all matching patients" }),
    );
    expect(navigation.navigateToInternalPath).toHaveBeenCalledWith(
      "/PatientManagement?quickQuery=%E5%BC%A0+%E4%B8%89+%26+A%2FB%3F",
    );
  });

  it("shows an explicit message when the server rejects an over-broad search", () => {
    renderSearchBar();
    fireEvent.change(searchInput(), { target: { value: "a" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    act(() => {
      pendingSearches[0].callback({
        results: [],
        totalItems: 0,
        error: "too-many",
      });
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Too many patients match this search",
    );
  });

  it("keeps one-name patients, rejects missing IDs, and deduplicates by patient ID", () => {
    renderSearchBar();
    fireEvent.change(searchInput(), { target: { value: "single name" } });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    act(() => {
      pendingSearches[0].callback(
        successfulSearch([
          { patientID: "P-1", lastName: "SingleName" },
          { patientID: "P-1", firstName: "Duplicate" },
          { lastName: "MissingId" },
        ]),
      );
    });

    expect(screen.getByText("SingleName")).toBeVisible();
    expect(screen.queryByText("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByText("MissingId")).not.toBeInTheDocument();
  });
});
