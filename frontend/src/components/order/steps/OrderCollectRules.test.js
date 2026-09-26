import { describe, expect, it } from "vitest";
import { isFutureCollectionTimestamp } from "./OrderCollect";
import { allowsImplicitOrderSave } from "../OrderContext";
import {
  collectionDefaultsFor,
  hasPendingClockDefaults,
  hasInvalidReceiptPair,
  mergePendingCollectionSamples,
  normalizeServerClock,
  refreshUntouchedCollectionClock,
} from "./collectionClock";

describe("sample collection product rules", () => {
  const clock = normalizeServerClock({
    date: "2026-08-21",
    time: "03:30",
    timezone: "Asia/Shanghai",
  });

  it("uses the server's wall-clock date and time, never the browser's timezone", () => {
    expect(
      isFutureCollectionTimestamp(
        { collectionDate: "2026-08-21", collectionTime: "11:30" },
        clock,
      ),
    ).toBe(true);
    expect(
      isFutureCollectionTimestamp(
        { collectionDate: "2026-08-21", collectionTime: "03:30" },
        clock,
      ),
    ).toBe(false);
    expect(isFutureCollectionTimestamp({ collectionDate: "" }, clock)).toBe(
      false,
    );
  });

  it("rejects incomplete or invalid server clock responses", () => {
    expect(
      normalizeServerClock({ date: "2026-08-21", time: "03:30" }),
    ).toBeNull();
    expect(
      normalizeServerClock({
        date: "2026-02-30",
        time: "03:30",
        timezone: "Asia/Shanghai",
      }),
    ).toBeNull();
    expect(
      normalizeServerClock({
        date: "2026-08-21",
        time: "25:30",
        timezone: "Asia/Shanghai",
      }),
    ).toBeNull();
  });

  it("defaults collection and receipt together without replacing saved or entered values", () => {
    expect(collectionDefaultsFor({ sampleItemId: "" }, clock)).toEqual({
      collectionDate: "2026-08-21",
      collectionTime: "03:30",
      receivedDate: "2026-08-21",
      receivedTime: "03:30",
    });
    expect(collectionDefaultsFor({ sampleItemId: "" }, null)).toEqual({});
    expect(
      collectionDefaultsFor(
        { sampleItemId: "", collectionDateUserEdited: true },
        clock,
      ),
    ).toEqual({
      collectionTime: "03:30",
      receivedDate: "2026-08-21",
      receivedTime: "03:30",
    });
    expect(
      collectionDefaultsFor(
        {
          sampleItemId: "",
          collectionDate: "2026-08-20",
          collectionTime: "02:10",
          receivedDate: "2026-08-20",
          receivedTime: "02:20",
        },
        clock,
      ),
    ).toEqual({});
    expect(
      collectionDefaultsFor({ sampleItemId: "42", collectionDate: "" }, clock),
    ).toEqual({});
  });

  it("keeps collection-only receipt fields empty and rejects a half-entered receipt", () => {
    const sample = { sampleTypeId: "blood", sampleItemId: "" };
    expect(collectionDefaultsFor(sample, clock, "later")).toEqual({
      collectionDate: clock.date,
      collectionTime: clock.time,
    });
    expect(
      refreshUntouchedCollectionClock(
        [{ ...sample, receivedDate: clock.date, receivedTime: clock.time }],
        clock,
        "later",
      )[0],
    ).toMatchObject({ receivedDate: "", receivedTime: "" });
    expect(
      hasPendingClockDefaults(
        [{ ...sample, collectionDate: clock.date, collectionTime: clock.time }],
        "later",
      ),
    ).toBe(false);
    expect(
      hasInvalidReceiptPair(
        [{ ...sample, receivedDate: clock.date, receivedTime: "" }],
        "now",
      ),
    ).toBe(true);
    expect(
      hasInvalidReceiptPair(
        [{ ...sample, receivedDate: "", receivedTime: "" }],
        "later",
      ),
    ).toBe(false);
    expect(
      hasInvalidReceiptPair(
        [{ ...sample, receivedDate: clock.date, receivedTime: "" }],
        "later",
      ),
    ).toBe(true);
    expect(
      hasInvalidReceiptPair(
        [{ ...sample, sampleItemId: "7", receivedDate: clock.date }],
        "now",
      ),
    ).toBe(true);
  });

  it("retains a user's edits when pending requests arrive later", () => {
    const requested = [
      {
        sampleTypeRequestId: "11",
        sampleTypeId: "whole-blood",
        collectionDate: "",
        collectionTime: "",
        receivedDate: "",
        receivedTime: "",
      },
    ];
    const current = [
      {
        sampleTypeId: "whole-blood",
        collectionDate: "2026-08-20",
        collectionTime: "02:10",
        collectionDateUserEdited: true,
        collectionTimeUserEdited: true,
        receivedDate: "2026-08-21",
        receivedTime: "03:00",
        collectorId: "COL-1",
      },
    ];
    expect(mergePendingCollectionSamples(requested, current)[0]).toMatchObject({
      collectionDate: "2026-08-20",
      collectionTime: "02:10",
      receivedDate: "2026-08-21",
      receivedTime: "03:00",
      collectorId: "COL-1",
    });
    expect(
      mergePendingCollectionSamples(requested, [
        {
          ...current[0],
          collectionDateUserEdited: false,
          collectionTimeUserEdited: false,
        },
      ])[0],
    ).toMatchObject({ collectionDate: "", collectionTime: "" });
  });

  it("does not attach edits to a different same-type request after reorder", () => {
    const requested = [
      { sampleTypeRequestId: "12", sampleTypeId: "blood" },
      { sampleTypeRequestId: "11", sampleTypeId: "blood" },
    ];
    const current = [
      { sampleTypeId: "blood", collectorId: "collector-A" },
      { sampleTypeId: "blood", collectorId: "collector-B" },
    ];
    expect(mergePendingCollectionSamples(requested, current)).toEqual(
      requested,
    );
    expect(
      mergePendingCollectionSamples(requested, [
        { ...current[0], sampleTypeRequestId: "11" },
        { ...current[1], sampleTypeRequestId: "12" },
      ]).map((sample) => sample.collectorId),
    ).toEqual(["collector-B", "collector-A"]);
  });

  it("matches an unbound unique type by type when requests reorder", () => {
    const requested = [
      { sampleTypeRequestId: "urine-request", sampleTypeId: "urine" },
      { sampleTypeRequestId: "blood-request", sampleTypeId: "blood" },
    ];
    const current = [
      { sampleTypeId: "blood", collectorId: "blood-collector" },
      { sampleTypeId: "urine", collectorId: "urine-collector" },
    ];
    expect(
      mergePendingCollectionSamples(requested, current).map(
        (sample) => sample.collectorId,
      ),
    ).toEqual(["urine-collector", "blood-collector"]);
  });

  it("refreshes only untouched new-tube defaults before the frozen save", () => {
    expect(
      refreshUntouchedCollectionClock(
        [
          {
            sampleTypeId: "blood",
            collectionDate: "2026-08-20",
            collectionTime: "01:00",
            receivedDate: "2026-08-20",
            receivedTime: "01:05",
          },
          {
            sampleTypeId: "urine",
            collectionTime: "00:30",
            collectionTimeUserEdited: true,
            receivedDate: "",
            receivedDateUserEdited: true,
          },
          {
            sampleTypeId: "blood",
            sampleItemId: "42",
            collectionTime: "01:00",
          },
        ],
        clock,
      ),
    ).toEqual([
      {
        sampleTypeId: "blood",
        collectionDate: "2026-08-21",
        collectionTime: "03:30",
        receivedDate: "2026-08-21",
        receivedTime: "03:30",
      },
      {
        sampleTypeId: "urine",
        collectionDate: "2026-08-21",
        collectionTime: "00:30",
        collectionTimeUserEdited: true,
        receivedDate: "",
        receivedDateUserEdited: true,
        receivedTime: "03:30",
      },
      {
        sampleTypeId: "blood",
        sampleItemId: "42",
        collectionTime: "01:00",
      },
    ]);
  });

  it("waits for automatic defaults but permits intentionally blank optional fields", () => {
    expect(
      hasPendingClockDefaults([
        { sampleTypeId: "whole-blood", collectionDate: "" },
      ]),
    ).toBe(true);
    expect(
      hasPendingClockDefaults([
        {
          sampleTypeId: "whole-blood",
          collectionDate: "2026-08-21",
          collectionTime: "03:30",
          receivedDate: "2026-08-21",
          receivedTime: "03:30",
        },
      ]),
    ).toBe(false);
    expect(
      hasPendingClockDefaults([
        {
          sampleTypeId: "whole-blood",
          collectionDate: "",
          collectionDateUserEdited: true,
          collectionTime: "",
          collectionTimeUserEdited: true,
          receivedDate: "",
          receivedDateUserEdited: true,
          receivedTime: "",
          receivedTimeUserEdited: true,
        },
      ]),
    ).toBe(false);
  });

  it("never auto-saves order entry or collection", () => {
    expect(allowsImplicitOrderSave("/order/enter")).toBe(false);
    expect(allowsImplicitOrderSave("/order/collect")).toBe(false);
    expect(allowsImplicitOrderSave("/order/collect/")).toBe(false);
    expect(allowsImplicitOrderSave("/order/label")).toBe(false);
  });
});
