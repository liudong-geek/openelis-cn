import {
  INTERNAL_ROUTE_REFRESH_EVENT,
  navigateToInternalPath,
  refreshCurrentRoute,
  getPublicLoginPath,
} from "./NavigationUtils";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("navigateToInternalPath", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  test("moves to an internal route without assigning window.location", () => {
    const popStateListener = vi.fn();
    window.addEventListener("popstate", popStateListener);

    expect(navigateToInternalPath("/Results?scope=pending#worklist")).toBe(
      true,
    );
    expect(window.location.pathname).toBe("/Results");
    expect(window.location.search).toBe("?scope=pending");
    expect(window.location.hash).toBe("#worklist");
    expect(popStateListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("popstate", popStateListener);
  });

  test("rejects cross-origin and invalid targets", () => {
    expect(navigateToInternalPath("https://example.com/patient/1")).toBe(false);
    expect(navigateToInternalPath("http://[invalid")).toBe(false);
    expect(window.location.pathname).toBe("/");
  });

  test("requests an in-app route refresh instead of a browser reload", () => {
    const refreshListener = vi.fn();
    window.addEventListener(INTERNAL_ROUTE_REFRESH_EVENT, refreshListener);

    refreshCurrentRoute();

    expect(refreshListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(INTERNAL_ROUTE_REFRESH_EVENT, refreshListener);
  });
});

describe("configured public login targets", () => {
  test.each([
    "/login",
    "/login?return=work#form",
    `${window.location.origin}/login?return=work#form`,
  ])("retains the local public login path and its query/hash: %s", (target) => {
    const url = new URL(target, window.location.origin);
    expect(getPublicLoginPath(target)).toBe(
      url.pathname + url.search + url.hash,
    );
  });
  test.each([
    "/LoginPage",
    "/login-other",
    "https://example.com/login",
    "http://[invalid",
  ])(
    "preserves full-document navigation for custom or invalid targets: %s",
    (target) => {
      expect(getPublicLoginPath(target)).toBeNull();
    },
  );
});

test("a relative custom login target retains the original document URL base", () => {
  const previous = window.location.href;
  window.history.replaceState({}, "", "/custom/settings");
  try {
    expect(new URL("login", window.location.href).pathname).toBe(
      "/custom/login",
    );
    expect(getPublicLoginPath("login")).toBeNull();
  } finally {
    window.history.replaceState({}, "", previous);
  }
});
