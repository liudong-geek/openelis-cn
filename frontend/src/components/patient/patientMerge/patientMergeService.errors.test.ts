import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPatients } from "./patientMergeService";

afterEach(() => vi.unstubAllGlobals());

describe("patient merge search errors", () => {
  it.each([
    [400, "Invalid search"],
    [401, "Unauthorized"],
    [500, "Search failed"],
  ])("preserves a %s response and its message", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(searchPatients({ patientId: "SIM" })).rejects.toEqual(
      expect.objectContaining({ status, message }),
    );
  });

  it("propagates a network failure", async () => {
    const failure = new TypeError("Network unavailable");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));

    await expect(searchPatients({ patientId: "SIM" })).rejects.toBe(failure);
  });

  it("preserves an HTTP failure from a later page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            queryId: "SIM-PAGED-ERROR",
            totalItems: 2,
            patientSearchResults: [{ patientID: "1" }],
            paging: { currentPage: "1", totalPages: "2" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Registry unavailable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPatients({ patientId: "SIM" })).rejects.toEqual(
      expect.objectContaining({ status: 502, message: "Registry unavailable" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
