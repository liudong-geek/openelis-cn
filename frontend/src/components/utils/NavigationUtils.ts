export interface InternalNavigationOptions {
  replace?: boolean;
}

export const INTERNAL_ROUTE_REFRESH_EVENT = "openelis:refresh-current-route";

/**
 * Navigate within the OpenELIS application without reloading the page.
 * Returns false for an invalid or cross-origin target so callers cannot turn
 * an internal action into an unexpected external redirect.
 */
export const navigateToInternalPath = (
  target: string,
  { replace = false }: InternalNavigationOptions = {},
): boolean => {
  if (!target) {
    return false;
  }

  let resolvedTarget: URL;
  try {
    resolvedTarget = new URL(target, window.location.origin);
  } catch {
    return false;
  }

  if (resolvedTarget.origin !== window.location.origin) {
    return false;
  }

  const relativeTarget = `${resolvedTarget.pathname}${resolvedTarget.search}${resolvedTarget.hash}`;
  const historyMethod = replace ? "replaceState" : "pushState";
  window.history[historyMethod](window.history.state, "", relativeTarget);
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: window.history.state }),
  );
  return true;
};

/** Re-mount the active route while preserving the application shell. */
export const refreshCurrentRoute = (): void => {
  window.dispatchEvent(new Event(INTERNAL_ROUTE_REFRESH_EVENT));
};

/** Only the configured same-origin public login route may remain in this document. */
export const getPublicLoginPath = (target: string): string | null => {
  try {
    const resolved = new URL(target, window.location.href);
    return resolved.origin === window.location.origin &&
      resolved.pathname === "/login"
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : null;
  } catch {
    return null;
  }
};
