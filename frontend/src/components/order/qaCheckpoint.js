import { qaFailure, qaHash, qaUuid } from "./qaConfirmation";

export const QA_CHECKPOINT_KEY = "lis.qa-confirmation.pending.v1";
const fail = () => {
  throw qaFailure();
};
export function readQaCheckpoint() {
  try {
    const raw = sessionStorage.getItem(QA_CHECKPOINT_KEY);
    if (raw === null) return null;
    if (raw.length > 2000) return fail();
    const v = JSON.parse(raw);
    if (
      !v ||
      Object.keys(v).sort().join(",") !==
        "confirmationId,facts,salt,submissionId,version" ||
      v.version !== 1 ||
      !qaUuid(v.confirmationId) ||
      !qaUuid(v.submissionId) ||
      !qaUuid(v.salt) ||
      !qaHash(v.facts)
    )
      return fail();
    return v;
  } catch {
    return fail();
  }
}
const digest = async (salt, sampleId, factsDigest, ids) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify([salt, sampleId, factsDigest, [...ids].sort()]),
        ),
      ),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");

// Only opaque operation references and a salted digest persist across refresh.
// No patient, tube, checklist text, command, user identity or credentials.
export async function rememberQaCheckpoint(submissionId, command, isCurrent) {
  if (
    readQaCheckpoint() ||
    !qaUuid(submissionId) ||
    !qaUuid(command.confirmationId)
  )
    return fail();
  const salt = crypto.randomUUID();
  const facts = await digest(
    salt,
    command.sampleId,
    command.expectedFactsDigest,
    command.specimenIds,
  );
  if (!isCurrent() || readQaCheckpoint()) return fail();
  const value = {
    version: 1,
    submissionId,
    confirmationId: command.confirmationId,
    salt,
    facts,
  };
  sessionStorage.setItem(QA_CHECKPOINT_KEY, JSON.stringify(value));
  if (JSON.stringify(readQaCheckpoint()) !== JSON.stringify(value))
    return fail();
  return value;
}
export function forgetQaCheckpoint(expected) {
  if (
    !expected ||
    JSON.stringify(readQaCheckpoint()) !== JSON.stringify(expected)
  )
    return fail();
  sessionStorage.removeItem(QA_CHECKPOINT_KEY);
  if (readQaCheckpoint()) return fail();
}
export async function reconcileQaCheckpoint(result, isCurrent) {
  const pending = readQaCheckpoint();
  if (!pending) return;
  const review = result?.current?.qaReview;
  if (
    result.receipt?.submissionId !== pending.submissionId ||
    review?.state !== "MATCHED_CONFIRMATION" ||
    review.confirmationId !== pending.confirmationId ||
    review.currentAcceptanceVerified !== false ||
    !review.checklistVersion ||
    !review.reviewedAt ||
    !review.reviewerId ||
    (await digest(
      pending.salt,
      result.current.sampleId,
      review.currentFactsDigest,
      review.specimenIds,
    )) !== pending.facts ||
    !isCurrent()
  )
    return fail();
  forgetQaCheckpoint(pending);
}
