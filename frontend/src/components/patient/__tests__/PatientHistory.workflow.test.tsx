import React from "react";
import { render } from "@testing-library/react";
// @ts-expect-error -- legacy router does not ship declarations.
import { createMemoryHistory } from "history";
// @ts-expect-error -- legacy router does not ship declarations.
import { Router, Route } from "react-router-dom";
import { describe, expect, it } from "vitest";
import PatientHistory from "../PatientHistory";

describe("Patient history compatibility", () => {
  it.each([
    ["/PatientHistory", "/PatientManagement"],
    ["/PatientHistory?patientId=42", "/PatientResults/42"],
    ["/PatientHistory?patientID=43", "/PatientResults/43"],
  ])("consolidates %s without another search form", (path, target) => {
    const history = createMemoryHistory({ initialEntries: [path] });
    render(
      <Router history={history}>
        <Route path="/PatientHistory">
          <PatientHistory />
        </Route>
      </Router>,
    );
    expect(history.location.pathname).toBe(target);
  });
});
