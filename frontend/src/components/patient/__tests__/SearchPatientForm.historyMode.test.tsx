import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../languages/en.json";
// @ts-expect-error -- the shared Layout module is legacy JSX without declarations.
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import { SearchPatientForm } from "../SearchPatientForm";
import type { SearchPatientFormProps } from "../SearchPatientForm";
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
  default: ({
    name,
    labelText,
    value,
    onChange,
  }: {
    name: string;
    labelText: string;
    value?: string;
    onChange: (value: string) => void;
  }) => (
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

const firstPage = (patientSearchResults: unknown[]) => ({
  patientSearchResults,
  paging: { currentPage: "1", totalPages: "1" },
  totalItems: patientSearchResults.length,
});

const renderSearchForm = (props: SearchPatientFormProps = {}) =>
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
              DEFAULT_DATE_LOCALE: "en-US",
            },
          }}
        >
          <SearchPatientForm {...props} />
        </ConfigurationContext.Provider>
      </NotificationContext.Provider>
    </IntlProvider>,
  );

describe("SearchPatientForm history mode", () => {
  it("uses explicit local-patient actions without changing the default shared form API", async () => {
    const getSelectedPatient = vi.fn<(patient: PatientRecord) => void>();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage(patientResults));
        } else if (endpoint.startsWith("/rest/patient-details")) {
          callback({ ...patientResults[0], patientPK: "P-001" });
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
      expect.objectContaining({ patientPK: "P-001", patientID: "P-001" }),
    );
  });

  it("offers patient management as one-field CRUD search with optional advanced filters", async () => {
    getFromOpenElisServer.mockReset();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage(patientResults));
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

    expect(
      screen.getByRole("textbox", { name: "Find a patient" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Patient Id" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "Find a patient" }), {
      target: { value: "N-001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(getFromOpenElisServer).toHaveBeenCalledWith(
      expect.stringContaining("quickQuery=N-001"),
      expect.any(Function),
      expect.anything(),
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

  it("restores controlled demographic fields and sends an encoded local-only query", async () => {
    getFromOpenElisServer.mockReset();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage([]));
        }
      },
    );
    const onStateChange = vi.fn();

    renderSearchForm({
      allowExternalSearch: false,
      allowExternalImport: false,
      initialState: {
        draft: {
          patientId: "档案 & 7",
          lastName: "李/王",
          firstName: "小 明",
          dateOfBirth: "01/02/1980",
          gender: "F",
          suppressExternalSearch: false,
          crSearch: true,
        },
      },
      onStateChange,
    });

    expect(screen.getByRole("textbox", { name: "Patient Id" })).toHaveValue(
      "档案 & 7",
    );
    expect(screen.getByRole("textbox", { name: "Last Name" })).toHaveValue(
      "李/王",
    );
    expect(screen.getByRole("textbox", { name: "First Name" })).toHaveValue(
      "小 明",
    );
    expect(screen.getByRole("textbox", { name: "Date of Birth" })).toHaveValue(
      "01/02/1980",
    );
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() =>
      expect(getFromOpenElisServer).toHaveBeenCalledWith(
        expect.stringMatching(/^\/rest\/patient-search-results\?/),
        expect.any(Function),
        expect.anything(),
      ),
    );
    const searchEndpoint = getFromOpenElisServer.mock.calls.find(([endpoint]) =>
      String(endpoint).startsWith("/rest/patient-search-results"),
    )?.[0] as string;
    const parameters = new URLSearchParams(searchEndpoint.split("?")[1]);
    expect(parameters.get("STNumber")).toBe("档案 & 7");
    expect(parameters.get("lastName")).toBe("李/王");
    expect(parameters.get("firstName")).toBe("小 明");
    expect(parameters.get("dateOfBirth")).toBe("01/02/1980");
    expect(parameters.get("gender")).toBe("F");
    expect(parameters.get("quickQuery")).toBeNull();
    expect(parameters.get("suppressExternalSearch")).toBe("true");
    expect(parameters.get("crSearch")).toBeNull();

    await waitFor(() =>
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasSearched: true,
          submitted: expect.objectContaining({
            patientId: "档案 & 7",
            dateOfBirth: "01/02/1980",
            gender: "F",
            suppressExternalSearch: true,
          }),
        }),
      ),
    );
  });

  it("ignores an older search response after a newer query has completed", async () => {
    getFromOpenElisServer.mockReset();
    const pendingResponses: Array<(response: unknown) => void> = [];
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          pendingResponses.push(callback);
        }
      },
    );

    renderSearchForm({ allowExternalSearch: false });
    const firstName = screen.getByRole("textbox", { name: "First Name" });

    fireEvent.change(firstName, { target: { value: "Old" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(pendingResponses).toHaveLength(1));
    fireEvent.change(firstName, { target: { value: "New" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => expect(pendingResponses).toHaveLength(2));
    act(() => {
      pendingResponses[0](firstPage([patientResults[0]]));
    });
    expect(screen.queryByText("Ming Li")).toBeNull();
    act(() => {
      pendingResponses[1](firstPage([patientResults[1]]));
    });
    expect(await screen.findByText("Hua Wang")).toBeVisible();
    expect(screen.getByText("Hua Wang")).toBeVisible();
    expect(screen.queryByText("Ming Li")).toBeNull();
  });

  it("replays only the submitted criteria while preserving a newer draft", async () => {
    getFromOpenElisServer.mockReset();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage([patientResults[0]]));
        }
      },
    );

    renderSearchForm({
      allowExternalSearch: false,
      initialState: {
        draft: { firstName: "Unsubmitted" },
        submitted: { firstName: "Submitted", gender: "M" },
        hasSearched: true,
      },
    });

    await waitFor(() =>
      expect(getFromOpenElisServer).toHaveBeenCalledWith(
        expect.stringMatching(/^\/rest\/patient-search-results\?/),
        expect.any(Function),
        expect.anything(),
      ),
    );
    expect(screen.getByRole("textbox", { name: "First Name" })).toHaveValue(
      "Unsubmitted",
    );
    expect(await screen.findByText("Ming Li")).toBeVisible();
    const searchEndpoint = getFromOpenElisServer.mock.calls[0][0] as string;
    const parameters = new URLSearchParams(searchEndpoint.split("?")[1]);
    expect(parameters.get("firstName")).toBe("Submitted");
    expect(parameters.get("gender")).toBe("M");
  });

  it("rebuilds submitted criteria before restoring a server-side page", async () => {
    getFromOpenElisServer.mockReset();
    const requests: Array<{
      endpoint: string;
      callback: (response: unknown) => void;
    }> = [];
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          requests.push({ endpoint, callback });
        }
      },
    );

    renderSearchForm({
      allowExternalSearch: false,
      initialState: {
        draft: { firstName: "Draft" },
        submitted: { firstName: "Submitted" },
        hasSearched: true,
        apiPage: 3,
      },
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(
      new URLSearchParams(requests[0].endpoint.split("?")[1]).has("page"),
    ).toBe(false);
    act(() => {
      requests[0].callback({
        patientSearchResults: [patientResults[0]],
        paging: { currentPage: "1", totalPages: "3" },
        queryId: "query-generation-1",
        totalItems: 3,
      });
    });

    await waitFor(() => expect(requests).toHaveLength(2));
    const restoredParameters = new URLSearchParams(
      requests[1].endpoint.split("?")[1],
    );
    expect(restoredParameters.get("firstName")).toBe("Submitted");
    expect(restoredParameters.get("page")).toBe("3");
    expect(restoredParameters.get("queryId")).toBe("query-generation-1");
    act(() => {
      requests[1].callback({
        patientSearchResults: [patientResults[1]],
        paging: { currentPage: "3", totalPages: "3" },
        queryId: "query-generation-1",
        totalItems: 3,
      });
    });

    expect(await screen.findByText("Hua Wang")).toBeVisible();
    expect(screen.getByText("3 / 3")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "First Name" })).toHaveValue(
      "Draft",
    );
  });

  it("returns through the same queryId and distinguishes failures from an empty result", async () => {
    getFromOpenElisServer.mockReset();
    const requests: Array<{
      endpoint: string;
      callback: (response: unknown) => void;
    }> = [];
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          requests.push({ endpoint, callback });
        }
      },
    );

    renderSearchForm({ allowExternalSearch: false });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => {
      requests[0].callback({
        patientSearchResults: [patientResults[0]],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "query-generation-back",
        totalItems: 2,
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Next Page" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    let parameters = new URLSearchParams(requests[1].endpoint.split("?")[1]);
    expect(parameters.get("page")).toBe("2");
    expect(parameters.get("queryId")).toBe("query-generation-back");
    act(() => {
      requests[1].callback({
        patientSearchResults: [patientResults[1]],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "query-generation-back",
        totalItems: 2,
      });
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Previous Page" }),
    );
    await waitFor(() => expect(requests).toHaveLength(3));
    parameters = new URLSearchParams(requests[2].endpoint.split("?")[1]);
    expect(parameters.get("page")).toBe("1");
    expect(parameters.get("queryId")).toBe("query-generation-back");

    act(() => requests[2].callback(undefined));
    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(
      screen.queryByText(enMessages["patient.search.empty.results"]),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(4));
    act(() => {
      requests[3].callback({
        patientSearchResults: [],
        paging: { currentPage: "1", totalPages: "1" },
        queryId: "query-empty",
        totalItems: 0,
      });
    });
    expect(
      await screen.findByText(enMessages["patient.search.empty.results"]),
    ).toBeVisible();
    expect(
      screen.queryByText(enMessages["patient.management.list.error"]),
    ).not.toBeInTheDocument();
  });

  it("rejects the right queryId when the response is for a different page", async () => {
    getFromOpenElisServer.mockReset();
    const requests: Array<{
      endpoint: string;
      callback: (response: unknown) => void;
    }> = [];
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          requests.push({ endpoint, callback });
        }
      },
    );

    renderSearchForm({ allowExternalSearch: false });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => {
      requests[0].callback({
        patientSearchResults: [patientResults[0]],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "same-query-wrong-page",
        totalItems: 2,
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Next Page" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => {
      requests[1].callback({
        patientSearchResults: [patientResults[1]],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "same-query-wrong-page",
        totalItems: 2,
      });
    });

    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(screen.queryByText("Hua Wang")).not.toBeInTheDocument();
  });

  it("invalidates a pending patient-details selection when a new search starts", async () => {
    getFromOpenElisServer.mockReset();
    let pendingDetails: ((response: unknown) => void) | undefined;
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage([patientResults[0]]));
        } else if (endpoint.startsWith("/rest/patient-details")) {
          pendingDetails = callback;
        }
      },
    );
    const getSelectedPatient = vi.fn();
    renderSearchForm({
      allowExternalSearch: false,
      selectionMode: "button",
      getSelectedPatient,
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Select" }));
    expect(pendingDetails).toBeDefined();

    fireEvent.change(screen.getByRole("textbox", { name: "First Name" }), {
      target: { value: "New criteria" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(
        getFromOpenElisServer.mock.calls.filter(([endpoint]) =>
          String(endpoint).startsWith("/rest/patient-search-results"),
        ),
      ).toHaveLength(2),
    );
    act(() => {
      pendingDetails?.({ ...patientResults[0], patientPK: "P-001" });
    });

    expect(getSelectedPatient).not.toHaveBeenCalled();
  });

  it("keeps the laboratory-number deep link search and automatic selection", async () => {
    getFromOpenElisServer.mockReset();
    const getSelectedPatient = vi.fn();
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          callback(firstPage([patientResults[0]]));
        } else if (endpoint.startsWith("/rest/patient-details")) {
          callback({ ...patientResults[0], patientPK: "P-001" });
        } else if (endpoint.startsWith("/rest/patient-photos")) {
          callback({});
        }
      },
    );

    renderSearchForm({
      allowExternalSearch: false,
      locationSearch: "?labNumber=LAB%26-1",
      getSelectedPatient,
    });

    await waitFor(() =>
      expect(getSelectedPatient).toHaveBeenCalledWith(
        expect.objectContaining({ patientPK: "P-001" }),
      ),
    );
    const searchEndpoint = getFromOpenElisServer.mock.calls.find(([endpoint]) =>
      String(endpoint).startsWith("/rest/patient-search-results"),
    )?.[0] as string;
    const parameters = new URLSearchParams(searchEndpoint.split("?")[1]);
    expect(parameters.get("labNumber")).toBe("LAB&-1");
  });

  it("clears rows and paging when a later page violates the response contract", async () => {
    getFromOpenElisServer.mockReset();
    const requests: Array<{
      endpoint: string;
      callback: (response: unknown) => void;
    }> = [];
    getFromOpenElisServer.mockImplementation(
      (endpoint: string, callback: (response: unknown) => void) => {
        if (endpoint.startsWith("/rest/patient-search-results")) {
          requests.push({ endpoint, callback });
        }
      },
    );

    renderSearchForm({ allowExternalSearch: false });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    act(() => {
      requests[0].callback({
        patientSearchResults: [patientResults[0]],
        paging: { currentPage: "1", totalPages: "2" },
        queryId: "query-invalid-total",
        totalItems: 2,
      });
    });

    expect(await screen.findByText("Ming Li")).toBeVisible();
    expect(screen.getByText("1 / 2")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    act(() => {
      requests[1].callback({
        patientSearchResults: [patientResults[1]],
        paging: { currentPage: "2", totalPages: "2" },
        queryId: "query-invalid-total",
        totalItems: 1.5,
      });
    });

    expect(
      await screen.findByText(enMessages["patient.management.list.error"]),
    ).toBeVisible();
    expect(screen.queryByText("Ming Li")).not.toBeInTheDocument();
    expect(screen.queryByText("Hua Wang")).not.toBeInTheDocument();
    expect(screen.queryByText("1 / 2")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next Page" }),
    ).not.toBeInTheDocument();
  });
});
