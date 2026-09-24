import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import {
  applySuccessfulSpecialtyRelease,
  Roles,
  specialtyCaseUiPermissions,
} from "./specialtyCaseAccess";

const specialistSession = {
  roles: [Roles.PATHOLOGIST],
  userId: "42",
};

const dualRoleTechnicianSession = {
  roles: [Roles.RESULTS, Roles.PATHOLOGIST],
  userId: "42",
};

function ReleasedCaseHarness() {
  const [sampleInfo, setSampleInfo] = useState({
    status: "READY_PATHOLOGIST",
    assignedTechnicianId: "7",
    assignedPathologistId: "42",
    release: true,
  });
  const permissions = specialtyCaseUiPermissions(
    sampleInfo,
    specialistSession,
    Roles.PATHOLOGIST,
  );

  return (
    <>
      <fieldset disabled={!permissions.canEdit}>
        <input aria-label="case input" defaultValue="editable" />
        <button disabled={!permissions.canSave}>Save</button>
        {permissions.canRelease && <button>Release</button>}
      </fieldset>
      <button
        onClick={() =>
          setSampleInfo((current) =>
            applySuccessfulSpecialtyRelease(current, true),
          )
        }
      >
        Simulate successful release
      </button>
    </>
  );
}

function DualRoleTechnicianHarness() {
  const sampleInfo = {
    status: "READY_PATHOLOGIST",
    assignedTechnicianId: "42",
    assignedPathologistId: "99",
  };
  const permissions = specialtyCaseUiPermissions(
    sampleInfo,
    dualRoleTechnicianSession,
    Roles.PATHOLOGIST,
  );

  return (
    <fieldset disabled={!permissions.canEdit}>
      <input aria-label="technician field" defaultValue="editable" />
      <select aria-label="assigned technician" disabled defaultValue="42">
        <option value="42">Current technician</option>
      </select>
      <select aria-label="assigned specialist" disabled defaultValue="99">
        <option value="99">Assigned specialist</option>
      </select>
      <fieldset disabled={!permissions.canEditSpecialistFields}>
        <input
          aria-label="specialist finding"
          defaultValue="existing finding"
        />
      </fieldset>
    </fieldset>
  );
}

function OtherSpecialistHarness() {
  const permissions = specialtyCaseUiPermissions(
    {
      status: "READY_PATHOLOGIST",
      assignedTechnicianId: "7",
      assignedPathologistId: "99",
    },
    specialistSession,
    Roles.PATHOLOGIST,
  );

  return (
    <fieldset disabled={!permissions.canEdit}>
      <fieldset disabled={!permissions.canEditSpecialistFields}>
        <input
          aria-label="existing specialist diagnosis"
          defaultValue="existing diagnosis"
        />
      </fieldset>
    </fieldset>
  );
}

describe("released specialty case UI", () => {
  test("locks inputs and Save and removes Release after success", () => {
    render(<ReleasedCaseHarness />);

    expect(screen.getByRole("textbox", { name: "case input" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Release" })).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Simulate successful release" }),
    );

    expect(screen.getByRole("textbox", { name: "case input" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Release" }),
    ).not.toBeInTheDocument();
  });

  test("keeps assignees and specialist fields read-only for a dual-role technician owner", () => {
    render(<DualRoleTechnicianHarness />);

    expect(
      screen.getByRole("textbox", { name: "technician field" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: "assigned technician" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "assigned specialist" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("textbox", { name: "specialist finding" }),
    ).toHaveValue("existing finding");
    expect(
      screen.getByRole("textbox", { name: "specialist finding" }),
    ).toBeDisabled();
  });

  test("keeps an existing diagnosis visible but read-only for another specialist", () => {
    render(<OtherSpecialistHarness />);

    const diagnosis = screen.getByRole("textbox", {
      name: "existing specialist diagnosis",
    });
    expect(diagnosis).toHaveValue("existing diagnosis");
    expect(diagnosis).toBeDisabled();
  });
});
