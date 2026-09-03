import { describe, expect, it } from "vitest";
import { isFutureCollectionTimestamp } from "./OrderCollect";

describe("sample collection product rules", () => {
  const now = new Date("2026-08-21T10:30:00");

  it("blocks a future collection timestamp", () => {
    expect(
      isFutureCollectionTimestamp(
        { collectionDate: "2026-08-21", collectionTime: "10:31" },
        now,
      ),
    ).toBe(true);
  });

  it("allows actual and incomplete collection timestamps", () => {
    expect(
      isFutureCollectionTimestamp(
        { collectionDate: "2026-08-21", collectionTime: "10:29" },
        now,
      ),
    ).toBe(false);
    expect(isFutureCollectionTimestamp({ collectionDate: "" }, now)).toBe(
      false,
    );
  });
});
