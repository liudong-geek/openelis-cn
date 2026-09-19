import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/en.json";
import ExternalConnectionSimulation from "./ExternalConnectionSimulation";

const renderSimulation = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <ExternalConnectionSimulation open onClose={vi.fn()} />
    </IntlProvider>,
  );

describe("ExternalConnectionSimulation", () => {
  test("offers guided HIS, FHIR, and critical-value scenarios", () => {
    renderSimulation();

    expect(screen.getByTestId("external-simulation-safety")).toHaveTextContent(
      "does not connect",
    );
    const options = screen
      .getByTestId("external-simulation-scenario")
      .querySelectorAll("option");
    expect(options).toHaveLength(3);
    expect(Array.from(options).map((option) => option.textContent)).toEqual([
      "HIS HL7 result push",
      "FHIR R4 Observation",
      "Critical-value webhook",
    ]);
  });

  test("switching to FHIR generates a synthetic Observation preview", () => {
    renderSimulation();

    fireEvent.change(screen.getByTestId("external-simulation-scenario"), {
      target: { value: "FHIR_OBSERVATION" },
    });

    expect(screen.getByTestId("external-simulation-endpoint")).toHaveValue(
      "https://fhir.example.local/fhir/Observation",
    );
    expect(screen.getByText(/SIM-OBS-001/)).toBeVisible();
    expect(screen.getByTestId("external-simulation-goal")).toHaveTextContent(
      "FHIR R4 Observation payload",
    );
  });

  test("running simulation validates configuration without network requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderSimulation();

    fireEvent.change(screen.getByTestId("external-simulation-authentication"), {
      target: { value: "MTLS" },
    });
    fireEvent.change(screen.getByTestId("external-simulation-retry"), {
      target: { value: "MANUAL_REVIEW" },
    });
    await userEvent.click(screen.getByTestId("external-simulation-run"));

    expect(screen.getByTestId("external-simulation-result")).toBeVisible();
    expect(
      screen.getByTestId("external-simulation-result-status"),
    ).toHaveTextContent("Passed");
    expect(screen.getByTestId("external-simulation-result")).toHaveTextContent(
      "No outbound network request was sent",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
