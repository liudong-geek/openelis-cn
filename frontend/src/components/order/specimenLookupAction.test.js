import { describe, expect, it } from "vitest";
import {
  buildLookupAccept,
  buildLookupReceipt,
  lookupActionKind,
  lookupWriteRecorded,
  sameLookupAction,
} from "./specimenLookupAction";

const base = {
  readOnly: true,
  matchedKind: "specimen",
  selection: { sampleId: "30", sampleItemId: "22", requestId: "12" },
  current: {
    sampleId: "30",
    labNo: "DEV30",
    patientMasked: false,
    patient: {
      id: "9",
      firstName: "Mei",
      lastName: "Li",
      birthDate: "1990-01-01",
    },
    requestedSpecimens: [
      {
        id: "12",
        sampleItemId: "22",
        typeOfSampleId: "7",
        status: "COLLECTED",
      },
    ],
    physicalSpecimens: [
      {
        id: "22",
        requestId: "12",
        sortOrder: "1",
        typeOfSampleId: "7",
        statusId: "5",
        collectionDate: "2026-09-26T05:00:00Z",
        receivedDate: null,
        decisionState: "NOT_RECORDED",
        recordedDecision: null,
        expectedEvidenceDigest: null,
        operationId: null,
        rejected: false,
        voided: false,
      },
    ],
  },
};
const changeTube = (result, changes) => ({
  ...result,
  current: {
    ...result.current,
    physicalSpecimens: [{ ...result.current.physicalSpecimens[0], ...changes }],
  },
});

describe("one-tube lookup write guard", () => {
  it("requires exact scanned tube, unmasked patient, and stable identity", () => {
    expect(lookupActionKind(base, "DEV30.1")).toBe("receipt");
    expect(lookupActionKind(base, "DEV30")).toBeNull();
    expect(
      lookupActionKind({ ...base, matchedKind: "order" }, "DEV30.1"),
    ).toBeNull();
    expect(
      lookupActionKind(
        {
          ...base,
          current: { ...base.current, patientMasked: true, patient: null },
        },
        "DEV30.1",
      ),
    ).toBeNull();
    expect(
      lookupActionKind(
        { ...base, selection: { ...base.selection, requestId: "13" } },
        "DEV30.1",
      ),
    ).toBeNull();
    const noSecondIdentifier = {
      ...base,
      current: {
        ...base.current,
        patient: { ...base.current.patient, birthDate: null },
      },
    };
    expect(lookupActionKind(noSecondIdentifier, "DEV30.1")).toBeNull();
    expect(
      lookupActionKind(
        {
          ...noSecondIdentifier,
          current: {
            ...noSecondIdentifier.current,
            patient: {
              ...noSecondIdentifier.current.patient,
              nationalId: "P-9",
            },
          },
        },
        "DEV30.1",
      ),
    ).toBe("receipt");
    expect(sameLookupAction(base, base, "DEV30.1", "receipt")).toBe(true);
    expect(
      sameLookupAction(
        base,
        {
          ...base,
          current: {
            ...base.current,
            patient: { ...base.current.patient, nationalId: "changed" },
          },
        },
        "DEV30.1",
        "receipt",
      ),
    ).toBe(false);
    expect(
      sameLookupAction(
        base,
        changeTube(base, { statusId: "9" }),
        "DEV30.1",
        "receipt",
      ),
    ).toBe(false);
  });

  it("uses only the verified server instant and confirms receipt by compact readback", () => {
    const command = buildLookupReceipt(base, "DEV30.1", "2026-09-26T05:03:00Z");
    expect(command.tubes).toEqual([
      {
        requestId: "12",
        sampleItemId: "22",
        collectionDate: "2026-09-26T05:00:00Z",
        receivedDate: "2026-09-26T05:03:00Z",
      },
    ]);
    expect(
      buildLookupReceipt(base, "DEV30.1", "2026-09-26T04:00:00Z"),
    ).toBeNull();
    expect(lookupWriteRecorded(base, "DEV30.1", "receipt", command)).toBe(
      false,
    );
    expect(
      lookupWriteRecorded(
        changeTube(base, { receivedDate: "2026-09-26T05:03:00Z" }),
        "DEV30.1",
        "receipt",
        command,
      ),
    ).toBe(true);
  });

  it("only accepts a current evidence digest and matches its operation ID on readback", () => {
    const digest = "a".repeat(64);
    const received = changeTube(base, {
      receivedDate: "2026-09-26T05:03:00Z",
      expectedEvidenceDigest: digest,
    });
    const operationId = "12345678-1234-1234-1234-123456789abc";
    expect(lookupActionKind(received, "DEV30.1")).toBe("accept");
    const command = buildLookupAccept(received, "DEV30.1", operationId);
    expect(command).toMatchObject({
      operationId,
      decision: "ACCEPTED",
      reason: null,
      expectedEvidenceDigest: digest,
    });
    expect(
      buildLookupAccept(
        changeTube(received, { expectedEvidenceDigest: null }),
        "DEV30.1",
        operationId,
      ),
    ).toBeNull();
    expect(
      lookupWriteRecorded(
        changeTube(received, {
          decisionState: "RECORDED",
          recordedDecision: "ACCEPTED",
          operationId: "00000000-0000-0000-0000-000000000000",
        }),
        "DEV30.1",
        "accept",
        command,
      ),
    ).toBe(false);
    expect(
      lookupWriteRecorded(
        changeTube(received, {
          decisionState: "RECORDED",
          recordedDecision: "ACCEPTED",
          operationId,
        }),
        "DEV30.1",
        "accept",
        command,
      ),
    ).toBe(true);
  });
});
