import {
  receiptFailure,
  receiptFacts,
  currentReceiptRows,
} from "./specimenReceipt";

export const RECEIPT_CHECKPOINT_KEY = "lis.receiving.pending.v1";
const fail = () => {
  throw receiptFailure();
};
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const keys = (v, expected) => v && Object.keys(v).sort().join(",") === expected;
export function readReceiptCheckpoint() {
  try {
    const raw = sessionStorage.getItem(RECEIPT_CHECKPOINT_KEY);
    if (raw === null) return null;
    if (raw.length > 17000) return fail();
    const value = JSON.parse(raw);
    if (
      !keys(value, "rows,salt,submissionId,version") ||
      value.version !== 1 ||
      !uuid(value.salt) ||
      !uuid(value.submissionId) ||
      !Array.isArray(value.rows) ||
      !value.rows.length ||
      value.rows.length > 100 ||
      !value.rows.every(
        (r) => keys(r, "facts,reference") && hash(r.reference) && hash(r.facts),
      ) ||
      new Set(value.rows.map((r) => r.reference)).size !== value.rows.length
    )
      return fail();
    return value;
  } catch {
    return fail();
  }
}
const digest = async (salt, value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify([salt, value])),
      ),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");

// Only an opaque recovery code and salted digests persist across a tab refresh.
// No patient, tube, time, command, session or credential is stored here.
export async function rememberReceiptCheckpoint(
  submissionId,
  command,
  isCurrent,
) {
  if (readReceiptCheckpoint() || !uuid(submissionId)) return fail();
  const salt = crypto.randomUUID();
  const rows = await Promise.all(
    command.tubes.map(async (tube) => ({
      reference: await digest(salt, tube.requestId),
      facts: await digest(salt, receiptFacts(command, tube)),
    })),
  );
  if (!isCurrent() || readReceiptCheckpoint()) return fail();
  const value = { version: 1, submissionId, salt, rows };
  sessionStorage.setItem(RECEIPT_CHECKPOINT_KEY, JSON.stringify(value));
  if (JSON.stringify(readReceiptCheckpoint()) !== JSON.stringify(value))
    return fail();
  return value;
}
export function forgetReceiptCheckpoint(expected) {
  if (
    !expected ||
    JSON.stringify(readReceiptCheckpoint()) !== JSON.stringify(expected)
  )
    return fail();
  sessionStorage.removeItem(RECEIPT_CHECKPOINT_KEY);
  if (readReceiptCheckpoint()) return fail();
}
export async function reconcileReceiptCheckpoint(result, isCurrent) {
  const pending = readReceiptCheckpoint();
  if (!pending) return;
  if (pending.submissionId !== result.receipt.submissionId) return fail();
  const command = {
    sampleId: result.current.sampleId,
    labNo: result.current.labNo,
    patientId: result.current.patient?.id,
  };
  const found = new Map();
  for (const tube of currentReceiptRows(result)) {
    const reference = await digest(pending.salt, tube.requestId);
    if (pending.rows.some((r) => r.reference === reference))
      found.set(
        reference,
        await digest(pending.salt, receiptFacts(command, tube)),
      );
  }
  if (
    !pending.rows.every((r) => found.get(r.reference) === r.facts) ||
    !isCurrent()
  )
    return fail();
  forgetReceiptCheckpoint(pending);
}
