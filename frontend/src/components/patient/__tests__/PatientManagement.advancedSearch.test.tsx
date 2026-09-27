import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryHistory } from "history";
import { IntlProvider } from "react-intl";
import { Route, Router } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../languages/en.json";
import PatientManagement from "../PatientManagement";

const searchFormProps = vi.hoisted(() => vi.fn());

vi.mock("../../common/PageBreadCrumb", () => ({ default: () => null }));
vi.mock("../../common/ProductPageHeader", () => ({
  default: ({
    title,
    actions,
  }: {
    title: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));
vi.mock("../PatientMasterList", () => ({
  default: ({
    onOpenAdvancedSearch,
    onNewPatient,
  }: {
    onOpenAdvancedSearch: () => void;
    onNewPatient: () => void;
  }) => (
    <div>
      SIM patient master list
      <button onClick={onOpenAdvancedSearch}>Advanced Search</button>
      <button onClick={onNewPatient}>SIM new patient</button>
    </div>
  ),
}));
vi.mock("../CreatePatientForm", () => ({
  default: ({
    onCancel,
    onSaveSuccess,
  }: {
    onCancel?: () => void;
    onSaveSuccess?: (patientId?: string) => void;
  }) => (
    <div>
      SIM patient editor
      {onCancel && <button onClick={onCancel}>SIM cancel patient</button>}
      {onSaveSuccess && (
        <button onClick={() => onSaveSuccess("91")}>SIM save patient</button>
      )}
    </div>
  ),
}));
vi.mock("../usePatientDetails", () => ({
  default: (id: string | null) => ({
    patient: id ? { patientPK: id } : null,
    loading: false,
    error: null,
  }),
}));
vi.mock("../SearchPatientForm", () => ({
  default: ({
    initialSearch,
    initialState,
    onStateChange,
    getSelectedPatient,
  }: {
    initialSearch: string;
    initialState?: Record<string, unknown>;
    onStateChange: (state: Record<string, unknown>) => void;
    getSelectedPatient: (patient: { patientPK: string }) => void;
  }) => {
    searchFormProps({ initialSearch, initialState, onStateChange });
    return (
      <div>
        <span>SIM advanced patient search {initialSearch}</span>
        <button
          onClick={() =>
            onStateChange({
              draft: { firstName: "Draft" },
              submitted: { firstName: "Submitted" },
              hasSearched: true,
              apiPage: 3,
            })
          }
        >
          SIM save advanced state
        </button>
        <button onClick={() => getSelectedPatient({ patientPK: "42" })}>
          SIM open patient
        </button>
      </div>
    );
  },
}));

const mount = (entry: string) => {
  const history = createMemoryHistory({ initialEntries: [entry] });
  render(
    <Router history={history}>
      <IntlProvider locale="en" messages={enMessages}>
        <Route path="/PatientManagement/:patientId?">
          <PatientManagement />
        </Route>
      </IntlProvider>
    </Router>,
  );
  return history;
};

describe("PatientManagement advanced search", () => {
  it("keeps the default patient list and makes advanced search an explicit mode", () => {
    mount("/PatientManagement");
    expect(screen.getByText("SIM patient master list")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Advanced Search" }));
    expect(screen.getByText(/SIM advanced patient search/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "SIM save advanced state" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Back to patient list" }),
    );
    expect(screen.getByText("SIM patient master list")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Advanced Search" }));
    expect(searchFormProps.mock.calls.at(-1)?.[0].initialState).toEqual({
      draft: { firstName: "Draft" },
      submitted: { firstName: "Submitted" },
      hasSearched: true,
      apiPage: 3,
    });
  });

  it("restores every supported identifier deep link and opens the selected record", () => {
    const links = [
      "?labNumber=SIM-2026-001",
      "?STNumber=SIM-ST-001",
      "?subjectNumber=SIM-SUBJECT-001",
      "?guid=SIM-GUID-001",
      "?quickQuery=%E5%BC%A0+%E4%B8%89+%26+A%2FB%3F",
    ];

    links.forEach((search, index) => {
      cleanup();
      const history = mount(`/PatientManagement${search}`);
      expect(
        screen.getByText(`SIM advanced patient search ${search}`),
      ).toBeVisible();
      if (index === 0) {
        fireEvent.click(
          screen.getByRole("button", { name: "SIM open patient" }),
        );
        expect(history.location.pathname).toBe("/PatientManagement/42");
      }
    });
  });

  it("creates a patient in a modal without leaving or replacing the list", () => {
    const history = mount("/PatientManagement");

    fireEvent.click(screen.getByRole("button", { name: "SIM new patient" }));
    expect(screen.getByText("SIM patient master list")).toBeVisible();
    expect(screen.getByText("SIM patient editor")).toBeVisible();
    expect(history.location.pathname).toBe("/PatientManagement");

    fireEvent.click(screen.getByRole("button", { name: "SIM cancel patient" }));
    expect(screen.queryByText("SIM patient editor")).not.toBeInTheDocument();
    expect(screen.getByText("SIM patient master list")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "SIM new patient" }));
    fireEvent.click(screen.getByRole("button", { name: "SIM save patient" }));
    expect(screen.queryByText("SIM patient editor")).not.toBeInTheDocument();
    expect(screen.getByText("SIM patient master list")).toBeVisible();
    expect(history.location.pathname).toBe("/PatientManagement");
  });
});
