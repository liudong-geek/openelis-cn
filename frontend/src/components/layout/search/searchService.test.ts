import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPatientData,
  getPatientDisplayName,
  getPatientManagementSearchRoute,
} from "./searchService";

const responseReader = vi.hoisted(() => ({
  readOpenElisResponse: vi.fn(),
}));

vi.mock("../../utils/readOpenElisResponse", () => responseReader);

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe("global patient search service", () => {
  beforeEach(() => responseReader.readOpenElisResponse.mockReset());

  it("uses one request, preserves HTTP status, and returns paging metadata", async () => {
    const callback = vi.fn();
    const controller = new AbortController();
    const patient = {
      patientID: "P-1",
      firstName: "三",
      lastName: "张",
    };
    responseReader.readOpenElisResponse.mockResolvedValue(
      jsonResponse({
        patientSearchResults: [patient],
        totalItems: 101,
        paging: { currentPage: "1" },
      }),
    );

    fetchPatientData("张 三 & A/B?", callback, controller.signal);

    expect(responseReader.readOpenElisResponse).toHaveBeenCalledTimes(1);
    expect(responseReader.readOpenElisResponse).toHaveBeenCalledWith(
      "/rest/patient-search-results?quickQuery=%E5%BC%A0+%E4%B8%89+%26+A%2FB%3F&suppressExternalSearch=true",
      controller.signal,
    );
    await vi.waitFor(() =>
      expect(callback).toHaveBeenCalledWith({
        results: [patient],
        totalItems: 101,
        error: null,
      }),
    );
  });

  it("does not deliver a response after its request is aborted", async () => {
    const callback = vi.fn();
    const controller = new AbortController();
    let resolveResponse: ((response: Response) => void) | undefined;
    responseReader.readOpenElisResponse.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );

    fetchPatientData("outdated", callback, controller.signal);
    controller.abort();
    resolveResponse?.(
      jsonResponse({
        patientSearchResults: [{ patientID: "old" }],
        totalItems: 1,
        paging: { currentPage: "1" },
      }),
    );
    await Promise.resolve();

    expect(callback).not.toHaveBeenCalled();
  });

  it("classifies a Spring JSON 400 by the HTTP status", async () => {
    const callback = vi.fn();
    responseReader.readOpenElisResponse.mockResolvedValue(
      jsonResponse(
        {
          timestamp: "2026-09-25T00:00:00Z",
          status: 400,
          error: "Bad Request",
          message: "Patient search returned too many rows",
        },
        400,
      ),
    );

    fetchPatientData("broad", callback);

    await vi.waitFor(() =>
      expect(callback).toHaveBeenCalledWith({
        results: [],
        totalItems: 0,
        error: "too-many",
      }),
    );
  });

  it("reports transport and other HTTP failures", async () => {
    const transportCallback = vi.fn();
    responseReader.readOpenElisResponse.mockRejectedValueOnce(
      new TypeError("network failed"),
    );

    fetchPatientData("network", transportCallback);

    await vi.waitFor(() =>
      expect(transportCallback).toHaveBeenCalledWith({
        results: [],
        totalItems: 0,
        error: "request",
      }),
    );

    const serverCallback = vi.fn();
    responseReader.readOpenElisResponse.mockResolvedValueOnce(
      jsonResponse({ status: 502, error: "Bad Gateway" }, 502),
    );

    fetchPatientData("registry", serverCallback);

    await vi.waitFor(() =>
      expect(serverCallback).toHaveBeenCalledWith({
        results: [],
        totalItems: 0,
        error: "request",
      }),
    );
  });

  it("rejects malformed paging metadata or a non-first-page response", async () => {
    const wrongPageCallback = vi.fn();
    responseReader.readOpenElisResponse.mockResolvedValueOnce(
      jsonResponse({
        patientSearchResults: [{ patientID: "P-2" }],
        totalItems: 10,
        paging: { currentPage: "2" },
      }),
    );

    fetchPatientData("wrong page", wrongPageCallback);

    await vi.waitFor(() =>
      expect(wrongPageCallback).toHaveBeenCalledWith({
        results: [],
        totalItems: 0,
        error: "request",
      }),
    );

    const missingTotalCallback = vi.fn();
    responseReader.readOpenElisResponse.mockResolvedValueOnce(
      jsonResponse({
        patientSearchResults: [{ patientID: "P-3" }],
        paging: { currentPage: "1" },
      }),
    );

    fetchPatientData("missing total", missingTotalCallback);

    await vi.waitFor(() =>
      expect(missingTotalCallback).toHaveBeenCalledWith({
        results: [],
        totalItems: 0,
        error: "request",
      }),
    );
  });

  it("builds the existing patient-management quick-search deep link", () => {
    expect(getPatientManagementSearchRoute(" 张 三 & A/B? ")).toBe(
      "/PatientManagement?quickQuery=%E5%BC%A0+%E4%B8%89+%26+A%2FB%3F",
    );
    expect(getPatientManagementSearchRoute("   ")).toBeNull();
  });

  it("formats partial patient names and uses a display fallback when absent", () => {
    expect(
      getPatientDisplayName({ patientID: "P-1", lastName: " 单名 " }, "未知"),
    ).toBe("单名");
    expect(
      getPatientDisplayName(
        { patientID: "P-2", firstName: "Given" },
        "Unknown",
      ),
    ).toBe("Given");
    expect(getPatientDisplayName({ patientID: "P-3" }, "Unknown")).toBe(
      "Unknown",
    );
  });
});
