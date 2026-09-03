import { afterEach, describe, expect, it, vi } from "vitest";
import { navigate } from "./navigate";

describe("patient results viewer navigation", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("navigates same-origin links without requiring a single-spa root", () => {
    const popStateListener = vi.fn();
    window.addEventListener("popstate", popStateListener, { once: true });
    window.history.replaceState({}, "", "/PatientResults/4");

    navigate({ to: "#groupedtimeline" });

    expect(window.location.pathname).toBe("/PatientResults/4");
    expect(window.location.hash).toBe("#groupedtimeline");
    expect(popStateListener).toHaveBeenCalledOnce();
  });

  it("preserves query strings for application routes", () => {
    navigate({ to: "/Results?scope=pending" });

    expect(window.location.pathname).toBe("/Results");
    expect(window.location.search).toBe("?scope=pending");
  });
});
