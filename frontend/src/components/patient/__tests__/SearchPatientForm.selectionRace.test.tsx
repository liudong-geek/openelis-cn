import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  default: ({ name, labelText, value, onChange }) => (
    <label>
      {labelText}
      <input
        name={name}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  ),
}));

vi.mock("../../common/CustomLabNumberInput", () => ({
  default: ({ name, labelText }) => (
    <label>
      {labelText}
      <input name={name} />
    </label>
  ),
}));

vi.mock("../photoManagement/photoAvatar/AyncAvatar", () => ({
  default: ({ patientName }) => <span>{patientName}</span>,
}));

const patients: PatientRecord[] = [
  {
    patientID: "P-001",
    patientPK: "P-001",
    lastName: "Li",
    firstName: "Ming",
    gender: "M",
    dataSourceName: "OpenElis",
  },
  {
    patientID: "P-002",
    patientPK: "P-002",
    lastName: "Wang",
    firstName: "Hua",
    gender: "F",
    dataSourceName: "OpenElis",
  },
];

const firstPage = (patientSearchResults: PatientRecord[]) => ({
  patientSearchResults,
  paging: { currentPage: "1", totalPages: "1" },
  totalItems: patientSearchResults.length,
});

const renderForm = (
  getSelectedPatient = vi.fn<(patient: PatientRecord) => void>(),
  addNotification = vi.fn(),
) => {
  const view = render(
    <IntlProvider locale="en" messages={enMessages}>
      <NotificationContext.Provider
        value={{
          notificationVisible: false,
          setNotificationVisible: vi.fn(),
          addNotification,
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
              DEFAULT_DATE_LOCALE: "en-US",
            },
          }}
        >
          <SearchPatientForm
            selectionMode="button"
            allowExternalSearch={false}
            allowExternalImport={false}
            getSelectedPatient={getSelectedPatient}
          />
        </ConfigurationContext.Provider>
      </NotificationContext.Provider>
    </IntlProvider>,
  );
  return { ...view, getSelectedPatient, addNotification };
};

describe("SearchPatientForm patient-detail selection", () => {
  beforeEach(() => getFromOpenElisServer.mockReset());

  it("allows only the latest of two patient selections to navigate", async () => {
    const detailRequests: Array<{
      endpoint: string;
      callback: (response: unknown) => void;
      signal?: AbortSignal;
    }> = [];
    getFromOpenElisServer.mockImplementation(
      (
        endpoint: string,
        callback: (response: unknown) => void,
        signal?: AbortSignal,
      ) => {
        if (typeof endpoint !== "string") return;
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage(patients));
        } else if (endpoint.startsWith("/rest/patient-details")) {
          detailRequests.push({ endpoint, callback, signal });
        } else if (endpoint.startsWith("/rest/patient-photos")) {
          callback({});
        }
      },
    );
    const { getSelectedPatient } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const selectButtons = await screen.findAllByRole("button", {
      name: "Select",
    });
    fireEvent.click(selectButtons[0]);
    await waitFor(() => expect(detailRequests).toHaveLength(1));
    fireEvent.click(selectButtons[1]);
    await waitFor(() => expect(detailRequests).toHaveLength(2));

    expect(detailRequests[0].endpoint).toContain("patientID=P-001");
    expect(detailRequests[0].signal?.aborted).toBe(true);
    expect(detailRequests[1].endpoint).toContain("patientID=P-002");

    act(() => {
      detailRequests[1].callback({ ...patients[1], patientPK: "P-002" });
    });
    await waitFor(() =>
      expect(getSelectedPatient).toHaveBeenCalledWith(
        expect.objectContaining({ patientPK: "P-002" }),
      ),
    );

    act(() => {
      detailRequests[0].callback({ ...patients[0], patientPK: "P-001" });
    });
    expect(getSelectedPatient).toHaveBeenCalledTimes(1);
  });

  it("invalidates a pending patient selection when paging replaces the visible rows", async () => {
    let pendingDetails:
      | {
          callback: (response: unknown) => void;
          signal?: AbortSignal;
        }
      | undefined;
    const pageRequests: string[] = [];
    getFromOpenElisServer.mockImplementation(
      (
        endpoint: string,
        callback: (response: unknown) => void,
        signal?: AbortSignal,
      ) => {
        if (typeof endpoint !== "string") return;
        if (endpoint.startsWith("/rest/patient-search-results")) {
          const params = new URLSearchParams(endpoint.split("?")[1] || "");
          if (params.get("page") === "2") {
            pageRequests.push(endpoint);
            return;
          }
          callback({
            queryId: "query-page-selection",
            totalItems: 2,
            patientSearchResults: [patients[0]],
            paging: { currentPage: "1", totalPages: "2" },
          });
        } else if (endpoint.startsWith("/rest/patient-details")) {
          pendingDetails = { callback, signal };
        }
      },
    );
    const { getSelectedPatient } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select" }));
    await waitFor(() => expect(pendingDetails).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    await waitFor(() => expect(pageRequests).toHaveLength(1));
    expect(pendingDetails?.signal?.aborted).toBe(true);

    act(() => {
      pendingDetails?.callback({ ...patients[0], patientPK: "P-001" });
    });
    expect(getSelectedPatient).not.toHaveBeenCalled();
  });

  it.each([
    ["a mismatched patient identity", { ...patients[0], patientPK: "P-999" }],
    [
      "an API error payload",
      {
        ...patients[0],
        patientPK: "P-001",
        status: 500,
        message: "patient lookup failed",
      },
    ],
  ])("rejects %s instead of navigating", async (_caseName, detailResponse) => {
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (typeof endpoint !== "string") return;
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage([patients[0]]));
        } else if (endpoint.startsWith("/rest/patient-details")) {
          callback(detailResponse);
        }
      },
    );
    const { getSelectedPatient, addNotification } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select" }));

    await waitFor(() => expect(addNotification).toHaveBeenCalledTimes(1));
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ message: enMessages["patient.fetch.error"] }),
    );
    expect(getSelectedPatient).not.toHaveBeenCalled();
  });
});
