import {
  INTERNAL_ROUTE_REFRESH_EVENT,
  navigateToInternalPath,
  refreshCurrentRoute,
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
