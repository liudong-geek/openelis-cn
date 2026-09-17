import { createHash } from "node:crypto";

export const entryReceiptResponse = (body, submissionId) => {
  const sent = JSON.parse(body);
  return {
    success: true,
    replayed: false,
    receipt: {
      version: 1,
      submissionId,
      requestHash: createHash("sha256")
        .update("raw-json-v1\n" + body)
        .digest("hex"),
      hashVersion: "raw-json-v1",
      createdAt: "2026-09-16T02:00:00Z",
      sampleId: "701",
      labNo: sent.sampleOrderItems.labNo,
      workflowType: "clinical",
      patientId: "801",
      labelRequests: [],
      requestedSpecimens: sent.requestedSpecimens.map((tube, index) => ({
        ...tube,
        id: String(901 + index),
        sampleId: "701",
        status: "REQUESTED",
        sampleItemId: null,
      })),
    },
  };
};

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// All calls terminate in this in-memory fixture. Only the atomic entry endpoint
// can write; unexpected legacy order searches or per-tube writes fail the test.
// A damaged POST response does not change the durable receipt used by later GET.
export const createEntrySubmissionSim = ({
  damageResponse = (response) => response,
  holdWrite = false,
} = {}) => {
  const writes = [];
  const reads = [];
  const receipts = new Map();
  const unexpected = [];
  const fetch = vi.fn(async (url, options = {}) => {
    const path = new URL(url, "http://sim.invalid").pathname;
    const method = options.method || "GET";
    if (method === "GET") {
      reads.push({ path, options });
      if (path.endsWith("/rest/SamplePatientEntry")) return json({});
      if (path.endsWith("/rest/labUnit/config"))
        return json({ workflowType: "Clinical" });
      if (path.endsWith("/rest/SampleEntryGenerateScanProvider"))
        return json({ body: "SIM-GENERATED-001" });
      const submissionId = path.match(
        /\/rest\/SamplePatientEntry\/submissions\/([^/]+)$/,
      )?.[1];
      if (submissionId && receipts.has(submissionId))
        return json({ ...receipts.get(submissionId), replayed: true });
    }
    if (method === "POST" && path.endsWith("/rest/SamplePatientEntry")) {
      const submissionId = new Headers(options.headers).get("Idempotency-Key");
      const receipt = entryReceiptResponse(options.body, submissionId);
      receipts.set(submissionId, receipt);
      let release;
      const response = () =>
        json(damageResponse(structuredClone(receipt)), 201);
      const pending = new Promise((resolve) => {
        release = () => resolve(response());
      });
      writes.push({ path, options, submissionId, release });
      return holdWrite ? pending : response();
    }
    unexpected.push({ method, path });
    throw new Error(`Unexpected SIM endpoint: ${method} ${path}`);
  });
  return { fetch, writes, reads, receipts, unexpected };
};
