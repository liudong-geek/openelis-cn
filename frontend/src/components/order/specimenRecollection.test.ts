import { webcrypto } from "node:crypto";
import {
  recollectionCandidate,
  recoverRecollection,
  submitRecollection,
  validateRecollectionReceipt,
} from "./specimenRecollection";

const current = {
  sampleId: "701",
  labNo: "SIM-701",
  patient: { id: "801" },
  requestedSpecimens: [
    { id: "901", status: "COLLECTED", sampleItemId: "1001" },
  ],
  physicalSpecimens: [
    {
      id: "1001",
      requestId: "901",
      sortOrder: "1",
      rejected: true,
      voided: false,
    },
  ],
};
const decision = {
  sampleItemId: "1001",
  state: "RECORDED",
  recordedDecision: "REJECTED",
  operationId: "11111111-2222-4333-8444-555555555555",
  evidenceDigest: "a".repeat(64),
};
const receipt = (operationId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee") => ({
  success: true,
  version: 1,
  replayed: false,
  operationId,
  sampleId: "701",
  labNo: "SIM-701",
  patientId: "801",
  sourceRequestId: "901",
  sourceSampleItemId: "1001",
  sourceDecisionOperationId: decision.operationId,
  evidenceDigest: decision.evidenceDigest,
  createdBy: "7",
  createdAt: "2026-09-17T01:00:00Z",
  request: {
    id: "902",
    sortOrder: 2,
    typeOfSampleId: "11",
    requestedQuantity: 1,
    unitOfMeasureId: null,
    testIds: ["31"],
    panelIds: [],
    status: "REQUESTED",
    sampleItemId: null,
    createdAt: "2026-09-17T01:00:00Z",
    lastUpdated: "2026-09-17T01:00:00Z",
  },
});
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

it("only admits a recorded rejection whose current tube and request still match", () => {
  expect(recollectionCandidate(current, decision)?.item.id).toBe("1001");
  expect(
    recollectionCandidate(current, {
      ...decision,
      recordedDecision: "ACCEPTED",
    }),
  ).toBeNull();
  expect(
    recollectionCandidate(
      {
        ...current,
        physicalSpecimens: [
          { ...current.physicalSpecimens[0], rejected: false },
        ],
      },
      decision,
    ),
  ).toBeNull();
});

it("submits one exact command and binds the receipt to the generated operation", async () => {
  fetch.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      version: 1,
      operationId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      sampleId: "701",
      labNo: "SIM-701",
      patientId: "801",
      sourceRequestId: "901",
      sourceSampleItemId: "1001",
      sourceDecisionOperationId: decision.operationId,
      expectedEvidenceDigest: decision.evidenceDigest,
    });
    return response(receipt(body.operationId));
  });
  await expect(
    submitRecollection(
      current,
      decision,
      "SIM-CSRF",
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ request: { id: "902", status: "REQUESTED" } });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    method: "POST",
    credentials: "include",
    redirect: "manual",
    cache: "no-store",
    headers: expect.objectContaining({ "X-CSRF-Token": "SIM-CSRF" }),
  });
});

it("reads an existing source relationship without issuing another POST", async () => {
  fetch.mockResolvedValue(response({ ...receipt(), replayed: true }));
  await expect(
    recoverRecollection("701", "1001", new AbortController().signal),
  ).resolves.toMatchObject({ replayed: true, request: { id: "902" } });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].method).toBe("GET");
  expect(fetch.mock.calls[0][0]).toContain(
    "/rest/specimen-recollections/current?sampleId=701&sourceSampleItemId=1001",
  );
});

it("rejects mismatched, malformed and failed responses without retrying", async () => {
  expect(() =>
    validateRecollectionReceipt(
      { ...receipt(), sourceSampleItemId: "1002" },
      {
        sampleId: "701",
        sourceSampleItemId: "1001",
      },
    ),
  ).toThrow();
  fetch.mockResolvedValue(
    response({ success: false, code: "RECOLLECTION_CONFLICT" }, 409),
  );
  await expect(
    recoverRecollection("701", "1001", new AbortController().signal),
  ).rejects.toMatchObject({ code: "RECOLLECTION_CONFLICT", status: 409 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
