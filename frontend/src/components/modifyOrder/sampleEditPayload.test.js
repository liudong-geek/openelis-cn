import { describe, expect, it } from "vitest";
import {
  buildSampleEditPayload,
  hasIncompleteAddedSamples,
} from "./sampleEditPayload";

const freeze = (value) => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const form = () => ({
  sampleOrderItems: {
    labNo: "中文申请-1",
    modified: false,
    program: "existing-program",
    referringSiteName: "中文医院",
    priorityList: [{ id: "1", value: "常规" }],
    programList: [{ id: "2", value: "常规临床检验" }],
    referringSiteList: [{ id: "3", value: "检验科" }],
    providersList: ["李医生"],
    paymentOptions: ["医保"],
    testLocationCodeList: ["本院"],
  },
  existingTests: [
    {
      analysisId: "10",
      sampleItemId: "20",
      testId: "30",
      accessionNumber: "A",
      removeSample: true,
      canCancel: false,
    },
    {
      analysisId: "11",
      sampleItemId: "20",
      testId: "31",
      accessionNumber: null,
      canceled: false,
      canRemoveSample: false,
    },
  ],
  possibleTests: [{ sampleItemId: "20", testId: "32", add: true }],
  initialSampleConditionList: ["normal"],
  testSectionList: ["biology"],
  referralItems: [{ sampleId: "20", testId: "32", institute: "中文院区" }],
  sampleXML: "<samples><sample stale='true'/></samples>",
  futureField: { nested: [{ enabled: false }] },
});
const tube = (overrides = {}) => ({
  sampleTypeId: "100",
  tests: [{ id: "200", name: "血常规" }],
  panels: [],
  sampleXML: {
    collectionDate: "03/10/2026",
    collectionTime: "09:30",
    collector: "张护士",
  },
  ...overrides,
});
const parseSamples = (payload) => {
  const xml = new DOMParser().parseFromString(payload.sampleXML, "text/xml");
  expect(xml.querySelector("parsererror")).toBeNull();
  return Array.from(xml.querySelectorAll("samples > sample"));
};

describe("buildSampleEditPayload", () => {
  it("copies the complete form and retains tube identity, null group markers and flags", () => {
    const original = freeze(form());
    const payload = buildSampleEditPayload(original, []);
    expect(payload.existingTests).toEqual(original.existingTests);
    expect(payload.possibleTests).toEqual(original.possibleTests);
    expect(payload.referralItems).toEqual(original.referralItems);
    expect(payload.futureField).toEqual(original.futureField);
    expect(payload.sampleOrderItems).toMatchObject({
      labNo: "中文申请-1",
      program: "existing-program",
      referringSiteName: "中文医院",
      modified: true,
    });
    expect(payload).not.toBe(original);
    expect(payload.existingTests[0]).not.toBe(original.existingTests[0]);
    payload.futureField.nested[0].enabled = true;
    expect(original.futureField.nested[0].enabled).toBe(false);
  });

  it("clears only payload display lists and keeps failed-save draft usable for a retry", () => {
    const original = freeze(form());
    const samples = freeze([tube()]);
    const first = buildSampleEditPayload(original, samples);
    first.sampleOrderItems.labNo = "server-side-copy";
    first.existingTests[0].removeSample = false;
    const retry = buildSampleEditPayload(original, samples);
    expect(retry.sampleOrderItems.priorityList).toEqual([]);
    expect(retry.sampleOrderItems.programList).toEqual([]);
    expect(retry.sampleOrderItems.referringSiteList).toEqual([]);
    for (const key of [
      "providersList",
      "paymentOptions",
      "testLocationCodeList",
    ])
      expect(retry.sampleOrderItems[key]).toEqual([]);
    expect(retry).not.toHaveProperty("providersList");
    for (const key of ["initialSampleConditionList", "testSectionList"])
      expect(retry[key]).toEqual([]);
    expect(retry.sampleOrderItems.labNo).toBe("中文申请-1");
    expect(retry.existingTests[0].removeSample).toBe(true);
    expect(original.sampleOrderItems.priorityList).toHaveLength(1);
    expect(original.sampleOrderItems.providersList).toEqual(["李医生"]);
    expect(original.sampleXML).toContain("stale");
    expect(samples[0].sampleXML.collector).toBe("张护士");
  });

  it.each(
    [
      [],
      [tube({ tests: [] })],
      [tube({ tests: [{ name: "missing id" }] })],
    ].map((samples) => ({ samples })),
  )("replaces stale XML with an explicit empty root for %j", ({ samples }) => {
    const payload = buildSampleEditPayload(form(), samples);
    expect(payload.sampleXML).toBe("<samples/>");
    expect(parseSamples(payload)).toHaveLength(0);
  });

  it("includes every valid new tube even when the first tube has no tests", () => {
    const payload = buildSampleEditPayload(form(), [
      tube({ tests: [] }),
      tube(),
      tube({ sampleTypeId: "101", tests: [{ id: "200" }, { id: "201" }] }),
    ]);
    const elements = parseSamples(payload);
    expect(elements.map((entry) => entry.getAttribute("sampleID"))).toEqual([
      "100",
      "101",
    ]);
    expect(elements.map((entry) => entry.getAttribute("tests"))).toEqual([
      "200",
      "200,201",
    ]);
  });

  it("does not carry the previous tube's panel selection into a later tube", () => {
    const elements = parseSamples(
      buildSampleEditPayload(form(), [
        tube({ panels: [{ id: "301" }] }),
        tube({ sampleTypeId: "101" }),
      ]),
    );
    expect(elements.map((entry) => entry.getAttribute("panels"))).toEqual([
      "301",
      "",
    ]);
  });

  it("does not invent label quantities when the new draft did not provide them", () => {
    const [element] = parseSamples(buildSampleEditPayload(form(), [tube()]));
    expect(element.hasAttribute("numOrderLabels")).toBe(false);
    expect(element.hasAttribute("numSpecimenLabels")).toBe(false);
    expect(element.hasAttribute("sampleNatureId")).toBe(false);
  });

  it("escapes all XML attribute delimiters and preserves Chinese clinical details", () => {
    const special = `张护士 & <采血> "东院" '夜班'`;
    const details = {
      collectionDate: "03/10/2026",
      collectionTime: "09:30",
      collector: special,
      collectionConditions: special,
      collectionMethod: "静脉采血",
      sampleTemperature: "4℃",
      specimenOrigin: "左侧肘静脉",
      quantity: 0,
      uom: "7",
      rejected: false,
      rejectionReason: "",
      receivedDate: "03/10/2026",
      receivedTime: "10:00",
      storageLocation: {
        id: "8",
        type: "position",
        positionCoordinate: special,
      },
      gpsLatitude: 0,
      gpsLongitude: 0,
      gpsAccuracy: 0,
      gpsCaptureMethod: "manual",
      numOrderLabels: 0,
      numSpecimenLabels: 2,
      initialConditionIds: "10,11",
      sampleNatureId: "12",
    };
    const [element] = parseSamples(
      buildSampleEditPayload(form(), [tube({ sampleXML: details })]),
    );
    for (const key of [
      "collector",
      "collectionConditions",
      "storagePositionCoordinate",
    ])
      expect(element.getAttribute(key)).toBe(special);
    expect(element.getAttribute("collectionMethod")).toBe("静脉采血");
    expect(element.getAttribute("specimenOrigin")).toBe("左侧肘静脉");
    expect(element.getAttribute("receivedDate")).toBe("03/10/2026");
    expect(element.getAttribute("storageLocationId")).toBe("8");
    for (const key of [
      "quantity",
      "gpsLatitude",
      "gpsLongitude",
      "gpsAccuracy",
      "numOrderLabels",
    ])
      expect(element.getAttribute(key)).toBe("0");
    expect(element.getAttribute("numSpecimenLabels")).toBe("2");
    expect(element.getAttribute("rejected")).toBe("false");
    expect(element.getAttribute("sampleNatureId")).toBe("12");
  });
});

describe("hasIncompleteAddedSamples", () => {
  it("permits no new tubes and complete multi-tube drafts", () => {
    expect(hasIncompleteAddedSamples()).toBe(false);
    expect(
      hasIncompleteAddedSamples([tube(), tube({ sampleTypeId: "101" })]),
    ).toBe(false);
  });
  it.each(
    [
      [{}],
      [tube({ sampleTypeId: "" })],
      [tube({ tests: [] })],
      [tube({ tests: [{ testId: "200" }] })],
      [tube(), tube({ tests: [{ id: "" }] })],
    ].map((samples) => ({ samples })),
  )(
    "flags an incomplete added draft without guessing an ID: %j",
    ({ samples }) => {
      expect(hasIncompleteAddedSamples(samples)).toBe(true);
    },
  );
});
