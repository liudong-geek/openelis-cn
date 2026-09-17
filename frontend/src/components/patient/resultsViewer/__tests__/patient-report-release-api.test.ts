import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../patient-report-release-api";
import {
  application,
  document,
  release,
  frozen,
  scope,
  clone,
  json,
} from "./reportFixtures";
const context = {
  stamp: { identity: "actor-session", csrf: "token" },
  current: () => true,
};
beforeEach(() => {
  localStorage.setItem("CSRF", "token");
});
afterEach(() => vi.unstubAllGlobals());
describe("document-scoped report contracts", () => {
  it("binds application, document, version and complete frozen membership", () => {
    expect(api.readApplications([application], "42")).toHaveLength(1);
    expect(api.readDocument(document, application)).toEqual(document);
    expect(
      api.readDetail(
        { release, scope, canReviewOriginal: false, canPrintCurrent: false },
        document,
        80,
      ).release.id,
    ).toBe(80);
    expect(
      api.readFrozen(frozen, document, release).snapshot.report.rows[0].cells,
    ).toEqual(["Patient One", "7.2 mmol/L"]);
  });
  it.each([
    (v: any) => {
      v.releaseId = 81;
    },
    (v: any) => {
      v.documentId = "61";
    },
    (v: any) => {
      v.snapshot.scope.patientId = "43";
    },
    (v: any) => {
      v.snapshot.scope.sampleId = "52";
    },
    (v: any) => {
      v.snapshot.scope.analysisIds = ["71"];
    },
    (v: any) => {
      v.snapshot.analyses[0].analysisId = "71";
    },
    (v: any) => {
      v.snapshot.analyses.push(clone(v.snapshot.analyses[0]));
    },
    (v: any) => {
      v.snapshot.analyses[0].lastUpdated = "bad";
    },
    (v: any) => {
      v.snapshot.reportVersion = 2;
    },
    (v: any) => {
      v.snapshotSha256 = "A".repeat(64);
    },
    (v: any) => {
      v.snapshot.report.rows[0].cells = [{ html: "unsafe" }];
    },
  ])("rejects mismatched or malformed frozen evidence %#", (mutate) => {
    const value = clone(frozen);
    mutate(value);
    expect(() => api.readFrozen(value, document, release)).toThrow();
  });
  it("rejects fake current-print permissions for a draft or historical report", () => {
    for (const status of ["DRAFT", "SUPERSEDED", "VOIDED"]) {
      expect(() =>
        api.readDetail(
          {
            release: { ...release, status, pdfSha256: "b".repeat(64) },
            scope,
            canReviewOriginal: true,
            canPrintCurrent: true,
          },
          document,
          80,
        ),
      ).toThrow();
    }
  });
  it("issues directly with a hash and password, never a generic signature", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        json({ ...release, status: "ISSUED", pdfSha256: "b".repeat(64) }),
      );
    vi.stubGlobal("fetch", fetcher);
    await api.issueReport(
      document,
      release,
      frozen.snapshotSha256,
      "secret",
      context,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toMatch(/\/rest\/reports\/documents\/60\/releases\/80\/issue$/);
    expect(JSON.parse(options.body)).toEqual({
      snapshotSha256: "a".repeat(64),
      password: "secret",
    });
    expect(options).toMatchObject({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      redirect: "manual",
      headers: { "X-CSRF-Token": "token" },
    });
  });
  it("binds void to the stored original hash and omits client signer identity", async () => {
    const r = {
      ...release,
      status: "ISSUED" as const,
      pdfSha256: "b".repeat(64),
    };
    const fetcher = vi.fn().mockResolvedValue(json({ ...r, status: "VOIDED" }));
    vi.stubGlobal("fetch", fetcher);
    await api.voidReport(document, r, "secret", "wrong unit", context);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      expectedPdfSha256: r.pdfSha256,
      password: "secret",
      reason: "wrong unit",
    });
  });
  it.each([500, 302, 200])(
    "marks failed/redirect/html mutation responses unknown (%s)",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response("login", {
            status,
            headers: { "Content-Type": "text/html" },
          }),
        ),
      );
      await expect(
        api.issueReport(
          document,
          release,
          frozen.snapshotSha256,
          "secret",
          context,
        ),
      ).rejects.toMatchObject({ kind: "unknown" });
    },
  );
  it("a changed session after send is unknown, and before send prevents the request", async () => {
    let current = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        current = false;
        return json({
          ...release,
          status: "ISSUED",
          pdfSha256: "b".repeat(64),
        });
      }),
    );
    const c = { ...context, current: () => current };
    await expect(
      api.issueReport(document, release, frozen.snapshotSha256, "secret", c),
    ).rejects.toMatchObject({ kind: "unknown" });
    vi.mocked(fetch).mockClear();
    await expect(api.getReportApplications("42", c)).rejects.toMatchObject({
      kind: "session",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces CSRF before reads and writes and preserves explicit rejection", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 409));
    vi.stubGlobal("fetch", fetcher);
    await expect(
      api.issueReport(
        document,
        release,
        frozen.snapshotSha256,
        "secret",
        context,
      ),
    ).rejects.toMatchObject({ kind: "rejected", status: 409 });
    localStorage.setItem("CSRF", "new");
    await expect(
      api.getReportApplications("42", context),
    ).rejects.toMatchObject({ kind: "session" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
