import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PATIENT_MERGE_SEARCH_PAGES,
  searchPatients,
} from "./patientMergeService";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

afterEach(() => vi.unstubAllGlobals());

describe("patient merge search paging", () => {
  it("aggregates every page with the original criteria and one queryId", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          queryId: "SIM-MERGE-QUERY",
          totalItems: 3,
          patientSearchResults: [{ patientID: "1" }, { patientID: "2" }],
          paging: { currentPage: "1", totalPages: "2" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          queryId: "SIM-MERGE-QUERY",
          totalItems: 3,
          patientSearchResults: [{ patientID: "3" }],
          paging: { currentPage: "2", totalPages: "2" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPatients({
      patientId: "SIM-ID",
      lastName: "张",
      firstName: "三",
      labNumber: "SIM-LAB",
      suppressExternalSearch: false,
    });

    expect(
      result.patientSearchResults?.map(({ patientID }) => patientID),
    ).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    const second = new URL(fetchMock.mock.calls[1][0], "http://localhost");
    expect(second.searchParams.get("lastName")).toBe(
      first.searchParams.get("lastName"),
    );
    expect(second.searchParams.get("firstName")).toBe(
      first.searchParams.get("firstName"),
    );
    expect(second.searchParams.get("nationalID")).toBe("SIM-ID");
    expect(second.searchParams.get("labNumber")).toBe("SIM-LAB");
    expect(first.searchParams.get("suppressExternalSearch")).toBe("false");
    expect(second.searchParams.get("suppressExternalSearch")).toBe("false");
    expect(second.searchParams.get("queryId")).toBe("SIM-MERGE-QUERY");
    expect(second.searchParams.get("page")).toBe("2");
  });

  it("rejects a page that is not bound to the first query", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            queryId: "SIM-FIRST",
            totalItems: 2,
            patientSearchResults: [{ patientID: "1" }],
            paging: { currentPage: "1", totalPages: "2" },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            queryId: "SIM-OTHER",
            totalItems: 2,
            patientSearchResults: [{ patientID: "2" }],
            paging: { currentPage: "2", totalPages: "2" },
          }),
        ),
    );

    await expect(searchPatients({ lastName: "SIM" })).rejects.toThrow(
      "Failed to search patients",
    );
  });

  it("rejects later pages whose total changes within the same query", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            queryId: "SIM-STABLE-TOTAL",
            totalItems: 4,
            patientSearchResults: [{ patientID: "1" }, { patientID: "2" }],
            paging: { currentPage: "1", totalPages: "2" },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            queryId: "SIM-STABLE-TOTAL",
            totalItems: 3,
            patientSearchResults: [{ patientID: "3" }, { patientID: "4" }],
            paging: { currentPage: "2", totalPages: "2" },
          }),
        ),
    );

    await expect(searchPatients({ lastName: "SIM" })).rejects.toThrow(
      "Failed to search patients",
    );
  });

  it("rejects a short final page instead of returning an incomplete merge list", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            queryId: "SIM-SHORT-PAGE",
            totalItems: 3,
            patientSearchResults: [{ patientID: "1" }, { patientID: "2" }],
            paging: { currentPage: "1", totalPages: "2" },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            queryId: "SIM-SHORT-PAGE",
            totalItems: 3,
            patientSearchResults: [],
            paging: { currentPage: "2", totalPages: "2" },
          }),
        ),
    );

    await expect(searchPatients({ lastName: "SIM" })).rejects.toThrow(
      "Failed to search patients",
    );
  });

  it("rejects a multi-page response without a queryId", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        totalItems: 2,
        patientSearchResults: [{ patientID: "1" }],
        paging: { currentPage: "1", totalPages: "2" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPatients({ lastName: "SIM" })).rejects.toThrow(
      "Failed to search patients",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads remaining pages serially instead of starting an unbounded burst", async () => {
    const pageTwo = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          queryId: "SIM-SERIAL",
          totalItems: 3,
          patientSearchResults: [{ patientID: "1" }],
          paging: { currentPage: "1", totalPages: "3" },
        }),
      )
      .mockReturnValueOnce(pageTwo.promise)
      .mockResolvedValueOnce(
        jsonResponse({
          queryId: "SIM-SERIAL",
          totalItems: 3,
          patientSearchResults: [{ patientID: "3" }],
          paging: { currentPage: "3", totalPages: "3" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = searchPatients({ lastName: "SIM" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    pageTwo.resolve(
      jsonResponse({
        queryId: "SIM-SERIAL",
        totalItems: 3,
        patientSearchResults: [{ patientID: "2" }],
        paging: { currentPage: "2", totalPages: "3" },
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    await expect(resultPromise).resolves.toMatchObject({
      patientSearchResults: [
        { patientID: "1" },
        { patientID: "2" },
        { patientID: "3" },
      ],
    });
  });

  it("rejects an excessive page count before loading another page", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        queryId: "SIM-TOO-MANY-PAGES",
        totalItems: MAX_PATIENT_MERGE_SEARCH_PAGES + 1,
        patientSearchResults: [{ patientID: "1" }],
        paging: {
          currentPage: "1",
          totalPages: String(MAX_PATIENT_MERGE_SEARCH_PAGES + 1),
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPatients({ lastName: "SIM" })).rejects.toThrow(
      "Failed to search patients",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation before scheduling the next page", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementationOnce(async () => {
      controller.abort();
      return jsonResponse({
        queryId: "SIM-CANCELLED",
        totalItems: 2,
        patientSearchResults: [{ patientID: "1" }],
        paging: { currentPage: "1", totalPages: "2" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      searchPatients({ lastName: "SIM" }, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
