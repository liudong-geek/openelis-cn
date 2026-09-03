import React from "react";
import { waitFor } from "@testing-library/dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import PatientReportReleasePanel from "../PatientReportReleasePanel";

const api = vi.hoisted(() => ({
  getPatientReportReleases: vi.fn(),
  createPatientReportDraft: vi.fn(),
  issuePatientReport: vi.fn(),
  voidPatientReport: vi.fn(),
  printPatientReport: vi.fn(),
  patientReportPdfUrl: vi.fn((id: number) => `/reports/${id}.pdf`),
}));
const isEsigEnabled = vi.hoisted(() => vi.fn());

vi.mock("../patient-report-release-api", () => api);
vi.mock("../../../esignature/api", () => ({ isEsigEnabled }));
vi.mock("../../../esignature/ESignatureButton", () => ({
  SignatureMeaning: {
    VALIDATED_AND_RELEASED: "VALIDATED_AND_RELEASED",
    REJECTED: "REJECTED",
  },
  default: ({ children, onSign }: any) => (
    <button onClick={() => onSign({ id: 99 })}>{children}</button>
  ),
}));

describe("PatientReportReleasePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEsigEnabled.mockResolvedValue({ enabled: true });
    api.createPatientReportDraft.mockResolvedValue({});
    api.issuePatientReport.mockResolvedValue({});
    api.voidPatientReport.mockResolvedValue({});
    api.printPatientReport.mockResolvedValue(new Blob());
  });

  it("在患者上下文中准备首次正式报告", async () => {
    api.getPatientReportReleases.mockResolvedValue([]);
    render(<PatientReportReleasePanel patientId="42" canManage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "准备首次正式报告" }),
    );

    await waitFor(() =>
      expect(api.createPatientReportDraft).toHaveBeenCalledWith("42", ""),
    );
  });

  it("更正版报告必须先记录更正原因", async () => {
    api.getPatientReportReleases.mockResolvedValue([
      {
        id: 8,
        patientId: "42",
        reportNumber: "BG-20260902-0001",
        reportVersion: 1,
        status: "ISSUED",
        createdAt: "2026-09-02T09:00:00",
        issuedAt: "2026-09-02T10:00:00",
      },
    ]);
    render(<PatientReportReleasePanel patientId="42" canManage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "准备更正版报告" }),
    );
    expect(screen.getByText("再次出具报告必须填写更正原因。")).toBeVisible();
    expect(api.createPatientReportDraft).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("更正原因（必填）"), {
      target: { value: "修正参考范围" },
    });
    fireEvent.click(screen.getByRole("button", { name: "准备更正版报告" }));

    await waitFor(() =>
      expect(api.createPatientReportDraft).toHaveBeenCalledWith(
        "42",
        "修正参考范围",
      ),
    );
  });

  it("使用电子签名出具已准备的报告", async () => {
    api.getPatientReportReleases.mockResolvedValue([
      {
        id: 10,
        patientId: "42",
        reportNumber: "BG-20260902-0002",
        reportVersion: 2,
        status: "DRAFT",
        createdAt: "2026-09-02T11:00:00",
      },
    ]);
    render(<PatientReportReleasePanel patientId="42" canManage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "电子签名并出具" }),
    );

    await waitFor(() =>
      expect(api.issuePatientReport).toHaveBeenCalledWith(10, 99),
    );
  });

  it("电子签名未启用时明确阻断正式签发", async () => {
    isEsigEnabled.mockResolvedValue({ enabled: false });
    api.getPatientReportReleases.mockResolvedValue([
      {
        id: 10,
        patientId: "42",
        reportNumber: "BG-20260902-0002",
        reportVersion: 2,
        status: "DRAFT",
        createdAt: "2026-09-02T11:00:00",
      },
    ]);
    render(<PatientReportReleasePanel patientId="42" canManage />);

    expect(await screen.findByText("无法签发")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "电子签名并出具" }),
    ).not.toBeInTheDocument();
  });
});
