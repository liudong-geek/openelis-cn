import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../languages/en.json";
import PatientMasterList from "../PatientMasterList";

const getFromOpenElisServer = vi.hoisted(() => vi.fn());

vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer,
}));

const patients = [
  {
    patientPK: "22",
    patientId: "22",
    firstName: "Ming",
    lastName: "Li",
    gender: "M",
    birthDate: "1990/01/02",
    nationalId: "ID-22",
    phoneNumber: "13800000000",
    merged: false,
  },
];

const makeSearchPatient = (id: number) => ({
  patientID: String(id),
  firstName: `P${String(id).padStart(3, "0")}`,
  lastName: "Paging",
  gender: "F",
  nationalId: `PAGE-${id}`,
});

interface PendingRequest {
  url: string;
  callback: (response: unknown) => void;
  signal: AbortSignal;
}

const renderList = (initialState = {}, onOpenAdvancedSearch?: () => void) => {
  const onOpenPatient = vi.fn();
  const onOpenResults = vi.fn();
  const onNewPatient = vi.fn();
  render(
    <IntlProvider locale="en" messages={enMessages}>
      <PatientMasterList
        initialState={initialState}
        onOpenPatient={onOpenPatient}
        onOpenResults={onOpenResults}
        onNewPatient={onNewPatient}
        onOpenAdvancedSearch={onOpenAdvancedSearch}
      />
    </IntlProvider>,
  );
  return { onOpenPatient, onOpenResults, onNewPatient };
};

describe("PatientMasterList", () => {
  it("restores the patient search after returning from a record", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({
        patientSearchResults: patients,
        paging: { currentPage: "1", totalPages: "1" },
        totalItems: 1,
      }),
    );
    renderList({ query: "ID-22", searchMode: true });
    expect(await screen.findByText("Ming Li")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Search patient records" }),
    ).toHaveValue("ID-22");
    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      expect.stringContaining("quickQuery=ID-22"),
      expect.any(Function),
      expect.anything(),
    );
  });

  it("restores the original list page instead of resetting to page one", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({
        patients,
        page: 3,
        pageSize: 20,
        totalItems: 60,
        totalPages: 3,
      }),
    );
    renderList({ page: 3, pageSize: 20 });
    expect(await screen.findByText("Ming Li")).toBeVisible();
    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      "/rest/patient-management-list?page=3&pageSize=20",
      expect.any(Function),
      expect.anything(),
    );
  });
  beforeEach(() => {
    getFromOpenElisServer.mockReset();
  });

  it("loads a patient list by default and exposes record actions", async () => {
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-management-list")) {
          callback({
            patients,
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
          });
        }
      },
    );

    const { onOpenPatient, onOpenResults } = renderList();

    expect(
      await screen.findByRole("heading", { name: "Patient list" }),
    ).toBeVisible();
    expect(screen.getByText("Ming Li")).toBeVisible();
    expect(screen.getByText("13800000000")).toBeVisible();
    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      "/rest/patient-management-list?page=1&pageSize=20",
      expect.any(Function),
      expect.anything(),
    );

    fireEvent.click(screen.getByRole("button", { name: "View or edit" }));
    expect(onOpenPatient).toHaveBeenCalledWith(
      expect.objectContaining({ patientPK: "22" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Test results" }));
    expect(onOpenResults).toHaveBeenCalledWith(
      expect.objectContaining({ patientPK: "22" }),
    );
  });

  it("searches the patient master list and can return to all patients", async () => {
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback({
            patientSearchResults: patients,
            paging: { currentPage: "1", totalPages: "1" },
            totalItems: 1,
          });
          return;
        }
        callback({
          patients,
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        });
      },
    );

    renderList();
    await screen.findByText("Ming Li");

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search patient records" }),
      { target: { value: "ID-22" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      expect.stringContaining("quickQuery=ID-22"),
      expect.any(Function),
      expect.anything(),
    );
    expect(screen.getByText("1 matching patients")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "All patients" }));
    expect(getFromOpenElisServer).toHaveBeenLastCalledWith(
      "/rest/patient-management-list?page=1&pageSize=20",
      expect.any(Function),
      expect.anything(),
    );
  });

  it("loads patients beyond 100 from the isolated server page", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "PAGE MATCH", searchMode: true });
    expect(requests).toHaveLength(1);
    act(() =>
      requests[0].callback({
        patientSearchResults: Array.from({ length: 99 }, (_, index) =>
          makeSearchPatient(index + 1),
        ),
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "query-page-match",
        totalItems: 101,
      }),
    );

    expect(await screen.findByText("P099 Paging")).toBeVisible();
    expect(screen.getByText("101 matching patients")).toBeVisible();
    expect(screen.getByText("1 / 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));

    expect(requests).toHaveLength(2);
    const pageParameters = new URLSearchParams(requests[1].url.split("?")[1]);
    expect(pageParameters.get("quickQuery")).toBe("PAGE MATCH");
    expect(pageParameters.get("suppressExternalSearch")).toBe("true");
    expect(pageParameters.get("page")).toBe("2");
    expect(pageParameters.get("queryId")).toBe("query-page-match");
    act(() =>
      requests[1].callback({
        patientSearchResults: [makeSearchPatient(100), makeSearchPatient(101)],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "query-page-match",
        totalItems: 101,
      }),
    );

    expect(await screen.findByText("P100 Paging")).toBeVisible();
    expect(screen.getByText("P101 Paging")).toBeVisible();
    expect(screen.queryByText("P099 Paging")).not.toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeVisible();
    expect(screen.getByText("101 matching patients")).toBeVisible();
  });

  it("rejects paged search metadata without a queryId", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "MISSING TOKEN", searchMode: true });
    act(() =>
      requests[0].callback({
        patientSearchResults: [makeSearchPatient(1)],
        paging: { currentPage: "1", totalPages: "2" },
        totalItems: 2,
      }),
    );

    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Next Page" }),
    ).not.toBeInTheDocument();
  });

  it("rejects a search page returned for a different queryId", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "TOKEN MATCH", searchMode: true });
    act(() =>
      requests[0].callback({
        patientSearchResults: [makeSearchPatient(1)],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "expected-token",
        totalItems: 2,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    act(() =>
      requests[1].callback({
        patientSearchResults: [makeSearchPatient(100)],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "foreign-token",
        totalItems: 2,
      }),
    );

    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(screen.queryByText("P100 Paging")).not.toBeInTheDocument();
  });

  it("rejects a search page returned for the right queryId but wrong page", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "WRONG PAGE", searchMode: true });
    act(() =>
      requests[0].callback({
        patientSearchResults: [makeSearchPatient(1)],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "same-token",
        totalItems: 2,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    act(() =>
      requests[1].callback({
        patientSearchResults: [makeSearchPatient(100)],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "same-token",
        totalItems: 2,
      }),
    );

    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(screen.queryByText("P100 Paging")).not.toBeInTheDocument();
  });

  it("refreshes the query snapshot before restoring a saved search page", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "RESTORE", searchMode: true, page: 2 });
    expect(new URLSearchParams(requests[0].url.split("?")[1]).get("page")).toBe(
      null,
    );
    act(() =>
      requests[0].callback({
        patientSearchResults: Array.from({ length: 99 }, (_, index) =>
          makeSearchPatient(index + 1),
        ),
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "query-restore",
        totalItems: 100,
      }),
    );

    expect(requests).toHaveLength(2);
    const restoredParameters = new URLSearchParams(
      requests[1].url.split("?")[1],
    );
    expect(restoredParameters.get("quickQuery")).toBe("RESTORE");
    expect(restoredParameters.get("page")).toBe("2");
    expect(restoredParameters.get("queryId")).toBe("query-restore");
    act(() =>
      requests[1].callback({
        patientSearchResults: [makeSearchPatient(100)],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "query-restore",
        totalItems: 100,
      }),
    );

    expect(await screen.findByText("P100 Paging")).toBeVisible();
    expect(screen.getByText("2 / 2")).toBeVisible();
  });

  it("does not let a late old search page replace a newer quick query", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "OLD", searchMode: true });
    act(() =>
      requests[0].callback({
        patientSearchResults: [makeSearchPatient(1)],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "query-old",
        totalItems: 2,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    const lateOldPage = requests[1];

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search patient records" }),
      { target: { value: "NEW" } },
    );
    expect(screen.queryByText("P1 Paging")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next Page" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const newSearch = requests[2];
    expect(lateOldPage.signal.aborted).toBe(true);
    act(() =>
      newSearch.callback({
        patientSearchResults: [makeSearchPatient(200)],
        paging: { currentPage: "1", totalPages: "1" },
        queryId: "query-new",
        totalItems: 1,
      }),
    );
    act(() =>
      lateOldPage.callback({
        patientSearchResults: [makeSearchPatient(100)],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "query-old",
        totalItems: 2,
      }),
    );

    expect(await screen.findByText("P200 Paging")).toBeVisible();
    expect(screen.queryByText("P100 Paging")).not.toBeInTheDocument();
  });

  it("offers advanced search without replacing the default patient list", async () => {
    getFromOpenElisServer.mockImplementation((_endpoint, callback) =>
      callback({
        patients,
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }),
    );
    const onOpenAdvancedSearch = vi.fn();

    renderList({}, onOpenAdvancedSearch);
    expect(await screen.findByText("Ming Li")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Advanced Search" }));

    expect(onOpenAdvancedSearch).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Patient list" })).toBeVisible();
  });

  it("clears stale rows and paging after an invalid search page", async () => {
    const requests: PendingRequest[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        url: string,
        callback: (response: unknown) => void,
        signal: AbortSignal,
      ) => requests.push({ url, callback, signal }),
    );

    renderList({ query: "INVALID TOTAL", searchMode: true });
    act(() =>
      requests[0].callback({
        patientSearchResults: [makeSearchPatient(1)],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "query-invalid-total",
        totalItems: 2,
      }),
    );
    expect(await screen.findByText("P001 Paging")).toBeVisible();
    expect(screen.getByText("1 / 2")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    act(() =>
      requests[1].callback({
        patientSearchResults: [makeSearchPatient(2)],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "query-invalid-total",
      }),
    );

    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(screen.queryByText("P001 Paging")).not.toBeInTheDocument();
    expect(screen.queryByText("P002 Paging")).not.toBeInTheDocument();
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
    expect(screen.getByText("0 matching patients")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Next Page" }),
    ).not.toBeInTheDocument();
  });
});
