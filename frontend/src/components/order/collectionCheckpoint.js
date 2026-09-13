import { entrySubmissionError } from "./orderEntryReceipt";
import { laboratoryMinute } from "./collectionRecovery";

// Tab-local recovery evidence only: never persist patient/order/tube IDs,
// collector, dates or clinical payloads. Random salt prevents reusable hashes.
const storageKey = "lis.collection.pending.v1";
const maximumLength = 170000;
const fail = () => {
  throw entrySubmissionError("order.collectionRecovery.unknown");
};
const uuid = (s) =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(s);
const hash = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export function readCollectionCheckpoint() {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw == null) return null;
    if (raw.length > maximumLength) return fail();
    const value = JSON.parse(raw);
    if (
      Object.keys(value).sort().join(",") !==
        "rows,salt,submissionId,version" ||
      value.version !== 1 ||
      !uuid(value.submissionId) ||
      !uuid(value.salt) ||
      !Array.isArray(value.rows) ||
      !value.rows.length ||
      value.rows.length > 1000 ||
      value.rows.some(
        (row) =>
          Object.keys(row).sort().join(",") !== "facts,reference" ||
          !hash(row.reference) ||
          !hash(row.facts),
      ) ||
      new Set(value.rows.map((row) => row.reference)).size !== value.rows.length
    )
      return fail();
    return value;
  } catch {
    return fail();
  }
}
const digest = async (salt, data) => {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([salt, data])),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
const facts = (sampleId, labNo, row) => [
  sampleId,
  labNo,
  row.requestId,
  row.typeOfSampleId,
  [...row.testIds].sort(),
  [...row.panelIds].sort(),
  row.requestedQuantity,
  row.unitOfMeasureId,
  row.quantity,
  row.minute,
  row.collector,
];
export async function rememberCollectionCheckpoint(
  submissionId,
  command,
  isCurrent = () => true,
) {
  if (
    readCollectionCheckpoint() ||
    !uuid(submissionId) ||
    !command.expected.length ||
    command.expected.length > 1000
  )
    return fail();
  const salt = crypto.randomUUID();
  const rows = await Promise.all(
    command.expected.map(async (row) => ({
      reference: await digest(salt, row.requestId),
      facts: await digest(salt, facts(command.sampleId, command.labNo, row)),
    })),
  );
  const value = { version: 1, submissionId, salt, rows };
  const raw = JSON.stringify(value);
  if (
    raw.length > maximumLength ||
    new Set(rows.map((row) => row.reference)).size !== rows.length
  )
    return fail();
  if (!isCurrent() || readCollectionCheckpoint()) return fail();
  try {
    sessionStorage.setItem(storageKey, raw);
    if (JSON.stringify(readCollectionCheckpoint()) !== JSON.stringify(value))
      return fail();
    return value;
  } catch {
    return fail();
  }
}
export function forgetCollectionCheckpoint(expected) {
  if (
    !expected ||
    JSON.stringify(readCollectionCheckpoint()) !== JSON.stringify(expected)
  )
    return fail();
  try {
    sessionStorage.removeItem(storageKey);
    if (readCollectionCheckpoint()) return fail();
  } catch {
    return fail();
  }
}
export async function reconcileCollectionCheckpoint(result, isCurrent) {
  const pending = readCollectionCheckpoint();
  if (!pending) return;
  const c = result.current;
  if (
    pending.submissionId !== result.receipt.submissionId ||
    !c.collectionContext
  )
    return fail();
  const found = new Map();
  for (const row of c.requestedSpecimens) {
    const reference = await digest(pending.salt, row.id);
    if (!pending.rows.some((value) => value.reference === reference)) continue;
    const item = c.physicalSpecimens.find((i) => i.id === row.sampleItemId);
    if (
      row.status !== "COLLECTED" ||
      !item?.collectionDate ||
      item.voided ||
      item.rejected
    )
      return fail();
    found.set(
      reference,
      await digest(
        pending.salt,
        facts(c.sampleId, c.labNo, {
          ...row,
          requestId: row.id,
          quantity: item.quantity,
          unitOfMeasureId: item.unitOfMeasureId,
          minute: laboratoryMinute(
            item.collectionDate,
            c.collectionContext.timeZone,
          ),
          collector: item.collector,
        }),
      ),
    );
    if (row.unitOfMeasureId !== item.unitOfMeasureId) return fail();
  }
  if (
    !isCurrent() ||
    pending.rows.some((row) => found.get(row.reference) !== row.facts)
  )
    return fail();
  forgetCollectionCheckpoint(pending);
}
