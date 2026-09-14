import { MENU_PROFILES } from "./taskFocusedMenu";

const normalizeProfile = (value) => {
  if (typeof value !== "string") return null;
  const profile = value.trim().toLowerCase();
  return Object.values(MENU_PROFILES).includes(profile) ? profile : null;
};

/**
 * Navigation describes the site's product workflow, not the user's language.
 * A bundled deployment default also covers an older backend or its initial
 * configuration request, without briefly reverting the current China edition.
 * This selects presentation only; the server-authorized menu is still the input.
 */
export const resolveNavigationProfile = (siteProfile, deploymentProfile) =>
  normalizeProfile(siteProfile) ||
  normalizeProfile(deploymentProfile) ||
  MENU_PROFILES.GLOBAL;
