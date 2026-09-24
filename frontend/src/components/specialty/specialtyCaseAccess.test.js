import { describe, expect, test } from "vitest";
import {
  applySuccessfulSpecialtyRelease,
  canActAsSpecialtySpecialist,
  canClaimSpecialtyTechnician,
  isCompletedSpecialtyCase,
  Roles,
  selectableSpecialtyStatuses,
  SPECIALTY_DASHBOARD_PATHS,
  specialtyCaseUiPermissions,
  specialtyReleaseValue,
} from "./specialtyCaseAccess";

const session = (roles) => ({
  roles,
  userId: "42",
  firstName: "Ming",
  lastName: "Li",
});

describe("specialty case access policy", () => {
  test("maps assignment guidance to the matching specialty workbench", () => {
    expect(SPECIALTY_DASHBOARD_PATHS).toEqual({
      pathology: "/PathologyDashboard",
      immunohistochemistry: "/ImmunohistochemistryDashboard",
      cytology: "/CytologyDashboard",
    });
  });

  test("separates technician and specialist capabilities", () => {
    expect(canClaimSpecialtyTechnician(session([Roles.RESULTS]))).toBe(true);
    expect(canClaimSpecialtyTechnician(session([Roles.PATHOLOGIST]))).toBe(
      false,
    );
    expect(
      canActAsSpecialtySpecialist(
        session([Roles.PATHOLOGIST]),
        Roles.PATHOLOGIST,
      ),
    ).toBe(true);
    expect(
      canActAsSpecialtySpecialist(session([Roles.RESULTS]), Roles.PATHOLOGIST),
    ).toBe(false);
  });

  test("requires an explicit persisted assignment before editing", () => {
    expect(
      specialtyCaseUiPermissions(
        { status: "IN_PROGRESS" },
        session([Roles.RESULTS]),
        Roles.PATHOLOGIST,
      ),
    ).toEqual({
      canEdit: false,
      canSave: false,
      canEditSpecialistFields: false,
      canRelease: false,
      requiresAssignment: true,
    });
    expect(
      specialtyCaseUiPermissions(
        { status: "IN_PROGRESS", assignedTechnicianId: "42" },
        session([Roles.RESULTS]),
        Roles.PATHOLOGIST,
      ),
    ).toEqual({
      canEdit: true,
      canSave: true,
      canEditSpecialistFields: false,
      canRelease: false,
      requiresAssignment: false,
    });
    expect(
      specialtyCaseUiPermissions(
        { status: "IN_PROGRESS", assignedTechnicianId: "99" },
        session([Roles.RESULTS]),
        Roles.PATHOLOGIST,
      ),
    ).toEqual({
      canEdit: false,
      canSave: false,
      canEditSpecialistFields: false,
      canRelease: false,
      requiresAssignment: true,
    });
    expect(
      specialtyCaseUiPermissions(
        {
          status: "READY_PATHOLOGIST",
          assignedTechnicianId: "42",
          assignedPathologistId: "99",
        },
        session([Roles.RESULTS, Roles.PATHOLOGIST]),
        Roles.PATHOLOGIST,
      ),
    ).toEqual({
      canEdit: true,
      canSave: true,
      canEditSpecialistFields: false,
      canRelease: false,
      requiresAssignment: false,
    });
    expect(
      specialtyCaseUiPermissions(
        {
          status: "READY_PATHOLOGIST",
          assignedTechnicianId: "7",
          assignedPathologistId: 42,
        },
        session([Roles.PATHOLOGIST]),
        Roles.PATHOLOGIST,
      ),
    ).toEqual({
      canEdit: true,
      canSave: true,
      canEditSpecialistFields: true,
      canRelease: true,
      requiresAssignment: false,
    });
  });

  test("keeps completed status out of ordinary choices and makes completed cases read-only", () => {
    expect(
      selectableSpecialtyStatuses([{ id: "IN_PROGRESS" }, { id: "COMPLETED" }]),
    ).toEqual([{ id: "IN_PROGRESS" }]);
    expect(isCompletedSpecialtyCase({ status: "COMPLETED" })).toBe(true);
  });

  test("allows release only for the matching specialist on an active case", () => {
    expect(
      specialtyReleaseValue(
        {
          status: "READY_PATHOLOGIST",
          assignedTechnicianId: "7",
          assignedPathologistId: "42",
          release: true,
        },
        session([Roles.PATHOLOGIST]),
        Roles.PATHOLOGIST,
      ),
    ).toBe(true);
    expect(
      specialtyReleaseValue(
        {
          status: "READY_PATHOLOGIST",
          assignedTechnicianId: "42",
          release: true,
        },
        session([Roles.RESULTS]),
        Roles.PATHOLOGIST,
      ),
    ).toBe(false);
    expect(
      specialtyReleaseValue(
        { status: "COMPLETED", assignedPathologistId: "42", release: true },
        session([Roles.PATHOLOGIST]),
        Roles.PATHOLOGIST,
      ),
    ).toBe(false);
  });

  test("turns a successful release into a completed read-only UI state", () => {
    const releasedCase = applySuccessfulSpecialtyRelease(
      {
        status: "READY_PATHOLOGIST",
        assignedTechnicianId: "7",
        assignedPathologistId: "42",
        release: true,
      },
      true,
    );

    expect(releasedCase).toEqual({
      status: "COMPLETED",
      assignedTechnicianId: "7",
      assignedPathologistId: "42",
      release: true,
    });
    expect(
      specialtyCaseUiPermissions(
        releasedCase,
        session([Roles.PATHOLOGIST]),
        Roles.PATHOLOGIST,
      ),
    ).toEqual({
      canEdit: false,
      canSave: false,
      canEditSpecialistFields: false,
      canRelease: false,
      requiresAssignment: false,
    });
  });

  test("does not complete an ordinary successful save", () => {
    const activeCase = { status: "IN_PROGRESS", release: false };
    expect(applySuccessfulSpecialtyRelease(activeCase, false)).toBe(activeCase);
  });
});
