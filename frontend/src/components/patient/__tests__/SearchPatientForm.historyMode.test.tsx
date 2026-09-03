import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../languages/en.json";
// @ts-expect-error -- the shared Layout module is legacy JSX without declarations.
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import { SearchPatientForm } from "../SearchPatientForm";
import type { PatientRecord } from "../types";

const getFromOpenElisServer = vi.hoisted(() => vi.fn());

vi.mock("../../utils/Utils", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getFromOpenElisServer,
    postToOpenElisServer: vi.fn(),
  };
});

vi.mock("../../common/CustomDatePicker", () => ({
  default: ({ name }: { name: string }) => <input name={name} />,
}));

vi.mock("../../common/CustomLabNumberInput", () => ({
  default: ({ name, labelText }: { name: string; labelText: string }) => (
    <label>
      {labelText}
      <input name={name} />
    </label>
  ),
}));

vi.mock("../photoManagement/photoAvatar/AyncAvatar", () => ({
  default: ({ patientName }: { patientName: string }) => (
    <span>{patientName}</span>
  ),
}));

const patientResults = [
  {
    patientID: "P-001",
    lastName: "Li",
    firstName: "Ming",
    gender: "M",
    dob: "1980-01-02",
    subjectNumber: "S-001",
    nationalId: "N-001",
    dataSourceName: "OpenElis",
  },
  {
    patientID: "P-002",
    lastName: "Wang",
    firstName: "Hua",
    gender: "F",
    dob: "1982-03-04",
    subjectNumber: "S-002",
    nationalId: "N-002",
    dataSourceName: "OpenElis",
    isMerged: true,
    mergedIntoPatientId: "P-003",
  },
];

describe("SearchPatientForm history mode", () => {
  it("uses explicit local-patient actions without changing the default shared form API", async () => {
    const getSelectedPatient = vi.fn<(patient: PatientRecord) => void>();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback({ patientSearchResults: patientResults });
        } else if (endpoint.startsWith("/rest/patient-details")) {
          callback({ ...patientResults[0], patientPK: "42" });
        } else if (endpoint.startsWith("/rest/patient-photos")) {
          callback({});
        }
      },
    );

    render(
      <IntlProvider locale="en" messages={enMessages}>
        <NotificationContext.Provider
          value={{
            notificationVisible: false,
            setNotificationVisible: vi.fn(),
            addNotification: vi.fn(),
          }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: {
                FIRST_NAME_REGEX: ".*",
                LAST_NAME_REGEX: ".*",
                AccessionFormat: "NUMERIC",
                UseExternalPatientInfo: "true",
                ENABLE_CLIENT_REGISTRY: "true",
              },
            }}
          >
            <SearchPatientForm
              getSelectedPatient={getSelectedPatient}
              selectionMode={"button" as const}
              allowExternalSearch={false}
              allowExternalImport={false}
              disableMergedSelection
            />
          </ConfigurationContext.Provider>
        </NotificationContext.Provider>
      </IntlProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "External Search" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    const selectButtons = await screen.findAllByRole("button", {
      name: "Select",
    });
    expect(selectButtons).toHaveLength(2);
    expect(selectButtons[0]).toBeEnabled();
    expect(selectButtons[1]).toBeDisabled();
    expect(screen.queryByRole("radio", { name: /Li Ming/ })).toBeNull();

    fireEvent.click(selectButtons[0]);

    expect(getSelectedPatient).toHaveBeenCalledWith(
      expect.objectContaining({ patientPK: "42", patientID: "P-001" }),
    );
  });

  it("offers patient management as one-field CRUD search with optional advanced filters", async () => {
    getFromOpenElisServer.mockReset();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback({ patientSearchResults: patientResults });
        }
      },
    );

    render(
      <IntlProvider locale="en" messages={enMessages}>
        <NotificationContext.Provider
          value={{
            notificationVisible: false,
            setNotificationVisible: vi.fn(),
            addNotification: vi.fn(),
          }}
        >
          <ConfigurationContext.Provider
            value={{
              configurationProperties: {
                FIRST_NAME_REGEX: ".*",
                LAST_NAME_REGEX: ".*",
                AccessionFormat: "NUMERIC",
                UseExternalPatientInfo: "false",
                ENABLE_CLIENT_REGISTRY: "false",
              },
            }}
          >
            <SearchPatientForm
              compactSearch
              selectionMode="button"
              selectionButtonMessageId="patient.management.open"
              allowExternalSearch={false}
              allowExternalImport={false}
            />
          </ConfigurationContext.Provider>
        </NotificationContext.Provider>
      </IntlProvider>,
    );

    expect(screen.getByRole("textbox", { name: "Find a patient" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Patient Id" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Find a patient" }), {
      target: { value: "N-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      expect.stringContaining("quickQuery=N-001"),
      expect.any(Function),
    );
    expect(
      await screen.findAllByRole("button", { name: "View or edit" }),
    ).toHaveLength(2);
    expect(screen.getByRole("cell", { name: "Male" })).toBeVisible();
    expect(screen.getByRole("cell", { name: "Female" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Advanced Search" }));
    expect(screen.getByRole("textbox", { name: "Patient Id" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Hide advanced search" }),
    ).toBeVisible();
  });
});
