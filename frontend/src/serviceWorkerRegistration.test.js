import { describe, expect, it } from "vitest";
import { getServiceWorkerUrl } from "./serviceWorkerRegistration";

describe("getServiceWorkerUrl", () => {
  it("registers from the application root instead of the current route", () => {
    expect(getServiceWorkerUrl("/")).toBe("/service-worker.js");
  });

  it("honours a configured deployment base path", () => {
    expect(getServiceWorkerUrl("/openelis")).toBe(
      "/openelis/service-worker.js",
    );
    expect(getServiceWorkerUrl("/openelis/")).toBe(
      "/openelis/service-worker.js",
    );
  });
});
