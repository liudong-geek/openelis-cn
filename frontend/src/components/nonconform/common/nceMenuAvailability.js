// Layout supplies Header's exact owner-bound raw menu snapshot. These flags
// only restrict navigation; they never grant a role or a clinical capability.
const collect = (items, elementId, ancestorsActive = true, matches = []) => {
  if (!Array.isArray(items)) return matches;
  for (const item of items) {
    const active = ancestorsActive && item?.menu?.isActive === true;
    if (item?.menu?.elementId === elementId) matches.push({ item, active });
    collect(item?.childMenus, elementId, active, matches);
  }
  return matches;
};

const activeChild = (items, elementId) => {
  const matches = collect(items, elementId);
  return matches.length === 1 && matches[0].active;
};

export const nceMenuAvailability = (items) => {
  const roots = collect(items, "menu_nonconformity");
  const children =
    roots.length === 1 && roots[0].active ? roots[0].item.childMenus : null;
  const dashboard = activeChild(children, "menu_nce_dashboard");
  return {
    registration:
      dashboard && activeChild(children, "menu_non_conforming_report"),
    view: dashboard && activeChild(children, "menu_non_conforming_view"),
    capa:
      dashboard &&
      activeChild(children, "menu_non_conforming_corrective_actions"),
  };
};

// The workspace server supplies both flags from its same-object UPDATE check.
// This is an additional limit on launching the existing CAPA page, not a new
// authorization contract for its legacy REST handlers.
export const canLaunchNceCapa = (availability, row) =>
  availability.view === true &&
  availability.capa === true &&
  row?.canAssign === true &&
  row?.canAddNote === true;
