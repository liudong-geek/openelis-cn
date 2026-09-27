import { describe, expect, test } from "vitest";
import {
  findDutySeparationConflicts,
  getPermissionProfile,
  resolvePermissionProfile,
} from "./chinaPermissionProfiles";

const globalRoles = [
  { roleId: "1", roleName: "Global Administrator" },
  { roleId: "2", roleName: "User Account Administrator" },
  { roleId: "11", roleName: "Audit Trail" },
  { roleId: "71", roleName: "Analyser Import" },
];
const labUnitRoles = [
  { roleId: "4", roleName: "Reception" },
  { roleId: "5", roleName: "Results" },
  { roleId: "7", roleName: "Reports" },
  { roleId: "10", roleName: "Validation" },
];

describe("China permission profiles", () => {
  test("resolves a technician to results permission in one lab unit", () => {
    expect(
      resolvePermissionProfile({
        profile: getPermissionProfile("technician"),
        globalRoles,
        labUnitRoles,
        labUnitId: "Hematology",
      }),
    ).toMatchObject({
      globalRoleIds: [],
      selectedTestSectionLabUnits: { Hematology: ["5"] },
      missingRoleNames: [],
      missingLabUnit: false,
    });
  });

  test("requires a lab unit before applying a clinical profile", () => {
    const resolved = resolvePermissionProfile({
      profile: getPermissionProfile("reviewer"),
      globalRoles,
      labUnitRoles,
    });

    expect(resolved.missingLabUnit).toBe(true);
    expect(resolved.selectedTestSectionLabUnits).toEqual({});
  });

  test("keeps system administration separate from clinical permissions", () => {
    expect(
      resolvePermissionProfile({
        profile: getPermissionProfile("systemAdmin"),
        globalRoles,
        labUnitRoles,
      }),
    ).toMatchObject({
      globalRoleIds: ["1"],
      selectedTestSectionLabUnits: {},
      missingLabUnit: false,
    });
  });

  test("detects result entry and validation assigned to the same unit", () => {
    expect(
      findDutySeparationConflicts(
        {
          Hematology: ["5", "10"],
          Chemistry: ["5"],
        },
        labUnitRoles,
      ),
    ).toEqual(["Hematology"]);
  });
});
