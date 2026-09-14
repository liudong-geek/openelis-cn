import { resolveNavigationProfile } from "./navigationProfile";
import { MENU_PROFILES } from "./taskFocusedMenu";

describe("site navigation profile", () => {
  test.each(["china", "global"])(
    "uses the explicitly configured %s profile",
    (profile) => {
      expect(resolveNavigationProfile(profile, "china")).toBe(profile);
    },
  );

  test("normalizes persisted configuration values", () => {
    expect(resolveNavigationProfile(" GLOBAL ", "china")).toBe(
      MENU_PROFILES.GLOBAL,
    );
  });

  test.each([undefined, null, "", " ", "unknown", true, {}])(
    "uses the deployment profile for missing or unsupported value %s",
    (profile) => {
      expect(resolveNavigationProfile(profile, "china")).toBe(
        MENU_PROFILES.CHINA,
      );
    },
  );

  test("supports an explicitly global deployment without a site override", () => {
    expect(resolveNavigationProfile(undefined, "global")).toBe(
      MENU_PROFILES.GLOBAL,
    );
  });

  test("does not silently select a regional edition when both settings are invalid", () => {
    expect(resolveNavigationProfile("unknown", "unknown")).toBe(
      MENU_PROFILES.GLOBAL,
    );
  });

  test("keeps the China deployment stable before and after site settings load", () => {
    const deploymentProfile = "china";
    expect(resolveNavigationProfile(undefined, deploymentProfile)).toBe(
      resolveNavigationProfile("china", deploymentProfile),
    );
  });
});
