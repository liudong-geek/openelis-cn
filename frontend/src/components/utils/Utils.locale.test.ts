import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFromOpenElisServer } from "./Utils";

describe("OpenELIS request locale", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("sends the canonical UI locale on centralized API GET requests", async () => {
    localStorage.setItem("locale", "zh_CN");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new Promise<void>((resolve) => {
      getFromOpenElisServer("/rest/sample-types", () => resolve());
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/rest/sample-types"),
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({ "Accept-Language": "zh-CN" }),
      }),
    );
  });
});
