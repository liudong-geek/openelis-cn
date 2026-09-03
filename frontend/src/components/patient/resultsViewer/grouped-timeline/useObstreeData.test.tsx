import { act, renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGetManyObstreeData } from "./useObstreeData";

const getFromOpenElisServer = vi.hoisted(() => vi.fn());

vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer,
}));

describe("useGetManyObstreeData", () => {
  beforeEach(() => {
    getFromOpenElisServer.mockReset();
  });

  it("keeps roots empty while loading and exposes the returned tree only after it loads", () => {
    let respond: (response: unknown) => void = () => undefined;
    getFromOpenElisServer.mockImplementation(
      (_endpoint: string, callback: (response: unknown) => void) => {
        respond = callback;
      },
    );

    const { result } = renderHook(() => useGetManyObstreeData("patient-1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.roots).toEqual([]);

    act(() => {
      respond([
        {
          display: "Microbiology",
          subSets: [
            {
              display: "Culture",
              obs: [{ value: "Positive", obsDatetime: "2026-08-23" }],
            },
          ],
        },
      ]);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.roots).toHaveLength(1);
    expect(
      result.current.roots[0]?.subSets?.[0]?.obs?.[0]?.interpretation,
    ).toBe("UNKNOWN");
  });

  it("distinguishes a failed request from a valid empty result set", () => {
    let respond: (response: unknown) => void = () => undefined;
    getFromOpenElisServer.mockImplementation(
      (_endpoint: string, callback: (response: unknown) => void) => {
        respond = callback;
      },
    );

    const { result } = renderHook(() => useGetManyObstreeData("patient-1"));

    act(() => respond(undefined));

    expect(result.current.loading).toBe(false);
    expect(result.current.roots).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it("prefers each observation's metadata and explicit server interpretation", () => {
    let respond: (response: unknown) => void = () => undefined;
    getFromOpenElisServer.mockImplementation(
      (_endpoint: string, callback: (response: unknown) => void) => {
        respond = callback;
      },
    );

    const { result } = renderHook(() => useGetManyObstreeData("patient-1"));

    act(() => {
      respond([
        {
          display: "Chemistry",
          subSets: [
            {
              display: "Analyte",
              lowNormal: 0,
              hiNormal: 10,
              obs: [
                {
                  value: "7",
                  rawValue: "7",
                  lowNormal: 8,
                  hiNormal: 12,
                  interpretation: null,
                },
                {
                  value: "7",
                  rawValue: "7",
                  lowNormal: 0,
                  hiNormal: 10,
                  interpretation: "ABNORMAL",
                },
              ],
            },
          ],
        },
      ]);
    });

    const observations = result.current.roots[0]?.subSets?.[0]?.obs;
    expect(observations?.[0]?.interpretation).toBe("LOW");
    expect(observations?.[1]?.interpretation).toBe("ABNORMAL");
  });
});
