import { describe, expect, test } from "vitest";
import { buildLabelMakerUrl, resolveBackendPrintUrl } from "./labelMakerUrl";

describe("labelMakerUrl", () => {
  test("builds label URLs under the authenticated backend base path", () => {
    expect(
      buildLabelMakerUrl({
        labNo: "LAB 001.1",
        type: "specimen",
        quantity: 2,
      }),
    ).toBe(
      "/api/OpenELIS-Global/LabelMakerServlet?labNo=LAB+001.1&type=specimen&quantity=2",
    );
  });

  test("repairs legacy root and route-relative label URLs", () => {
    expect(resolveBackendPrintUrl("/LabelMakerServlet?labNo=LAB-1")).toBe(
      "/api/OpenELIS-Global/LabelMakerServlet?labNo=LAB-1",
    );
    expect(resolveBackendPrintUrl("LabelMakerServlet?labNo=LAB-2")).toBe(
      "/api/OpenELIS-Global/LabelMakerServlet?labNo=LAB-2",
    );
  });

  test("does not rewrite already-canonical or external print URLs", () => {
    expect(
      resolveBackendPrintUrl(
        "/api/OpenELIS-Global/LabelMakerServlet?labNo=LAB-3",
      ),
    ).toBe("/api/OpenELIS-Global/LabelMakerServlet?labNo=LAB-3");
    expect(resolveBackendPrintUrl("https://printer.example/label.pdf")).toBe(
      "https://printer.example/label.pdf",
    );
  });
});
