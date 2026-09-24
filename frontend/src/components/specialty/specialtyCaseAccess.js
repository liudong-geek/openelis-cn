import { hasRole, Roles } from "../utils/Utils";

export const SPECIALTY_COMPLETED_STATUS = "COMPLETED";
export const SPECIALTY_DASHBOARD_PATHS = Object.freeze({
  pathology: "/PathologyDashboard",
  immunohistochemistry: "/ImmunohistochemistryDashboard",
  cytology: "/CytologyDashboard",
});

export const canClaimSpecialtyTechnician = (userSessionDetails) =>
  hasRole(userSessionDetails, Roles.RESULTS);

export const canActAsSpecialtySpecialist = (
  userSessionDetails,
  specialistRole,
) => hasRole(userSessionDetails, specialistRole);

export const isCompletedSpecialtyCase = (sampleInfo) =>
  sampleInfo?.status === SPECIALTY_COMPLETED_STATUS;

export const specialtyCaseUiPermissions = (
  sampleInfo,
  userSessionDetails,
  specialistRole,
) => {
  const currentUserId = userSessionDetails?.userId;
  const isCurrentUser = (assignedUserId) =>
    currentUserId != null &&
    assignedUserId != null &&
    String(assignedUserId) === String(currentUserId);
  const isTechnicianAssignee =
    canClaimSpecialtyTechnician(userSessionDetails) &&
    isCurrentUser(sampleInfo?.assignedTechnicianId);
  const isSpecialistAssignee =
    canActAsSpecialtySpecialist(userSessionDetails, specialistRole) &&
    isCurrentUser(sampleInfo?.assignedPathologistId);
  const completed = isCompletedSpecialtyCase(sampleInfo);
  const assignedToCurrentUser = isTechnicianAssignee || isSpecialistAssignee;
  const hasTechnicianAssignment = Boolean(sampleInfo?.assignedTechnicianId);
  const readOnly = completed || !assignedToCurrentUser;
  return {
    canEdit: !readOnly,
    canSave: !readOnly,
    canEditSpecialistFields: !completed && isSpecialistAssignee,
    canRelease: !completed && isSpecialistAssignee && hasTechnicianAssignment,
    requiresAssignment: !completed && !assignedToCurrentUser,
  };
};

export const selectableSpecialtyStatuses = (statuses = []) =>
  statuses.filter((status) => status?.id !== SPECIALTY_COMPLETED_STATUS);

export const specialtyReleaseValue = (
  sampleInfo,
  userSessionDetails,
  specialistRole,
) =>
  specialtyCaseUiPermissions(sampleInfo, userSessionDetails, specialistRole)
    .canRelease && Boolean(sampleInfo?.release);

export const applySuccessfulSpecialtyRelease = (
  sampleInfo,
  releaseSubmitted,
) =>
  releaseSubmitted
    ? {
        ...sampleInfo,
        status: SPECIALTY_COMPLETED_STATUS,
        release: true,
      }
    : sampleInfo;

export { Roles };
