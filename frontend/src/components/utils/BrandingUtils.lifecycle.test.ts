import { afterEach, describe, expect, test, vi } from "vitest";
import { loadAndApplyBranding } from "./BrandingUtils";

const deferred = () => {
  let resolve!: (response: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
};
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("style");
  document.head
    .querySelectorAll('link[rel*="icon"]')
    .forEach((node) => node.remove());
});

describe("branding reads", () => {
  test("a canceled old response cannot replace newer colors, favicon or callback", async () => {
    const old = deferred();
    const current = deferred();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise),
    );
    const oldController = new AbortController();
    const callback = vi.fn();
    loadAndApplyBranding(callback, oldController.signal);
    oldController.abort();
    loadAndApplyBranding(callback, new AbortController().signal);
    current.resolve(
      json({ headerColor: "#123456", faviconUrl: "/current.ico" }),
    );
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    old.resolve(json({ headerColor: "#abcdef", faviconUrl: "/stale.ico" }));
    await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      document.documentElement.style.getPropertyValue("--site-branding-header"),
    ).toBe("#123456");
    expect(
      document.head.querySelector('link[rel="icon"]')?.getAttribute("href"),
    ).toContain("/current.ico");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("a changed session owner blocks applying branding before effect cleanup", async () => {
    const pending = deferred();
    let currentOwner = true;
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const callback = vi.fn();
    loadAndApplyBranding(
      callback,
      new AbortController().signal,
      () => currentOwner,
    );
    currentOwner = false;
    pending.resolve(json({ headerColor: "#abcdef", faviconUrl: "/stale.ico" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callback).not.toHaveBeenCalled();
    expect(
      document.documentElement.style.getPropertyValue("--site-branding-header"),
    ).toBe("");
    expect(document.head.querySelector('link[rel="icon"]')).toBeNull();
  });

  test("active branding failure remains visible and calls the current failure callback", async () => {
    const failure = new TypeError("Failed to fetch");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    const callback = vi.fn();
    loadAndApplyBranding(callback, new AbortController().signal);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(undefined));
    expect(error).toHaveBeenCalledWith(failure);
  });
});
