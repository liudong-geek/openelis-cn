import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

const renderList = (initialState = {}) => {
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
      />
    </IntlProvider>,
  );
  return { onOpenPatient, onOpenResults, onNewPatient };
};

describe("PatientMasterList", () => {
  it("restores the patient search after returning from a record", async () => {
    getFromOpenElisServer.mockImplementation((_url, callback) =>
      callback({ patientSearchResults: patients }),
    );
    renderList({ query: "ID-22", searchMode: true });
    expect(await screen.findByText("Ming Li")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "Search patient records" }),
    ).toHaveValue("ID-22");
    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      expect.stringContaining("quickQuery=ID-22"),
      expect.any(Function),
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
          callback({ patientSearchResults: patients });
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
    );
    expect(screen.getByText("1 matching patients")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "All patients" }));
    expect(getFromOpenElisServer).toHaveBeenLastCalledWith(
      "/rest/patient-management-list?page=1&pageSize=20",
      expect.any(Function),
    );
  });
});
