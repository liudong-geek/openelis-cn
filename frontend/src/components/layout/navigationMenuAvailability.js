// This is the same authenticated identity used by Header's owned reads. A
// navigation snapshot never grants a role, module permission or clinical action.
export const navigationMenuOwner = (details) =>
  details?.authenticated === true &&
  typeof details.userId === "string" &&
  details.userId.trim() &&
  typeof details.sessionId === "string" &&
  details.sessionId.trim()
    ? JSON.stringify([
        details.userId,
        details.sessionId,
        details.loginLabUnit ?? null,
        details.roles ?? [],
        details.userLabRolesMap ?? {},
      ])
    : null;

// The patient-maintenance shortcut replaces the legacy root/child navigation.
// Require the actual IDs and their active ancestry from Header's raw GET result;
// missing data or unknown flags do not manufacture a visible entry.
export const hasPatientManagementMenu = (items) => {
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    if (item?.menu?.isActive !== true) return false;
    if (item.menu.elementId === "menu_patient") {
      return (
        Array.isArray(item.childMenus) &&
        item.childMenus.some(
          (child) =>
            child?.menu?.elementId === "menu_patient_add_or_edit" &&
            child.menu.isActive === true,
        )
      );
    }
    return hasPatientManagementMenu(item.childMenus);
  });
};

// The China list contains the ordinary history/results shortcut. Its original
// exact flag stays independent from the optional research patient-create flag.
export const hasPatientHistoryMenu = (items) => {
  const roots = [];
  const collect = (entries, ancestorsActive = true) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      const active = ancestorsActive && entry?.menu?.isActive === true;
      if (entry?.menu?.elementId === "menu_patient")
        roots.push({ entry, active });
      collect(entry?.childMenus, active);
    }
  };
  collect(items);
  if (roots.length !== 1 || !roots[0].active) return false;
  const children = roots[0].entry.childMenus;
  if (!Array.isArray(children)) return false;
  const history = children.filter(
    (entry) => entry?.menu?.elementId === "menu_patienthistory",
  );
  return history.length === 1 && history[0].menu.isActive === true;
};

export const canViewPatientHistory = (details, items) =>
  !!navigationMenuOwner(details) &&
  Array.isArray(details?.roles) &&
  // Exact existing PatientResults route roles; this shortcut grants none.
  details.roles.some((role) =>
    ["Reception", "Results", "Reports"].includes(role),
  ) &&
  hasPatientHistoryMenu(items);
