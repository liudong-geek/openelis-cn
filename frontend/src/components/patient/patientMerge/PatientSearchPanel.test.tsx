import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../languages/en.json";
import PatientSearchPanel from "./PatientSearchPanel";
import type { PatientSearchResponse } from "../types";

const mergeApi = vi.hoisted(() => ({
  searchPatients: vi.fn(),
  getPatientMergeDetails: vi.fn(),
}));

vi.mock("./patientMergeService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./patientMergeService")>();
  return { ...actual, ...mergeApi };
});
vi.mock("../../layout/Layout", () => ({
  ConfigurationContext: React.createContext({
    configurationProperties: { UseExternalPatientInfo: "true" },
  }),
}));
vi.mock("../../common/CustomDatePicker", () => ({
  default: ({ id, value, onChange }) => (
    <input
      id={id}
      aria-label="Date of Birth"
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const response = (
  patientID: string,
  lastName: string,
): PatientSearchResponse => ({
  patientSearchResults: [
    {
      patientID,
      patientPK: patientID,
      lastName,
      firstName: "",
      dataSourceName: "OpenElis",
    },
  ],
  paging: { currentPage: "1", totalPages: "1", searchTermToPage: [] },
  queryId: `query-${patientID}`,
  totalItems: 1,
});

const twoPatientResponse: PatientSearchResponse = {
  patientSearchResults: [
    {
      patientID: "A",
      patientPK: "A",
      lastName: "Alpha",
      firstName: "One",
      dataSourceName: "OpenElis",
    },
    {
      patientID: "B",
      patientPK: "B",
      lastName: "Beta",
      firstName: "Two",
      dataSourceName: "OpenElis",
    },
  ],
  paging: { currentPage: "1", totalPages: "1", searchTermToPage: [] },
  queryId: "query-two-patients",
  totalItems: 2,
};

const renderPanel = (onPatientSelect = vi.fn()) => {
  const view = render(
    <IntlProvider locale="en" messages={enMessages}>
      <PatientSearchPanel
        panelId="primary"
        title="Primary patient"
        selectedPatient={null}
        otherSelectedPatient={null}
        onPatientSelect={onPatientSelect}
      />
    </IntlProvider>,
  );
  return { ...view, onPatientSelect };
};

const startSearch = async (value = "SIM") => {
  fireEvent.change(screen.getByRole("textbox", { name: "Patient Id" }), {
    target: { value },
  });
  const searchButton = screen.getByRole("button", { name: "Search" });
  expect(searchButton).toBeEnabled();
  fireEvent.click(searchButton);
  await waitFor(() => expect(mergeApi.searchPatients).toHaveBeenCalled());
};

describe("PatientSearchPanel request boundaries", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mergeApi.searchPatients.mockReset();
    mergeApi.getPatientMergeDetails.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => consoleError.mockRestore());

  it("uses enabled search controls and keeps the latest search result", async () => {
    const oldSearch = deferred<PatientSearchResponse>();
    const newSearch = deferred<PatientSearchResponse>();
    mergeApi.searchPatients
      .mockReturnValueOnce(oldSearch.promise)
      .mockReturnValueOnce(newSearch.promise);
    renderPanel();

    await startSearch("OLD");
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "External Search" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Patient Id" }), {
      target: { value: "NEW" },
    });
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(mergeApi.searchPatients).toHaveBeenCalledTimes(2),
    );

    await act(async () => newSearch.resolve(response("2", "Newest")));
    expect(await screen.findByText("Newest")).toBeVisible();

    await act(async () => oldSearch.resolve(response("1", "Outdated")));
    expect(screen.getByText("Newest")).toBeVisible();
    expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
  });

  it.each(["patientId", "firstName", "lastName", "gender", "dateOfBirth"])(
    "invalidates an in-flight search immediately when %s changes",
    async (field) => {
      const pending = deferred<PatientSearchResponse>();
      mergeApi.searchPatients.mockReturnValueOnce(pending.promise);
      renderPanel();
      await startSearch("BASE");
      expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
      const requestSignal = mergeApi.searchPatients.mock.calls.at(-1)?.[1] as
        | AbortSignal
        | undefined;
      expect(requestSignal?.aborted).toBe(false);

      if (field === "gender") {
        fireEvent.click(screen.getByRole("radio", { name: "Male" }));
      } else {
        const label =
          field === "patientId"
            ? "Patient Id"
            : field === "firstName"
              ? "First Name"
              : field === "lastName"
                ? "Last Name"
                : "Date of Birth";
        fireEvent.change(screen.getByRole("textbox", { name: label }), {
          target: {
            value: field === "dateOfBirth" ? "2000-01-02" : "CHANGED",
          },
        });
      }

      expect(requestSignal?.aborted).toBe(true);
      expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
      await act(async () => pending.resolve(response("OLD", "Outdated")));
      expect(screen.queryByText("Outdated")).not.toBeInTheDocument();
      expect(
        screen.queryByText(enMessages["patient.search.nopatient"]),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    [
      "400 response",
      { status: 400, message: "Invalid patient search" },
      "Invalid patient search",
    ],
    [
      "401 response",
      { status: 401, message: "Unauthorized" },
      enMessages["accessDenied.message"],
    ],
    [
      "500 response",
      { status: 500 },
      enMessages["patient.merge.error.executionFailed"],
    ],
    [
      "network failure",
      new TypeError("Network unavailable"),
      "Network unavailable",
    ],
  ])(
    "shows %s as an error rather than an empty result",
    async (_name, error, message) => {
      mergeApi.searchPatients.mockRejectedValueOnce(error);
      renderPanel();

      await startSearch();

      expect(await screen.findByText(message)).toBeVisible();
      expect(
        screen.getByText(enMessages["patient.management.list.error"]),
      ).toBeVisible();
      expect(
        screen.queryByText(enMessages["patient.search.nopatient"]),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps a successful zero-match response as the empty state", async () => {
    mergeApi.searchPatients.mockResolvedValueOnce({
      patientSearchResults: [],
      paging: { currentPage: "1", totalPages: "1", searchTermToPage: [] },
      queryId: "query-empty",
      totalItems: 0,
    });
    renderPanel();

    await startSearch();

    expect(
      await screen.findByText(enMessages["patient.search.nopatient"]),
    ).toBeVisible();
    expect(
      screen.queryByText(enMessages["patient.management.list.error"]),
    ).not.toBeInTheDocument();
  });

  it("allows only the latest patient-detail selection to win", async () => {
    const patientA = deferred<{ dataSummary: { sampleCount: number } }>();
    const patientB = deferred<{ dataSummary: { sampleCount: number } }>();
    mergeApi.searchPatients.mockResolvedValueOnce(twoPatientResponse);
    mergeApi.getPatientMergeDetails
      .mockReturnValueOnce(patientA.promise)
      .mockReturnValueOnce(patientB.promise);
    const { container, onPatientSelect } = renderPanel();
    await startSearch();

    expect(await screen.findByText("Alpha")).toBeVisible();
    const selectA =
      container.querySelector<HTMLInputElement>("#primary-select-A");
    const selectB =
      container.querySelector<HTMLInputElement>("#primary-select-B");
    expect(selectA).not.toBeNull();
    expect(selectB).not.toBeNull();
    fireEvent.click(selectA!);
    await waitFor(() =>
      expect(mergeApi.getPatientMergeDetails).toHaveBeenCalledWith("A"),
    );
    expect(selectA).toBeDisabled();

    fireEvent.click(selectB!);
    await waitFor(() =>
      expect(mergeApi.getPatientMergeDetails).toHaveBeenCalledWith("B"),
    );
    await act(async () =>
      patientB.resolve({ dataSummary: { sampleCount: 2 } }),
    );
    await waitFor(() =>
      expect(onPatientSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          patientID: "B",
          patientPK: "B",
          dataSummary: { sampleCount: 2 },
        }),
      ),
    );

    await act(async () =>
      patientA.resolve({ dataSummary: { sampleCount: 1 } }),
    );
    expect(onPatientSelect).toHaveBeenCalledTimes(1);
  });
});
