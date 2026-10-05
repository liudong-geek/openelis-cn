import { act, renderHook } from "@testing-library/react-hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import usePatientDetails from "./usePatientDetails";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: api.get }));
beforeEach(() => {
  api.get.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});
const resolve = (index: number, value: unknown) =>
  act(() => api.get.mock.calls[index][1](value));

describe("full patient identity loading", () => {
  it("does not query without a patient ID", () => {
    const { result } = renderHook(() => usePatientDetails(null));
    expect(api.get).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      patient: null,
      loading: false,
      error: null,
    });
  });
  it("reads complete details and photo for the exact encoded ID", () => {
    const { result } = renderHook(() => usePatientDetails("A /?"));
    expect(api.get.mock.calls[0][0]).toBe(
      "/rest/patient-details?patientID=A%20%2F%3F",
    );
    resolve(0, {
      patientPK: "A /?",
      patientLastUpdated: "v1",
      personLastUpdated: "v2",
      guid: "opaque-guid",
      patientContact: { id: "4", person: { id: "5" } },
    });
    expect(result.current.loading).toBe(true);
    resolve(1, { data: "data:image/jpeg;base64,cGhvdG8=" });
    expect(result.current.patient).toMatchObject({
      patientPK: "A /?",
      patientLastUpdated: "v1",
      personLastUpdated: "v2",
      photo: "data:image/jpeg;base64,cGhvdG8=",
    });
  });
  it.each([undefined, {}, { patientPK: "another" }])(
    "rejects absent or mismatched details %j",
    (response) => {
      const { result } = renderHook(() => usePatientDetails("42"));
      resolve(0, response);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.patient).toBeNull();
      expect(api.get).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects a failed photo request and accepts an authoritative empty photo", () => {
    const { result, rerender } = renderHook(
      ({ version }) => usePatientDetails("42", version),
      { initialProps: { version: 0 } },
    );
    resolve(0, { patientPK: "42" });
    resolve(1, undefined);
    expect(result.current.error).toBeInstanceOf(Error);
    rerender({ version: 1 });
    resolve(2, { patientPK: "42" });
    resolve(3, { data: "" });
    expect(result.current.patient).toEqual({ patientPK: "42", photo: "" });
    expect(result.current.error).toBeNull();
  });
  it("isolates old A responses after A to B to A", () => {
    const { result, rerender } = renderHook(({ id }) => usePatientDetails(id), {
      initialProps: { id: "A" },
    });
    rerender({ id: "B" });
    rerender({ id: "A" });
    resolve(0, { patientPK: "A", firstName: "obsolete" });
    expect(api.get).toHaveBeenCalledTimes(3);
    resolve(2, { patientPK: "A", firstName: "current" });
    resolve(3, { data: "" });
    resolve(1, { patientPK: "B", firstName: "wrong" });
    expect(result.current.patient?.firstName).toBe("current");
  });
  it("ignores photo callbacks after close and on timeout", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePatientDetails("42"));
    resolve(0, { patientPK: "42" });
    act(() => vi.advanceTimersByTime(30000));
    resolve(1, { data: "late photo" });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.patient).toBeNull();
    expect(api.get.mock.calls[0][2].aborted).toBe(true);
  });
});
