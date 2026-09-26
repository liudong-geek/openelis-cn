import { afterEach, describe, expect, test, vi } from "vitest";
import { lookupSpecimen } from "./specimenLookupApi";

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  redirected: false,
  type: "basic",
  headers: { get: () => "application/json" },
  json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

describe("read-only specimen lookup transport", () => {
  test("uses the current session and preserves complete dotted codes", async () => {
    const result = {
      version: 1,
      source: "specimen_lookup",
      readOnly: true,
      matchedKind: "specimen",
      selection: { sampleId: "30", sampleItemId: "22", requestId: "12" },
      current: {
        sampleId: "30",
        labNo: "A.300",
        requestedSpecimens: [],
        physicalSpecimens: [],
      },
    };
    const fetcher = vi.fn().mockResolvedValue(reply(200, result));
    vi.stubGlobal("fetch", fetcher);

    expect(await lookupSpecimen(" A.300.2 ")).toBe(result);
    expect(fetcher.mock.calls[0][0]).toContain(
      "/rest/specimen-intake/lookup?code=A.300.2",
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  });

  test("distinguishes ambiguous codes from missing and unauthorized records", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(reply(409, { code: "SPECIMEN_LOOKUP_AMBIGUOUS" }))
      .mockResolvedValueOnce(reply(404, { code: "SPECIMEN_LOOKUP_NOT_FOUND" }))
      .mockResolvedValueOnce(reply(403, { code: "SPECIMEN_LOOKUP_DENIED" }))
      .mockResolvedValueOnce(
        reply(409, { code: "SPECIMEN_LOOKUP_UNSUPPORTED" }),
      )
      .mockResolvedValueOnce(
        reply(409, { code: "SPECIMEN_LOOKUP_LEGACY_READONLY" }),
      );
    vi.stubGlobal("fetch", fetcher);

    await expect(lookupSpecimen("A.300.2")).rejects.toMatchObject({
      kind: "ambiguous",
    });
    await expect(lookupSpecimen("unknown")).rejects.toMatchObject({
      kind: "notFound",
    });
    await expect(lookupSpecimen("forbidden")).rejects.toMatchObject({
      kind: "forbidden",
    });
    await expect(lookupSpecimen("unsupported")).rejects.toMatchObject({
      kind: "unsupported",
    });
    await expect(lookupSpecimen("legacy")).rejects.toMatchObject({
      kind: "unsupported",
    });
  });
});
